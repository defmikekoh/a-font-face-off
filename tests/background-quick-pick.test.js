const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AFFOSroulette = require('../src/sroulette-utils.js');

function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
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

function loadBackground(seed = {}) {
    const storage = createStorage(seed);
    const cssOps = [];
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
            query() { return Promise.resolve([]); },
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
            onRemoved: { addListener() {} }
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
            openPopup() { return Promise.resolve(); }
        }
    };

    const context = vm.createContext({
        console,
        browser: browserStub,
        self: { addEventListener() {} },
        navigator: { onLine: true, userAgent: 'node-test' },
        fetch: async () => ({ ok: true, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }),
        performance: { now: () => 0 },
        crypto: globalThis.crypto,
        TextEncoder: globalThis.TextEncoder,
        URLSearchParams,
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        setTimeout,
        clearTimeout,
        Promise,
        Date,
        AFFOSroulette,
        affoParseGfMetadataText: () => ({}),
        affoGetMetadataFamilies: () => [],
        buildCss2UrlForFamily: () => '',
        generateThirdManInCSS: () => '/* css */'
    });

    const runtimeSourcePath = path.join(__dirname, '..', 'src', 'background-font-runtime.js');
    const sourcePath = path.join(__dirname, '..', 'src', 'background.js');
    const source = fs.readFileSync(runtimeSourcePath, 'utf8') + '\n' + fs.readFileSync(sourcePath, 'utf8');
    vm.runInContext(source, context, { filename: 'background.js' });

    return { context, storage, cssOps };
}

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
});
