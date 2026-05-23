const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

globalThis.AFFOSroulette = require('../src/sroulette-utils.js');
globalThis.normalizeConfig = require('../src/config-utils.js').normalizeConfig;
const popupPanelUtils = require('../src/popup-panel-utils.js');

function panelStates(map) {
    return {
        getPanelState(type) {
            return map[type] || { kind: 'empty' };
        },
    };
}

describe('popup-panel-utils config comparison', () => {
    it('compares canonicalized active controls and variable axes', () => {
        assert.equal(popupPanelUtils.configsEqual({
            fontName: 'Inter',
            fontSize: '18',
            letterSpacing: 0,
            fontWeight: '500',
            variableAxes: { wdth: '100' },
        }, {
            fontName: 'Inter',
            fontSize: 18,
            letterSpacing: 0,
            fontWeight: 500,
            variableAxes: { wdth: 100 },
        }), true);

        assert.equal(popupPanelUtils.configsEqual({
            fontName: 'Inter',
            fontSize: 18,
        }, {
            fontName: 'Inter',
        }), false);

        assert.equal(popupPanelUtils.configsEqual({
            fontName: 'Inter',
            fontSizeScale: 110,
        }, {
            fontName: 'Inter',
            fontSize: 110,
        }), false);

        assert.equal(popupPanelUtils.configsEqual({
            fontName: 'Inter',
            fontSizeScale: '110',
        }, {
            fontName: 'Inter',
            fontSizeScale: 110,
        }), true);

        assert.equal(popupPanelUtils.configsEqual({
            fontName: 'Inter',
            variableAxes: { wdth: 95 },
        }, {
            fontName: 'Inter',
            variableAxes: { wdth: 100 },
        }), false);
    });

    it('builds applied comparison configs from stored payloads', () => {
        assert.deepEqual(popupPanelUtils.buildAppliedComparisonConfig({
            fontName: 'Lora',
            fontSizeScale: 112,
            lineHeight: 1.6,
            letterSpacing: 0,
            fontWeight: 600,
            fontStyle: 'italic',
            fontColor: '#333333',
            variableAxes: { wght: 600 },
            css2Url: 'derived-value',
        }), {
            fontName: 'Lora',
            fontSizeScale: 112,
            lineHeight: 1.6,
            letterSpacing: 0,
            fontWeight: 600,
            fontStyle: 'italic',
            fontColor: '#333333',
            variableAxes: { wght: 600 },
        });
    });
});

describe('popup-panel-utils Sroulette helpers', () => {
    it('sets and clears Sroulette intent on domain entries', () => {
        const entry = {
            serif: { fontName: 'Lora' },
        };

        assert.equal(popupPanelUtils.setSrouletteIntentOnEntry(entry, 'serif', 'sans'), true);
        assert.deepEqual(entry, {
            sroulette: {
                serif: { pool: 'sans' },
            },
        });
        assert.deepEqual(popupPanelUtils.getSrouletteIntent(entry, 'serif'), { pool: 'sans' });

        popupPanelUtils.clearSrouletteIntentFromEntry(entry, 'serif');
        assert.deepEqual(entry, {});
    });
});

describe('popup-panel-utils Apply All planning', () => {
    it('plans changed font payloads, changed Sroulette intents, and unsets', () => {
        const config = {
            fontName: 'Lora',
            fontSize: 18,
            variableAxes: { wght: 500 },
        };
        const result = popupPanelUtils.buildThirdManInBatchChanges(['serif', 'sans', 'mono'], {
            serif: { fontName: 'Old Serif', variableAxes: {} },
            sans: { fontName: 'Inter', variableAxes: {} },
            mono: { fontName: 'JetBrains Mono', variableAxes: {} },
        }, panelStates({
            serif: { kind: 'font', config },
            sans: { kind: 'sroulette', pool: 'serif' },
            mono: { kind: 'empty' },
        }));

        assert.deepEqual(result.batchConfigs, {
            serif: {
                kind: 'fontPayloadRequest',
                target: 'serif',
                config,
            },
            sans: {
                kind: 'sroulette',
                pool: 'serif',
            },
            mono: null,
        });
        assert.deepEqual(result.cssJobs, [{
            type: 'serif',
            fontName: 'Lora',
            config,
        }]);
    });

    it('skips unchanged font and Sroulette panel states', () => {
        const config = {
            fontName: 'Lora',
            fontSize: 18,
            variableAxes: { wght: 500 },
        };
        const result = popupPanelUtils.buildThirdManInBatchChanges(['serif', 'sans'], {
            serif: config,
            sroulette: {
                sans: { pool: 'serif' },
            },
        }, panelStates({
            serif: { kind: 'font', config },
            sans: { kind: 'sroulette', pool: 'serif' },
        }));

        assert.deepEqual(result, {
            batchConfigs: {},
            cssJobs: [],
        });
    });
});

describe('popup-panel-utils Third Man In difference counting', () => {
    it('counts current font and Sroulette differences against applied domain data', () => {
        assert.equal(popupPanelUtils.countThirdManInDifferences(['serif', 'sans', 'mono'], {
            serif: { fontName: 'Old Serif', variableAxes: {} },
            sroulette: {
                sans: { pool: 'serif' },
            },
        }, panelStates({
            serif: { kind: 'font', config: { fontName: 'Lora', variableAxes: {} } },
            sans: { kind: 'sroulette', pool: 'serif' },
            mono: { kind: 'empty' },
        })), 1);
    });

    it('counts clearing all applied TMI settings as one reset action', () => {
        assert.equal(popupPanelUtils.countThirdManInDifferences(['serif', 'sans', 'mono'], {
            serif: { fontName: 'Lora', variableAxes: {} },
            sans: { fontName: 'Inter', variableAxes: {} },
        }, panelStates({
            serif: { kind: 'empty' },
            sans: { kind: 'empty' },
            mono: { kind: 'empty' },
        })), 1);
    });
});
