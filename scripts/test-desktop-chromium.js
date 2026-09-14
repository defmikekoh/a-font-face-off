#!/usr/bin/env node
'use strict';
/* global fetch */

const fs = require('node:fs');
const path = require('node:path');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { connect, until, runChromiumSmoke } = require('./chromium-smoke');

async function main() {
    const root = path.resolve(__dirname, '..');
    const temp = path.join(root, 'ztemp');
    fs.mkdirSync(temp, { recursive: true });
    const profile = fs.mkdtempSync(path.join(temp, 'chrome-smoke-'));
    const output = path.join(temp, 'desktop-chromium-test.json');
    // Selenium Manager fetches matching Chrome for Testing + ChromeDriver.
    // Keep its downloads local and force CfT rather than the user's Chrome.
    process.env.SE_CACHE_PATH = path.join(temp, 'selenium');
    process.env.SE_FORCE_BROWSER_DOWNLOAD = 'true';
    process.env.SE_AVOID_STATS = 'true';
    const version = process.env.AFFO_CHROME_VERSION || '153.0.8010.36';
    const options = new chrome.Options()
        .setBrowserVersion(version)
        .addArguments(`--user-data-dir=${profile}`, `--load-extension=${path.join(temp, 'edge-mv3-src')}`,
            '--no-first-run', '--no-default-browser-check', '--window-size=1000,800');
    if (process.env.AFFO_CHROME_HEADED !== '1') options.addArguments('--headless=new');
    let driver;
    let manager;
    try {
        driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
        const caps = await driver.getCapabilities();
        const endpoint = `http://${caps.get('goog:chromeOptions').debuggerAddress}`;
        await driver.get('chrome://extensions/');
        const targets = async () => (await fetch(endpoint + '/json')).json();
        const target = await until(async () => (await targets()).find(t => t.url.startsWith('chrome://extensions')), 'extension manager');
        manager = await connect(target.webSocketDebuggerUrl);
        await manager.evaluate('chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true})');
        const extension = await until(() => manager.evaluate(`chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true}).then(items=>items.find(item=>item.name==='A Font Face-off' && item.state==='ENABLED'))`), 'AFFO installation');
        await driver.switchTo().newWindow('tab');
        await driver.get('https://example.com/');
        await driver.switchTo().newWindow('tab');
        await driver.get(`chrome-extension://${extension.id}/popup.html`);
        const tabId = await driver.executeAsyncScript(`const done=arguments[arguments.length-1]; chrome.tabs.query({url:'https://example.com/'},tabs=>done(tabs[0].id));`);
        await driver.get(`chrome-extension://${extension.id}/popup.html?domain=example.com&sourceTabId=${tabId}`);
        await runChromiumSmoke({endpoint, extensionId: extension.id, output, desktop: true,
            metadata: {browserVersion: caps.get('browserVersion'), requestedVersion: version, platform: caps.get('platformName'), headless: process.env.AFFO_CHROME_HEADED !== '1'}});
    } catch (error) {
        // Preserve assertion reports; startup failures must not leave a stale pass.
        if (!fs.existsSync(output) || fs.statSync(output).mtimeMs < startedAt) {
            fs.writeFileSync(output, JSON.stringify({passed:false, phase:'startup', error:error.stack}, null, 2) + '\n');
        }
        throw error;
    } finally {
        if (manager) manager.close();
        try { if (driver) await driver.quit(); }
        finally { fs.rmSync(profile, { recursive: true, force: true }); }
    }
}
const startedAt = Date.now();
main().catch(error => { console.error(error); process.exitCode = 1; });
