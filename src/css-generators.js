/* css-generators.js — CSS generation functions for all three modes.
 *
 * Depends on: config-utils.js (REGISTERED_AXES, getEffective*, buildAllAxisSettings)
 *
 * In the browser this file is loaded as a plain <script> before popup.js.
 * In Node (test runner) we export via module.exports so tests can require().
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const GUARD_EXCLUDE = ':not([data-affo-guard]):not([data-affo-guard] *)';
const POST_HEADER_EXCLUDE = ':not(.post-header):not(.post-header *)';

function getIgnoreCommentsExclude(ignoreComments) {
    if (!ignoreComments) return '';
    return ':not(.comments-page):not(.comments-page *)';
}

// ── Utility ──────────────────────────────────────────────────────────────────

function formatAxisValue(axis, value) {
    switch (axis) {
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

function buildItalicProps(payload, imp, weightOverride) {
    const props = [`font-style: italic${imp}`];
    if (weightOverride) props.push(`font-weight: ${weightOverride}${imp}`);

    if (payload.variableAxes && Object.keys(payload.variableAxes).length > 0) {
        const axes = { ...payload.variableAxes };
        // Force true italic via ital axis
        if (axes.ital !== undefined) axes.ital = 1;
        // Force slant if available and at default
        if (axes.slnt !== undefined && Number(axes.slnt) === 0) axes.slnt = -10;
        // Override weight for bold-italic
        if (weightOverride && axes.wght !== undefined) axes.wght = weightOverride;

        const settings = Object.entries(axes)
            .filter(([, v]) => isFinite(Number(v)))
            .map(([axis, value]) => `"${axis}" ${value}`)
            .join(', ');
        if (settings) props.push(`font-variation-settings: ${settings}${imp}`);
    }
    return props;
}

function buildBoldAxisSettings(payload, weightOverride) {
    const axes = {};
    if (payload.variableAxes) {
        Object.entries(payload.variableAxes).forEach(([axis, value]) => {
            if (isFinite(Number(value))) {
                axes[axis] = Number(value);
            }
        });
    }
    axes.wght = Number(weightOverride);
    return Object.entries(axes).map(([axis, value]) => `"${axis}" ${value}`);
}

function getSiteSpecificRules(fontType, otherProps, hostname) {
    if (hostname && hostname.includes('wikipedia.org')) {
        return `html.mf-font-size-clientpref-small body.skin-minerva .content p[data-affo-font-type="${fontType}"], html.mf-font-size-clientpref-small body.skin-minerva .content span[data-affo-font-type="${fontType}"], html.mf-font-size-clientpref-small body.skin-minerva .content li[data-affo-font-type="${fontType}"] { ${otherProps.join('; ')}; }`;
    }
    return null;
}

function buildThirdManInTextSelector(fontType) {
    return [
        `html body p[data-affo-font-type="${fontType}"]`,
        `html body span[data-affo-font-type="${fontType}"]`,
        `html body a[data-affo-font-type="${fontType}"]`,
        `html body em[data-affo-font-type="${fontType}"]`,
        `html body i[data-affo-font-type="${fontType}"]`,
        `html body td[data-affo-font-type="${fontType}"]`,
        `html body th[data-affo-font-type="${fontType}"]`,
        `html body li[data-affo-font-type="${fontType}"]`,
        `html body p[data-affo-font-type="${fontType}"] a`,
        `html body span[data-affo-font-type="${fontType}"] a`,
        `html body td[data-affo-font-type="${fontType}"] a`,
        `html body th[data-affo-font-type="${fontType}"] a`,
        `html body li[data-affo-font-type="${fontType}"] a`,
        `html body p[data-affo-font-type="${fontType}"] :where(em, i)`,
        `html body span[data-affo-font-type="${fontType}"] :where(em, i)`,
        `html body a[data-affo-font-type="${fontType}"] :where(em, i)`,
        `html body td[data-affo-font-type="${fontType}"] :where(em, i)`,
        `html body th[data-affo-font-type="${fontType}"] :where(em, i)`,
        `html body li[data-affo-font-type="${fontType}"] :where(em, i)`
    ].join(', ');
}

// ── Face-off mode CSS (generateBodyCSS) ──────────────────────────────────────

function generateBodyCSS(payload, aggressive, ignoreComments) {
    if (!payload) return '';

    const imp = aggressive ? ' !important' : '';
    const hasAnyProperties = payload.fontName || payload.fontSize || payload.lineHeight || payload.letterSpacing != null || payload.fontWeight || payload.fontColor || (payload.variableAxes && Object.keys(payload.variableAxes).length > 0);
    if (!hasAnyProperties) return '';

    // Body Contact CSS selector (broad selector targeting all body text, including bold elements for font-family)
    const commentExclude = getIgnoreCommentsExclude(ignoreComments);
    const sel = 'body, ' +
        'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not([role="navigation"]):not([role="banner"]):not([role="contentinfo"]):not([role="complementary"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^="language-"]):not([class*=" language-"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc):not([class*="byline"]):not([class*="author"]):not([class*="widget"]):not([class*="whatfont"]):not([id*="whatfont"])' + POST_HEADER_EXCLUDE + commentExclude + GUARD_EXCLUDE;
    // Weight-specific selector excludes bold elements so their weight can be overridden separately
    const weightSel = 'body, ' +
        'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not(strong):not(b):not([role="navigation"]):not([role="banner"]):not([role="contentinfo"]):not([role="complementary"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^="language-"]):not([class*=" language-"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc):not([class*="byline"]):not([class*="author"]):not([class*="widget"]):not([class*="whatfont"]):not([id*="whatfont"])' + POST_HEADER_EXCLUDE + commentExclude + GUARD_EXCLUDE;

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
    if (payload.letterSpacing != null && isFinite(payload.letterSpacing)) {
        decl.push(`letter-spacing:${payload.letterSpacing}em${imp}`);
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
    // All axes in font-variation-settings (bypasses @font-face descriptor clamping)
    const allAxes = buildAllAxisSettings(payload);
    const boldAxes = buildBoldAxisSettings(payload, 700);
    if (allAxes.length > 0) {
        decl.push(`font-variation-settings:${allAxes.join(', ')}${imp}`);
    }

    let css = `${sel}{${decl.join('; ')};}`;

    const effectiveWt = getEffectiveWeight(payload);
    if (effectiveWt !== null) {
        let weightRule = `font-weight:${effectiveWt}${imp}`;
        if (allAxes.length > 0) {
            weightRule += `; font-variation-settings:${allAxes.join(', ')}${imp}`;
        }
        css += '\n' + weightSel + `{${weightRule};}`;
    }

    // Bold override — font-weight only; stretch/style inherit from parent
    if (effectiveWt !== null) {
        let boldRule = `font-weight: 700${imp}`;
        if (boldAxes.length > 0) {
            boldRule += `; font-variation-settings: ${boldAxes.join(', ')}${imp}`;
        }
        css += `\nbody strong, body b, html body strong, html body b { ${boldRule}; }`;
    }

    // Italic rule — ensure <em>/<i> render true italic with correct axis values
    if (payload.fontName) {
        const italicProps = buildItalicProps(payload, imp);
        css += `\nbody :where(em, i) { ${italicProps.join('; ')}; }`;
        // Bold-italic rule
        const boldItalicProps = buildItalicProps(payload, imp, 700);
        css += `\nbody :where(strong, b) :where(em, i) { ${boldItalicProps.join('; ')}; }`;
    }

    return css;
}

// ── Body Contact mode CSS ────────────────────────────────────────────────────

function generateBodyContactCSS(payload, aggressive, ignoreComments) {
    if (!payload) return '';

    const imp = aggressive ? ' !important' : '';
    const lines = [];

    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);
    }

    const commentExclude = getIgnoreCommentsExclude(ignoreComments);
    const selector = 'body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo):not([class*="byline"]):not([class*="subtitle"]):not([role="dialog"]):not([role="dialog"] *):not(button):not(button *)' + POST_HEADER_EXCLUDE + commentExclude + GUARD_EXCLUDE;
    const weightSelector = 'body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(strong):not(b):not(.no-affo):not([class*="byline"]):not([class*="subtitle"]):not([role="dialog"]):not([role="dialog"] *):not(button):not(button *)' + POST_HEADER_EXCLUDE + commentExclude + GUARD_EXCLUDE;
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
    if (payload.letterSpacing != null && isFinite(payload.letterSpacing)) {
        styleRule += ` letter-spacing: ${payload.letterSpacing}em${imp};`;
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
    const allAxes = buildAllAxisSettings(payload);
    const boldAxes = buildBoldAxisSettings(payload, 700);
    if (allAxes.length > 0) {
        styleRule += ` font-variation-settings: ${allAxes.join(', ')}${imp};`;
    }

    styleRule += ' }';
    lines.push(styleRule);

    const effectiveWeight = getEffectiveWeight(payload);
    if (effectiveWeight) {
        let weightProps = `font-weight: ${effectiveWeight}${imp}`;
        if (allAxes.length > 0) {
            weightProps += `; font-variation-settings: ${allAxes.join(', ')}${imp}`;
        }
        lines.push(`${weightSelector} { ${weightProps}; }`);
        let boldProps = `font-weight: 700${imp}`;
        if (boldAxes.length > 0) {
            boldProps += `; font-variation-settings: ${boldAxes.join(', ')}${imp}`;
        }
        lines.push(`body strong, body b { ${boldProps}; }`);
    }

    // Italic rule — ensure <em>/<i> render true italic with correct axis values
    if (payload.fontName) {
        const italicProps = buildItalicProps(payload, imp);
        lines.push(`body :where(em, i) { ${italicProps.join('; ')}; }`);
        // Bold-italic rule
        const boldItalicProps = buildItalicProps(payload, imp, 700);
        lines.push(`body :where(strong, b) :where(em, i) { ${boldItalicProps.join('; ')}; }`);
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

    const allAxes = buildAllAxisSettings(payload);
    const boldAxes = buildBoldAxisSettings(payload, 700);
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
    if (allAxes.length > 0) {
        nonBoldProps.push(`font-variation-settings: ${allAxes.join(', ')}${imp}`);
    }
    if (nonBoldProps.length > 0) {
        lines.push(`[data-affo-font-type="${ft}"]:not(strong):not(b) { ${nonBoldProps.join('; ')}; }`);
    }

    // Bold rule
    if (payload.fontName || effectiveWeight) {
        const boldProps = [];
        if (payload.fontName) boldProps.push(`font-family: "${payload.fontName}"${imp}`);
        boldProps.push(`font-weight: 700${imp}`);
        if (boldAxes.length > 0) {
            boldProps.push(`font-variation-settings: ${boldAxes.join(', ')}${imp}`);
        }
        lines.push(`strong[data-affo-font-type="${ft}"], b[data-affo-font-type="${ft}"], [data-affo-font-type="${ft}"] strong, [data-affo-font-type="${ft}"] b { ${boldProps.join('; ')}; }`);
    }

    lines.push(`[data-affo-font-type="${ft}"] h1, [data-affo-font-type="${ft}"] h2, [data-affo-font-type="${ft}"] h3, [data-affo-font-type="${ft}"] h4, [data-affo-font-type="${ft}"] h5, [data-affo-font-type="${ft}"] h6 { font-family: revert${imp}; font-weight: revert${imp}; font-stretch: revert${imp}; font-style: revert${imp}; font-variation-settings: normal${imp}; }`);

    // Italic rule — ensure <em>/<i> render true italic with correct axis values
    if (payload.fontName) {
        const italicProps = buildItalicProps(payload, imp);
        lines.push(`:where(em, i)[data-affo-font-type="${ft}"], [data-affo-font-type="${ft}"] :where(em, i) { ${italicProps.join('; ')}; }`);
        // Bold-italic rule
        const boldItalicProps = buildItalicProps(payload, imp, 700);
        lines.push(`[data-affo-font-type="${ft}"] :where(strong, b) :where(em, i) { ${boldItalicProps.join('; ')}; }`);
    }

    // Other properties apply only to body text elements
    const otherProps = [];
    if (payload.fontSize && isFinite(payload.fontSize)) {
        otherProps.push(`font-size: ${payload.fontSize}px${imp}`);
    }
    if (payload.lineHeight && isFinite(payload.lineHeight)) {
        otherProps.push(`line-height: ${payload.lineHeight}${imp}`);
    }
    if (payload.letterSpacing != null && isFinite(payload.letterSpacing)) {
        otherProps.push(`letter-spacing: ${payload.letterSpacing}em${imp}`);
    }

    if (otherProps.length > 0) {
        lines.push(`${buildThirdManInTextSelector(ft)} { ${otherProps.join('; ')}; }`);

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
        buildItalicProps,
        getSiteSpecificRules,
        generateBodyCSS,
        generateBodyContactCSS,
        generateThirdManInCSS,
    };
}
