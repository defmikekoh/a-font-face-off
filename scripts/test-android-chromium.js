#!/usr/bin/env node
'use strict';

// Run against a disposable, already-installed AFFO Android Chromium session.
// Device selection, installation and socket forwarding are explicit ADB steps;
// this script never clears browser data or chooses a device automatically.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

async function connect(endpoint) {
    const socket = new WebSocket(endpoint);
    const pending = new Map();
    const events = [];
    let nextId = 0;
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (!message.id) { events.push(message); return; }
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    return {
        events,
        close() { socket.close(); },
        send(method, params = {}) {
            return new Promise((resolve, reject) => {
                const id = ++nextId;
                const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 50000);
                pending.set(id, { resolve, reject, timer });
                socket.send(JSON.stringify({ id, method, params }));
            });
        },
        async evaluate(expression) {
            const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        }
    };
}

async function until(check, description, timeout = 20000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        const result = await check();
        if (result) return result;
        await delay(200);
    }
    throw new Error(`Timed out waiting for ${description}`);
}

async function main() {
    const args = process.argv.slice(2);
    const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
    const endpoint = option('--endpoint', 'http://127.0.0.1:9235');
    const extensionId = option('--extension-id', '');
    const output = option('--out', 'ztemp/android-chromium-test.json');
    if (!/^[a-p]{32}$/.test(extensionId)) throw new Error('Supply --extension-id from the installed AFFO extension');
    if (new URL(endpoint).hostname !== '127.0.0.1') throw new Error('Use an explicitly forwarded loopback endpoint');
    const targets = async () => (await fetch(endpoint + '/json')).json();
    const clients = [];
    const report = { startedAt: new Date().toISOString(), extensionId, checks: [] };
    const record = (name, details) => { report.checks.push({ name, ...details }); console.log(`PASS ${name}`); };
    async function attach(target) { const client = await connect(target.webSocketDebuggerUrl); clients.push(client); return client; }
    try {
        const list = await targets();
        const pageTarget = list.find(target => target.url === 'https://example.com/');
        const popupTarget = list.find(target => target.url.startsWith(`chrome-extension://${extensionId}/popup.html`));
        const managerTarget = list.find(target => target.url.startsWith('vivaldi://extensions'));
        assert.ok(pageTarget && popupTarget && managerTarget, 'Open example.com, AFFO popup.html, and vivaldi://extensions before running');
        const page = await attach(pageTarget);
        const popup = await attach(popupTarget);
        const manager = await attach(managerTarget);
        const errorBaseline = await manager.evaluate(`new Promise(resolve=>chrome.developerPrivate.getExtensionInfo('${extensionId}',info=>resolve(info.runtimeErrors.map(error=>({id:error.id,occurrences:error.occurrences})))))`);
        await until(() => popup.evaluate('document.readyState === \"complete\" && typeof browser !== \"undefined\" && typeof applyFontToPage === \"function\"'), 'popup initialization');
        report.userAgent = await page.evaluate('navigator.userAgent');
        const manifest = await popup.evaluate('browser.runtime.getManifest()');
        assert.equal(manifest.manifest_version, 3);
        assert.ok(manifest.background.service_worker);
        const tabId = await popup.evaluate(`browser.tabs.query({}).then(tabs => tabs.find(tab => tab.url === 'https://example.com/').id)`);
        await popup.evaluate(`window.sourceTabId=${tabId}; window.currentTabHostname='example.com'; browser.storage.local.set({affoApplyMap:{},affoAggressiveDomains:[],affoBlockJavaScriptDomains:['blocked.example']})`);
        await page.send('Page.reload', {ignoreCache:true});
        await until(() => page.evaluate('document.documentElement?.getAttribute("data-affo-base")'), 'content script');
        record('MV3 installation and content script', { tabId });

        const applied = await popup.evaluate(`applyFontToPage('body',{fontName:'Lora',variableAxes:{}})`);
        assert.equal(applied, true);
        const body = await until(async () => {
            const value = await page.evaluate(`({font:getComputedStyle(document.querySelector('p')).fontFamily,loaded:document.fonts.check('16px Lora')})`);
            return value.font.includes('Lora') && value.loaded && value;
        }, 'Lora application and font loading');
        const css = await popup.evaluate('appliedCssActive.body');
        assert.match(css, /font-family: "Lora";/);
        assert.doesNotMatch(css, /font-family: "Lora" !important/);
        record('Body Apply with remote font and aggressive mode off', body);

        await popup.evaluate(`unapplyFontFromPage('body')`);
        await page.evaluate(`(() => {
            document.getElementById('affo-mv3-fixture')?.remove();
            const article=document.createElement('article'); article.id='affo-mv3-fixture';
            for (const family of ['serif','sans-serif','monospace']) {
                const p=document.createElement('p'); p.id='probe-'+family;
                const container=document.createElement('div'); container.style.fontFamily=family;
                p.textContent='This is a sufficiently long paragraph for the font family walker to classify and replace during extension testing on Android.';
                container.appendChild(p); article.appendChild(container);
            }
            document.body.appendChild(article);
        })()`);
        // Inherited site families classify each paragraph without an inline
        // declaration that would legitimately outrank non-aggressive CSS.
        for (const [type, font] of [['serif','Lora'],['sans','Inter'],['mono','Roboto Mono']]) {
            const result = await popup.evaluate(`applyThirdManInFont(${JSON.stringify(type)},{fontName:${JSON.stringify(font)},variableAxes:{}})`);
            assert.equal(result, true, `${type} Apply`);
        }
        const tmiCss = await popup.evaluate(`Object.fromEntries(['serif','sans','mono'].map(type=>[type,appliedCssActive[type]]))`);
        for (const css of Object.values(tmiCss)) assert.doesNotMatch(css, /font-family:[^;]+!important/);
        const tmi = await page.evaluate(`Array.from(document.querySelectorAll('#affo-mv3-fixture p')).map(p=>({id:p.id,type:p.dataset.affoFontType,font:getComputedStyle(p).fontFamily}))`);
        assert.equal(tmi.length,3);
        for (const [index,font] of ['Lora','Inter','Roboto Mono'].entries()) assert.ok(tmi[index].font.includes(font), JSON.stringify(tmi));
        record('TMI three-target Apply with aggressive mode off', { tmi });

        const workerTarget = await until(async () => (await targets()).find(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${extensionId}/`)), 'service worker');
        const worker = await attach(workerTarget);
        const rules = await worker.evaluate('browser.declarativeNetRequest.getDynamicRules()');
        assert.ok(rules.some(rule => rule.id === 81001 && rule.condition.requestDomains.includes('blocked.example')));
        record('Chromium JavaScript-blocking rule', { ruleCount: rules.length });
        const whatfont = await worker.evaluate(`handleAffoRuntimeMessage({type:'affoEnsureWhatFontScripts'},{tab:{id:${tabId}},frameId:0})`);
        assert.equal(whatfont.success, true);
        assert.equal(await page.evaluate(`!!document.querySelector('.__whatfont_control')`), true);
        record('WhatFont activation', whatfont);

        const origins = await popup.evaluate(`(async()=>{
            const details={target:{tabId:${tabId}},css:'p { color: rgb(12, 34, 56) !important; }',origin:'USER'};
            await browser.scripting.insertCSS(details);
            const before=await AFFOMessaging.executeScript(browser,{target:details.target,func:()=>getComputedStyle(document.querySelector('p')).color});
            await browser.scripting.removeCSS(details);
            const after=await AFFOMessaging.executeScript(browser,{target:details.target,func:()=>getComputedStyle(document.querySelector('p')).color});
            return {before:before[0],after:after[0]};
        })()`);
        assert.equal(origins.before,'rgb(12, 34, 56)');
        assert.notEqual(origins.after,origins.before);
        record('USER-origin CSS insertion and removal', origins);

        await worker.evaluate(`insertTrackedSrouletteCss(${tabId},'serif','p { background-color: rgb(21, 43, 65) !important; }')`);
        await manager.send('ServiceWorker.enable');
        const version = await until(async () => manager.events.flatMap(event => event.method === 'ServiceWorker.workerVersionUpdated' ? event.params.versions : []).find(version => version.scriptURL.startsWith(`chrome-extension://${extensionId}/`)), 'worker version');
        worker.close();
        await manager.send('ServiceWorker.stopWorker', {versionId:version.versionId});
        await popup.evaluate(`browser.runtime.sendMessage({type:'affoGetPageInfo'})`);
        const restartedTarget = await until(async () => (await targets()).find(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${extensionId}/`) && target.id !== workerTarget.id), 'restarted worker');
        const restarted = await attach(restartedTarget);
        await restarted.evaluate(`removeTrackedSrouletteCss(${tabId},['serif'])`);
        const background = await page.evaluate(`getComputedStyle(document.querySelector('p')).backgroundColor`);
        assert.notEqual(background,'rgb(21, 43, 65)');
        record('Sroulette CSS removal after service-worker restart', {background});
        const errors = await manager.evaluate(`new Promise(resolve=>chrome.developerPrivate.getExtensionInfo('${extensionId}',info=>resolve({runtime:info.runtimeErrors,manifest:info.manifestErrors})))`);
        const newErrors = errors.runtime.filter(error => !errorBaseline.some(previous => previous.id === error.id && previous.occurrences === error.occurrences));
        assert.equal(newErrors.length,0,JSON.stringify(newErrors));
        assert.equal(errors.manifest.length,0,JSON.stringify(errors.manifest));
        record('No new extension runtime or manifest errors', {preExistingRuntimeEntries:errorBaseline.length,runtime:newErrors,manifest:errors.manifest});
        report.passed = true;
    } catch (error) {
        report.passed = false; report.error = error.stack; throw error;
    } finally {
        clients.forEach(client=>client.close());
        fs.mkdirSync(path.dirname(output),{recursive:true});
        fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
        console.log(`Report: ${output}`);
    }
}
main().catch(error => {console.error(error);process.exitCode=1;});
