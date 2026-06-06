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

        // Wait for the mode-switch transition AND the browser-action panel resize
        // to settle (the popup can briefly report a collapsed body height right
        // after switching) before measuring the flex-column layout.
        await driver.wait(async () => popupExec(driver, `
            return !document.body.classList.contains('mode-switching') &&
                document.getElementById('panel-grips').getBoundingClientRect().height > 0 &&
                document.body.getBoundingClientRect().height >= 500;
        `), 5000);

        const defaults = await popupExec(driver, `
            return {
                topHeading: document.getElementById('top-font-name')?.textContent.trim(),
                topDisplay: document.getElementById('top-font-display')?.textContent.trim(),
                topPreviewStyle: document.getElementById('top-font-text')?.getAttribute('style') || '',
                bottomHeading: document.getElementById('bottom-font-name')?.textContent.trim(),
                bottomDisplay: document.getElementById('bottom-font-display')?.textContent.trim(),
                bottomPreviewStyle: document.getElementById('bottom-font-text')?.getAttribute('style') || '',
                topMinHeight: getComputedStyle(document.getElementById('top-font-section')).minHeight,
                bottomMinHeight: getComputedStyle(document.getElementById('bottom-font-section')).minHeight,
                bodyDisplay: getComputedStyle(document.body).display,
                topOverscrollBehavior: getComputedStyle(document.getElementById('top-font-section')).overscrollBehaviorY,
                bottomOverscrollBehavior: getComputedStyle(document.getElementById('bottom-font-section')).overscrollBehaviorY,
                previewPaintContainment: getComputedStyle(document.getElementById('font-preview-rink')).contain,
                comparisonPosition: getComputedStyle(document.getElementById('font-comparison')).position,
                gripsPosition: getComputedStyle(document.getElementById('panel-grips')).position,
                comparisonBottom: document.getElementById('font-comparison').getBoundingClientRect().bottom,
                previewRinkBottom: document.getElementById('font-preview-rink').getBoundingClientRect().bottom,
                gripsTop: document.getElementById('panel-grips').getBoundingClientRect().top,
                gripsBottom: document.getElementById('panel-grips').getBoundingClientRect().bottom,
                viewportHeight: window.innerHeight,
                sectionHeightDifference: Math.abs(
                    document.getElementById('top-font-section').getBoundingClientRect().height -
                    document.getElementById('bottom-font-section').getBoundingClientRect().height
                )
            };
        `);
        assert.equal(defaults.topHeading, 'ABeeZee');
        assert.equal(defaults.topDisplay, 'ABeeZee');
        assert.match(defaults.topPreviewStyle, /font-family:\s*"ABeeZee"/);
        assert.equal(defaults.bottomHeading, 'Zilla Slab Highlight');
        assert.equal(defaults.bottomDisplay, 'Zilla Slab Highlight');
        assert.match(defaults.bottomPreviewStyle, /font-family:\s*"Zilla Slab Highlight"/);
        assert.equal(defaults.topMinHeight, '0px');
        assert.equal(defaults.bottomMinHeight, '0px');
        assert.equal(defaults.topOverscrollBehavior, 'contain');
        assert.equal(defaults.bottomOverscrollBehavior, 'contain');
        assert.equal(defaults.previewPaintContainment, 'paint');
        // Three-rectangle flex column: mode-tabs / #font-comparison (flex:1) /
        // #panel-grips (last row, height includes the gesture strip via
        // --panel-grips-total). The bar is the intrinsic last row, so it sits at the
        // bottom and the preview content ends exactly at the bar top — no overlap.
        assert.equal(defaults.bodyDisplay, 'flex');
        assert.equal(defaults.comparisonPosition, 'relative');
        assert.equal(defaults.gripsPosition, 'relative');
        assert.ok(
            Math.abs(defaults.gripsBottom - defaults.viewportHeight) < 1,
            `Face-off bottom bar should sit at the viewport bottom: ${JSON.stringify({
                gripsBottom: defaults.gripsBottom,
                viewportHeight: defaults.viewportHeight
            })}`
        );
        assert.ok(
            Math.abs(defaults.previewRinkBottom - defaults.gripsTop) < 1,
            `Face-off preview content should end exactly at the bottom bar (no overlap): ${JSON.stringify({
                previewRinkBottom: defaults.previewRinkBottom,
                gripsTop: defaults.gripsTop
            })}`
        );
        assert.ok(defaults.sectionHeightDifference < 1, 'Face-off preview halves should share the available height');

        // Verify cloned top/bottom control panels have correct elements
        const panels = await popupExec(driver, `
            return ['top', 'bottom'].map(pos => ({
                pos,
                panel: !!document.getElementById(pos + '-font-controls'),
                display: !!document.getElementById(pos + '-font-display'),
                sizeSlider: !!document.getElementById(pos + '-font-size'),
                sizeText: !!document.getElementById(pos + '-font-size-text'),
                weightSlider: !!document.getElementById(pos + '-font-weight'),
                weightStep: document.getElementById(pos + '-font-weight')?.step,
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
            assert.equal(p.weightStep, '50', `${p.pos} font-weight slider allows midpoint weights`);
            assert.ok(p.axesContainer, `${p.pos} axes container exists`);
            assert.ok(p.applyBtn, `${p.pos} apply button exists`);
            assert.ok(p.resetBtn, `${p.pos} reset button exists`);
        }
    });

    it('keeps the newest Face-off font when an older load finishes later', async () => {
        const result = await popupExec(driver, `
            return (async () => {
                const originalGetOrCreate = getOrCreateFontDefinition;
                getOrCreateFontDefinition = async function(fontName) {
                    if (fontName === 'ABeeZee') {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    return originalGetOrCreate(fontName);
                };
                try {
                    const staleLoad = loadFont('top', 'ABeeZee', { suppressImmediateSave: true });
                    await new Promise(resolve => setTimeout(resolve, 20));
                    await loadFont('top', 'Rubik', { suppressImmediateSave: true });
                    await staleLoad;
                    return {
                        heading: document.getElementById('top-font-name')?.textContent.trim(),
                        display: document.getElementById('top-font-display')?.textContent.trim(),
                        previewStyle: document.getElementById('top-font-text')?.getAttribute('style') || ''
                    };
                } finally {
                    getOrCreateFontDefinition = originalGetOrCreate;
                }
            })();
        `);

        assert.equal(result.heading, 'Rubik');
        assert.equal(result.display, 'Rubik');
        assert.match(result.previewStyle, /font-family:\s*"Rubik"/);
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
                weightStep: document.getElementById(pos + '-font-weight')?.step,
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
            assert.equal(p.weightStep, '50', `${p.pos} font-weight slider allows midpoint weights`);
            assert.ok(p.axesContainer, `${p.pos} axes container exists`);
            assert.ok(p.applyBtn, `${p.pos} apply button exists`);
            assert.ok(p.resetBtn, `${p.pos} reset button exists`);
        }
    });

    it('offers Sroulette pools in the mono panel favorites picker', async () => {
        await popupExec(driver, `
            browser.storage.local.set({
                affoSubstackRoulette: true,
                affoSubstackRouletteSerif: ['Integration Serif'],
                affoSubstackRouletteSans: ['Integration Sans'],
                affoFavorites: {
                    'Integration Serif': { fontName: 'Lora', variableAxes: {} },
                    'Integration Sans': { fontName: 'Inter', variableAxes: {} }
                },
                affoFavoritesOrder: ['Integration Serif', 'Integration Sans']
            });
            document.querySelector('[data-mode="third-man-in"]').click();
            return true;
        `);
        await driver.sleep(300);

        await popupExec(driver, `
            showFavoritesPopup('mono');
            return true;
        `);
        await driver.sleep(300);

        const result = await popupExec(driver, `
            const serifChoice = document.querySelector('.sroulette-favorite-item[data-sroulette-pool="serif"]');
            const sansChoice = document.querySelector('.sroulette-favorite-item[data-sroulette-pool="sans"]');
            if (serifChoice) serifChoice.click();
            return {
                hasSerifChoice: !!serifChoice,
                hasSansChoice: !!sansChoice,
                state: getCurrentPanelState('mono'),
                display: document.getElementById('mono-font-display')?.textContent.trim()
            };
        `);

        assert.equal(result.hasSerifChoice, true, 'Mono favorites should offer the configured serif pool');
        assert.equal(result.hasSansChoice, true, 'Mono favorites should offer the configured sans pool');
        assert.deepEqual(result.state, { kind: 'sroulette', pool: 'serif' });
        assert.equal(result.display, 'Sroulette Serif');
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

    it('sroulette selection resets controls and marker clears the body panel', async () => {
        await popupExec(driver, 'document.querySelector(\'[data-mode="body-contact"]\').click()');
        await driver.sleep(300);

        const result = await popupExec(driver, `
            const sizeGroup = document.querySelector('#body-font-controls .control-group[data-control="font-size"]');
            const lineHeightGroup = document.querySelector('#body-font-controls .control-group[data-control="line-height"]');
            const sizeSlider = document.getElementById('body-font-size');
            const sizeText = document.getElementById('body-font-size-text');
            const lineHeightSlider = document.getElementById('body-line-height');
            const lineHeightText = document.getElementById('body-line-height-text');
            if (sizeGroup) sizeGroup.classList.remove('unset');
            if (sizeSlider) sizeSlider.value = '24';
            if (sizeText) sizeText.value = '24';
            if (lineHeightGroup) lineHeightGroup.classList.remove('unset');
            if (lineHeightSlider) lineHeightSlider.value = '1.9';
            if (lineHeightText) lineHeightText.value = '1.9';

            markPanelAsSroulette('body', 'serif');
            const selected = {
                panelState: getCurrentPanelState('body').kind,
                sizeValue: sizeSlider ? sizeSlider.value : null,
                sizeTextValue: sizeText ? sizeText.value : null,
                sizeGroupUnset: sizeGroup ? sizeGroup.classList.contains('unset') : null,
                lineHeightValue: lineHeightSlider ? lineHeightSlider.value : null,
                lineHeightTextValue: lineHeightText ? lineHeightText.value : null,
                lineHeightGroupUnset: lineHeightGroup ? lineHeightGroup.classList.contains('unset') : null
            };

            const marker = document.querySelector('#body-font-controls .sroulette-wheel-marker');
            if (marker) marker.click();

            const panel = document.getElementById('body-font-controls');
            const display = document.getElementById('body-font-display');
            const preview = document.getElementById('body-font-text');
            const groups = Array.from(panel.querySelectorAll('.control-group'));

            return {
                markerExisted: !!marker,
                selected,
                displayText: display ? display.textContent.trim() : null,
                showingSroulette: display ? display.classList.contains('sroulette-display') : null,
                markerCount: panel.querySelectorAll('.sroulette-wheel-marker').length,
                sizeDisabled: sizeSlider ? sizeSlider.disabled : null,
                sizeValue: sizeSlider ? sizeSlider.value : null,
                sizeTextValue: sizeText ? sizeText.value : null,
                allGroupsUnset: groups.every(group => group.classList.contains('unset')),
                panelState: getCurrentPanelState('body').kind,
                previewStyle: preview ? preview.getAttribute('style') || '' : ''
            };
        `);

        assert.equal(result.markerExisted, true, 'Sroulette marker should render');
        assert.equal(result.selected.panelState, 'sroulette');
        assert.equal(result.selected.sizeValue, '17');
        assert.equal(result.selected.sizeTextValue, '17');
        assert.equal(result.selected.sizeGroupUnset, true);
        assert.equal(result.selected.lineHeightValue, '1.5');
        assert.equal(result.selected.lineHeightTextValue, '1.5');
        assert.equal(result.selected.lineHeightGroupUnset, true);
        assert.equal(result.displayText, 'Default');
        assert.equal(result.showingSroulette, false);
        assert.equal(result.markerCount, 0);
        assert.equal(result.sizeDisabled, false);
        assert.equal(result.sizeValue, '17');
        assert.equal(result.sizeTextValue, '17');
        assert.equal(result.allGroupsUnset, true);
        assert.equal(result.panelState, 'empty');
        assert.equal(result.previewStyle.includes('24px'), false, 'preview should not keep stale font size');
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

    it('consumes a page-font draft into Face-off top without saving it', async () => {
        await popupExec(driver, `
            return browser.storage.local.set({
                affoUIState: {
                    'body-contact': {},
                    faceoff: {
                        topFont: { fontName: 'Lora', variableAxes: {} },
                        bottomFont: { fontName: 'Rubik', variableAxes: {} }
                    },
                    'third-man-in': {}
                },
                affoFaceoffPageFontDraft: {
                    createdAt: Date.now(),
                    sourceUrl: location.href,
                    config: {
                        fontName: 'Ephemeral Test Font',
                        variableAxes: { wght: 500 },
                        fontFaceRule: '@font-face { font-family: "Ephemeral Test Font"; src: local("Arial"); font-weight: 200 900; }'
                    },
                    fontDefinition: {
                        axes: ['wght'],
                        defaults: { wght: 400 },
                        ranges: { wght: [200, 900] }
                    }
                }
            }).then(() => true);
        `);
        await closePopup(driver);
        await openPopup(driver);
        await driver.sleep(1000);

        const state = await popupExec(driver, `
            return browser.storage.local.get(['affoUIState', 'affoFaceoffPageFontDraft']).then((stored) => {
                const topAxis = {
                    value: document.getElementById('top-wght')?.value,
                    min: document.getElementById('top-wght')?.min,
                    max: document.getElementById('top-wght')?.max,
                    active: !document.querySelector('#top-font-controls .control-group[data-axis="wght"]')?.classList.contains('unset')
                };
                const topPreviewStyle = document.getElementById('top-font-text')?.getAttribute('style') || '';
                document.querySelector('#top-font-controls .control-group[data-axis="wght"] .axis-reset-btn')?.click();
                return {
                    activeMode: document.querySelector('[data-mode].active')?.dataset?.mode,
                    topFont: document.getElementById('top-font-display')?.textContent.trim(),
                    bottomFont: document.getElementById('bottom-font-display')?.textContent.trim(),
                    topPreviewStyle,
                    topApplyDisabled: document.getElementById('apply-top')?.disabled,
                    topSaveDisabled: document.getElementById('top-save-favorite-bar')?.disabled,
                    topAxis,
                    resetAxisValue: document.getElementById('top-wght')?.value,
                    injectedRule: !!document.getElementById('affo-custom-font-Ephemeral-Test-Font'),
                    draftPresent: !!stored.affoFaceoffPageFontDraft,
                    savedTopFont: stored.affoUIState?.faceoff?.topFont?.fontName
                };
            });
        `);

        assert.equal(state.activeMode, 'faceoff');
        assert.equal(state.topFont, 'Ephemeral Test Font');
        assert.equal(state.bottomFont, 'Rubik');
        assert.match(state.topPreviewStyle, /Ephemeral Test Font/);
        assert.doesNotMatch(state.topPreviewStyle, /font-weight/);
        assert.match(state.topPreviewStyle, /font-variation-settings:\s*"wght" 500/);
        assert.equal(state.topApplyDisabled, true);
        assert.equal(state.topSaveDisabled, true);
        assert.deepEqual(state.topAxis, { value: '500', min: '200', max: '900', active: true });
        assert.equal(state.resetAxisValue, '400');
        assert.equal(state.injectedRule, true);
        assert.equal(state.draftPresent, false, 'one-shot page-font draft should be removed after opening');
        assert.equal(state.savedTopFont, 'Lora', 'ephemeral top font should not replace saved Face-off state');
    });
});
