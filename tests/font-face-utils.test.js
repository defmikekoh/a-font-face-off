const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    extractFontFaceSources,
    extractFontFaceSrcUrl,
    extractFontFaceEntries,
    getFontFormat,
    getFontMimeType,
    getDescriptorValue,
    selectFontFaceWarmUrl,
    sortFontFaceUrlsForConfig,
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

    it('uses the final src descriptor and skips legacy EOT and SVG sources', () => {
        const block = `@font-face {
            src: url("font.eot");
            src: url("font.eot?#iefix") format("embedded-opentype"),
                 url("font.woff2") format("woff2"),
                 url("font.woff") format("woff"),
                 url("font.ttf") format("truetype"),
                 url("font.otf") format("opentype"),
                 url("font.svg#Test") format("svg");
        }`;

        assert.equal(extractFontFaceSrcUrl(block), 'font.woff2');
        assert.deepEqual(
            extractFontFaceSources(block).map(source => [source.format, source.supported]),
            [
                ['eot', false],
                ['woff2', true],
                ['woff', true],
                ['ttf', true],
                ['otf', true],
                ['svg', false],
            ]
        );
    });

    it('recognizes supported URL, format-hint, and data URL formats', () => {
        assert.equal(getFontFormat('https://example.com/font.WOFF?version=2'), 'woff');
        assert.equal(getFontFormat('https://example.com/download?id=1', 'truetype'), 'ttf');
        assert.equal(getFontFormat('data:font/otf;base64,T1RUTw=='), 'otf');
        assert.equal(getFontMimeType('ttf'), 'font/ttf');
        assert.equal(getFontMimeType('opentype'), 'font/otf');
    });
});

describe('font-face-utils Google FontFace selection', () => {
    const cssText = [
        '@font-face { font-family: "Test"; font-style: normal; font-weight: 700; src: url("https://fonts.gstatic.com/test-700-latin.woff2") format("woff2"); unicode-range: U+0000-00FF; }',
        '@font-face { font-family: "Test"; font-style: normal; font-weight: 900; src: url("https://fonts.gstatic.com/test-900-cyrillic.woff2") format("woff2"); unicode-range: U+0400-04FF; }',
        '@font-face { font-family: "Test"; font-style: normal; font-weight: 900; src: url("https://fonts.gstatic.com/test-900-latin.woff2") format("woff2"); unicode-range: U+0000-00FF; }',
        '@font-face { font-family: "Test"; font-style: italic; font-weight: 900; src: url("https://fonts.gstatic.com/test-900-italic-latin.woff2") format("woff2"); unicode-range: U+0000-00FF; }',
    ].join('\n');

    it('parses descriptors needed by background warming and content loading', () => {
        const entries = extractFontFaceEntries(cssText);
        assert.equal(entries.length, 4);
        assert.deepEqual(entries[0].weightInfo, { descriptor: '700', min: 700, max: 700 });
        assert.equal(entries[0].style, 'normal');
        assert.deepEqual(entries[0].ranges, [[0, 255]]);
    });

    it('parses WOFF, TTF, and OTF entries as loadable font faces', () => {
        const entries = extractFontFaceEntries([
            '@font-face { src: url(test.woff) format("woff"); }',
            '@font-face { src: url(test.ttf) format("truetype"); }',
            '@font-face { src: url(download?id=3) format("opentype"); }',
        ].join('\n'));
        assert.deepEqual(entries.map(entry => entry.format), ['woff', 'ttf', 'otf']);
    });

    it('warms the configured Latin weight before the supplemental bold face', () => {
        const selected = selectFontFaceWarmUrl(cssText, {
            fontWeight: 900,
            variableAxes: {},
        });
        assert.equal(selected.url, 'https://fonts.gstatic.com/test-900-latin.woff2');
        assert.equal(selected.weight, '900');
        assert.equal(selected.style, 'normal');
    });

    it('selects the configured italic face', () => {
        const selected = selectFontFaceWarmUrl(cssText, {
            fontWeight: 900,
            fontStyle: 'italic',
            variableAxes: {},
        });
        assert.equal(selected.url, 'https://fonts.gstatic.com/test-900-italic-latin.woff2');
        assert.equal(selected.style, 'italic');
    });

    it('sorts the configured weight before bold while preserving subset order', () => {
        const entries = extractFontFaceEntries(cssText);
        const urls = [
            'https://fonts.gstatic.com/test-700-latin.woff2',
            'https://fonts.gstatic.com/test-900-latin.woff2',
            'https://fonts.gstatic.com/test-900-cyrillic.woff2',
        ];
        assert.deepEqual(sortFontFaceUrlsForConfig(urls, entries, {
            fontWeight: 900,
            variableAxes: {},
        }), [
            'https://fonts.gstatic.com/test-900-latin.woff2',
            'https://fonts.gstatic.com/test-900-cyrillic.woff2',
            'https://fonts.gstatic.com/test-700-latin.woff2',
        ]);
    });
});
