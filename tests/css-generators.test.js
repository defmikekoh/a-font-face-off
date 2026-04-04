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
        assert.match(css, /body strong, body b, html body strong, html body b/);
        assert.match(css, /font-weight: 700/);
        assert.match(css, /body strong, body b, html body strong, html body b \{[^}]*"wght" 700[^}]*"CASL" 1/);
        assert.doesNotMatch(css, /body strong, body b, html body strong, html body b \{[^}]*"wght" 385/);
    });

    it('does not carry wght into body-contact bold overrides', () => {
        const css = generateBodyContactCSS(payload, false, false);
        assert.match(css, /body strong, body b/);
        assert.match(css, /font-weight: 700/);
        assert.match(css, /body strong, body b \{[^}]*"wght" 700[^}]*"CASL" 1/);
        assert.doesNotMatch(css, /body strong, body b \{[^}]*"wght" 385/);
    });

    it('does not carry wght into third-man-in bold overrides', () => {
        const css = generateThirdManInCSS('serif', payload, false);
        const boldRule = css.split('\n').find(line => line.startsWith('strong[data-affo-font-type="serif"]'));
        assert.match(css, /strong\[data-affo-font-type="serif"\]/);
        assert.match(css, /font-weight: 700/);
        assert.match(boldRule, /"wght" 700/);
        assert.match(boldRule, /"CASL" 1/);
        assert.ok(boldRule);
        assert.doesNotMatch(boldRule, /"wght" 385/);
    });

    it('resets headings inside third-man-in marked containers', () => {
        const css = generateThirdManInCSS('serif', payload, false);
        const headingRule = css.split('\n').find(line => line.startsWith('[data-affo-font-type="serif"] h1'));
        assert.ok(headingRule);
        assert.match(headingRule, /font-family: revert/);
        assert.match(headingRule, /font-weight: revert/);
        assert.match(headingRule, /font-variation-settings: normal/);
    });
});

describe('css-generators third-man-in text sizing', () => {
    it('applies body text sizing to marked links and links nested inside marked text containers', () => {
        const css = generateThirdManInCSS('serif', {
            fontName: 'Spectral',
            fontSize: 19,
            lineHeight: 1.7,
            letterSpacing: 0.02,
            variableAxes: {}
        }, false);
        const textRule = css.split('\n').find(line => line.startsWith('html body p[data-affo-font-type="serif"]'));
        assert.ok(textRule);
        assert.match(textRule, /html body a\[data-affo-font-type="serif"\]/);
        assert.match(textRule, /html body p\[data-affo-font-type="serif"\] a/);
        assert.match(textRule, /font-size: 19px/);
        assert.match(textRule, /line-height: 1\.7/);
        assert.match(textRule, /letter-spacing: 0\.02em/);
    });
});
