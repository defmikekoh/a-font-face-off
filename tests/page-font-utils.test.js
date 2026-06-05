const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    cleanFontFamilyName,
    extractMatchingFontFaceRules,
    extractRemoteFontUrls,
    normalizeFontFamilyName,
    rankStylesheetUrls,
    replaceFontFaceUrl,
    selectBestFontFaceRule,
} = require('../src/page-font-utils.js');

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

    it('selects the rule matching detected style and weight', () => {
        const rules = [
            '@font-face { font-family: Test; src: url(regular.woff2); font-weight: 400; }',
            '@font-face { font-family: Test; src: url(variable.woff2); font-weight: 600 900; }',
            '@font-face { font-family: Test; src: url(italic.woff2); font-weight: 400; font-style: italic; }',
        ];

        assert.match(selectBestFontFaceRule(rules, 700, 'normal'), /variable\.woff2/);
        assert.match(selectBestFontFaceRule(rules, 400, 'italic'), /italic\.woff2/);
    });

    it('extracts and replaces a remote font URL', () => {
        const rule = '@font-face { src: local("Test"), url("https://cdn.example.com/test.woff2") format("woff2"); }';
        const urls = extractRemoteFontUrls(rule);
        const replaced = replaceFontFaceUrl(rule, urls[0], 'data:font/woff2;base64,AAAA');

        assert.deepEqual(urls, ['https://cdn.example.com/test.woff2']);
        assert.ok(replaced.includes('url("data:font/woff2;base64,AAAA")'));
    });
});
