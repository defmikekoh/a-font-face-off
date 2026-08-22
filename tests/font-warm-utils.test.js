const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getStoredFontTypesToWarm } = require('../src/font-warm-utils.js');

const font = fontName => ({ fontName, variableAxes: {} });

describe('font-warm-utils stored mode selection', () => {
    it('uses an unambiguous body entry even when the global mode is stale', () => {
        assert.deepEqual(getStoredFontTypesToWarm({
            body: font('Lora'),
        }, 'third-man-in', 'third-man-in'), ['body']);
    });

    it('uses only present TMI positions even when the global mode is stale', () => {
        assert.deepEqual(getStoredFontTypesToWarm({
            serif: font('Lora'),
            sans: font('Andika'),
        }, 'body-contact', 'body-contact'), ['serif', 'sans']);
    });

    it('uses the current view to disambiguate a mixed body entry', () => {
        assert.deepEqual(getStoredFontTypesToWarm({
            body: font('Lora'),
            sans: font('Andika'),
        }, 'body-contact', 'third-man-in'), ['body']);
    });

    it('uses the current view to disambiguate a mixed TMI entry', () => {
        assert.deepEqual(getStoredFontTypesToWarm({
            body: font('Lora'),
            serif: font('Source Serif 4'),
            sans: font('Andika'),
            mono: font('Roboto Mono'),
        }, 'third-man-in', 'body-contact'), ['serif', 'sans', 'mono']);
    });

    it('falls back to the legacy applied mode when Face-off is visible', () => {
        assert.deepEqual(getStoredFontTypesToWarm({
            body: font('Lora'),
            sans: font('Andika'),
        }, 'faceoff', 'third-man-in'), ['sans']);
    });

    it('warms all present positions for ambiguous mixed legacy data', () => {
        assert.deepEqual(getStoredFontTypesToWarm({
            body: font('Lora'),
            serif: font('Source Serif 4'),
            mono: font('Roboto Mono'),
        }, 'faceoff', undefined), ['body', 'serif', 'mono']);
    });

    it('ignores missing and nameless configurations', () => {
        assert.deepEqual(getStoredFontTypesToWarm(null), []);
        assert.deepEqual(getStoredFontTypesToWarm({
            body: {},
            sans: font('Andika'),
            mono: null,
        }), ['sans']);
    });
});
