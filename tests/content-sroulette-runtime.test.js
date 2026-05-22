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
            mono: { fontName: 'JetBrains Mono' },
            sroulette: {
                body: { pool: 'serif' },
                serif: { pool: 'serif' },
                sans: { pool: 'sans' },
            },
            __affoSrouletteResolved: { serif: true },
        };

        const resolved = contentSroulette.materializeEntry(entry, data, { log() {} });

        assert.equal(resolved.sroulette, undefined);
        assert.deepEqual(resolved.__affoSrouletteResolved, {
            body: true,
            serif: true,
            sans: true,
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

        resolved.serif.variableAxes.wght = 700;
        assert.equal(data.affoFavorites['Serif One'].variableAxes.wght, 500);
    });

    it('leaves Substack entries unresolved for site-native rerolls', () => {
        const entry = {
            sroulette: {
                body: { pool: 'serif' },
            },
        };

        assert.equal(
            contentSroulette.materializeEntry(entry, makeSrouletteData(), { isSubstack: true }),
            entry
        );
    });

    it('treats intent-only Substack entries as empty', () => {
        assert.equal(
            contentSroulette.shouldTreatEntryAsEmptyOnSubstack({
                sroulette: { serif: { pool: 'serif' } },
            }, true),
            true
        );
        assert.equal(
            contentSroulette.shouldTreatEntryAsEmptyOnSubstack({
                serif: { fontName: 'Lora' },
                sroulette: { serif: { pool: 'serif' } },
            }, true),
            false
        );
        assert.equal(
            contentSroulette.shouldTreatEntryAsEmptyOnSubstack({
                sroulette: { serif: { pool: 'serif' } },
            }, false),
            false
        );
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
        contentSroulette.requestCssInsert('body', '.ignored {}');
        contentSroulette.requestCssRemoval(['serif', 'body', 'sans', 'mono']);

        assert.deepEqual(messages, [
            {
                type: 'affoInsertSrouletteCss',
                fontType: 'serif',
                css: '.affo-serif { font-family: Lora; }',
            },
            {
                type: 'affoRemoveSrouletteCss',
                fontTypes: ['serif', 'sans'],
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
                fontTypes: ['sans'],
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
