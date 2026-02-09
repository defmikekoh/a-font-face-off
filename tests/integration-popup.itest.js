const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, openPopup, closePopup, popupExec, TEST_PAGE } = require('./selenium-helper');

let driver;
let profileDir;

describe('Integration tests', () => {
    before(async () => {
        const ctx = await setup();
        driver = ctx.driver;
        profileDir = ctx.profileDir;
    });

    after(async () => {
        await teardown(driver, profileDir);
    });

    // -- Content Script test (runs first, before opening popup) --

    it('content script sets data-affo-base on a web page', async () => {
        await driver.get(TEST_PAGE);
        await driver.sleep(3000);

        const affoBase = await driver.executeScript(
            "return document.documentElement.getAttribute('data-affo-base')"
        );
        assert.ok(affoBase, 'data-affo-base attribute should be set by content script');
        assert.ok(
            ['serif', 'sans', 'mono'].includes(affoBase),
            `data-affo-base should be serif, sans, or mono, got: ${affoBase}`
        );
    });

    // -- Popup UI tests (real toolbar popup on the current page) --

    it('popup loads with mode tabs', async () => {
        await openPopup(driver);

        const tabCount = await popupExec(driver,
            "return document.querySelectorAll('[data-mode]').length"
        );
        assert.equal(tabCount, 3, 'Expected 3 mode tabs');

        const modes = await popupExec(driver, `
            return Array.from(document.querySelectorAll('[data-mode]'))
                .map(t => t.dataset.mode).sort();
        `);
        assert.deepEqual(modes, ['body-contact', 'faceoff', 'third-man-in']);
    });

    it('switches to faceoff mode and has cloned panels', async () => {
        await popupExec(driver, 'document.querySelector(\'[data-mode="faceoff"]\').click()');
        await driver.sleep(500);

        const active = await popupExec(driver,
            "return document.querySelector('[data-mode].active')?.dataset?.mode"
        );
        assert.equal(active, 'faceoff');

        // Verify cloned top/bottom control panels have correct elements
        const panels = await popupExec(driver, `
            return ['top', 'bottom'].map(pos => ({
                pos,
                panel: !!document.getElementById(pos + '-font-controls'),
                display: !!document.getElementById(pos + '-font-display'),
                sizeSlider: !!document.getElementById(pos + '-font-size'),
                sizeText: !!document.getElementById(pos + '-font-size-text'),
                weightSlider: !!document.getElementById(pos + '-font-weight'),
                axesContainer: !!document.getElementById(pos + '-axes-container'),
                applyBtn: !!document.getElementById('apply-' + pos),
                resetBtn: !!document.getElementById('reset-' + pos)
            }));
        `);
        for (const p of panels) {
            assert.ok(p.panel, `${p.pos} control panel exists`);
            assert.ok(p.display, `${p.pos} font display exists`);
            assert.ok(p.sizeSlider, `${p.pos} font-size slider exists`);
            assert.ok(p.sizeText, `${p.pos} font-size text input exists`);
            assert.ok(p.weightSlider, `${p.pos} font-weight slider exists`);
            assert.ok(p.axesContainer, `${p.pos} axes container exists`);
            assert.ok(p.applyBtn, `${p.pos} apply button exists`);
            assert.ok(p.resetBtn, `${p.pos} reset button exists`);
        }
    });

    it('switches to third-man-in mode', async () => {
        await popupExec(driver, 'document.querySelector(\'[data-mode="third-man-in"]\').click()');
        await driver.sleep(500);

        const active = await popupExec(driver,
            "return document.querySelector('[data-mode].active')?.dataset?.mode"
        );
        assert.equal(active, 'third-man-in');

        const grips = await popupExec(driver, `
            return {
                serif: !!document.getElementById('serif-font-grip'),
                sans: !!document.getElementById('sans-font-grip'),
                mono: !!document.getElementById('mono-font-grip')
            };
        `);
        assert.ok(grips.serif, 'serif grip exists');
        assert.ok(grips.sans, 'sans grip exists');
        assert.ok(grips.mono, 'mono grip exists');

        // Verify cloned control panels have correct elements
        const panels = await popupExec(driver, `
            return ['serif', 'sans', 'mono'].map(pos => ({
                pos,
                panel: !!document.getElementById(pos + '-font-controls'),
                display: !!document.getElementById(pos + '-font-display'),
                sizeSlider: !!document.getElementById(pos + '-font-size'),
                weightSlider: !!document.getElementById(pos + '-font-weight'),
                axesContainer: !!document.getElementById(pos + '-axes-container'),
                applyBtn: !!document.getElementById('apply-' + pos),
                resetBtn: !!document.getElementById('reset-' + pos)
            }));
        `);
        for (const p of panels) {
            assert.ok(p.panel, `${p.pos} control panel exists`);
            assert.ok(p.display, `${p.pos} font display exists`);
            assert.ok(p.sizeSlider, `${p.pos} font-size slider exists`);
            assert.ok(p.weightSlider, `${p.pos} font-weight slider exists`);
            assert.ok(p.axesContainer, `${p.pos} axes container exists`);
            assert.ok(p.applyBtn, `${p.pos} apply button exists`);
            assert.ok(p.resetBtn, `${p.pos} reset button exists`);
        }
    });

    it('switches to body-contact mode', async () => {
        await popupExec(driver, 'document.querySelector(\'[data-mode="body-contact"]\').click()');
        await driver.sleep(500);

        const active = await popupExec(driver,
            "return document.querySelector('[data-mode].active')?.dataset?.mode"
        );
        assert.equal(active, 'body-contact');
    });

    it('body panel is visible in body-contact mode', async () => {
        // Close and reopen popup for a fresh state
        await closePopup(driver);
        await driver.sleep(300);
        await openPopup(driver);

        await popupExec(driver, 'document.querySelector(\'[data-mode="body-contact"]\').click()');
        await driver.sleep(500);

        const hasVisible = await popupExec(driver, `
            const panel = document.getElementById('body-font-controls');
            return panel ? panel.classList.contains('visible') : null;
        `);
        assert.notEqual(hasVisible, null, 'body font controls element should exist');
        assert.equal(hasVisible, true, 'body font controls should be visible in body-contact mode');
    });

    it('font display shows a font name', async () => {
        const fontName = await popupExec(driver, `
            const display = document.getElementById('body-font-display');
            return display ? display.textContent.trim() : null;
        `);
        assert.ok(fontName, 'font display should show a font name');
        assert.ok(fontName.length > 0, 'font name should not be empty');
    });

    it('font picker opens when font display is clicked', async () => {
        await popupExec(driver, 'document.getElementById("body-font-display").click()');
        await driver.sleep(500);

        const pickerVisible = await popupExec(driver, `
            const picker = document.getElementById('font-picker-modal');
            if (!picker) return false;
            return getComputedStyle(picker).display !== 'none';
        `);
        assert.ok(pickerVisible, 'font picker modal should be visible after clicking font display');

        // Close picker
        await popupExec(driver, `
            const overlay = document.getElementById('panel-overlay');
            if (overlay) overlay.click();
        `);
        await driver.sleep(300);
    });

    it('font-size slider updates text input', async () => {
        await popupExec(driver, `
            const slider = document.getElementById('body-font-size');
            if (slider) {
                slider.value = '24';
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            }
        `);
        await driver.sleep(200);

        const newValue = await popupExec(driver,
            "return document.getElementById('body-font-size-text')?.value"
        );
        assert.equal(newValue, '24', 'text input should reflect slider value');
    });
});
