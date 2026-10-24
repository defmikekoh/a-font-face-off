/* global document */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setup, teardown, openPopup, closePopup, popupExec } = require('./selenium-helper');

test('directory settings isolate Apply and Quick Pick, follow SPA navigation, and fall back to domain', { timeout: 120000 }, async () => {
    const server = http.createServer((_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><title>Directory fonts</title><style>body{font:16px serif;color:rgb(0,0,0)}</style><main><p id="sample">This is a long readable paragraph for testing directory font settings and inheritance across different parts of the same website.</p></main>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    let driver, profileDir;
    const config = color => ({ fontName: 'Georgia', fontSource: 'local', fontColor: color });
    try {
        ({ driver, profileDir } = await setup());
        await driver.get(base + '/');
        await openPopup(driver);
        const optionsUrl = await popupExec(driver, `return browser.storage.local.set({affoApplyMap: {'127.0.0.1': {body: ${JSON.stringify(config('#ff0000'))}}}}).then(() => browser.runtime.getURL('options.html'));`);
        await closePopup(driver);
        await driver.get(optionsUrl);
        await driver.executeScript(function (value) {
            document.getElementById('font-path-scopes').value = value;
            document.getElementById('save-font-path-scopes').click();
        }, '127.0.0.1/wiki/\n127.0.0.1/jira/\n127.0.0.1/wiki/admin/');
        await driver.wait(async () => (await driver.executeScript("return document.getElementById('status-font-path-scopes').textContent")).startsWith('Saved'), 5000);

        async function waitColor(color) {
            await driver.wait(async () => (await driver.executeScript("return getComputedStyle(document.getElementById('sample')).color")) === color, 15000, 'Expected ' + color);
        }
        await driver.get(base + '/wiki/page');
        await waitColor('rgb(255, 0, 0)');
        await openPopup(driver);
        assert.equal(await popupExec(driver, 'return getActiveOrigin();'), '127.0.0.1/wiki/');
        assert.equal(await popupExec(driver, `return applyFontToPage('body', ${JSON.stringify(config('#0000ff'))});`), true);
        assert.equal(await popupExec(driver, "return browser.storage.local.get('affoApplyMap').then(d => d.affoApplyMap['127.0.0.1'].body.fontColor);"), '#ff0000');
        await closePopup(driver);
        await waitColor('rgb(0, 0, 255)');
        await driver.executeScript("history.pushState({}, '', '/jira/issue');");
        await waitColor('rgb(255, 0, 0)');
        await driver.executeScript("history.pushState({}, '', '/wiki/admin/users');");
        await waitColor('rgb(255, 0, 0)');
        await driver.executeScript("history.pushState({}, '', '/wiki?query=1#part');");
        await waitColor('rgb(0, 0, 255)');
        await driver.executeScript("history.pushState({}, '', '/wikipedia/');");
        await waitColor('rgb(255, 0, 0)');

        // Quick Pick resolves from the sender's full page URL, then changes only jira.
        await driver.get(base + '/jira/issue');
        await openPopup(driver);
        const tabId = await popupExec(driver, 'return getTargetTabForPopup().then(t => t.id);');
        await popupExec(driver, `return browser.scripting.executeScript({target:{tabId:${tabId}},func: () => browser.runtime.sendMessage({type:'quickApplyFavorite',origin:location.hostname,position:'serif',fontConfig:{fontName:'Georgia',fontSource:'local',fontColor:'#008000'}})});`);
        const map = await popupExec(driver, "return browser.storage.local.get('affoApplyMap').then(d => d.affoApplyMap);");
        assert.equal(map['127.0.0.1/jira/'].serif.fontColor, '#008000');
        assert.equal(map['127.0.0.1'].serif, undefined);
        assert.equal(map['127.0.0.1/wiki/'].body.fontColor, '#0000ff');
        // Clearing directory settings retains the directory instead of reverting to domain.
        await popupExec(driver, "return clearApplyMapForOrigin('127.0.0.1/jira/');");
        assert.deepEqual(await popupExec(driver, "return getApplyMapForOrigin('127.0.0.1/jira/');"), {});
        await closePopup(driver);
        await driver.get(base + '/jira/issue');
        await waitColor('rgb(0, 0, 0)');

        // Removing the scope through Settings restores domain inheritance.
        await driver.get(optionsUrl);
        await driver.executeScript("document.getElementById('font-path-scopes').value = '127.0.0.1/wiki/'; document.getElementById('save-font-path-scopes').click();");
        await driver.wait(async () => (await driver.executeScript("return document.getElementById('status-font-path-scopes').textContent")).startsWith('Saved'), 5000);
        await driver.get(base + '/jira/issue');
        await waitColor('rgb(255, 0, 0)');

        // Inline hosts also remove the previous scope's properties on SPA navigation.
        await openPopup(driver);
        await popupExec(driver, `return browser.storage.local.set({affoInlineApplyDomains:['127.0.0.1'],affoApplyMap:{
            '127.0.0.1':{body:${JSON.stringify(config('#ff0000'))}},
            '127.0.0.1/wiki/':{serif:${JSON.stringify(config('#0000ff'))}},
            '127.0.0.1/jira/':{}
        }});`);
        await closePopup(driver);
        await driver.get(base + '/wiki/article');
        await waitColor('rgb(0, 0, 255)');
        await driver.executeScript("history.pushState({}, '', '/jira/issue');");
        await waitColor('rgb(0, 0, 0)');
        assert.equal(await driver.executeScript("return document.getElementById('sample').style.fontFamily"), '');
    } finally {
        await teardown(driver, profileDir);
        await new Promise(resolve => server.close(resolve));
    }
});
