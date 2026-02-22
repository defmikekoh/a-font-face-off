const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    REGISTERED_AXES,
    normalizeConfig,
    determineButtonState,
    getEffectiveWeight,
    getEffectiveWidth,
    getEffectiveSlant,
    getEffectiveItalic,
    buildAllAxisSettings,
    buildCustomAxisSettings,
} = require('../src/config-utils.js');

// ── normalizeConfig ──────────────────────────────────────────────────────────

describe('normalizeConfig', () => {
    it('returns null for falsy input', () => {
        assert.equal(normalizeConfig(null), null);
        assert.equal(normalizeConfig(undefined), null);
        assert.equal(normalizeConfig(0), null);
        assert.equal(normalizeConfig(''), null);
    });

    it('returns canonical shape with only fontName present', () => {
        const result = normalizeConfig({ fontName: 'Roboto' });
        assert.deepEqual(result, {
            fontName: 'Roboto',
            variableAxes: {},
        });
    });

    it('coerces numeric string values', () => {
        const result = normalizeConfig({
            fontName: 'Inter',
            fontSize: '18',
            lineHeight: '1.5',
            letterSpacing: '0.05',
            fontWeight: '400',
        });
        assert.equal(result.fontSize, 18);
        assert.equal(result.lineHeight, 1.5);
        assert.equal(result.letterSpacing, 0.05);
        assert.equal(result.fontWeight, 400);
    });

    it('handles legacy fontSizePx property', () => {
        const result = normalizeConfig({ fontName: 'Lato', fontSizePx: 20 });
        assert.equal(result.fontSize, 20);
    });

    it('prefers fontSizePx over fontSize when both present', () => {
        const result = normalizeConfig({ fontName: 'Lato', fontSizePx: 20, fontSize: 16 });
        assert.equal(result.fontSize, 20);
    });

    it('drops fontColor when set to "default"', () => {
        const result = normalizeConfig({ fontName: 'Roboto', fontColor: 'default' });
        assert.equal(result.fontColor, undefined);
    });

    it('keeps non-default fontColor', () => {
        const result = normalizeConfig({ fontName: 'Roboto', fontColor: '#ff0000' });
        assert.equal(result.fontColor, '#ff0000');
    });

    it('preserves fontFaceRule', () => {
        const rule = '@font-face { font-family: "Custom"; src: url(...); }';
        const result = normalizeConfig({ fontName: 'Custom', fontFaceRule: rule });
        assert.equal(result.fontFaceRule, rule);
    });

    it('coerces variable axes values to numbers', () => {
        const result = normalizeConfig({
            fontName: 'Inter',
            variableAxes: { wght: '700', wdth: '75', CASL: '1' },
        });
        assert.deepEqual(result.variableAxes, { wght: 700, wdth: 75, CASL: 1 });
    });

    it('folds legacy wdthVal/slntVal/italVal into variableAxes', () => {
        const result = normalizeConfig({
            fontName: 'Inter',
            wdthVal: 80,
            slntVal: -12,
            italVal: 1,
        });
        assert.deepEqual(result.variableAxes, { wdth: 80, slnt: -12, ital: 1 });
    });

    it('does not overwrite variableAxes with legacy vals', () => {
        const result = normalizeConfig({
            fontName: 'Inter',
            variableAxes: { wdth: 100 },
            wdthVal: 80, // should be ignored because variableAxes.wdth exists
        });
        assert.equal(result.variableAxes.wdth, 100);
    });

    it('sets fontName to null when missing', () => {
        const result = normalizeConfig({ fontSize: 16 });
        assert.equal(result.fontName, null);
    });

    it('omits properties not present in input (No Key arch)', () => {
        const result = normalizeConfig({ fontName: 'Roboto' });
        assert.equal(result.hasOwnProperty('fontSize'), false);
        assert.equal(result.hasOwnProperty('lineHeight'), false);
        assert.equal(result.hasOwnProperty('letterSpacing'), false);
        assert.equal(result.hasOwnProperty('fontWeight'), false);
        assert.equal(result.hasOwnProperty('fontColor'), false);
        assert.equal(result.hasOwnProperty('fontFaceRule'), false);
    });

    it('preserves letterSpacing of 0', () => {
        const result = normalizeConfig({ fontName: 'Roboto', letterSpacing: 0 });
        assert.equal(result.letterSpacing, 0);
    });
});

// ── determineButtonState ─────────────────────────────────────────────────────

describe('determineButtonState', () => {
    it('returns apply when changes exist and not all defaults', () => {
        const result = determineButtonState(3, false, false);
        assert.deepEqual(result, { action: 'apply', changeCount: 3 });
    });

    it('returns reset when changes exist but all are defaults', () => {
        const result = determineButtonState(2, true, false);
        assert.deepEqual(result, { action: 'reset', changeCount: 0 });
    });

    it('returns reset when no changes but domain has applied', () => {
        const result = determineButtonState(0, false, true);
        assert.deepEqual(result, { action: 'reset', changeCount: 0 });
    });

    it('returns none when no changes and no domain applied', () => {
        const result = determineButtonState(0, false, false);
        assert.deepEqual(result, { action: 'none', changeCount: 0 });
    });

    it('returns reset when all defaults, even with domain applied', () => {
        const result = determineButtonState(1, true, true);
        assert.deepEqual(result, { action: 'reset', changeCount: 0 });
    });
});

// ── getEffectiveWeight ───────────────────────────────────────────────────────

describe('getEffectiveWeight', () => {
    it('returns fontWeight when set', () => {
        assert.equal(getEffectiveWeight({ fontWeight: 700 }), 700);
    });

    it('falls back to variableAxes.wght', () => {
        assert.equal(getEffectiveWeight({ variableAxes: { wght: 500 } }), 500);
    });

    it('prefers fontWeight over variableAxes.wght', () => {
        assert.equal(getEffectiveWeight({ fontWeight: 300, variableAxes: { wght: 500 } }), 300);
    });

    it('coerces string values', () => {
        assert.equal(getEffectiveWeight({ fontWeight: '600' }), 600);
    });

    it('returns null when neither set', () => {
        assert.equal(getEffectiveWeight({}), null);
        assert.equal(getEffectiveWeight({ variableAxes: {} }), null);
    });
});

// ── getEffectiveWidth ────────────────────────────────────────────────────────

describe('getEffectiveWidth', () => {
    it('returns wdthVal when set', () => {
        assert.equal(getEffectiveWidth({ wdthVal: 75 }), 75);
    });

    it('falls back to variableAxes.wdth', () => {
        assert.equal(getEffectiveWidth({ variableAxes: { wdth: 125 } }), 125);
    });

    it('returns null when neither set', () => {
        assert.equal(getEffectiveWidth({}), null);
    });
});

// ── getEffectiveSlant ────────────────────────────────────────────────────────

describe('getEffectiveSlant', () => {
    it('returns slntVal when set', () => {
        assert.equal(getEffectiveSlant({ slntVal: -12 }), -12);
    });

    it('falls back to variableAxes.slnt', () => {
        assert.equal(getEffectiveSlant({ variableAxes: { slnt: -10 } }), -10);
    });

    it('returns null when neither set', () => {
        assert.equal(getEffectiveSlant({}), null);
    });
});

// ── getEffectiveItalic ───────────────────────────────────────────────────────

describe('getEffectiveItalic', () => {
    it('returns italVal when set', () => {
        assert.equal(getEffectiveItalic({ italVal: 1 }), 1);
    });

    it('falls back to variableAxes.ital', () => {
        assert.equal(getEffectiveItalic({ variableAxes: { ital: 1 } }), 1);
    });

    it('returns null when neither set', () => {
        assert.equal(getEffectiveItalic({}), null);
    });
});

// ── buildCustomAxisSettings ──────────────────────────────────────────────────

describe('buildCustomAxisSettings', () => {
    it('returns empty array when no axes', () => {
        assert.deepEqual(buildCustomAxisSettings({}), []);
        assert.deepEqual(buildCustomAxisSettings({ variableAxes: {} }), []);
    });

    it('excludes registered axes', () => {
        const result = buildCustomAxisSettings({
            variableAxes: { wght: 700, wdth: 100, slnt: 0, ital: 0, opsz: 14 },
        });
        assert.deepEqual(result, []);
    });

    it('includes custom axes', () => {
        const result = buildCustomAxisSettings({
            variableAxes: { CASL: 1, CRSV: 0.5 },
        });
        assert.deepEqual(result, ['"CASL" 1', '"CRSV" 0.5']);
    });

    it('mixes registered and custom axes, only returns custom', () => {
        const result = buildCustomAxisSettings({
            variableAxes: { wght: 400, CASL: 1, slnt: -5, MONO: 0 },
        });
        assert.deepEqual(result, ['"CASL" 1', '"MONO" 0']);
    });

    it('skips non-finite values', () => {
        const result = buildCustomAxisSettings({
            variableAxes: { CASL: 'abc', MONO: 1 },
        });
        assert.deepEqual(result, ['"MONO" 1']);
    });
});

// ── REGISTERED_AXES ──────────────────────────────────────────────────────────

describe('REGISTERED_AXES', () => {
    it('contains all five registered axes', () => {
        assert.ok(REGISTERED_AXES.has('wght'));
        assert.ok(REGISTERED_AXES.has('wdth'));
        assert.ok(REGISTERED_AXES.has('slnt'));
        assert.ok(REGISTERED_AXES.has('ital'));
        assert.ok(REGISTERED_AXES.has('opsz'));
    });

    it('does not contain custom axes', () => {
        assert.ok(!REGISTERED_AXES.has('CASL'));
        assert.ok(!REGISTERED_AXES.has('CRSV'));
    });
});

// ── buildAllAxisSettings ─────────────────────────────────────────────────────

describe('buildAllAxisSettings', () => {
    it('returns empty array when no axes', () => {
        assert.deepEqual(buildAllAxisSettings({}), []);
        assert.deepEqual(buildAllAxisSettings({ variableAxes: {} }), []);
    });

    it('includes registered axes (bypasses @font-face clamping)', () => {
        const result = buildAllAxisSettings({
            variableAxes: { wght: 470, wdth: 80 },
        });
        assert.deepEqual(result, ['"wght" 470', '"wdth" 80']);
    });

    it('includes custom axes', () => {
        const result = buildAllAxisSettings({
            variableAxes: { CASL: 1, CRSV: 0.5 },
        });
        assert.deepEqual(result, ['"CASL" 1', '"CRSV" 0.5']);
    });

    it('includes both registered and custom axes', () => {
        const result = buildAllAxisSettings({
            variableAxes: { wght: 470, CASL: 1, slnt: -5, MONO: 0 },
        });
        assert.deepEqual(result, ['"wght" 470', '"CASL" 1', '"slnt" -5', '"MONO" 0']);
    });

    it('skips non-finite values', () => {
        const result = buildAllAxisSettings({
            variableAxes: { wght: 'abc', CASL: 1 },
        });
        assert.deepEqual(result, ['"CASL" 1']);
    });
});
