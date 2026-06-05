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

    it('activates WhatFont after one toolbar click when scripts are lazy-loaded', async () => {
        await seedToolbarAppliedFontState();
        await driver.navigate().refresh();
        await waitForToolbarIframe();

        await clickWhatFontToolbarButtonOnce();
        await waitForWhatFontOverlay();

        const overlayState = await driver.executeScript(`
            return {
                hasControl: !!document.querySelector('.__whatfont_control'),
                hasTip: !!document.querySelector('.__whatfont_tip'),
                whatfontClassCount: document.querySelectorAll('[class*="__whatfont_"]').length
            };
        `);

        assert.equal(overlayState.hasControl, true, 'WhatFont control should be visible after one toolbar click');
        assert.equal(overlayState.hasTip, true, 'WhatFont tooltip should be initialized after one toolbar click');
        assert.ok(overlayState.whatfontClassCount >= 2, 'WhatFont should add its overlay elements to the page');
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
            return link ? { text: link.textContent.trim(), title: link.title } : null;
        `);
        assert.deepEqual(action, {
            text: 'Face-off',
            title: 'Compare this page font in Face-off'
        });
    });
});
