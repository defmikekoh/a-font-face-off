const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, openPopup, closePopup, popupExec } = require('./selenium-helper');

test('native popup highlights original families and removes each scoped substitution independently', async () => {
    const { driver, profileDir } = await setup();
    const popup = script => popupExec(driver, script);
    const page = script => driver.executeScript('return ' + script);
    const ready = () => driver.wait(() => popup("return !!document.querySelector('#line-source button') && !document.querySelector('#line-apply').disabled"), 15000);
    const marks = () => page("Array.from(CSS.highlights.get('affo-line-change') || [], range => range.startContainer.parentElement.id)");
    const family = id => page(`getComputedStyle(document.getElementById('${id}')).fontFamily`);
    try {
        await driver.executeScript(`document.body.innerHTML =
            '<p id="first" style="font-family:Arial,sans-serif">First</p>' +
            '<p id="fallback" style="font-family:Georgia,Arial,serif">Fallback</p>'`);
        await openPopup(driver);
        await ready();
        await popup("Array.from(document.querySelectorAll('#line-source button')).find(button => button.textContent === 'Arial').click()");
        await ready();
        await popup("document.querySelector('#line-highlight').click()");
        await driver.wait(async () => (await marks()).length > 0, 10000);
        assert.deepEqual(await marks(), ['first']);
        await ready();
        await popup("document.querySelector('#line-apply').click()");
        await driver.wait(async () => await family('first') === 'Georgia', 10000);
        await ready();
        await popup("Array.from(document.querySelectorAll('#line-source button')).find(button => button.textContent === 'Georgia').click()");
        await driver.wait(async () => (await marks()).includes('fallback'), 10000);
        assert.deepEqual(await marks(), ['fallback']);
        await ready();
        await popup("return applyFontConfig('line',{fontName:'Arial',fontSource:'local',fontSize:27}).then(() => document.querySelector('#line-apply').click())");
        await driver.wait(async () => await family('fallback') === 'Arial', 10000);
        assert.equal(await page("getComputedStyle(document.querySelector('#fallback')).fontSize"), '27px');
        await ready();
        const trash = '#line-rules button[aria-label="Remove substitution for Arial"]';
        assert.equal(await popup(`return document.querySelector('${trash}').textContent`), '🗑️');
        await popup(`document.querySelector('${trash}').click()`);
        await driver.wait(async () => (await family('first')).startsWith('Arial,'), 10000);
        assert.equal(await family('fallback'), 'Arial');
        assert.equal(await popup("return document.querySelectorAll('#line-rules li').length"), 1);
    } finally {
        await teardown(driver, profileDir);
    }
});

test('loading a Line Change favorite clears the default Sroulette target and keeps controls active', async () => {
    const { driver, profileDir } = await setup();
    const popup = script => popupExec(driver, script);
    try {
        await driver.executeScript("document.body.innerHTML = '<p style=\"font-family:Arial,sans-serif\">Favorite target</p>'");
        await openPopup(driver);
        await driver.wait(() => popup("return !!document.querySelector('#line-source button') && !document.querySelector('#line-apply').disabled"), 15000);
        await popup(`
            return browser.storage.local.set({
                affoFavorites: { 'Chosen favorite': { fontName: 'Lora', variableAxes: {} } },
                affoFavoritesOrder: ['Chosen favorite'],
                affoSubstackRouletteSerif: ['Chosen favorite']
            });
        `);
        await closePopup(driver);
        await openPopup(driver);
        await driver.wait(() => popup("return document.getElementById('line-font-display').dataset.affoSroulettePool === 'serif' && !document.getElementById('line-apply').disabled"), 15000);
        await popup(`
            document.getElementById('line-in-grip').click();
            document.getElementById('line-load-favorite-bar').click();
        `);
        await driver.wait(() => popup("return document.querySelector('#favorites-popup').classList.contains('visible')"), 5000);
        await popup("document.querySelector('[data-favorite-name=\"Chosen favorite\"]')?.click()");
        await driver.wait(() => popup(`
            return !document.getElementById('favorites-popup').classList.contains('visible') &&
                document.getElementById('line-font-display').textContent === 'Lora' &&
                !document.getElementById('line-font-controls').classList.contains('sroulette-applied');
        `), 10000);
        assert.equal(await popup("return document.getElementById('line-font-size').disabled"), false);
        await popup("document.getElementById('line-apply').click()");
        await driver.wait(() => popup(`
            return getActiveOrigin().then(scope => browser.storage.local.get('affoApplyMap').then(({affoApplyMap}) =>
                affoApplyMap?.[scope]?.lineChange?.[0]?.target?.fontName === 'Lora'));
        `), 10000);
    } finally {
        await teardown(driver, profileDir);
    }
});
