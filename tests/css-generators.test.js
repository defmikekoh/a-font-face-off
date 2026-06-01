const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const configUtils = require('../src/config-utils.js');

Object.assign(global, configUtils);

const {
    generateBodyCSS,
    generateBodyContactCSS,
    generateThirdManInCSS,
} = require('../src/css-generators.js');

describe('css-generators ignore comments selectors', () => {
    const payload = {
        fontName: 'Spectral',
        variableAxes: {},
    };

    it('does not exclude comments unless requested for body mode', () => {
        const css = generateBodyContactCSS(payload, false, false);
        assert.doesNotMatch(css, /\.comments-page/);
    });

    it('excludes comments-page when requested for body mode', () => {
        const css = generateBodyContactCSS(payload, false, true);
        assert.match(css, /:not\(\.comments-page\)/);
        assert.match(css, /:not\(\.comments-page \*\)/);
    });

    it('applies the same comment exclusions in face-off body css when requested', () => {
        const css = generateBodyCSS(payload, false, true);
        assert.match(css, /:not\(\.comments-page\)/);
        assert.match(css, /:not\(\.comments-page \*\)/);
    });

    it('excludes post headers from body-mode selectors', () => {
        const css = generateBodyContactCSS(payload, false, false);
        assert.match(css, /:not\(\.post-header\)/);
        assert.match(css, /:not\(\.post-header \*\)/);
    });

    it('excludes post headers from face-off body css', () => {
        const css = generateBodyCSS(payload, false, false);
        assert.match(css, /:not\(\.post-header\)/);
        assert.match(css, /:not\(\.post-header \*\)/);
    });

    it('excludes generic article deck selectors from body-contact css', () => {
        const css = generateBodyContactCSS(payload, false, false);
        assert.match(css, /:not\(article header :is\(p, div\):is\(/);
        assert.match(css, /\[id\*="summary" i\]/);
        assert.match(css, /\[class\*="standfirst" i\]/);
        assert.match(css, /\[data-testid\*="subheadline" i\]/);
        assert.match(css, /:not\(article header :is\(p, div\):is\([^)]*\) \*\)/);
    });

    it('excludes generic article deck selectors from face-off body css', () => {
        const css = generateBodyCSS(payload, false, false);
        assert.match(css, /:not\(article header :is\(p, div\):is\(/);
        assert.match(css, /\[name\*="excerpt" i\]/);
        assert.match(css, /\[itemprop\*="deck" i\]/);
    });

    it('does not exclude all article-header paragraphs wholesale', () => {
        const css = generateBodyContactCSS(payload, false, false);
        assert.doesNotMatch(css, /:not\(article header p\):not\(article header p \*\)/);
        assert.doesNotMatch(css, /:not\(article header div\):not\(article header div \*\)/);
    });
});

describe('css-generators bold variable-axis overrides', () => {
    const payload = {
        fontName: 'Roboto Slab',
        variableAxes: {
            wght: 385,
            CASL: 1,
        },
    };

    it('does not carry wght into body bold overrides', () => {
        const css = generateBodyCSS(payload, false, false);
        const boldRule = css.split('\n').find(line => line.startsWith('body strong'));
        assert.ok(boldRule);
        assert.match(css, /font-weight: 700/);
        assert.match(boldRule, /"wght" 700[^}]*"CASL" 1/);
        assert.doesNotMatch(boldRule, /"wght" 385/);
    });

    it('does not carry wght into body-contact bold overrides', () => {
        const css = generateBodyContactCSS(payload, false, false);
        const boldRule = css.split('\n').find(line => line.startsWith('body strong'));
        assert.ok(boldRule);
        assert.match(css, /font-weight: 700/);
        assert.match(boldRule, /"wght" 700[^}]*"CASL" 1/);
        assert.doesNotMatch(boldRule, /"wght" 385/);
    });

    it('does not carry wght into third-man-in bold overrides', () => {
        const css = generateThirdManInCSS('serif', payload, false);
        const boldRule = css.split('\n').find(line => line.startsWith('[data-affo-font-type="serif"][data-affo-was-bold="true"]'));
        assert.match(css, /font-weight: 700/);
        assert.match(boldRule, /"wght" 700/);
        assert.match(boldRule, /"CASL" 1/);
        assert.ok(boldRule);
        assert.doesNotMatch(boldRule, /"wght" 385/);
    });

    it('keeps walker-marked bold descendants out of the non-bold TMI rule', () => {
        const css = generateThirdManInCSS('serif', payload, false);
        const nonBoldRule = css.split('\n').find(line => line.startsWith('[data-affo-font-type="serif"]:not([data-affo-was-bold="true"])'));
        const boldRule = css.split('\n').find(line => line.startsWith('[data-affo-font-type="serif"][data-affo-was-bold="true"]'));
        assert.ok(nonBoldRule);
        assert.ok(boldRule);
        assert.match(nonBoldRule, /:not\(\[data-affo-was-bold="true"\]\)/);
        assert.match(boldRule, /\[data-affo-font-type="serif"\]\[data-affo-was-bold="true"\]/);
    });

    it('does not treat unmarked third-man-in strong descendants as bold', () => {
        const css = generateThirdManInCSS('sans', {
            fontName: 'Merriweather',
            fontSize: 15.5,
            variableAxes: {}
        }, false);
        const nonBoldRule = css.split('\n').find(line => line.startsWith('[data-affo-font-type="sans"]:not([data-affo-was-bold="true"])'));
        const boldRule = css.split('\n').find(line => line.includes('font-weight: 700'));

        assert.ok(nonBoldRule);
        assert.ok(boldRule);
        assert.doesNotMatch(boldRule, /strong\[data-affo-font-type="sans"\]/);
        assert.doesNotMatch(boldRule, /\[data-affo-font-type="sans"\] strong/);
        assert.match(boldRule, /^\[data-affo-font-type="sans"\]\[data-affo-was-bold="true"\]/);
    });

    it('resets headings inside third-man-in marked containers', () => {
        const css = generateThirdManInCSS('serif', payload, false);
        const headingRule = css.split('\n').find(line => line.includes('[data-affo-font-type="serif"] :is(h1, h2, h3, h4, h5, h6)'));
        assert.ok(headingRule);
        assert.match(headingRule, /font-family: revert/);
        assert.match(headingRule, /font-weight: revert/);
        assert.match(headingRule, /font-variation-settings: normal/);
    });
});

describe('css-generators static italic style', () => {
    it('emits font-style without adding ital to font-variation-settings', () => {
        const css = generateBodyCSS({
            fontName: 'IBM Plex Serif',
            fontStyle: 'italic',
            variableAxes: {},
        }, false, false);
        assert.match(css, /font-style:italic/);
        assert.doesNotMatch(css, /"ital" 1/);
    });

    it('keeps slnt as a variable axis setting', () => {
        const css = generateThirdManInCSS('serif', {
            fontName: 'Roboto Flex',
            variableAxes: { slnt: -10 },
        }, false);
        assert.match(css, /font-style: oblique -10deg/);
        assert.match(css, /font-variation-settings: "slnt" -10/);
    });
});

describe('css-generators third-man-in text sizing', () => {
    it('applies body text sizing to marked links/italics and nested links/italics inside marked text containers, excluding footnote anchors', () => {
        const css = generateThirdManInCSS('serif', {
            fontName: 'Spectral',
            fontSize: 19,
            lineHeight: 1.7,
            letterSpacing: 0.02,
            variableAxes: {}
        }, false);
        const textRule = css.split('\n').find(line => line.includes('font-size: 19px'));
        assert.ok(textRule);
        assert.match(textRule, /html body div\[data-affo-font-type="serif"\]/);
        assert.match(textRule, /html body blockquote\[data-affo-font-type="serif"\]/);
        assert.match(textRule, /html body a\[data-affo-font-type="serif"\]:not\(\.footnote-anchor\)/);
        assert.match(textRule, /html body em\[data-affo-font-type="serif"\]/);
        assert.match(textRule, /html body i\[data-affo-font-type="serif"\]/);
        assert.match(textRule, /html body p\[data-affo-font-type="serif"\] a:not\(\.footnote-anchor\)/);
        assert.match(textRule, /html body div\[data-affo-font-type="serif"\] a:not\(\.footnote-anchor\)/);
        assert.match(textRule, /html body blockquote\[data-affo-font-type="serif"\] a:not\(\.footnote-anchor\)/);
        assert.match(textRule, /html body p\[data-affo-font-type="serif"\] :where\(em, i\)/);
        assert.match(textRule, /html body div\[data-affo-font-type="serif"\] :where\(em, i\)/);
        assert.match(textRule, /html body blockquote\[data-affo-font-type="serif"\] :where\(em, i\)/);
        assert.match(textRule, /font-size: 19px/);
        assert.match(textRule, /line-height: 1\.7/);
        assert.match(textRule, /letter-spacing: 0\.02em/);
    });

    it('does not emit cascading font-size rules for percent scaling', () => {
        const css = generateThirdManInCSS('serif', {
            fontName: 'Spectral',
            fontSizeScale: 112,
            lineHeight: 1.7,
            variableAxes: {}
        }, false);
        assert.doesNotMatch(css, /font-size:/);
        assert.match(css, /line-height: 1\.7/);
    });
});

describe('css-generators third-man-in heading preservation', () => {
    it('keeps marked heading descendants out of TMI replacement rules', () => {
        const css = generateThirdManInCSS('sans', {
            fontName: 'Inter',
            fontSize: 20,
            fontWeight: 420,
            variableAxes: { wght: 420 }
        }, false);
        const nonBoldRule = css.split('\n').find(line => line.startsWith('[data-affo-font-type="sans"]:not([data-affo-was-bold="true"])'));
        const boldRule = css.split('\n').find(line => line.startsWith('[data-affo-font-type="sans"][data-affo-was-bold="true"]'));
        const textRule = css.split('\n').find(line => line.includes('font-size: 20px'));

        assert.ok(nonBoldRule);
        assert.ok(boldRule);
        assert.ok(textRule);
        assert.match(nonBoldRule, /:not\(:is\(h1, h2, h3, h4, h5, h6\)\)/);
        assert.match(nonBoldRule, /:not\(:is\(h1, h2, h3, h4, h5, h6\) \*\)/);
        assert.match(boldRule, /\[data-affo-font-type="sans"\]\[data-affo-was-bold="true"\]:not\(:is\(h1, h2, h3, h4, h5, h6\)\):not\(:is\(h1, h2, h3, h4, h5, h6\) \*\)/);
        assert.match(textRule, /html body p\[data-affo-font-type="sans"\]:not\(:is\(h1, h2, h3, h4, h5, h6\)\):not\(:is\(h1, h2, h3, h4, h5, h6\) \*\)/);
    });

    it('resets both marked headings and marked descendants inside headings', () => {
        const css = generateThirdManInCSS('serif', {
            fontName: 'Spectral',
            variableAxes: {}
        }, false);
        const resetRule = css.split('\n').find(line => line.includes('font-family: revert'));

        assert.ok(resetRule);
        assert.match(resetRule, /:is\(h1, h2, h3, h4, h5, h6\)\[data-affo-font-type="serif"\]/);
        assert.match(resetRule, /:is\(h1, h2, h3, h4, h5, h6\) \[data-affo-font-type="serif"\]/);
        assert.match(resetRule, /\[data-affo-font-type="serif"\] :is\(h1, h2, h3, h4, h5, h6\) \*/);
    });
});

describe('css-generators drop cap preservation', () => {
    const payload = {
        fontName: 'Spectral',
        fontSize: 19,
        lineHeight: 1.65,
        fontWeight: 420,
        variableAxes: {}
    };

    function assertDropCapExclusion(css) {
        assert.match(css, /:not\(:is\(\[style\*="var\(--drop-cap" i\][^)]*\)\)/);
        assert.match(css, /:not\(:is\(\[style\*="var\(--drop-cap" i\][^)]*\) \*\)/);
        assert.match(css, /\[style\*="initial-letter" i\]/);
        assert.match(css, /\[class\*="dropcap" i\]/);
        assert.match(css, /\[data-drop-cap\]/);
    }

    it('keeps drop-cap elements out of body-contact replacement selectors', () => {
        assertDropCapExclusion(generateBodyContactCSS(payload, false, false));
    });

    it('keeps drop-cap elements out of body-mode replacement selectors', () => {
        assertDropCapExclusion(generateBodyCSS(payload, false, false));
    });

    it('keeps drop-cap elements out of third-man-in replacement selectors', () => {
        assertDropCapExclusion(generateThirdManInCSS('serif', payload, false));
    });
});

describe('css-generators percent font-size scaling', () => {
    it('leaves body contact font-size scaling to content-side computed px application', () => {
        const css = generateBodyContactCSS({
            fontSizeScale: 112,
            variableAxes: {}
        }, false, false);
        assert.equal(css, '');
    });
});
