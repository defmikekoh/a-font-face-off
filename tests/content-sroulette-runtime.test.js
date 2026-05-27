const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

globalThis.AFFOSroulette = require('../src/sroulette-utils.js');
const contentSroulette = require('../src/content-sroulette-runtime.js');

afterEach(() => {
    delete globalThis.browser;
    delete globalThis.AFFO_DEBUG;
});

function makeSrouletteData() {
    return {
        affoSubstackRoulette: true,
        affoSubstackRouletteSerif: ['Serif One', 'Missing Serif'],
        affoSubstackRouletteSans: ['Sans One'],
        affoFavorites: {
            'Serif One': {
                fontName: 'Lora',
                fontSize: '18px',
                variableAxes: { wght: 500 },
            },
            'Sans One': {
                fontName: 'Inter',
                lineHeight: '1.5',
                variableAxes: { wdth: 100 },
            },
        },
    };
}

describe('content-sroulette-runtime materialization', () => {
    it('materializes Sroulette intent without mutating favorite configs', () => {
        const data = makeSrouletteData();
        const entry = {
            sroulette: {
                body: { pool: 'serif' },
                serif: { pool: 'serif' },
                sans: { pool: 'sans' },
                mono: { pool: 'serif' },
            },
            __affoSrouletteResolved: { serif: true },
        };

        const resolved = contentSroulette.materializeEntry(entry, data, { log() {} });

        assert.equal(resolved.sroulette, undefined);
        assert.deepEqual(resolved.__affoSrouletteResolved, {
            body: true,
            serif: true,
            sans: true,
            mono: true,
        });
        assert.deepEqual(resolved.body, {
            fontName: 'Lora',
            fontSize: '18px',
            variableAxes: { wght: 500 },
        });
        assert.deepEqual(resolved.serif, {
            fontName: 'Lora',
            fontSize: '18px',
            variableAxes: { wght: 500 },
        });
        assert.deepEqual(resolved.sans, {
            fontName: 'Inter',
            lineHeight: '1.5',
            variableAxes: { wdth: 100 },
        });
        assert.deepEqual(resolved.mono, {
            fontName: 'Lora',
            fontSize: '18px',
            variableAxes: { wght: 500 },
        });

        resolved.serif.variableAxes.wght = 700;
        assert.equal(data.affoFavorites['Serif One'].variableAxes.wght, 500);
    });

    it('materializes explicit Substack intent so a configured page bypasses native Roulette', () => {
        const entry = {
            sroulette: {
                mono: { pool: 'serif' },
            },
        };

        assert.deepEqual(contentSroulette.materializeEntry(entry, makeSrouletteData()), {
            mono: {
                fontName: 'Lora',
                fontSize: '18px',
                variableAxes: { wght: 500 },
            },
            __affoSrouletteResolved: { mono: true },
        });
    });
});

describe('content-sroulette-runtime CSS tracking messages', () => {
    it('sends insertion and filtered removal messages through runtime messaging', () => {
        const messages = [];
        globalThis.browser = {
            runtime: {
                sendMessage(message) {
                    messages.push(message);
                    return Promise.resolve();
                },
            },
        };

        contentSroulette.requestCssInsert('serif', '.affo-serif { font-family: Lora; }');
        contentSroulette.requestCssInsert('mono', '.affo-mono { font-family: Lora; }');
        contentSroulette.requestCssInsert('body', '.ignored {}');
        contentSroulette.requestCssRemoval(['serif', 'body', 'sans', 'mono']);

        assert.deepEqual(messages, [
            {
                type: 'affoInsertSrouletteCss',
                fontType: 'serif',
                css: '.affo-serif { font-family: Lora; }',
            },
            {
                type: 'affoInsertSrouletteCss',
                fontType: 'mono',
                css: '.affo-mono { font-family: Lora; }',
            },
            {
                type: 'affoRemoveSrouletteCss',
                fontTypes: ['serif', 'sans', 'mono'],
            },
        ]);
    });

    it('removes stale tracked CSS targets for unresolved entries', () => {
        const messages = [];
        globalThis.browser = {
            runtime: {
                sendMessage(message) {
                    messages.push(message);
                    return Promise.resolve();
                },
            },
        };

        contentSroulette.syncCssTrackingForEntry({
            __affoSrouletteResolved: { serif: true },
        });

        assert.deepEqual(messages, [
            {
                type: 'affoRemoveSrouletteCss',
                fontTypes: ['sans', 'mono'],
            },
        ]);
    });
});

describe('content-sroulette-runtime storage resolution', () => {
    it('loads Sroulette pool data from storage when not provided', async () => {
        let requestedKeys = null;
        globalThis.browser = {
            storage: {
                local: {
                    get(keys) {
                        requestedKeys = keys;
                        return Promise.resolve(makeSrouletteData());
                    },
                },
            },
        };

        const resolved = await contentSroulette.resolveEntry({
            sroulette: {
                sans: { pool: 'sans' },
            },
        }, null, { log() {} });

        assert.deepEqual(requestedKeys, [
            'affoSubstackRoulette',
            'affoSubstackRouletteSerif',
            'affoSubstackRouletteSans',
            'affoFavorites',
        ]);
        assert.deepEqual(resolved.sans, {
            fontName: 'Inter',
            lineHeight: '1.5',
            variableAxes: { wdth: 100 },
        });
    });
});
