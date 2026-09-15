const { test } = require('node:test');
const assert = require('node:assert/strict');
const firefox = require('selenium-webdriver/firefox');
const { setup, teardown, openPopup, popupExec } = require('./selenium-helper');

test('slider bursts, text commits, axis reset, and immediate popup close preserve final configs', async () => {
    const { driver, profileDir } = await setup();
    try {
        await openPopup(driver);
        for (const [mode, positions] of [
            ['body-contact', ['body']], ['third-man-in', ['serif', 'sans', 'mono']], ['faceoff', ['top', 'bottom']]
        ]) {
            await popupExec(driver, `return performModeSwitch(${JSON.stringify(mode)});`);
            for (const position of positions) {
                const result = await popupExec(driver, `return (async () => {
                    const position = ${JSON.stringify(position)};
                    await loadFont(position, 'Roboto', { fontSource: 'local' });
                    Object.assign(getEffectiveFontDefinition('Roboto'), { axes: ['TEST'], ranges: { TEST: [-10, 10] },
                        steps: { TEST: 1 }, defaults: { TEST: 5 } });
                    generateFontControls(position, 'Roboto');
                    let writes = 0, previews = 0;
                    const originalSet = browser.storage.local.set.bind(browser.storage.local);
                    const originalApply = applyFont;
                    browser.storage.local.set = value => {
                        if ('affoUIState' in value) writes++;
                        return originalSet(value);
                    };
                    window.applyFont = (...args) => { previews++; return originalApply(...args); };
                    const input = document.getElementById(position + '-line-height');
                    for (const value of [1.1, 1.4, 1.9]) {
                        input.value = value;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    const beforeCommit = { writes, previews };
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    const afterCommit = { writes, previews, lineHeight: getCurrentUIConfig(position).lineHeight,
                        preview: document.getElementById(position + '-font-text').style.lineHeight };
                    const axis = document.getElementById(position + '-TEST');
                    axis.value = 7;
                    axis.dispatchEvent(new Event('input', { bubbles: true }));
                    axis.dispatchEvent(new Event('change', { bubbles: true }));
                    const axisWrites = writes - afterCommit.writes;
                    const text = document.getElementById(position + '-TEST-text');
                    text.value = '0';
                    text.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
                    text.dispatchEvent(new Event('blur'));
                    const zero = getCurrentUIConfig(position).variableAxes.TEST;
                    const textWrites = writes - afterCommit.writes - axisWrites;
                    axis.closest('.control-group').querySelector('.axis-reset-btn').click();
                    const reset = getCurrentUIConfig(position).variableAxes.TEST;
                    const mode = ${JSON.stringify(mode)};
                    const key = AFFOPopupPanelUtils.MODE_CONFIG[mode].stateKeys[position];
                    const stored = (await browser.storage.local.get('affoUIState')).affoUIState[mode][key];
                    browser.storage.local.set = originalSet;
                    window.applyFont = originalApply;
                    return { beforeCommit, afterCommit, axisWrites, textWrites, zero, reset: reset ?? null, stored };
                })();`);
                assert.deepEqual(result.beforeCommit, { writes: 3, previews: 0 }, position);
                assert.deepEqual(result.afterCommit, { writes: 3, previews: 1, lineHeight: 1.9, preview: '1.9' }, position);
                assert.equal(result.axisWrites, 1, position);
                assert.equal(result.textWrites, 1, 'Enter followed by blur must not save twice');
                assert.equal(result.zero, 0, 'Zero must remain a valid custom-axis value');
                assert.equal(result.reset, null);
                assert.deepEqual(result.stored.variableAxes, {});
                assert.equal(result.stored.lineHeight, 1.9);
            }
        }
        // Dispatch and close in the SAME browser task, before an animation frame or
        // a save promise can complete in the popup. No artificial flush on close.
        await driver.setContext(firefox.Context.CHROME);
        await driver.executeScript(`
            const b = Array.from(document.querySelectorAll('browser')).find(b => b.currentURI?.spec.includes('popup.html'));
            const sb = Cu.Sandbox(b.contentWindow, { sandboxPrototype: b.contentWindow, wantXrays: false });
            Cu.evalInSandbox("const slider = document.getElementById('top-line-height'); slider.value = '2.17'; slider.dispatchEvent(new Event('input', {bubbles:true}));", sb);
            document.getElementById('customizationui-widget-panel').hidePopup();
        `);
        await driver.setContext(firefox.Context.CONTENT);
        await openPopup(driver);
        const stored = await popupExec(driver, `return browser.storage.local.get('affoUIState');`);
        assert.equal(stored.affoUIState.faceoff.topFont.lineHeight, 2.17);
        // AFFO intentionally reopens in Body Contact rather than remembering Face-off.
        await popupExec(driver, "return performModeSwitch('faceoff');");
        await driver.wait(async () => popupExec(driver, `return !!getCurrentUIConfig('top');`), 15000);
        assert.equal(await popupExec(driver, `return getCurrentUIConfig('top').lineHeight;`), 2.17);
    } finally {
        await teardown(driver, profileDir);
    }
});
