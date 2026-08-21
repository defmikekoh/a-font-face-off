const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AFFOSroulette = require('../src/sroulette-utils.js');
const AFFOPageFontUtils = require('../src/page-font-utils.js');

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function buildVariableTestFont() {
    const fvar = Buffer.alloc(56);
    fvar.writeUInt16BE(1, 0);
    fvar.writeUInt16BE(16, 4);
    fvar.writeUInt16BE(2, 6);
    fvar.writeUInt16BE(2, 8);
    fvar.writeUInt16BE(20, 10);
    fvar.write('wght', 16, 'ascii');
    fvar.writeInt32BE(100 * 65536, 20);
    fvar.writeInt32BE(300 * 65536, 24);
    fvar.writeInt32BE(1000 * 65536, 28);
    fvar.write('opsz', 36, 'ascii');
    fvar.writeInt32BE(9 * 65536, 40);
    fvar.writeInt32BE(100 * 65536, 44);
    fvar.writeInt32BE(100 * 65536, 48);

    const font = Buffer.alloc(28 + fvar.length);
    font.writeUInt32BE(0x00010000, 0);
    font.writeUInt16BE(1, 4);
    font.write('fvar', 12, 'ascii');
    font.writeUInt32BE(28, 20);
    font.writeUInt32BE(fvar.length, 24);
    fvar.copy(font, 28);
    return font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength);
}

function createStorage(seed = {}) {
    const data = clone(seed);
    return {
        data,
        local: {
            async get(keys) {
                if (keys === undefined || keys === null) return clone(data);
                if (typeof keys === 'string') return { [keys]: clone(data[keys]) };
                if (Array.isArray(keys)) {
                    const out = {};
                    keys.forEach(key => { out[key] = clone(data[key]); });
                    return out;
                }
                return {};
            },
            async set(items) {
                Object.entries(items).forEach(([key, value]) => {
                    data[key] = clone(value);
                });
            },
            async remove(keys) {
                (Array.isArray(keys) ? keys : [keys]).forEach(key => {
                    delete data[key];
                });
            }
        },
        onChanged: {
            addListener() {}
        }
    };
}

function loadBackground(seed = {}, options = {}) {
    const storage = createStorage(seed);
    const cssOps = [];
    const titleOps = [];
    const tabsSeed = clone(options.tabs || []);
    const matchesTabQuery = (tab, queryInfo = {}) => {
        if (queryInfo.active != null && !!tab.active !== !!queryInfo.active) return false;
        if (queryInfo.currentWindow != null && !!tab.currentWindow !== !!queryInfo.currentWindow) return false;
        if (queryInfo.lastFocusedWindow != null && !!tab.lastFocusedWindow !== !!queryInfo.lastFocusedWindow) return false;
        return true;
    };
    const browserStub = {
        storage: {
            local: storage.local,
            onChanged: storage.onChanged
        },
        runtime: {
            getURL(file) { return `moz-extension://test/${file}`; },
            onMessage: { addListener() {} },
            sendMessage() { return Promise.resolve(); }
        },
        tabs: {
            query(queryInfo = {}) { return Promise.resolve(clone(tabsSeed.filter(tab => matchesTabQuery(tab, queryInfo)))); },
            get(tabId) { return Promise.resolve(clone(tabsSeed.find(tab => tab.id === tabId))); },
            sendMessage() { return Promise.resolve({ success: true }); },
            insertCSS(tabId, details) {
                cssOps.push({ op: 'insertCSS', tabId, details: clone(details) });
                return Promise.resolve();
            },
            removeCSS(tabId, details) {
                cssOps.push({ op: 'removeCSS', tabId, details: clone(details) });
                return Promise.resolve();
            },
            executeScript() { return Promise.resolve(); },
            create() { return Promise.resolve({ id: 1 }); },
            onRemoved: { addListener() {} },
            onActivated: { addListener() {} },
            onUpdated: { addListener() {} }
        },
        windows: {
            onFocusChanged: { addListener() {} }
        },
        alarms: {
            create() { return Promise.resolve(); },
            clear() { return Promise.resolve(); },
            onAlarm: { addListener() {} }
        },
        identity: {
            launchWebAuthFlow() { return Promise.resolve(); }
        },
        browserAction: {
            openPopup() { return Promise.resolve(); },
            setTitle(details) {
                titleOps.push(clone(details));
                return Promise.resolve();
            }
        }
    };

    const context = vm.createContext({
        console,
        browser: browserStub,
        self: { addEventListener() {} },
        navigator: { onLine: true, userAgent: 'node-test' },
        fetch: options.fetch || (async () => ({ ok: true, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) })),
        performance: { now: () => 0 },
        crypto: globalThis.crypto,
        TextEncoder: globalThis.TextEncoder,
        AbortController: globalThis.AbortController,
        URL: globalThis.URL,
        URLSearchParams,
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        setTimeout,
        clearTimeout,
        Promise,
        Date,
        AFFOSroulette,
        AFFOPageFontUtils,
        affoParseGfMetadataText: () => ({}),
        affoGetMetadataFamilies: () => [],
        buildCss2UrlForFamily: () => '',
        generateThirdManInCSS: () => '/* css */'
    });

    const configSourcePath = path.join(__dirname, '..', 'src', 'config-utils.js');
    const blockJavascriptUtilsPath = path.join(__dirname, '..', 'src', 'block-javascript-utils.js');
    const runtimeSourcePath = path.join(__dirname, '..', 'src', 'background-font-runtime.js');
    const sourcePath = path.join(__dirname, '..', 'src', 'background.js');
    const source = fs.readFileSync(configSourcePath, 'utf8') + '\n' + fs.readFileSync(blockJavascriptUtilsPath, 'utf8') + '\n' + fs.readFileSync(runtimeSourcePath, 'utf8') + '\n' + fs.readFileSync(sourcePath, 'utf8');
    vm.runInContext(source, context, { filename: 'background.js' });

    return { context, storage, cssOps, titleOps };
}

describe('background WhatFont Face-off draft', () => {
    it('follows stylesheet imports to find a reusable page font', async () => {
        const fetchedUrls = [];
        const { context, storage } = loadBackground({}, {
            fetch: async url => {
                fetchedUrls.push(url);
                const css = url === 'https://example.com/theme.css'
                    ? '@import url("https://fonts.googleapis.com/css2?family=Libre+Caslon+Text"); .article { font-family: "Libre Caslon Text"; }'
                    : '@font-face { font-family: "Libre Caslon Text"; src: local("Arial"); font-weight: 400; }';
                return {
                    ok: true,
                    status: 200,
                    text: async () => css,
                    arrayBuffer: async () => new ArrayBuffer(0)
                };
            }
        });

        const result = await context.self.affoHandleRuntimeMessage({
            type: 'affoPrepareFaceoffPageFont',
            fontName: 'Libre Caslon Text',
            fontWeight: 400,
            fontStyle: 'normal',
            variableAxes: {},
            fontFaceRules: [],
            stylesheetUrls: ['https://example.com/theme.css'],
            pageUrl: 'https://example.com/article'
        }, {
            tab: { id: 123, url: 'https://example.com/article' }
        });

        assert.equal(result.success, true);
        assert.deepEqual(fetchedUrls, [
            'https://example.com/theme.css',
            'https://fonts.googleapis.com/css2?family=Libre+Caslon+Text'
        ]);
        assert.match(storage.data.affoFaceoffPageFontDraft.config.fontFaceRule, /Libre Caslon Text/);
    });

    it('sets the top font size and line height for the one-shot Face-off', async () => {
        const { context, storage } = loadBackground();

        const result = await context.self.affoHandleRuntimeMessage({
            type: 'affoPrepareFaceoffPageFont',
            fontName: 'Detected Font',
            fontWeight: 400,
            fontStyle: 'normal',
            variableAxes: {},
            fontFaceRules: [{
                cssText: '@font-face { font-family: "Detected Font"; src: local("Arial"); font-weight: 400; }',
                baseUrl: 'https://example.com/styles.css'
            }],
            stylesheetUrls: [],
            pageUrl: 'https://example.com/article'
        }, {
            tab: { id: 123, url: 'https://example.com/article' }
        });

        assert.equal(result.success, true);
        assert.equal(storage.data.affoFaceoffPageFontDraft.config.fontSize, 17);
        assert.equal(storage.data.affoFaceoffPageFontDraft.config.lineHeight, 1.45);
    });

    it('prepares Adobe fonts loaded dynamically without a stylesheet font-face rule', async () => {
        const fontData = buildVariableTestFont();
        const resourceUrl = 'https://use.typekit.net/pf/tk/jyts/n5/m?unicode=abc&token=secret';
        const fetchedUrls = [];
        const { context, storage } = loadBackground({}, {
            fetch: async url => {
                fetchedUrls.push(url);
                return {
                    ok: true,
                    status: 200,
                    text: async () => '',
                    arrayBuffer: async () => fontData
                };
            }
        });

        const result = await context.self.affoHandleRuntimeMessage({
            type: 'affoPrepareFaceoffPageFont',
            fontName: 'jyts-n5',
            fontWeight: 500,
            fontStyle: 'normal',
            variableAxes: {},
            fontFaceRules: [],
            stylesheetUrls: [],
            fontResourceUrls: [resourceUrl],
            pageUrl: 'https://fonts.adobe.com/fonts/macha'
        }, {
            tab: { id: 123, url: 'https://fonts.adobe.com/fonts/macha' }
        });

        assert.equal(result.success, true);
        assert.deepEqual(fetchedUrls, [resourceUrl]);
        assert.match(storage.data.affoFaceoffPageFontDraft.config.fontFaceRule, /font-family: "jyts-n5"/);
        assert.match(storage.data.affoFaceoffPageFontDraft.config.fontFaceRule, /data:font\/ttf;base64/);
        assert.equal(storage.data.affoFaceoffPageFontDraft.config.fontWeight, 500);
    });

    it('retains computed axes proven by the downloaded font fvar table', async () => {
        const fontData = buildVariableTestFont();
        const { context, storage } = loadBackground({}, {
            fetch: async () => ({
                ok: true,
                arrayBuffer: async () => fontData
            })
        });

        const result = await context.self.affoHandleRuntimeMessage({
            type: 'affoPrepareFaceoffPageFont',
            fontName: 'Austin News',
            fontWeight: 300,
            fontStyle: 'normal',
            variableAxes: { opsz: 9, wght: 300 },
            fontFaceRules: [{
                cssText: '@font-face { font-family: "Austin News"; src: url("https://example.com/austin.woff2"); font-weight: 300; }',
                baseUrl: 'https://example.com/styles.css'
            }],
            stylesheetUrls: [],
            pageUrl: 'https://example.com/article'
        }, {
            tab: { id: 123, url: 'https://example.com/article' }
        });

        assert.equal(result.success, true);
        assert.deepEqual(storage.data.affoFaceoffPageFontDraft.config.variableAxes, {
            wght: 300,
            opsz: 9
        });
        assert.deepEqual(storage.data.affoFaceoffPageFontDraft.fontDefinition, {
            axes: ['wght', 'opsz'],
            defaults: { wght: 300, opsz: 100 },
            ranges: { wght: [100, 1000], opsz: [9, 100] }
        });
    });
});

describe('background quick-pick Sroulette', () => {
    it('stores synced Sroulette intent without a resolved font', async () => {
        const { context, storage } = loadBackground({
            affoApplyMap: {
                'example.com': {
                    serif: { fontName: 'Old Serif' },
                    mono: { fontName: 'Mono' }
                }
            }
        });

        const result = await context.self.affoHandleRuntimeMessage({
            type: 'quickApplySroulette',
            origin: 'example.com',
            position: 'serif',
            pool: 'sans'
        }, { tab: { id: 123 } });

        assert.equal(result.success, true);
        assert.deepEqual(storage.data.affoApplyMap['example.com'].sroulette, {
            serif: { pool: 'sans' }
        });
        assert.equal(storage.data.affoApplyMap['example.com'].serif, undefined);
        assert.deepEqual(storage.data.affoApplyMap['example.com'].mono, { fontName: 'Mono' });
    });

    it('supports body Sroulette intent without storing a resolved font', async () => {
        const { context, storage } = loadBackground({
            affoApplyMap: {
                'example.com': {
                    body: { fontName: 'Old Body' }
                }
            }
        });

        const result = await context.self.affoHandleRuntimeMessage({
            type: 'quickApplySroulette',
            origin: 'example.com',
            position: 'body',
            pool: 'serif'
        }, { tab: { id: 123 } });

        assert.equal(result.success, true);
        assert.deepEqual(storage.data.affoApplyMap['example.com'].sroulette, {
            body: { pool: 'serif' }
        });
        assert.equal(storage.data.affoApplyMap['example.com'].body, undefined);
    });

    it('clears Sroulette intent for a target when a normal favorite is quick-applied', async () => {
        const { context, storage } = loadBackground({
            affoApplyMap: {
                'example.com': {
                    sroulette: {
                        sans: { pool: 'serif' }
                    }
                }
            },
            affoAggressiveDomains: []
        });

        const result = await context.self.affoHandleRuntimeMessage({
            type: 'quickApplyFavorite',
            origin: 'example.com',
            position: 'sans',
            fontConfig: {
                fontName: 'Inter',
                fontSize: 18,
                variableAxes: { wght: 500 }
            }
        }, { tab: { id: 123 } });

        assert.equal(result.success, true);
        assert.deepEqual(storage.data.affoApplyMap['example.com'].sans, {
            fontName: 'Inter',
            fontSize: 18,
            variableAxes: { wght: 500 }
        });
        assert.equal(storage.data.affoApplyMap['example.com'].sroulette, undefined);
    });

    it('preserves local font source when a local favorite is quick-applied', async () => {
        const { context, storage } = loadBackground({
            affoApplyMap: {},
            affoAggressiveDomains: []
        });

        const result = await context.self.affoHandleRuntimeMessage({
            type: 'quickApplyFavorite',
            origin: 'example.com',
            position: 'serif',
            fontConfig: {
                fontName: 'Iowan Old Style',
                fontSource: 'local'
            }
        }, { tab: { id: 123 } });

        assert.equal(result.success, true);
        assert.deepEqual(storage.data.affoApplyMap['example.com'].serif, {
            fontName: 'Iowan Old Style',
            fontSource: 'local'
        });
    });

    it('injects resolved Sroulette CSS as tracked extension CSS', async () => {
        const { context, cssOps } = loadBackground();

        const firstResult = await context.self.affoHandleRuntimeMessage({
            type: 'affoInsertSrouletteCss',
            fontType: 'mono',
            css: '.first { font-family: Lora; }'
        }, { tab: { id: 123 } });

        const secondResult = await context.self.affoHandleRuntimeMessage({
            type: 'affoInsertSrouletteCss',
            fontType: 'mono',
            css: '.second { font-family: Lora; }'
        }, { tab: { id: 123 } });

        assert.equal(firstResult.success, true);
        assert.equal(secondResult.success, true);
        assert.deepEqual(cssOps, [
            {
                op: 'insertCSS',
                tabId: 123,
                details: { code: '.first { font-family: Lora; }', cssOrigin: 'author' }
            },
            {
                op: 'insertCSS',
                tabId: 123,
                details: { code: '.first { font-family: Lora; }', cssOrigin: 'user' }
            },
            {
                op: 'removeCSS',
                tabId: 123,
                details: { code: '.first { font-family: Lora; }', cssOrigin: 'author' }
            },
            {
                op: 'removeCSS',
                tabId: 123,
                details: { code: '.first { font-family: Lora; }', cssOrigin: 'user' }
            },
            {
                op: 'insertCSS',
                tabId: 123,
                details: { code: '.second { font-family: Lora; }', cssOrigin: 'author' }
            },
            {
                op: 'insertCSS',
                tabId: 123,
                details: { code: '.second { font-family: Lora; }', cssOrigin: 'user' }
            }
        ]);
    });

    it('removes tracked Sroulette CSS when requested', async () => {
        const { context, cssOps } = loadBackground();

        await context.self.affoHandleRuntimeMessage({
            type: 'affoInsertSrouletteCss',
            fontType: 'mono',
            css: '.mono { font-family: Lora; }'
        }, { tab: { id: 123 } });

        const result = await context.self.affoHandleRuntimeMessage({
            type: 'affoRemoveSrouletteCss',
            fontTypes: ['mono']
        }, { tab: { id: 123 } });

        assert.equal(result.success, true);
        assert.deepEqual(cssOps, [
            {
                op: 'insertCSS',
                tabId: 123,
                details: { code: '.mono { font-family: Lora; }', cssOrigin: 'author' }
            },
            {
                op: 'insertCSS',
                tabId: 123,
                details: { code: '.mono { font-family: Lora; }', cssOrigin: 'user' }
            },
            {
                op: 'removeCSS',
                tabId: 123,
                details: { code: '.mono { font-family: Lora; }', cssOrigin: 'author' }
            },
            {
                op: 'removeCSS',
                tabId: 123,
                details: { code: '.mono { font-family: Lora; }', cssOrigin: 'user' }
            }
        ]);
    });

    it('sets the browser action title from the active tab domain settings', async () => {
        const { context, titleOps } = loadBackground({
            affoApplyMap: {
                'example.com': {
                    body: { fontName: 'Merriweather' }
                }
            }
        }, {
            tabs: [
                { id: 7, active: true, url: 'https://example.com/story' }
            ]
        });

        await new Promise(resolve => setTimeout(resolve, 0));
        titleOps.length = 0;
        const updated = await context.self.affoUpdateBrowserActionTitleForActiveTabs();

        assert.equal(updated, true);
        assert.deepEqual(titleOps, [
            { tabId: 7, title: 'AFFO - B: Merriweather' }
        ]);
    });
});
