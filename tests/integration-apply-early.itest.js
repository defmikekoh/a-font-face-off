const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setup, teardown, openPopup, closePopup, popupExec } = require('./selenium-helper');

let driver;
let profileDir;
let server;
let url;
const host = '127.0.0.1';

describe('Apply Early saved-font startup', { concurrency: false }, () => {
    before(async () => {
        server = http.createServer((req, res) => {
            if (req.url === '/slow.js') {
                res.setHeader('Content-Type', 'text/javascript');
                setTimeout(() => res.end('/* parser released */'), 2000);
                return;
            }
            res.setHeader('Content-Type', 'text/html');
            res.end(`<!doctype html><html><head><style>p { font-family: Arial, sans-serif }</style></head><body>
                <p id="early">This article paragraph is available while the remainder of the document is still loading.</p>
                <script>
                window.earlyApplied = false;
                const timer = setInterval(() => {
                    if (document.readyState === 'loading' && document.querySelector('style[id^="a-font-face-off-style-"]')) {
                        window.earlyApplied = true;
                    }
                }, 10);
                document.addEventListener('DOMContentLoaded', () => clearInterval(timer));
                </script>
                <script src="/slow.js"></script>
                <p id="late">This later article paragraph must also receive its configured reading font.</p>
                </body></html>`);
        });
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, host, resolve);
        });
        url = `http://${host}:${server.address().port}/`;
        ({ driver, profileDir } = await setup());
    });

    after(async () => {
        await teardown(driver, profileDir);
        if (server) await new Promise(resolve => server.close(resolve));
    });

    async function seed(type, early, wait = []) {
        await openPopup(driver);
        await popupExec(driver, `return browser.storage.local.set(${JSON.stringify({
            affoApplyEarlyDomains: early,
            affoWaitForItDomains: wait,
            affoApplyMap: { [host]: { [type]: { fontName: 'Georgia', fontSource: 'local', variableAxes: {} } } }
        })}).then(() => true);`);
        await closePopup(driver);
    }

    for (const type of ['body', 'sans']) {
        it(`restores ${type} before parsing finishes and covers later content`, async () => {
            await seed(type, [host]);
            await driver.get(url);
            assert.equal(await driver.executeScript('return window.earlyApplied'), true);
            await driver.wait(async () => driver.executeScript(
                "return getComputedStyle(document.getElementById('late')).fontFamily.includes('Georgia')"
            ), 5000);
        });
    }

    it('an explicit empty list preserves normal startup', async () => {
        await seed('body', []);
        await driver.get(url);
        assert.equal(await driver.executeScript('return window.earlyApplied'), false);
        await driver.wait(async () => driver.executeScript(
            "return !!document.getElementById('a-font-face-off-style-body')"
        ), 5000);
    });

    it('Wait For It suppresses early and automatic application on overlap', async () => {
        await seed('body', [host], [host]);
        await driver.get(url);
        assert.equal(await driver.executeScript('return window.earlyApplied'), false);
        assert.equal(await driver.executeScript(
            "return !!document.querySelector('style[id^=\"a-font-face-off-style-\"]')"
        ), false);
    });
    it('options show the unset default, save empty, reset, and resolve conflicting lists', async () => {
        await openPopup(driver);
        const optionsUrl = await popupExec(driver, "return browser.runtime.getURL('options.html');");
        await popupExec(driver, "return browser.storage.local.remove(['affoApplyEarlyDomains', 'affoWaitForItDomains']).then(() => true);");
        await closePopup(driver);
        await driver.get(optionsUrl);
        await driver.wait(async () => driver.executeScript(
            "return document.getElementById('apply-early-domains').value === 'www.tomsguide.com'"
        ), 5000);
        await driver.executeScript("document.getElementById('apply-early-domains').value = ''; document.getElementById('save-apply-early').click();");
        await driver.wait(async () => driver.executeAsyncScript(
            "const done = arguments[arguments.length - 1]; browser.storage.local.get('affoApplyEarlyDomains').then(d => done(Array.isArray(d.affoApplyEarlyDomains) && d.affoApplyEarlyDomains.length === 0));"
        ), 5000);
        await driver.executeScript("document.getElementById('reset-apply-early').click();");
        await driver.wait(async () => driver.executeScript(
            "return document.getElementById('apply-early-domains').value === 'www.tomsguide.com'"
        ), 5000);
        await driver.executeScript("document.getElementById('waitforit-domains').value = 'www.tomsguide.com'; document.getElementById('save-waitforit').click();");
        await driver.wait(async () => driver.executeScript(
            "return document.getElementById('apply-early-domains').value === ''"
        ), 5000);
        await driver.executeScript("document.getElementById('reset-apply-early').click();");
        await driver.wait(async () => driver.executeScript(
            "return document.getElementById('waitforit-domains').value === '' && document.getElementById('apply-early-domains').value === 'www.tomsguide.com'"
        ), 5000);
    });

});
