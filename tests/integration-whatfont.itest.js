const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { By, until } = require('selenium-webdriver');
const { setup, teardown, openPopup, closePopup, popupExec } = require('./selenium-helper');

let driver;
let profileDir;

async function writeExtensionStorage(values) {
    await openPopup(driver);
    try {
        await popupExec(driver, `
            return browser.storage.local.set(${JSON.stringify(values)}).then(() => true);
        `);
    } finally {
        await closePopup(driver);
    }
}

async function seedToolbarAppliedFontState() {
    const origin = await driver.executeScript('return location.hostname;');
    await writeExtensionStorage({
        affoToolbarEnabled: true,
        affoApplyMap: {
            [origin]: {
                body: { fontName: 'Lora', variableAxes: {} }
            }
        }
    });
}

async function waitForToolbarIframe() {
    return driver.wait(
        until.elementLocated(By.css('#affo-left-toolbar-iframe')),
        7000,
        'Toolbar iframe should appear after seeding applied font state'
    );
}

async function clickWhatFontToolbarButtonOnce() {
    const frame = await waitForToolbarIframe();
    await driver.switchTo().frame(frame);
    try {
        await driver.executeScript(`
            const button = document.getElementById('whatfont-button');
            if (!button) throw new Error('WhatFont button not found');
            button.click();
        `);
    } finally {
        await driver.switchTo().defaultContent();
    }
}

async function waitForWhatFontOverlay() {
    await driver.wait(async () => {
        return driver.executeScript(`
            return !!document.querySelector('.__whatfont_control');
        `);
    }, 5000, 'WhatFont control should appear after one toolbar click');
}

describe('WhatFont toolbar integration', () => {
    before(async () => {
        const ctx = await setup();
        driver = ctx.driver;
        profileDir = ctx.profileDir;
    });

    after(async () => {
        await teardown(driver, profileDir);
    });

    it('captures page-realm FontFace constructor metadata at document start', async () => {
        const record = await driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            const eventName = '__affo_page_font_face_created_v1__';
            const timer = setTimeout(() => done(null), 3000);
            let capturedRecord = null;
            document.addEventListener(eventName, event => {
                capturedRecord = JSON.parse(event.detail);
            }, { once: true });
            const face = new FontFace('AFFO Capture Probe', 'local("Arial")', {
                weight: '600',
                style: 'normal'
            });
            document.fonts.add(face);
            face.load().then(() => {
                clearTimeout(timer);
                done(capturedRecord);
            }, error => {
                clearTimeout(timer);
                done({ error: String(error) });
            });
        `);

        assert.equal(record.family, 'AFFO Capture Probe');
        assert.equal(record.source, 'local("Arial")');
        assert.equal(record.descriptors.weight, '600');
        assert.equal(record.baseUrl, 'https://en.wikipedia.org/wiki/Typography');
    });

    it('activates WhatFont after one toolbar click when scripts are lazy-loaded', async () => {
        await seedToolbarAppliedFontState();
        await driver.navigate().refresh();
        await waitForToolbarIframe();

        await driver.executeAsyncScript(`
            const done = arguments[arguments.length - 1];
            const face = new FontFace('AFFO Capture Probe', 'local("Arial")', {
                weight: '600',
                style: 'normal'
            });
            document.fonts.add(face);
            face.load().then(() => {
                const target = document.createElement('p');
                target.id = 'affo-dynamic-font-target';
                target.textContent = 'Dynamically constructed font face';
                target.style.fontFamily = '"AFFO Capture Probe", sans-serif';
                target.style.fontWeight = '600';
                document.body.appendChild(target);
                done(true);
            }, error => done(String(error)));
        `);

        await clickWhatFontToolbarButtonOnce();
        await waitForWhatFontOverlay();

        const overlayState = await driver.executeScript(`
            return {
                hasControl: !!document.querySelector('.__whatfont_control'),
                hasTip: !!document.querySelector('.__whatfont_tip'),
                whatfontClassCount: document.querySelectorAll('[class*="__whatfont_"]').length,
                guardedControl: !!document.querySelector('.__whatfont_control[data-affo-guard]'),
                guardedTip: !!document.querySelector('.__whatfont_tip[data-affo-guard]')
            };
        `);

        assert.equal(overlayState.hasControl, true, 'WhatFont control should be visible after one toolbar click');
        assert.equal(overlayState.hasTip, true, 'WhatFont tooltip should be initialized after one toolbar click');
        assert.ok(overlayState.whatfontClassCount >= 2, 'WhatFont should add its overlay elements to the page');
        assert.equal(overlayState.guardedControl, true, 'WhatFont control should be excluded from AFFO font application');
        assert.equal(overlayState.guardedTip, true, 'WhatFont tooltip should be excluded from AFFO font application');
    });

    it('shows a Face-off action on pinned WhatFont cards', async () => {
        await driver.executeScript(`
            const target = document.querySelector('p') || document.body;
            target.click();
        `);
        await driver.wait(async () => {
            return driver.executeScript('return !!document.querySelector(".__whatfont_faceoff_compare");');
        }, 5000, 'Pinned WhatFont card should expose a Face-off action');

        const action = await driver.executeScript(`
            const link = document.querySelector('.__whatfont_faceoff_compare');
            const panel = link && link.closest('.__whatfont_panel');
            return link ? {
                text: link.textContent.trim(),
                title: link.title,
                guardedPanel: !!(panel && panel.hasAttribute('data-affo-guard'))
            } : null;
        `);
        assert.deepEqual(action, {
            text: 'Face-off',
            title: 'Compare this page font in Face-off',
            guardedPanel: true
        });
    });

    it('hands a captured dynamic FontFace to Face-off', async () => {
        await driver.executeScript(`
            document.getElementById('affo-dynamic-font-target').click();
        `);
        await driver.wait(async () => {
            return driver.executeScript(`
                return Array.from(document.querySelectorAll('.__whatfont_panel')).some(panel =>
                    panel.textContent.includes('AFFO Capture Probe')
                );
            `);
        }, 5000, 'WhatFont should identify the dynamically constructed font family');

        await driver.executeScript(`
            const panel = Array.from(document.querySelectorAll('.__whatfont_panel')).find(candidate =>
                candidate.textContent.includes('AFFO Capture Probe')
            );
            panel.querySelector('.__whatfont_faceoff_compare').click();
        `);

        const actionText = await driver.wait(async () => {
            return driver.executeScript(`
                const panel = Array.from(document.querySelectorAll('.__whatfont_panel')).find(candidate =>
                    candidate.textContent.includes('AFFO Capture Probe')
                );
                const text = panel && panel.querySelector('.__whatfont_faceoff_compare').textContent.trim();
                return text === 'Opening...' || text === 'Unavailable' ? text : false;
            `);
        }, 5000, 'Captured dynamic font should complete its Face-off handoff');

        assert.equal(actionText, 'Opening...');
    });
});
