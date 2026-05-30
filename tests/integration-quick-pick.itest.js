const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { By } = require('selenium-webdriver');
const { setup, teardown, openPopup, closePopup, popupExec } = require('./selenium-helper');

let driver;
let profileDir;

const TOOLBAR_TEST_FAVORITES = {
    'Toolbar Test Serif': { fontName: 'Lora', variableAxes: {} },
    'Toolbar Test Sans': { fontName: 'Inter', variableAxes: {} },
    'Toolbar Test Text': { fontName: 'Source Serif 4', variableAxes: {} },
    'Toolbar Test UI': { fontName: 'Roboto', variableAxes: {} },
    'Toolbar Test Monoish': { fontName: 'IBM Plex Sans', variableAxes: {} },
};
const TOOLBAR_TEST_FAVORITES_ORDER = Object.keys(TOOLBAR_TEST_FAVORITES);

async function getQuickPickState() {
    const state = await driver.executeScript(`
        const isTouchEligible = /Mobile|Tablet|Android/i.test(navigator.userAgent) ||
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0;
        const iframe = document.querySelector('iframe[src*="left-toolbar"]');
        return {
            isTouchEligible,
            userAgent: navigator.userAgent,
            maxTouchPoints: navigator.maxTouchPoints || 0,
            hasOntouchStart: 'ontouchstart' in window,
            hasToolbarIframe: !!iframe,
            hasFaceoffButton: !!document.getElementById('faceoff-button'),
            hasOverlay: !!document.getElementById('affo-quick-pick-overlay')
        };
    `);
    state.hasFaceoffButton = state.hasFaceoffButton || await hasIframeFaceoffButton();
    return state;
}

async function getToolbarIframeElement() {
    const frames = await driver.findElements(By.css('iframe[src*="left-toolbar"]'));
    return frames[0] || null;
}

async function hasIframeFaceoffButton() {
    const iframe = await getToolbarIframeElement();
    if (!iframe) return false;

    await driver.switchTo().frame(iframe);
    try {
        return await driver.executeScript('return !!document.getElementById("faceoff-button");');
    } finally {
        await driver.switchTo().defaultContent();
    }
}

async function getToolbarIframeMetrics() {
    const iframe = await getToolbarIframeElement();
    assert.ok(iframe, 'Toolbar iframe should exist');

    const frameRect = await driver.executeScript(`
        const rect = arguments[0].getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    `, iframe);

    await driver.switchTo().frame(iframe);
    try {
        return await driver.executeScript(`
            const toolbar = document.getElementById('toolbar');
            const rootStyles = window.getComputedStyle(document.documentElement);
            const bodyStyles = window.getComputedStyle(document.body);
            const toolbarStyles = toolbar ? window.getComputedStyle(toolbar) : null;
            const buttons = Array.from(document.querySelectorAll('.toolbar-button'));
            const visibleButtons = buttons.filter((button) => {
                const styles = window.getComputedStyle(button);
                const rect = button.getBoundingClientRect();
                return styles.display !== 'none' && rect.width > 0 && rect.height > 0;
            });
            const lastButton = visibleButtons[visibleButtons.length - 1];
            const lastRect = lastButton ? lastButton.getBoundingClientRect() : null;
            const doc = document.documentElement;
            const touchOnlyButtonIds = ['close-tab-button', 'page-up-button', 'page-down-button'];
            return {
                frameWidth: ${JSON.stringify(frameRect.width)},
                frameHeight: ${JSON.stringify(frameRect.height)},
                documentClientWidth: doc.clientWidth,
                documentScrollWidth: doc.scrollWidth,
                documentClientHeight: doc.clientHeight,
                documentScrollHeight: doc.scrollHeight,
                toolbarClientHeight: toolbar ? toolbar.clientHeight : null,
                toolbarScrollHeight: toolbar ? toolbar.scrollHeight : null,
                rootOverflowX: rootStyles.overflowX,
                bodyOverflowX: bodyStyles.overflowX,
                toolbarOverflowX: toolbarStyles ? toolbarStyles.overflowX : null,
                buttonCount: buttons.length,
                visibleButtonCount: visibleButtons.length,
                visibleButtonIds: visibleButtons.map((button) => button.id),
                touchOnlyButtons: touchOnlyButtonIds.map((id) => {
                    const button = document.getElementById(id);
                    const styles = button ? window.getComputedStyle(button) : null;
                    return {
                        id,
                        exists: !!button,
                        display: styles ? styles.display : null,
                        parentId: button && button.parentElement ? button.parentElement.id : null
                    };
                }),
                lastButtonBottom: lastRect ? lastRect.bottom : null
            };
        `);
    } finally {
        await driver.switchTo().defaultContent();
    }
}

async function waitForToolbarPresence(expected, label) {
    await driver.wait(async () => {
        const state = await getQuickPickState();
        return expected
            ? state.hasToolbarIframe && state.hasFaceoffButton
            : !state.hasToolbarIframe;
    }, 7000, label || `Timed out waiting for toolbar presence=${expected}`);
}

async function getCurrentOrigin() {
    return driver.executeScript('return location.hostname;');
}

async function writeExtensionStorage(values) {
    await openPopup(driver);
    await popupExec(driver, `
        return browser.storage.local.set(${JSON.stringify(values)}).then(() => true);
    `);
    await closePopup(driver);
    await driver.sleep(300);
}

async function seedToolbarAppliedFontState() {
    const origin = await getCurrentOrigin();
    await writeExtensionStorage({
        affoFavorites: TOOLBAR_TEST_FAVORITES,
        affoFavoritesOrder: TOOLBAR_TEST_FAVORITES_ORDER,
        affoApplyMap: {
            [origin]: {
                serif: { fontName: 'Lora', variableAxes: {} }
            }
        }
    });
}

async function seedToolbarSrouletteState() {
    const origin = await getCurrentOrigin();
    await writeExtensionStorage({
        affoApplyMap: {
            [origin]: {
                sroulette: {
                    serif: { pool: 'sans' }
                }
            }
        }
    });
}

async function clearToolbarAppliedState() {
    await writeExtensionStorage({ affoApplyMap: {} });
}

async function ensureQuickPickAvailable() {
    const state = await getQuickPickState();
    if (!state.isTouchEligible && !state.hasToolbarIframe) {
        await seedToolbarAppliedFontState();
    }
    await waitForToolbarPresence(true, 'Quick Pick toolbar should be available for this test');
}

async function closeQuickPickMenu() {
    await driver.executeScript(`
        const closeBtn = document.querySelector('#affo-quick-pick-content button');
        if (closeBtn) closeBtn.click();
    `);
    await driver.sleep(300);
}

async function clickFaceoffButton() {
    const pageClicked = await driver.executeScript(`
        const faceoffBtn = document.getElementById('faceoff-button');
        if (!faceoffBtn) return false;
        faceoffBtn.click();
        return true;
    `);
    if (pageClicked) return true;

    const iframe = await getToolbarIframeElement();
    if (!iframe) return false;

    await driver.switchTo().frame(iframe);
    try {
        return await driver.executeScript(`
            const faceoffBtn = document.getElementById('faceoff-button');
            if (!faceoffBtn) return false;
            faceoffBtn.click();
            return true;
        `);
    } finally {
        await driver.switchTo().defaultContent();
    }
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

    it('quick-pick toolbar stays hidden on non-touch pages without applied fonts', async () => {
        await driver.sleep(2000);
        const state = await getQuickPickState();

        if (state.isTouchEligible) {
            assert.ok(state.hasToolbarIframe || state.hasFaceoffButton, 'touch-eligible profile should show the quick-pick toolbar');
        } else {
            assert.equal(state.hasToolbarIframe, false, 'non-touch profile should not inject the toolbar iframe before fonts are applied');
            assert.equal(state.hasFaceoffButton, false, 'non-touch profile should not show the faceoff button before fonts are applied');
            assert.equal(state.hasOverlay, false, 'non-touch profile should not create the quick-pick overlay before fonts are applied');
        }
    });

    it('quick-pick toolbar appears on non-touch pages with an applied font', async (t) => {
        const initial = await getQuickPickState();
        if (initial.isTouchEligible) {
            t.skip('Touch-eligible profile always shows the toolbar');
            return;
        }

        await seedToolbarAppliedFontState();
        await waitForToolbarPresence(true, 'Applied font state should show the desktop toolbar');

        const state = await getQuickPickState();
        assert.equal(state.hasToolbarIframe, true, 'non-touch profile should inject the toolbar iframe when a font is applied');
        assert.equal(state.hasFaceoffButton, true, 'non-touch profile should show the faceoff button when a font is applied');
    });

    it('quick-pick toolbar default size fits all iframe buttons without scrolling', async () => {
        await ensureQuickPickAvailable();

        const state = await getQuickPickState();
        const metrics = await getToolbarIframeMetrics();
        const expectedVisibleButtonCount = state.isTouchEligible ? 6 : 3;
        assert.equal(metrics.buttonCount, 6, 'Toolbar should keep all six button elements available in the iframe');
        assert.equal(
            metrics.visibleButtonCount,
            expectedVisibleButtonCount,
            `Toolbar should display the expected buttons for this input mode: ${JSON.stringify(metrics)}`
        );
        assert.ok(
            metrics.toolbarScrollHeight <= metrics.documentClientHeight + 1,
            `Toolbar should not need vertical scrolling by default: ${JSON.stringify(metrics)}`
        );
        assert.ok(
            metrics.lastButtonBottom <= metrics.documentClientHeight + 1,
            `Last toolbar button should fit in the default iframe height: ${JSON.stringify(metrics)}`
        );
        assert.deepEqual(
            [metrics.rootOverflowX, metrics.bodyOverflowX, metrics.toolbarOverflowX],
            ['hidden', 'hidden', 'hidden'],
            `Toolbar iframe should suppress horizontal scrollbars during hover states: ${JSON.stringify(metrics)}`
        );
    });

    it('quick-pick toolbar recovers when a page removes its injected iframe', async () => {
        await ensureQuickPickAvailable();

        await driver.executeScript(`
            const iframe = document.getElementById('affo-left-toolbar-iframe');
            if (iframe) iframe.remove();
        `);
        await waitForToolbarPresence(true, 'Toolbar should be recreated after its iframe is detached');

        const state = await getQuickPickState();
        assert.equal(state.hasToolbarIframe, true, 'Toolbar iframe should be reattached after page removal');
        assert.equal(state.hasFaceoffButton, true, 'Reattached toolbar iframe should load its controls');
    });

    it('quick-pick toolbar remains visible when page CSS hides html-level iframes', async () => {
        await ensureQuickPickAvailable();

        await driver.executeScript(`
            const style = document.createElement('style');
            style.id = 'affo-test-hide-html-iframes';
            style.textContent = 'html > iframe { display: none !important; }';
            document.head.appendChild(style);
        `);

        try {
            const iframeDisplay = await driver.executeScript(`
                const iframe = document.getElementById('affo-left-toolbar-iframe');
                if (!iframe) return null;
                return {
                    display: getComputedStyle(iframe).display,
                    inlinePriority: iframe.style.getPropertyPriority('display')
                };
            `);

            assert.ok(iframeDisplay, 'Toolbar iframe should exist with hostile page CSS');
            assert.equal(iframeDisplay.display, 'block', 'Toolbar iframe should override page display suppression');
            assert.equal(iframeDisplay.inlinePriority, 'important', 'Toolbar display should retain important priority');
        } finally {
            await driver.executeScript(`
                document.getElementById('affo-test-hide-html-iframes')?.remove();
            `);
        }
    });

    it('quick-pick toolbar hides touch-only buttons on non-touch pages', async (t) => {
        await ensureQuickPickAvailable();

        const state = await getQuickPickState();
        if (state.isTouchEligible) {
            t.skip('Touch-eligible profile keeps close and page navigation buttons visible');
            return;
        }

        const metrics = await getToolbarIframeMetrics();
        assert.deepEqual(
            metrics.visibleButtonIds,
            ['faceoff-button', 'whatfont-button', 'hide-toolbar-button'],
            `Non-touch toolbar should show only the desktop controls: ${JSON.stringify(metrics)}`
        );
        assert.deepEqual(
            metrics.touchOnlyButtons.map((button) => [button.id, button.exists, button.display, button.parentId]),
            [
                ['close-tab-button', true, 'none', ''],
                ['page-up-button', true, 'none', ''],
                ['page-down-button', true, 'none', '']
            ],
            `Touch-only toolbar buttons should remain hidden outside the toolbar: ${JSON.stringify(metrics)}`
        );
    });

    it('quick-pick toolbar appears on non-touch pages with applied Sroulette intent', async (t) => {
        const initial = await getQuickPickState();
        if (initial.isTouchEligible) {
            t.skip('Touch-eligible profile always shows the toolbar');
            return;
        }

        await clearToolbarAppliedState();
        await waitForToolbarPresence(false, 'Cleared font state should hide the desktop toolbar');
        await seedToolbarSrouletteState();
        await waitForToolbarPresence(true, 'Applied Sroulette intent should show the desktop toolbar');

        const state = await getQuickPickState();
        assert.equal(state.hasToolbarIframe, true, 'non-touch profile should inject the toolbar iframe for Sroulette intent');
        assert.equal(state.hasFaceoffButton, true, 'non-touch profile should show the faceoff button for Sroulette intent');
    });

    it('quick-pick toolbar hides on non-touch pages when applied state is cleared', async (t) => {
        const initial = await getQuickPickState();
        if (initial.isTouchEligible) {
            t.skip('Touch-eligible profile keeps the toolbar visible');
            return;
        }

        await seedToolbarAppliedFontState();
        await waitForToolbarPresence(true, 'Applied font state should show the desktop toolbar before clearing');
        await clearToolbarAppliedState();
        await waitForToolbarPresence(false, 'Clearing applied state should hide the desktop toolbar');

        const state = await getQuickPickState();
        assert.equal(state.hasToolbarIframe, false, 'non-touch profile should remove the toolbar iframe after clearing fonts');
        assert.equal(state.hasFaceoffButton, false, 'non-touch profile should remove the faceoff button after clearing fonts');
    });

    it('quick-pick menu element exists in DOM after tapping faceoff', async () => {
        await ensureQuickPickAvailable();

        const clicked = await clickFaceoffButton();
        assert.ok(clicked, 'Faceoff button should be clickable');
        await driver.sleep(500);

        const menuExists = await driver.executeScript(`
            return !!document.getElementById('affo-quick-pick-overlay');
        `);
        assert.ok(menuExists, 'Quick-pick overlay should be created after faceoff button click');
        await closeQuickPickMenu();
    });

    it('quick-pick menu is initially hidden', async () => {
        await ensureQuickPickAvailable();
        await clickFaceoffButton();
        await driver.sleep(500);
        await closeQuickPickMenu();

        const isHidden = await driver.executeScript(`
            const menu = document.getElementById('affo-quick-pick-overlay');
            return menu ? menu.style.display === 'none' : false;
        `);
        assert.ok(isHidden, 'Quick-pick overlay should be hidden initially');
    });

    it('faceoff button exists on left toolbar', async () => {
        await ensureQuickPickAvailable();

        await driver.sleep(1000);
        const state = await getQuickPickState();
        assert.ok(state.hasFaceoffButton, 'Faceoff button should exist on available toolbar');
    });

    it('quick-pick menu closes with close button', async () => {
        await ensureQuickPickAvailable();

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

    it('quick-pick menu has message element', async () => {
        await ensureQuickPickAvailable();

        const messageEl = await driver.executeScript(`
            return !!document.getElementById('affo-quick-pick-message');
        `);
        assert.ok(messageEl, 'Quick-pick menu should have message element');
    });

    it('quick-pick menu has 5 favorite buttons', async () => {
        await ensureQuickPickAvailable();

        const buttonCount = await driver.executeScript(`
            return document.querySelectorAll('#affo-quick-pick-font-1, #affo-quick-pick-font-2, #affo-quick-pick-font-3, #affo-quick-pick-font-4, #affo-quick-pick-font-5').length;
        `);
        assert.equal(buttonCount, 5, 'Menu should have 5 favorite button elements');
    });

    it('quick-pick menu does not expose removed auxiliary actions', async () => {
        await ensureQuickPickAvailable();

        const retiredActions = await driver.executeScript(`
            return {
                unapply: !!document.getElementById('affo-quick-pick-unapply'),
                rewalk: !!document.getElementById('affo-quick-pick-rewalk')
            };
        `);
        assert.equal(retiredActions.unapply, false, 'Quick-pick menu should not have unapply button');
        assert.equal(retiredActions.rewalk, false, 'Quick-pick menu should not have rewalk button');
    });

    it('favorite buttons are styled correctly', async () => {
        await ensureQuickPickAvailable();

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

    it('close button exists and is accessible', async () => {
        await ensureQuickPickAvailable();

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

    it('menu overlay has correct styling', async () => {
        await ensureQuickPickAvailable();

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

    it('quick-pick elements are accessible via IDs', async () => {
        await ensureQuickPickAvailable();

        const elementIds = await driver.executeScript(`
            return {
                overlay: !!document.getElementById('affo-quick-pick-overlay'),
                content: !!document.getElementById('affo-quick-pick-content'),
                message: !!document.getElementById('affo-quick-pick-message'),
                font1: !!document.getElementById('affo-quick-pick-font-1'),
                font2: !!document.getElementById('affo-quick-pick-font-2'),
                font3: !!document.getElementById('affo-quick-pick-font-3'),
                font4: !!document.getElementById('affo-quick-pick-font-4'),
                font5: !!document.getElementById('affo-quick-pick-font-5')
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
    });

    it('faceoff button is clickable', async () => {
        await ensureQuickPickAvailable();

        const buttonInfo = await driver.executeScript(`
            let btn = document.getElementById('faceoff-button');
            return {
                exists: !!btn,
                isButton: btn ? btn.tagName === 'BUTTON' : false,
                isClickable: btn ? !btn.disabled : false
            };
        `);
        if (!buttonInfo.exists) {
            const iframe = await getToolbarIframeElement();
            assert.ok(iframe, 'Toolbar iframe should exist');
            await driver.switchTo().frame(iframe);
            try {
                Object.assign(buttonInfo, await driver.executeScript(`
                    const btn = document.getElementById('faceoff-button');
                    return {
                        exists: !!btn,
                        isButton: btn ? btn.tagName === 'BUTTON' : false,
                        isClickable: btn ? !btn.disabled : false
                    };
                `));
            } finally {
                await driver.switchTo().defaultContent();
            }
        }
        assert.ok(buttonInfo.exists, 'Faceoff button should exist');
        assert.ok(buttonInfo.isButton, 'Faceoff button should be a button element');
        assert.ok(buttonInfo.isClickable, 'Faceoff button should be clickable');
    });
});
