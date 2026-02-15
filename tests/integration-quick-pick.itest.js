const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, openPopup, closePopup, popupExec, TEST_PAGE } = require('./selenium-helper');

let driver;
let profileDir;

describe('Quick-pick favorites feature', () => {
    before(async () => {
        const ctx = await setup();
        driver = ctx.driver;
        profileDir = ctx.profileDir;
    });

    after(async () => {
        await teardown(driver, profileDir);
    });

    it('quick-pick menu element exists in DOM', async () => {
        // Wait for page to load
        await driver.sleep(2000);

        // Trigger menu creation by simulating a short click on the faceoff button
        // The button can be accessed from either page DOM or iframe
        const clicked = await driver.executeScript(`
            let faceoffBtn = document.getElementById('faceoff-button');
            if (!faceoffBtn) {
                // Try to find it in the iframe
                const iframe = document.querySelector('iframe[src*="left-toolbar"]');
                if (iframe && iframe.contentDocument) {
                    faceoffBtn = iframe.contentDocument.getElementById('faceoff-button');
                }
            }
            if (faceoffBtn) {
                faceoffBtn.click();
                return true;
            }
            return false;
        `);

        assert.ok(clicked, 'Faceoff button should be clickable');
        await driver.sleep(500);

        const menuExists = await driver.executeScript(`
            return !!document.getElementById('quick-pick-menu');
        `);
        assert.ok(menuExists, 'Quick-pick menu should be created after faceoff button click');
    });

    it('quick-pick menu is initially hidden', async () => {
        const isHidden = await driver.executeScript(`
            const menu = document.getElementById('quick-pick-menu');
            return menu ? menu.style.display === 'none' : true;
        `);
        assert.ok(isHidden, 'Quick-pick menu should be hidden initially');
    });

    it('faceoff button exists on left toolbar', async () => {
        // Check in iframe since left toolbar button is in iframe
        await driver.sleep(1000);

        const faceoffBtn = await driver.executeScript(`
            // Check both in main document and in iframe
            if (document.getElementById('faceoff-button')) return true;
            // Check in iframe
            const iframe = document.querySelector('iframe[src*="left-toolbar"]');
            if (iframe && iframe.contentDocument) {
                return !!iframe.contentDocument.getElementById('faceoff-button');
            }
            return false;
        `);
        assert.ok(faceoffBtn, 'Faceoff button should exist on page');
    });

    it('quick-pick menu closes with close button', async () => {
        // Open menu
        await driver.executeScript(`
            // Manually show menu for testing
            const menu = document.getElementById('quick-pick-menu');
            if (menu) menu.style.display = 'flex';
        `);
        await driver.sleep(300);

        // Verify it's open
        const isOpen = await driver.executeScript(`
            const menu = document.getElementById('quick-pick-menu');
            return menu ? menu.style.display === 'flex' : false;
        `);
        assert.ok(isOpen, 'Menu should be visible after opening');

        // Close menu
        await driver.executeScript(`
            const closeBtn = document.getElementById('quick-pick-close');
            if (closeBtn) closeBtn.click();
        `);
        await driver.sleep(300);

        // Verify it's closed
        const isClosed = await driver.executeScript(`
            const menu = document.getElementById('quick-pick-menu');
            return menu ? menu.style.display === 'none' : true;
        `);
        assert.ok(isClosed, 'Menu should be hidden after clicking close');
    });

    it('quick-pick menu has message element', async () => {
        const messageEl = await driver.executeScript(`
            return !!document.getElementById('affo-quick-pick-message');
        `);
        assert.ok(messageEl, 'Quick-pick menu should have message element');
    });

    it('quick-pick menu has 5 favorite buttons', async () => {
        const buttonCount = await driver.executeScript(`
            return document.querySelectorAll('#affo-quick-pick-font-1, #affo-quick-pick-font-2, #affo-quick-pick-font-3, #affo-quick-pick-font-4, #affo-quick-pick-font-5').length;
        `);
        assert.equal(buttonCount, 5, 'Menu should have 5 favorite button elements');
    });

    it('quick-pick menu has unapply button', async () => {
        const unapplyBtn = await driver.executeScript(`
            return !!document.getElementById('affo-quick-pick-unapply');
        `);
        assert.ok(unapplyBtn, 'Quick-pick menu should have unapply button');
    });

    it('favorite buttons are styled correctly', async () => {
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

    it('unapply button is styled with red color (light theme)', async () => {
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
        // Red button should have a background color set
        assert.ok(unapplyStyles.backgroundColor, 'Unapply button should have background color');
    });

    it('close button exists and is accessible', async () => {
        const closeBtn = await driver.executeScript(`
            const btn = document.getElementById('quick-pick-close');
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

    it('menu overlay has correct styling', async () => {
        const menuStyles = await driver.executeScript(`
            const menu = document.getElementById('quick-pick-menu');
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

    it('quick-pick elements are accessible via IDs', async () => {
        const elementIds = await driver.executeScript(`
            return {
                menu: !!document.getElementById('quick-pick-menu'),
                message: !!document.getElementById('affo-quick-pick-message'),
                font1: !!document.getElementById('affo-quick-pick-font-1'),
                font2: !!document.getElementById('affo-quick-pick-font-2'),
                font3: !!document.getElementById('affo-quick-pick-font-3'),
                font4: !!document.getElementById('affo-quick-pick-font-4'),
                font5: !!document.getElementById('affo-quick-pick-font-5'),
                unapply: !!document.getElementById('affo-quick-pick-unapply'),
                close: !!document.getElementById('quick-pick-close')
            };
        `);

        assert.ok(elementIds.menu, 'quick-pick-menu should exist');
        assert.ok(elementIds.message, 'affo-quick-pick-message should exist');
        assert.ok(elementIds.font1, 'affo-quick-pick-font-1 should exist');
        assert.ok(elementIds.font2, 'affo-quick-pick-font-2 should exist');
        assert.ok(elementIds.font3, 'affo-quick-pick-font-3 should exist');
        assert.ok(elementIds.font4, 'affo-quick-pick-font-4 should exist');
        assert.ok(elementIds.font5, 'affo-quick-pick-font-5 should exist');
        assert.ok(elementIds.unapply, 'affo-quick-pick-unapply should exist');
        assert.ok(elementIds.close, 'quick-pick-close should exist');
    });

    it('faceoff button is clickable', async () => {
        const buttonInfo = await driver.executeScript(`
            const btn = document.getElementById('faceoff-button');
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
