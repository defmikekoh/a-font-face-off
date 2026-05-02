const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    extractFontFaceSrcUrl,
    getDescriptorValue,
} = require('../src/font-face-utils.js');

describe('font-face-utils getDescriptorValue', () => {
    it('keeps data URL semicolons inside src descriptor', () => {
        const block = '@font-face { font-family: "AP"; src: url(data:font/woff2;base64,abcd); font-weight: 400; }';
        assert.equal(getDescriptorValue(block, 'src'), 'url(data:font/woff2;base64,abcd)');
    });

    it('keeps semicolons inside quoted URLs', () => {
        const block = '@font-face { src: url("https://example.com/font;v=1.woff2") format("woff2"); font-weight: 400; }';
        assert.equal(getDescriptorValue(block, 'src'), 'url("https://example.com/font;v=1.woff2") format("woff2")');
    });
});

describe('font-face-utils extractFontFaceSrcUrl', () => {
    it('extracts a direct url source', () => {
        const block = '@font-face { font-family: "A"; src: url("https://example.com/a.woff2") format("woff2"); }';
        assert.equal(extractFontFaceSrcUrl(block), 'https://example.com/a.woff2');
    });

    it('extracts a downloadable url after a local source', () => {
        const block = '@font-face { font-family: "Gibson"; src: local("Gibson"), url("https://db.onlinewebfonts.com/t/af83729ef342708b89deb4fbe42a865d.woff2") format("woff2"); }';
        assert.equal(extractFontFaceSrcUrl(block), 'https://db.onlinewebfonts.com/t/af83729ef342708b89deb4fbe42a865d.woff2');
    });

    it('extracts a downloadable url after multiple local sources and a trailing comma', () => {
        const block = '@font-face { font-family: "Gibson"; src: local("Gibson"), local("Gibson Regular"), url("https://example.com/gibson.woff2") format("woff2"),; font-weight: 400; }';
        assert.equal(extractFontFaceSrcUrl(block), 'https://example.com/gibson.woff2');
    });

    it('extracts single-quoted urls', () => {
        const block = "@font-face { src: local('A'), url('https://example.com/a.woff2') format('woff2'); }";
        assert.equal(extractFontFaceSrcUrl(block), 'https://example.com/a.woff2');
    });

    it('extracts data urls', () => {
        const block = '@font-face { src: url("data:font/woff2;base64,abcd"); }';
        assert.equal(extractFontFaceSrcUrl(block), 'data:font/woff2;base64,abcd');
    });

    it('returns empty string when src only has local sources', () => {
        const block = '@font-face { font-family: "A"; src: local("A"); }';
        assert.equal(extractFontFaceSrcUrl(block), '');
    });

    it('does not use urls outside the src descriptor', () => {
        const block = '@font-face { font-family: "A"; background: url("https://example.com/not-a-font.woff2"); }';
        assert.equal(extractFontFaceSrcUrl(block), '');
    });
});
