const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, openPopup, popupExec } = require('./selenium-helper');

test('native popup highlights original families and removes each scoped substitution independently', async () => {
    const { driver, profileDir } = await setup();
    const popup = script => popupExec(driver, script);
    const page = script => driver.executeScript('return ' + script);
    const ready = () => driver.wait(() => popup("return !!document.querySelector('#line-source option') && !document.querySelector('#line-source').disabled"), 15000);
    const marks = () => page("Array.from(CSS.highlights.get('affo-line-change') || [], range => range.startContainer.parentElement.id)");
    const family = id => page(`getComputedStyle(document.getElementById('${id}')).fontFamily`);
    try {
        await driver.executeScript(`document.body.innerHTML =
            '<p id="first" style="font-family:Arial,sans-serif">First</p>' +
            '<p id="fallback" style="font-family:Georgia,Arial,serif">Fallback</p>'`);
        await openPopup(driver);
        await ready();
        await popup("document.querySelector('#line-highlight').click()");
        await driver.wait(async () => (await marks()).length > 0, 10000);
        assert.deepEqual(await marks(), ['first']);
        await ready();
        await popup("document.querySelector('#line-apply').click()");
        await driver.wait(async () => await family('first') === 'Georgia', 10000);
        await ready();
        await popup("const source=document.querySelector('#line-source'); source.value='Georgia'; source.dispatchEvent(new Event('change'))");
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
