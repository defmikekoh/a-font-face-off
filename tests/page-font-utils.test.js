const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');

const {
    buildFontBinaryAxisDefinition,
    buildFontFaceAxisDefinition,
    cleanFontFamilyName,
    detectFontBinaryFormat,
    extractMatchingFontFaceRules,
    extractRemoteFontUrls,
    extractStylesheetImportUrls,
    normalizeFontFamilyName,
    rankStylesheetUrls,
    replaceFontFaceUrl,
    mergeAxisDefinitions,
    selectBestFontFaceRule,
} = require('../src/page-font-utils.js');

function writeFixed(buffer, offset, value) {
    buffer.writeInt32BE(Math.round(value * 65536), offset);
}

function buildTestFvarTable() {
    const table = Buffer.alloc(56);
    table.writeUInt16BE(1, 0);
    table.writeUInt16BE(0, 2);
    table.writeUInt16BE(16, 4);
    table.writeUInt16BE(2, 6);
    table.writeUInt16BE(2, 8);
    table.writeUInt16BE(20, 10);
    table.writeUInt16BE(0, 12);
    table.writeUInt16BE(0, 14);

    table.write('wght', 16, 'ascii');
    writeFixed(table, 20, 100);
    writeFixed(table, 24, 300);
    writeFixed(table, 28, 1000);

    table.write('opsz', 36, 'ascii');
    writeFixed(table, 40, 9);
    writeFixed(table, 44, 100);
    writeFixed(table, 48, 100);
    return table;
}

function buildTestSfnt() {
    const fvar = buildTestFvarTable();
    const font = Buffer.alloc(28 + fvar.length);
    font.writeUInt32BE(0x00010000, 0);
    font.writeUInt16BE(1, 4);
    font.write('fvar', 12, 'ascii');
    font.writeUInt32BE(28, 20);
    font.writeUInt32BE(fvar.length, 24);
    fvar.copy(font, 28);
    return font;
}

function buildTestWoff2() {
    const fvar = buildTestFvarTable();
    const compressed = zlib.brotliCompressSync(fvar);
    const font = Buffer.alloc(50 + compressed.length);
    font.write('wOF2', 0, 'ascii');
    font.writeUInt32BE(0x00010000, 4);
    font.writeUInt32BE(font.length, 8);
    font.writeUInt16BE(1, 12);
    font.writeUInt32BE(28 + fvar.length, 16);
    font.writeUInt32BE(compressed.length, 20);
    font[48] = 47; // Known fvar tag, null transform.
    font[49] = fvar.length;
    compressed.copy(font, 50);
    return font;
}

function buildTestWoff() {
    const fvar = buildTestFvarTable();
    const compressed = zlib.deflateSync(fvar);
    const font = Buffer.alloc(64 + compressed.length);
    font.write('wOFF', 0, 'ascii');
    font.writeUInt32BE(0x00010000, 4);
    font.writeUInt32BE(font.length, 8);
    font.writeUInt16BE(1, 12);
    font.write('fvar', 44, 'ascii');
    font.writeUInt32BE(64, 48);
    font.writeUInt32BE(compressed.length, 52);
    font.writeUInt32BE(fvar.length, 56);
    compressed.copy(font, 64);
    return font;
}

describe('page-font-utils', () => {
    it('normalizes quoted family names', () => {
        assert.equal(cleanFontFamilyName('"YahooSans VF"'), 'YahooSans VF');
        assert.equal(normalizeFontFamilyName('"YahooSans VF"'), 'yahoosans vf');
        assert.equal(normalizeFontFamilyName("'YahooSans VF'"), 'yahoosans vf');
    });

    it('extracts matching nested font-face blocks and resolves relative URLs', () => {
        const css = `
            @supports (font-variation-settings: normal) {
                @font-face {
                    font-family: 'YahooSans VF';
                    src: url('../fonts/YahooSans-VF-Web.woff2') format('woff2');
                    font-weight: 200 900;
                }
            }
            @font-face { font-family: Other; src: url(other.woff2); }
        `;
        const rules = extractMatchingFontFaceRules(
            css,
            'YahooSans VF',
            'https://s.yimg.com/cv/apiv2/sports/css/yahooSans.css'
        );

        assert.equal(rules.length, 1);
        assert.match(rules[0], /font-weight:\s*200 900/);
        assert.match(rules[0], /https:\/\/s\.yimg\.com\/cv\/apiv2\/sports\/fonts\/YahooSans-VF-Web\.woff2/);
    });

    it('prioritizes likely font stylesheets', () => {
        const ranked = rankStylesheetUrls([
            'https://example.com/app.css',
            'https://cdn.example.com/fonts/yahooSans.css',
            'https://example.com/theme.css',
        ], 'YahooSans VF');

        assert.equal(ranked[0], 'https://cdn.example.com/fonts/yahooSans.css');
    });

    it('extracts and resolves imported stylesheet URLs', () => {
        const imports = extractStylesheetImportUrls(`
            @import url("fonts/type.css") screen;
            @import 'https://fonts.googleapis.com/css2?family=Libre+Caslon+Text';
            @import url(fonts/type.css);
        `, 'https://example.com/css/theme.css');

        assert.deepEqual(imports, [
            'https://example.com/css/fonts/type.css',
            'https://fonts.googleapis.com/css2?family=Libre+Caslon+Text'
        ]);
    });

    it('selects the rule matching detected style and weight', () => {
        const rules = [
            '@font-face { font-family: Test; src: url(regular.woff2); font-weight: 400; }',
            '@font-face { font-family: Test; src: url(variable.woff2); font-weight: 600 900; }',
            '@font-face { font-family: Test; src: url(italic.woff2); font-weight: 400; font-style: italic; }',
        ];

        assert.match(selectBestFontFaceRule(rules, 700, 'normal'), /variable\.woff2/);
        assert.match(selectBestFontFaceRule(rules, 400, 'italic'), /italic\.woff2/);
    });

    it('prefers the matching Basic Latin subset', () => {
        const rules = [
            '@font-face { font-family: Test; src: url(latin-ext.woff2); font-weight: 400; unicode-range: U+0100-02FF; }',
            '@font-face { font-family: Test; src: url(latin.woff2); font-weight: 400; unicode-range: U+0000-00FF; }',
        ];

        assert.match(selectBestFontFaceRule(rules, 400, 'normal'), /url\(latin\.woff2\)/);
    });

    it('derives only variable axes proven by font-face descriptor ranges', () => {
        const definition = buildFontFaceAxisDefinition(
            '@font-face { font-family: Test; font-weight: 200 900; font-stretch: 75% 125%; font-style: oblique -12deg 0deg; }'
        );

        assert.deepEqual(definition, {
            axes: ['wght', 'wdth', 'slnt'],
            defaults: { wght: 400, wdth: 100, slnt: 0 },
            ranges: { wght: [200, 900], wdth: [75, 125], slnt: [-12, 0] }
        });
    });

    it('does not expose a static font-face weight as a variable axis', () => {
        assert.deepEqual(
            buildFontFaceAxisDefinition('@font-face { font-weight: 500; }'),
            { axes: [], defaults: {}, ranges: {} }
        );
    });

    it('reads variable axes from an uncompressed OpenType fvar table', async () => {
        assert.deepEqual(
            await buildFontBinaryAxisDefinition(buildTestSfnt()),
            {
                axes: ['wght', 'opsz'],
                defaults: { wght: 300, opsz: 100 },
                ranges: { wght: [100, 1000], opsz: [9, 100] }
            }
        );
    });

    it('reads variable axes from a WOFF2 fvar table', async () => {
        assert.deepEqual(
            await buildFontBinaryAxisDefinition(buildTestWoff2(), {
                decompressBrotli(compressed) {
                    return zlib.brotliDecompressSync(compressed);
                }
            }),
            {
                axes: ['wght', 'opsz'],
                defaults: { wght: 300, opsz: 100 },
                ranges: { wght: [100, 1000], opsz: [9, 100] }
            }
        );
    });

    it('reads variable axes from a WOFF fvar table', async () => {
        assert.deepEqual(
            await buildFontBinaryAxisDefinition(buildTestWoff(), {
                decompressDeflate(compressed) {
                    return zlib.inflateSync(compressed);
                }
            }),
            {
                axes: ['wght', 'opsz'],
                defaults: { wght: 300, opsz: 100 },
                ranges: { wght: [100, 1000], opsz: [9, 100] }
            }
        );
    });

    it('detects WOFF2, WOFF, TTF, and OTF binaries by signature', () => {
        assert.equal(detectFontBinaryFormat(buildTestWoff2()), 'woff2');
        assert.equal(detectFontBinaryFormat(buildTestWoff()), 'woff');
        assert.equal(detectFontBinaryFormat(buildTestSfnt()), 'ttf');
        assert.equal(detectFontBinaryFormat(Buffer.from('OTTO')), 'otf');
    });

    it('prefers binary axis metadata while retaining descriptor-only axes', () => {
        assert.deepEqual(
            mergeAxisDefinitions(
                {
                    axes: ['wght', 'opsz'],
                    defaults: { wght: 300, opsz: 100 },
                    ranges: { wght: [100, 1000], opsz: [9, 100] }
                },
                {
                    axes: ['wght', 'wdth'],
                    defaults: { wght: 400, wdth: 100 },
                    ranges: { wght: [200, 900], wdth: [75, 125] }
                }
            ),
            {
                axes: ['wght', 'opsz', 'wdth'],
                defaults: { wght: 300, opsz: 100, wdth: 100 },
                ranges: { wght: [100, 1000], opsz: [9, 100], wdth: [75, 125] }
            }
        );
    });

    it('extracts and replaces a remote font URL', () => {
        const rule = '@font-face { src: local("Test"), url("https://cdn.example.com/test.woff2") format("woff2"); }';
        const urls = extractRemoteFontUrls(rule);
        const replaced = replaceFontFaceUrl(rule, urls[0], 'data:font/woff2;base64,AAAA');

        assert.deepEqual(urls, ['https://cdn.example.com/test.woff2']);
        assert.ok(replaced.includes('url("data:font/woff2;base64,AAAA")'));
    });

    it('extracts only supported remote font sources in declaration order', () => {
        const rule = `@font-face { src:
            url("test.eot") format("embedded-opentype"),
            url("https://cdn.example.com/test.woff") format("woff"),
            url("https://cdn.example.com/test.ttf") format("truetype"),
            url("https://cdn.example.com/test.otf") format("opentype"),
            url("https://cdn.example.com/test.svg") format("svg"); }`;
        assert.deepEqual(extractRemoteFontUrls(rule), [
            'https://cdn.example.com/test.woff',
            'https://cdn.example.com/test.ttf',
            'https://cdn.example.com/test.otf',
        ]);
    });
});
