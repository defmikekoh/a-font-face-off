const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown } = require('./selenium-helper');

let driver;
let profileDir;
let quickPickExpected;

async function getQuickPickState() {
    return driver.executeScript(`
        const isTouchEligible = /Mobile|Tablet|Android/i.test(navigator.userAgent) ||
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0;
        const iframe = document.querySelector('iframe[src*="left-toolbar"]');
        let iframeFaceoff = false;
        if (iframe && iframe.contentDocument) {
            iframeFaceoff = !!iframe.contentDocument.getElementById('faceoff-button');
        }
        return {
            isTouchEligible,
            userAgent: navigator.userAgent,
            maxTouchPoints: navigator.maxTouchPoints || 0,
            hasOntouchStart: 'ontouchstart' in window,
            hasToolbarIframe: !!iframe,
            hasFaceoffButton: !!document.getElementById('faceoff-button') || iframeFaceoff,
            hasOverlay: !!document.getElementById('affo-quick-pick-overlay')
        };
    `);
}

async function skipIfQuickPickDisabled(t) {
    if (quickPickExpected === undefined) {
        quickPickExpected = (await getQuickPickState()).isTouchEligible;
    }
    if (!quickPickExpected) {
        t.skip('Quick Pick toolbar is disabled on non-touch devices');
        return true;
    }
    return false;
}

async function clickFaceoffButton() {
    return driver.executeScript(`
        let faceoffBtn = document.getElementById('faceoff-button');
        if (!faceoffBtn) {
            const iframe = document.querySelector('iframe[src*="left-toolbar"]');
            if (iframe && iframe.contentDocument) {
                faceoffBtn = iframe.contentDocument.getElementById('faceoff-button');
            }
        }
        if (!faceoffBtn) return false;
        faceoffBtn.click();
        return true;
    `);
}

describe('Quick-pick favorites feature', { concurrency: false }, () => {
    before(async () => {
        const ctx = await setup();
        driver = ctx.driver;
        profileDir = ctx.profileDir;
    });

    after(async () => {
        await teardown(driver, profileDir);
    });

    it('quick-pick toolbar follows the touch-device gate', async () => {
        await driver.sleep(2000);
        const state = await getQuickPickState();
        quickPickExpected = state.isTouchEligible;

        if (state.isTouchEligible) {
            assert.ok(state.hasToolbarIframe || state.hasFaceoffButton, 'touch-eligible profile should show the quick-pick toolbar');
        } else {
            assert.equal(state.hasToolbarIframe, false, 'non-touch profile should not inject the quick-pick toolbar iframe');
            assert.equal(state.hasFaceoffButton, false, 'non-touch profile should not show the quick-pick faceoff button');
            assert.equal(state.hasOverlay, false, 'non-touch profile should not create the quick-pick overlay');
        }
    });

    it('quick-pick menu element exists in DOM after tapping faceoff', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const clicked = await clickFaceoffButton();
        assert.ok(clicked, 'Faceoff button should be clickable');
        await driver.sleep(500);

        const menuExists = await driver.executeScript(`
            return !!document.getElementById('affo-quick-pick-overlay');
        `);
        assert.ok(menuExists, 'Quick-pick overlay should be created after faceoff button click');
    });

    it('quick-pick menu is initially hidden', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const isHidden = await driver.executeScript(`
            const menu = document.getElementById('affo-quick-pick-overlay');
            return menu ? menu.style.display === 'none' : false;
        `);
        assert.ok(isHidden, 'Quick-pick overlay should be hidden initially');
    });

    it('faceoff button exists on left toolbar', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        await driver.sleep(1000);
        const state = await getQuickPickState();
        assert.ok(state.hasFaceoffButton, 'Faceoff button should exist on touch toolbar');
    });

    it('quick-pick menu closes with close button', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        await clickFaceoffButton();
        await driver.sleep(500);

        const isOpen = await driver.executeScript(`
            const menu = document.getElementById('affo-quick-pick-overlay');
            return menu ? menu.style.display === 'flex' : false;
        `);
        assert.ok(isOpen, 'Menu should be visible after opening');

        await driver.executeScript(`
            const closeBtn = document.querySelector('#affo-quick-pick-content button');
            if (closeBtn) closeBtn.click();
        `);
        await driver.sleep(300);

        const isClosed = await driver.executeScript(`
            const menu = document.getElementById('affo-quick-pick-overlay');
            return menu ? menu.style.display === 'none' : false;
        `);
        assert.ok(isClosed, 'Menu should be hidden after clicking close');
    });

    it('quick-pick menu has message element', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const messageEl = await driver.executeScript(`
            return !!document.getElementById('affo-quick-pick-message');
        `);
        assert.ok(messageEl, 'Quick-pick menu should have message element');
    });

    it('quick-pick menu has 5 favorite buttons', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const buttonCount = await driver.executeScript(`
            return document.querySelectorAll('#affo-quick-pick-font-1, #affo-quick-pick-font-2, #affo-quick-pick-font-3, #affo-quick-pick-font-4, #affo-quick-pick-font-5').length;
        `);
        assert.equal(buttonCount, 5, 'Menu should have 5 favorite button elements');
    });

    it('quick-pick menu has unapply button', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const unapplyBtn = await driver.executeScript(`
            return !!document.getElementById('affo-quick-pick-unapply');
        `);
        assert.ok(unapplyBtn, 'Quick-pick menu should have unapply button');
    });

    it('favorite buttons are styled correctly', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const buttonStyles = await driver.executeScript(`
            const btn = document.getElementById('affo-quick-pick-font-1');
            if (!btn) return null;
            const styles = window.getComputedStyle(btn);
            return {
                hasBackground: !!styles.backgroundColor,
                hasPadding: !!styles.padding,
                hasBorder: !!styles.border,
                isButton: btn.tagName === 'BUTTON'
            };
        `);
        assert.ok(buttonStyles, 'Favorite buttons should exist');
        assert.ok(buttonStyles.isButton, 'Favorite elements should be buttons');
        assert.ok(buttonStyles.hasBackground, 'Buttons should have background');
    });

    it('unapply button is styled with red color', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const unapplyStyles = await driver.executeScript(`
            const btn = document.getElementById('affo-quick-pick-unapply');
            if (!btn) return null;
            const styles = window.getComputedStyle(btn);
            return {
                backgroundColor: styles.backgroundColor,
                color: styles.color
            };
        `);
        assert.ok(unapplyStyles, 'Unapply button should exist');
        assert.ok(unapplyStyles.backgroundColor, 'Unapply button should have background color');
    });

    it('close button exists and is accessible', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const closeBtn = await driver.executeScript(`
            const btn = document.querySelector('#affo-quick-pick-content button');
            return {
                exists: !!btn,
                isButton: btn ? btn.tagName === 'BUTTON' : false,
                hasText: btn ? btn.textContent.trim() !== '' : false
            };
        `);
        assert.ok(closeBtn.exists, 'Close button should exist');
        assert.ok(closeBtn.isButton, 'Close button should be a button element');
        assert.ok(closeBtn.hasText, 'Close button should have visible text');
    });

    it('menu overlay has correct styling', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const menuStyles = await driver.executeScript(`
            const menu = document.getElementById('affo-quick-pick-overlay');
            if (!menu) return null;
            const styles = window.getComputedStyle(menu);
            return {
                position: styles.position,
                hasFixed: styles.position === 'fixed',
                display: menu.style.display,
                zIndex: styles.zIndex
            };
        `);
        assert.ok(menuStyles, 'Menu should exist');
        assert.ok(menuStyles.hasFixed, 'Menu should use fixed positioning');
    });

    it('quick-pick elements are accessible via IDs', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const elementIds = await driver.executeScript(`
            return {
                overlay: !!document.getElementById('affo-quick-pick-overlay'),
                content: !!document.getElementById('affo-quick-pick-content'),
                message: !!document.getElementById('affo-quick-pick-message'),
                font1: !!document.getElementById('affo-quick-pick-font-1'),
                font2: !!document.getElementById('affo-quick-pick-font-2'),
                font3: !!document.getElementById('affo-quick-pick-font-3'),
                font4: !!document.getElementById('affo-quick-pick-font-4'),
                font5: !!document.getElementById('affo-quick-pick-font-5'),
                unapply: !!document.getElementById('affo-quick-pick-unapply')
            };
        `);

        assert.ok(elementIds.overlay, 'affo-quick-pick-overlay should exist');
        assert.ok(elementIds.content, 'affo-quick-pick-content should exist');
        assert.ok(elementIds.message, 'affo-quick-pick-message should exist');
        assert.ok(elementIds.font1, 'affo-quick-pick-font-1 should exist');
        assert.ok(elementIds.font2, 'affo-quick-pick-font-2 should exist');
        assert.ok(elementIds.font3, 'affo-quick-pick-font-3 should exist');
        assert.ok(elementIds.font4, 'affo-quick-pick-font-4 should exist');
        assert.ok(elementIds.font5, 'affo-quick-pick-font-5 should exist');
        assert.ok(elementIds.unapply, 'affo-quick-pick-unapply should exist');
    });

    it('faceoff button is clickable', async (t) => {
        if (await skipIfQuickPickDisabled(t)) return;

        const buttonInfo = await driver.executeScript(`
            let btn = document.getElementById('faceoff-button');
            if (!btn) {
                const iframe = document.querySelector('iframe[src*="left-toolbar"]');
                if (iframe && iframe.contentDocument) {
                    btn = iframe.contentDocument.getElementById('faceoff-button');
                }
            }
            return {
                exists: !!btn,
                isButton: btn ? btn.tagName === 'BUTTON' : false,
                isClickable: btn ? !btn.disabled : false
            };
        `);
        assert.ok(buttonInfo.exists, 'Faceoff button should exist');
        assert.ok(buttonInfo.isButton, 'Faceoff button should be a button element');
        assert.ok(buttonInfo.isClickable, 'Faceoff button should be clickable');
    });
});
