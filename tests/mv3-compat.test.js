const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');
const { buildManifest } = require('../scripts/build-chromium-mv3.js');

const read = name => fs.readFileSync(require.resolve('../src/' + name), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const event = () => ({ addListener() {}, removeListener() {}, hasListener() {} });

function loadFunctions(file, names, context) {
    const source = read(file);
    const ast = acorn.parse(source, { ecmaVersion: 2022 });
    const definitions = ast.body.filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name));
    assert.equal(definitions.length, names.length);
    vm.runInContext(definitions.map(node => source.slice(node.start, node.end)).join('\n'), context);
}

function createHarness({ content = false, android = false } = {}) {
    const calls = [];
    const local = {};
    const chrome = {
        runtime: {
            getURL: file => 'chrome-extension://test/' + file,
            getManifest: () => ({ manifest_version: 3 }),
            onMessage: event(),
            openOptionsPage: cb => { calls.push('options'); cb(); },
            sendMessage: (msg, cb) => cb(msg)
        },
        storage: {
            local: {
                get: (key, cb) => cb({ [key]: local[key] }),
                set: (values, cb) => { Object.assign(local, values); cb(); }
            },
            onChanged: event()
        }
    };
    const page = vm.createContext({
        window: { __affoFontSwapDone: {}, __affoWalkerDone: {} },
        location: { hostname: 'example.com' },
        document: {
            dispatchEvent(event) {
                const { fontType } = event.detail;
                calls.push({ event: event.type, detail: clone(event.detail) });
                if (event.type === 'affo-prepare-font-swap') page.window.__affoFontSwapDone[fontType] = { done: true, success: true };
                if (event.type === 'affo-restore-font-swap') page.window.__affoFontSwapDone['restore-' + fontType] = { done: true, success: true };
                if (event.type === 'affo-continue-walker') page.window.__affoWalkerDone[fontType] = { done: true, count: 3 };
            }
        },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
    }, { codeGeneration: { strings: false, wasm: false } });
    if (!content) {
        chrome.tabs = {
            query: (_query, cb) => cb([{ id: 99, url: 'https://wrong-tab.example/' }]),
            onUpdated: event(), onActivated: event(), onRemoved: event()
        };
        chrome.alarms = { onAlarm: event() };
        chrome.scripting = {
            async executeScript(injection) {
                calls.push({ scriptTarget: clone(injection.target) });
                page.args = clone(injection.args || []);
                // Like Chrome, copy the packaged function into an isolated world.
                const result = vm.runInContext('(' + injection.func.toString() + ')(...args)', page);
                return [{ result: await result }];
            },
            async insertCSS(injection) { calls.push({ insert: clone(injection) }); },
            async removeCSS(injection) { calls.push({ remove: clone(injection) }); }
        };
    }
    const context = vm.createContext({ chrome, navigator: { userAgent: android ? 'Android EdgA' : 'Macintosh Chrome' } });
    vm.runInContext(read('browser-api.js'), context);
    vm.runInContext(read('messaging-utils.js'), context);
    return { context, page, calls, chrome };
}

test('MV3 shim initializes with only content-script APIs and can use storage/messaging', async () => {
    const { context } = createHarness({ content: true });
    assert.equal(context.browser.tabs, undefined);
    assert.equal(context.browser.alarms, undefined);
    await context.browser.storage.local.set({ sample: 42 });
    assert.equal((await context.browser.storage.local.get('sample')).sample, 42);
    assert.equal(await context.browser.runtime.sendMessage('ping'), 'ping');
});

test('MV3 executes packaged functions without the legacy tabs adapter', async () => {
    const { context } = createHarness();
    assert.equal(context.browser.tabs.executeScript, undefined);
    const result = await context.AFFOMessaging.executeScript(context.browser, {
        target: { tabId: 7 },
        func: (value) => value,
        args: ['a font with "quotes", backticks ` and ${literal}']
    });
    assert.equal(result[0], 'a font with "quotes", backticks ` and ${literal}');
});

test('Body and TMI preparation, walker and restore execute in the source tab with string code disabled', async () => {
    const { context, calls } = createHarness();
    Object.assign(context, {
        window: { sourceTabId: 7 },
        getTargetTabForPopup: async () => ({ id: 7 }),
        setTimeout: callback => setTimeout(callback, 0),
        affoDebugLog() {}, affoDebugWarn() {}
    });
    loadFunctions('popup.js', ['executeScriptInTargetTab', 'prepareFontSwapInTargetTab', 'restoreFontSwapInTargetTab',
        'pollFontSwapBridgeResult', 'runElementWalkerInTargetTab', 'insertCSSInTargetTab', 'removeCSSInTargetTab'], context);
    for (const fontType of ['body', 'serif', 'sans', 'mono']) {
        const config = { fontName: 'Font "quoted" ${literal}', variableAxes: { wght: 500 } };
        assert.equal(await context.prepareFontSwapInTargetTab(fontType, config), true);
        assert.equal((await context.runElementWalkerInTargetTab(fontType)).count, 3);
        await context.insertCSSInTargetTab({ css: 'p { color: red }' });
        await context.removeCSSInTargetTab({ css: 'p { color: red }' });
        assert.equal(await context.restoreFontSwapInTargetTab(fontType), true);
        const prepared = calls.find(call => call.event === 'affo-prepare-font-swap' && call.detail.fontType === fontType);
        assert.deepEqual(prepared.detail.fontConfig, config);
    }
    assert.ok(calls.filter(call => call.scriptTarget).every(call => call.scriptTarget.tabId === 7));
    assert.deepEqual(calls.filter(call => call.insert).map(call => call.insert), calls.filter(call => call.remove).map(call => call.remove));
    assert.ok(calls.filter(call => call.insert).every(call => call.insert.origin === 'USER' && call.insert.target.tabId === 7));
});

test('shared CSS API preserves author/user origins and frame targeting', async () => {
    const { context, calls } = createHarness();
    for (const origin of ['AUTHOR', 'USER', undefined]) {
        const details = { css: 'p { color: red }', origin, target: { tabId: 7, frameIds: [2] } };
        await context.browser.scripting.insertCSS(details);
        await context.browser.scripting.removeCSS(details);
        assert.deepEqual(calls.at(-2).insert, calls.at(-1).remove);
        assert.equal(calls.at(-2).insert.origin, origin);
        assert.deepEqual(calls.at(-2).insert.target, { tabId: 7, frameIds: [2] });
    }
});

test('desktop options uses the native API while Android retains the tab-opening workaround', async () => {
    const desktop = createHarness();
    await desktop.context.browser.runtime.openOptionsPage();
    assert.ok(desktop.calls.includes('options'));
    assert.equal(createHarness({ android: true }).context.browser.runtime.openOptionsPage, undefined);
});

test('Firefox uses its native API and surfaces per-frame script errors', async () => {
    const native = { scripting: { async executeScript(details) {
        assert.deepEqual(clone(details.target), { tabId: 8, frameIds: [2] });
        return [{ frameId: 2, error: { message: 'Page bridge failed' } }];
    } } };
    const context = vm.createContext({ browser: native, chrome: {} });
    vm.runInContext(read('browser-api.js'), context);
    vm.runInContext(read('messaging-utils.js'), context);
    assert.equal(context.browser, native);
    await assert.rejects(context.AFFOMessaging.executeScript(native, {
        target: { tabId: 8, frameIds: [2] }, func: () => false
    }), /Page bridge failed/);
});

test('Firefox and Chromium share MV3 manifests except background hosting and blocking permissions', () => {
    const firefox = JSON.parse(read('manifest.json'));
    const chromium = buildManifest(firefox);
    assert.equal(firefox.manifest_version, 3);
    assert.equal(firefox.background.persistent, false);
    assert.ok(firefox.background.scripts.includes('browser-api.js'));
    assert.ok(firefox.permissions.includes('webRequestBlocking'));
    assert.equal(chromium.browser_specific_settings, undefined);
    assert.ok(chromium.background.service_worker);
    assert.ok(chromium.permissions.includes('declarativeNetRequestWithHostAccess'));
    assert.ok(!chromium.permissions.includes('webRequestBlocking'));
    for (const key of ['action', 'content_scripts', 'host_permissions', 'content_security_policy', 'web_accessible_resources']) {
        assert.deepEqual(chromium[key], firefox[key]);
    }
});

function trackingContext(sessionData, cssOps) {
    const context = vm.createContext({
        browser: {
            storage: { session: {
                async get(key) { return sessionData[key] ? { [key]: clone(sessionData[key]) } : {}; },
                async set(values) { Object.assign(sessionData, clone(values)); },
                async remove(key) { delete sessionData[key]; }
            } },
            scripting: {
                async insertCSS(options) { cssOps.push({ insert: options.css, origin: options.origin, tabId: options.target.tabId }); },
                async removeCSS(options) { cssOps.push({ remove: options.css, origin: options.origin, tabId: options.target.tabId }); }
            }
        },
        isSrouletteCssTarget: target => ['serif', 'sans', 'mono'].includes(target),
        affoDebugLog() {}
    });
    vm.runInContext('const srouletteInsertedCssByTab = new Map(); const srouletteCssQueues = new Map();', context);
    loadFunctions('background.js', ['withSrouletteCssTracking', 'removeTrackedSrouletteCss', 'removeTrackedSrouletteCssNow',
        'insertTrackedSrouletteCss', 'insertTrackedSrouletteCssNow'], context);
    return context;
}

test('Sroulette removes old CSS after worker restart and retains concurrent TMI targets', async () => {
    const session = {};
    const cssOps = [];
    const before = trackingContext(session, cssOps);
    await Promise.all(['serif', 'sans', 'mono'].map(target => before.insertTrackedSrouletteCss(7, target, target + ' old')));
    assert.deepEqual(session['affoSrouletteInsertedCss:7'], { serif: 'serif old', sans: 'sans old', mono: 'mono old' });
    const restarted = trackingContext(session, cssOps);
    await restarted.insertTrackedSrouletteCss(7, 'serif', 'serif new');
    assert.deepEqual(cssOps.filter(op => op.remove), [
        { remove: 'serif old', origin: 'AUTHOR', tabId: 7 },
        { remove: 'serif old', origin: 'USER', tabId: 7 }
    ]);
    await restarted.removeTrackedSrouletteCss(7);
    assert.equal(session['affoSrouletteInsertedCss:7'], undefined);
    assert.equal(cssOps.filter(op => op.remove).length, 8);
});

test('Body and TMI Apply save configurations only after successful preparation and surface failure', async () => {
    const { context, page, calls } = createHarness();
    const saved = [];
    const alerts = [];
    const config = { fontName: 'Georgia', variableAxes: {} };
    const types = ['serif', 'sans', 'mono'];
    page.document.querySelectorAll = () => [];
    Object.assign(context, {
        window: {}, console: { error() {} },
        getTargetTabForPopup: async () => ({ id: 7 }),
        getActiveOrigin: async () => 'example.com',
        buildPayload: async (_type, value) => value,
        getApplyMapForOrigin: async () => ({}),
        buildThirdManInBatchChanges: () => ({
            batchConfigs: Object.fromEntries(types.map(type => [type, { target: type, config }])),
            cssJobs: types.map(type => ({ type, config }))
        }),
        isFontBatchPayloadRequest: () => true,
        saveApplyMapForOrigin: async (origin, type, value) => { saved.push({ origin, type, value }); },
        saveBatchApplyStateForOrigin: async (origin, value) => { saved.push({ origin, value }); },
        appliedCssActive: {},
        shouldUseInlineApply: () => false,
        shouldUseAggressive: () => false,
        shouldIgnoreComments: () => false,
        setTimeout: callback => setTimeout(callback, 0),
        affoDebugLog() {}, affoDebugWarn() {}, saveExtensionState() {},
        currentViewMode: 'body',
        showApplyLoading() {}, hideApplyLoading: async () => {},
        showCustomAlert: message => alerts.push(message),
        updateBodyButtons: async () => {}, updateAllThirdManInButtons: async () => {}
    });
    vm.runInContext(read('config-utils.js') + '\n' + read('css-generators.js'), context);
    vm.runInContext('const handleApplyLocks = new Set();', context);
    loadFunctions('popup.js', ['executeScriptInTargetTab', 'prepareFontSwapInTargetTab', 'restoreFontSwapInTargetTab',
        'pollFontSwapBridgeResult', 'runElementWalkerInTargetTab', 'insertCSSInTargetTab', 'removeCSSInTargetTab',
        'applyFontToPage', 'applyAllThirdManInFonts', 'handleApply'], context);
    context.applyPanelConfiguration = () => context.applyFontToPage('body', config);
    await context.handleApply('body');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].type, 'body');
    assert.ok(calls.some(call => call.insert && call.insert.css.includes('Georgia')));
    context.currentViewMode = 'third-man-in';
    await context.handleApply('serif');
    assert.equal(saved.length, 2);
    assert.deepEqual(Object.keys(saved[1].value), types);
    assert.equal(alerts.length, 0);
    assert.equal(calls.filter(call => call.insert).length, 4);
    for (const { insert } of calls.filter(call => call.insert)) {
        assert.match(insert.css, /font-family: "Georgia";/);
        assert.doesNotMatch(insert.css, /font-family: "Georgia" !important/);
    }
    context.shouldUseAggressive = () => true;
    assert.equal(await context.applyFontToPage('body', config), true);
    assert.match(calls.filter(call => call.insert).at(-1).insert.css, /font-family: "Georgia" !important;/);

    delete page.window.__affoFontSwapDone;
    await context.handleApply('serif');
    context.currentViewMode = 'body';
    await context.handleApply('body');
    assert.equal(saved.length, 3, 'A missing content bridge must not save a failed Apply');
    assert.equal(alerts.length, 2, 'Both modes must visibly report failure');
    assert.match(alerts[0], /could not be prepared/);
    assert.match(alerts[1], /could not be applied/);
});

test('WhatFont activation uses packaged functions in the sender frame', async () => {
    const { context, page, calls, chrome } = createHarness();
    const script = chrome.scripting.executeScript;
    page.document.querySelector = () => page.window._WHATFONT ? {} : null;
    page.window._whatFont = () => ({
        setJQuery() {},
        setCSSURL(url) { assert.equal(url, 'chrome-extension://test/wf.css'); },
        init() { page.window._WHATFONT = true; }
    });
    chrome.scripting.executeScript = async injection => {
        if (!injection.files) return script(injection);
        calls.push({ files: clone(injection.files), target: clone(injection.target) });
        if (injection.files[0] === 'jquery.js') page.window.jQuery = () => {};
        return [{ result: null }];
    };
    context.console = { error() {} };
    loadFunctions('background.js', ['handleAffoRuntimeMessage'], context);
    const result = await context.handleAffoRuntimeMessage({ type: 'affoEnsureWhatFontScripts' }, { tab: { id: 7 }, frameId: 3 });
    assert.equal(result.success, true);
    assert.deepEqual(calls.filter(call => call.files).flatMap(call => call.files), ['jquery.js', 'whatfont_core.js']);
    assert.ok(calls.every(call => (call.scriptTarget || call.target).frameIds[0] === 3));
    const again = await context.handleAffoRuntimeMessage({ type: 'affoEnsureWhatFontScripts' }, { tab: { id: 7 }, frameId: 3 });
    assert.equal(again.success, true);
    assert.equal(calls.filter(call => call.files).length, 1, 'An active WhatFont must not load files again');
});

test('binary font replies survive Chromium JSON messaging without changing cached buffers', async () => {
    const context = vm.createContext({ btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') });
    vm.runInContext(read('messaging-utils.js'), context);
    // Exercise multiple encoding chunks and every possible byte, including zero.
    const bytes = Uint8Array.from({ length: 100003 }, (_, index) => index % 256);
    context.AFFOBackgroundFontRuntime = { async handleFetchMessage() { return {ok:true,binary:true,data:bytes.buffer,cached:true}; } };
    loadFunctions('background.js', ['handleAffoRuntimeMessage'], context);
    const response = await context.handleAffoRuntimeMessage({type:'affoFetch',binary:true,url:'https://fonts.example/font.woff2'}, {});
    const wire = clone(response);
    assert.equal(wire.encoding, 'base64');
    assert.equal(wire.cached, true);
    assert.equal(typeof wire.data, 'string');
    assert.deepEqual(Buffer.from(context.AFFOMessaging.decodeBinaryResponseData(wire.data)), Buffer.from(bytes));
    assert.equal(bytes.byteLength, 100003);
    const text = {ok:true,binary:false,data:'@font-face {}'};
    assert.equal(context.AFFOMessaging.encodeBinaryResponse(text), text);
});

test('popup sizing distinguishes Chromium Android panels from Firefox and explicit tabs', () => {
    for (const [android, chromium, search, expected] of [
        [true, true, '', ['affo-mobile', 'affo-popup-panel']],
        [true, true, '?sourceTabId=7', ['affo-mobile']],
        [true, false, '', ['affo-mobile']],
        [true, false, '?sourceTabId=7', ['affo-mobile']],
        [false, true, '', []],
        [false, false, '', []]
    ]) {
        const classes = [];
        const context = vm.createContext({
            navigator: {userAgent:android ? 'Android' : 'Macintosh'},
            browser: {runtime:{getManifest:()=>({background:chromium ? {service_worker:'worker.js'} : {scripts:['background.js']}})}},
            location:{search}, URLSearchParams,
            document:{documentElement:{classList:{add:name=>classes.push(name)}}}
        });
        vm.runInContext(read('popup-context.js'),context);
        assert.deepEqual(classes,expected);
    }
});
