/* css-generators.js — CSS generation functions for all three modes.
 *
 * Depends on: config-utils.js (REGISTERED_AXES, getEffective*, buildCustomAxisSettings)
 *
 * In the browser this file is loaded as a plain <script> before popup.js.
 * In Node (test runner) we export via module.exports so tests can require().
 */

// ── Utility ──────────────────────────────────────────────────────────────────

function formatAxisValue(axis, value) {
    switch(axis) {
        case 'wdth':
            return value + '%';
        case 'opsz':
            return value + 'pt';
        case 'slnt':
            return value + '°';
        default:
            return value;
    }
}

function getSiteSpecificRules(fontType, otherProps, hostname) {
    if (hostname && hostname.includes('wikipedia.org')) {
        return `html.mf-font-size-clientpref-small body.skin-minerva .content p[data-affo-font-type="${fontType}"], html.mf-font-size-clientpref-small body.skin-minerva .content span[data-affo-font-type="${fontType}"], html.mf-font-size-clientpref-small body.skin-minerva .content li[data-affo-font-type="${fontType}"] { ${otherProps.join('; ')}; }`;
    }
    return null;
}

// ── Face-off mode CSS (generateBodyCSS) ──────────────────────────────────────

function generateBodyCSS(payload, aggressive) {
    if (!payload) return '';

    const imp = aggressive ? ' !important' : '';
    const hasAnyProperties = payload.fontName || payload.fontSize || payload.lineHeight || payload.fontWeight || payload.fontColor || (payload.variableAxes && Object.keys(payload.variableAxes).length > 0);
    if (!hasAnyProperties) return '';

    // Body Contact CSS selector (broad selector targeting all body text, including bold elements for font-family)
    const sel = 'body, ' +
                'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not([role="navigation"]):not([role="banner"]):not([role="contentinfo"]):not([role="complementary"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^="language-"]):not([class*=" language-"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc):not([class*="byline"]):not([class*="author"]):not([class*="widget"]):not([class*="whatfont"]):not([id*="whatfont"])';
    // Weight-specific selector excludes bold elements so their weight can be overridden separately
    const weightSel = 'body, ' +
                'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not(strong):not(b):not([role="navigation"]):not([role="banner"]):not([role="contentinfo"]):not([role="complementary"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^="language-"]):not([class*=" language-"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc):not([class*="byline"]):not([class*="author"]):not([class*="widget"]):not([class*="whatfont"]):not([id*="whatfont"])';

    const decl = [];

    if (payload.fontName) {
        decl.push(`font-family:"${payload.fontName}"${imp}`);
    }

    if (payload.fontSize !== null && payload.fontSize !== undefined) {
        decl.push(`font-size:${payload.fontSize}px${imp}`);
    }
    if (payload.lineHeight !== null && payload.lineHeight !== undefined) {
        decl.push(`line-height:${payload.lineHeight}${imp}`);
    }
    if (payload.fontColor) {
        decl.push(`color:${payload.fontColor}${imp}`);
    }
    // Registered axes → high-level CSS properties
    const effectiveWdth = getEffectiveWidth(payload);
    if (effectiveWdth !== null) {
        decl.push(`font-stretch:${effectiveWdth}%${imp}`);
    }
    const effectiveItal = getEffectiveItalic(payload);
    const effectiveSlnt = getEffectiveSlant(payload);
    if (effectiveItal !== null && effectiveItal >= 1) {
        decl.push(`font-style:italic${imp}`);
    } else if (effectiveSlnt !== null && effectiveSlnt !== 0) {
        decl.push(`font-style:oblique ${effectiveSlnt}deg${imp}`);
    }
    // Custom axes only in font-variation-settings
    const customAxes = buildCustomAxisSettings(payload);
    if (customAxes.length > 0) {
        decl.push(`font-variation-settings:${customAxes.join(', ')}${imp}`);
    }

    let css = `${sel}{${decl.join('; ')};}`;

    const effectiveWt = getEffectiveWeight(payload);
    if (effectiveWt !== null) {
        let weightRule = `font-weight:${effectiveWt}${imp}`;
        if (customAxes.length > 0) {
            weightRule += `; font-variation-settings:${customAxes.join(', ')}${imp}`;
        }
        css += '\n' + weightSel + `{${weightRule};}`;
    }

    // Bold override — font-weight only; stretch/style inherit from parent
    if (effectiveWt !== null) {
        let boldRule = `font-weight: 700${imp}`;
        if (customAxes.length > 0) {
            boldRule += `; font-variation-settings: ${customAxes.join(', ')}${imp}`;
        }
        css += `\nbody strong, body b, html body strong, html body b { ${boldRule}; }`;
    }

    return css;
}

// ── Body Contact mode CSS ────────────────────────────────────────────────────

function generateBodyContactCSS(payload, aggressive) {
    if (!payload) return '';

    const imp = aggressive ? ' !important' : '';
    const lines = [];

    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);
    }

    const selector = `body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo):not([class*="byline"]):not([class*="subtitle"]):not([role="dialog"]):not([role="dialog"] *):not(button):not(button *)`;
    const weightSelector = `body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(strong):not(b):not(.no-affo):not([class*="byline"]):not([class*="subtitle"]):not([role="dialog"]):not([role="dialog"] *):not(button):not(button *)`;
    let styleRule = `${selector} {`;

    if (payload.fontName) {
        styleRule += ` font-family: "${payload.fontName}"${imp};`;
    }

    if (payload.fontSize && isFinite(payload.fontSize)) {
        styleRule += ` font-size: ${payload.fontSize}px${imp};`;
    }
    if (payload.lineHeight && isFinite(payload.lineHeight)) {
        styleRule += ` line-height: ${payload.lineHeight}${imp};`;
    }
    if (payload.fontColor) {
        styleRule += ` color: ${payload.fontColor}${imp};`;
    }

    const effectiveWdth = getEffectiveWidth(payload);
    if (effectiveWdth !== null) {
        styleRule += ` font-stretch: ${effectiveWdth}%${imp};`;
    }
    const effectiveItal = getEffectiveItalic(payload);
    const effectiveSlnt = getEffectiveSlant(payload);
    if (effectiveItal !== null && effectiveItal >= 1) {
        styleRule += ` font-style: italic${imp};`;
    } else if (effectiveSlnt !== null && effectiveSlnt !== 0) {
        styleRule += ` font-style: oblique ${effectiveSlnt}deg${imp};`;
    }
    const customAxes = buildCustomAxisSettings(payload);
    if (customAxes.length > 0) {
        styleRule += ` font-variation-settings: ${customAxes.join(', ')}${imp};`;
    }

    styleRule += ' }';
    lines.push(styleRule);

    const effectiveWeight = getEffectiveWeight(payload);
    if (effectiveWeight) {
        let weightProps = `font-weight: ${effectiveWeight}${imp}`;
        if (customAxes.length > 0) {
            weightProps += `; font-variation-settings: ${customAxes.join(', ')}${imp}`;
        }
        lines.push(`${weightSelector} { ${weightProps}; }`);
        let boldProps = `font-weight: 700${imp}`;
        if (customAxes.length > 0) {
            boldProps += `; font-variation-settings: ${customAxes.join(', ')}${imp}`;
        }
        lines.push(`body strong, body b { ${boldProps}; }`);
    }

    return lines.join('\n');
}

// ── Third Man In mode CSS ────────────────────────────────────────────────────

function generateThirdManInCSS(fontType, payload, aggressive) {
    if (!payload) return '';

    const imp = aggressive ? ' !important' : '';
    const lines = [];

    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);
    }

    const ft = fontType;

    const customAxes = buildCustomAxisSettings(payload);
    const effectiveWeight = getEffectiveWeight(payload);

    // Comprehensive rule for non-bold marked elements
    const nonBoldProps = [];
    if (payload.fontName) nonBoldProps.push(`font-family: "${payload.fontName}"${imp}`);
    if (effectiveWeight) {
        nonBoldProps.push(`font-weight: ${effectiveWeight}${imp}`);
    }
    const effectiveWdth = getEffectiveWidth(payload);
    if (effectiveWdth !== null) {
        nonBoldProps.push(`font-stretch: ${effectiveWdth}%${imp}`);
    }
    const effectiveItal = getEffectiveItalic(payload);
    const effectiveSlnt = getEffectiveSlant(payload);
    if (effectiveItal !== null && effectiveItal >= 1) {
        nonBoldProps.push(`font-style: italic${imp}`);
    } else if (effectiveSlnt !== null && effectiveSlnt !== 0) {
        nonBoldProps.push(`font-style: oblique ${effectiveSlnt}deg${imp}`);
    }
    if (customAxes.length > 0) {
        nonBoldProps.push(`font-variation-settings: ${customAxes.join(', ')}${imp}`);
    }
    if (nonBoldProps.length > 0) {
        lines.push(`[data-affo-font-type="${ft}"]:not(strong):not(b) { ${nonBoldProps.join('; ')}; }`);
    }

    // Bold rule
    if (payload.fontName || effectiveWeight) {
        const boldProps = [];
        if (payload.fontName) boldProps.push(`font-family: "${payload.fontName}"${imp}`);
        boldProps.push(`font-weight: 700${imp}`);
        if (customAxes.length > 0) {
            boldProps.push(`font-variation-settings: ${customAxes.join(', ')}${imp}`);
        }
        lines.push(`strong[data-affo-font-type="${ft}"], b[data-affo-font-type="${ft}"], [data-affo-font-type="${ft}"] strong, [data-affo-font-type="${ft}"] b { ${boldProps.join('; ')}; }`);
    }

    // Other properties apply only to body text elements
    const otherProps = [];
    if (payload.fontSize && isFinite(payload.fontSize)) {
        otherProps.push(`font-size: ${payload.fontSize}px${imp}`);
    }
    if (payload.lineHeight && isFinite(payload.lineHeight)) {
        otherProps.push(`line-height: ${payload.lineHeight}${imp}`);
    }

    if (otherProps.length > 0) {
        lines.push(`html body p[data-affo-font-type="${ft}"], html body span[data-affo-font-type="${ft}"], html body td[data-affo-font-type="${ft}"], html body th[data-affo-font-type="${ft}"], html body li[data-affo-font-type="${ft}"] { ${otherProps.join('; ')}; }`);

        const hostname = (typeof window !== 'undefined' && window.currentTabHostname) || null;
        const siteSpecificRules = getSiteSpecificRules(fontType, otherProps, hostname);
        if (siteSpecificRules) {
            lines.push(siteSpecificRules);
        }
    }

    const css = lines.join('\n');
    console.log(`🎯 Generated CSS for ${fontType}:`, css);
    return css;
}

// Element walker for Third Man In is now handled entirely by content.js
// (popup.js sends a 'runElementWalker' message instead of injecting a script)

// ── Node export (no-op in browser) ───────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatAxisValue,
        getSiteSpecificRules,
        generateBodyCSS,
        generateBodyContactCSS,
        generateThirdManInCSS,
    };
}
