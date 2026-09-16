const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setup, teardown, openPopup, closePopup, popupExec } = require('./selenium-helper');

test('inline TMI applies, leaves equivalent CSS intact, and recovers damaged styles and dynamic text', { timeout: 90000 }, async () => {
    const server = http.createServer((_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><title>Inline TMI</title><style>body{font:16px serif}p:nth-child(3n){font-weight:700}</style><main>' +
            Array.from({ length: 500 }, (_, i) => `<p id="p${i}">Readable paragraph ${i} with sufficient content for the TMI classifier.</p>`).join('') + '</main>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let driver, profileDir;
    try {
        ({ driver, profileDir } = await setup());
        const url = `http://127.0.0.1:${server.address().port}/`;
        await driver.get(url);
        await openPopup(driver);
        await popupExec(driver, `return browser.storage.local.set({
            affoInlineApplyDomains: ['127.0.0.1'],
            affoApplyMap: {'127.0.0.1': {serif: {fontName: 'Georgia', fontSource: 'local',
                fontColor: '#ff0000', fontSizeScale: 125, variableAxes: {wght: 450, wdth: 90}}}}
        }).then(() => true);`);
        await closePopup(driver);
        await driver.get(url);
        await driver.wait(async () => driver.executeScript("return document.querySelectorAll('p[data-affo-protected]').length === 500 && document.getElementById('p499').style.fontSize === '20px'"), 25000);
        assert.equal(await driver.executeScript("return document.getElementById('p2').style.fontWeight"), '700');
        assert.equal(await driver.executeScript("return document.getElementById('p0').style.color"), 'rgb(255, 0, 0)');
        // Real browser CSSOM normalization must not trigger writes on focus or polling.
        await driver.executeScript(`window.inlineWrites = 0;
            window.inlineObserver = new MutationObserver(records => { window.inlineWrites += records.length; });
            window.inlineObserver.observe(document.querySelector('main'), {subtree:true, attributes:true, attributeFilter:['style']});
            window.dispatchEvent(new Event('focus'));`);
        await driver.sleep(3500);
        assert.equal(await driver.executeScript('return window.inlineWrites'), 0, 'Intact recovery and polling must not rewrite normalized values');
        await driver.executeScript(`window.inlineObserver.disconnect();
            const p = document.getElementById('p499');
            p.style.removeProperty('font-family');
            p.style.removeProperty('color');
            p.style.setProperty('font-variation-settings', '"wght" 100', 'important');
            p.removeAttribute('data-affo-protected');
            window.dispatchEvent(new Event('focus'));`);
        await driver.wait(async () => driver.executeScript(`const p = document.getElementById('p499'); return p.hasAttribute('data-affo-protected') && p.style.color === 'rgb(255, 0, 0)' && p.style.fontFamily.includes('Georgia') && p.style.fontVariationSettings.includes('450');`), 15000);
        await driver.executeScript(`const p = document.createElement('p'); p.id = 'added'; p.textContent = 'Dynamic readable text should be classified, protected and scaled after insertion.'; document.querySelector('main').append(p);`);
        await driver.wait(async () => driver.executeScript("const p = document.getElementById('added'); return p.getAttribute('data-affo-font-type') === 'serif' && p.hasAttribute('data-affo-protected') && p.style.fontSize === '20px';"), 15000);
    } finally {
        await teardown(driver, profileDir);
        await new Promise(resolve => server.close(resolve));
    }
});
