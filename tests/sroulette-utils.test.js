const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const sroulette = require('../src/sroulette-utils.js');

describe('sroulette-utils intent helpers', () => {
    it('validates pools and targets', () => {
        assert.equal(sroulette.isPool('serif'), true);
        assert.equal(sroulette.isPool('sans'), true);
        assert.equal(sroulette.isPool('mono'), false);
        assert.equal(sroulette.isTarget('body'), true);
        assert.equal(sroulette.isTarget('mono'), false);
        assert.equal(sroulette.isCssTarget('serif'), true);
        assert.equal(sroulette.isCssTarget('body'), false);
    });

    it('sets, reads, and clears Sroulette intent', () => {
        const entry = {
            serif: { fontName: 'Lora' },
        };

        assert.equal(sroulette.setIntent(entry, 'serif', 'sans'), true);
        assert.deepEqual(entry, {
            sroulette: {
                serif: { pool: 'sans' },
            },
        });
        assert.deepEqual(sroulette.getIntent(entry, 'serif'), { pool: 'sans' });
        assert.equal(sroulette.hasIntentForTarget(entry, 'serif'), true);
        assert.equal(sroulette.hasIntent(entry), true);

        sroulette.clearIntent(entry, 'serif');
        assert.deepEqual(entry, {});
    });

    it('ignores invalid intent data', () => {
        const entry = {
            sroulette: {
                serif: { pool: 'mono' },
            },
        };

        assert.equal(sroulette.getIntent(entry, 'serif'), null);
        assert.equal(sroulette.hasIntent(entry), false);
        assert.equal(sroulette.setIntent(entry, 'mono', 'serif'), false);
        assert.equal(sroulette.setIntent(entry, 'serif', 'mono'), false);
    });

    it('checks raw sroulette maps used by quick pick', () => {
        const srouletteData = {
            body: { pool: 'serif' },
            sans: { pool: 'mono' },
        };

        assert.equal(sroulette.hasIntentInMap(srouletteData, ['body']), true);
        assert.equal(sroulette.hasIntentInMap(srouletteData, ['sans']), false);
        assert.equal(sroulette.hasIntentInMap(null, ['body']), false);
    });
});

describe('sroulette-utils pool metadata helpers', () => {
    it('returns storage keys, labels, batch intents, and valid pool counts', () => {
        const data = {
            affoSubstackRoulette: true,
            affoSubstackRouletteSerif: ['Serif One', 'Missing Serif'],
            affoSubstackRouletteSans: ['Sans One'],
            affoFavorites: {
                'Serif One': { fontName: 'Lora' },
                'Sans One': { fontName: 'Inter' },
            },
        };

        assert.equal(sroulette.getPoolStorageKey('serif'), 'affoSubstackRouletteSerif');
        assert.equal(sroulette.getPoolLabel('sans'), 'Sroulette Sans');
        assert.deepEqual(sroulette.createBatchIntent('serif'), { kind: 'sroulette', pool: 'serif' });
        assert.equal(sroulette.isBatchIntent({ kind: 'sroulette', pool: 'serif' }), true);
        assert.deepEqual(sroulette.getValidPoolInfoFromData(data, 'serif'), {
            available: true,
            count: 1,
        });
        assert.deepEqual(sroulette.getValidPoolInfoFromData(data, 'mono'), {
            available: false,
            count: 0,
        });
    });
});
