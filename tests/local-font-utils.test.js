const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    FONT_SOURCE_LOCAL,
    normalizeFontFamilyName,
    normalizeLocalFonts,
    isLocalFontConfig,
} = require('../src/local-font-utils.js');

describe('local-font-utils', () => {
    it('normalizes quoted family names', () => {
        assert.equal(normalizeFontFamilyName('"Iowan Old Style"'), 'Iowan Old Style');
        assert.equal(normalizeFontFamilyName("'Helvetica Neue'"), 'Helvetica Neue');
    });

    it('deduplicates and drops generic families', () => {
        const result = normalizeLocalFonts([
            ' Iowan Old Style ',
            'iowan old style',
            'serif',
            'Aptos',
            '',
            '"Helvetica Neue"'
        ]);

        assert.deepEqual(result, ['Iowan Old Style', 'Aptos', 'Helvetica Neue']);
    });

    it('parses textarea input', () => {
        const result = normalizeLocalFonts('Aptos\n\nsystem-ui\nSF Pro Text');
        assert.deepEqual(result, ['Aptos', 'SF Pro Text']);
    });

    it('detects local font configs', () => {
        assert.equal(isLocalFontConfig({ fontSource: FONT_SOURCE_LOCAL }), true);
        assert.equal(isLocalFontConfig({ fontSource: 'google' }), false);
    });
});
