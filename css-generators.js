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

function generateBodyCSS(payload) {
    if (!payload) return '';

    const hasAnyProperties = payload.fontName || payload.fontSize || payload.lineHeight || payload.fontWeight || payload.fontColor || (payload.variableAxes && Object.keys(payload.variableAxes).length > 0);
    if (!hasAnyProperties) return '';

    // Body Contact CSS selector (broad selector targeting all body text, including bold elements for font-family)
    const sel = 'body, ' +
                'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not([role="navigation"]):not([role="banner"]):not([role="contentinfo"]):not([role="complementary"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^="language-"]):not([class*=" language-"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc)';
    // Weight-specific selector excludes bold elements so their weight can be overridden separately
    const weightSel = 'body, ' +
                'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not(strong):not(b):not([role="navigation"]):not([role="banner"]):not([role="contentinfo"]):not([role="complementary"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^="language-"]):not([class*=" language-"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc)';

    const decl = [];

    if (payload.fontName) {
        decl.push(`font-family:"${payload.fontName}" !important`);
    }

    if (payload.fontSize !== null && payload.fontSize !== undefined) {
        decl.push(`font-size:${payload.fontSize}px !important`);
    }
    if (payload.lineHeight !== null && payload.lineHeight !== undefined) {
        decl.push(`line-height:${payload.lineHeight} !important`);
    }
    if (payload.fontColor) {
        decl.push(`color:${payload.fontColor} !important`);
    }
    // Registered axes → high-level CSS properties
    const effectiveWdth = getEffectiveWidth(payload);
    if (effectiveWdth !== null) {
        decl.push(`font-stretch:${effectiveWdth}% !important`);
    }
    const effectiveItal = getEffectiveItalic(payload);
    const effectiveSlnt = getEffectiveSlant(payload);
    if (effectiveItal !== null && effectiveItal >= 1) {
        decl.push('font-style:italic !important');
    } else if (effectiveSlnt !== null && effectiveSlnt !== 0) {
        decl.push(`font-style:oblique ${effectiveSlnt}deg !important`);
    }
    // Custom axes only in font-variation-settings
    const customAxes = buildCustomAxisSettings(payload);
    if (customAxes.length > 0) {
        decl.push(`font-variation-settings:${customAxes.join(', ')} !important`);
    }

    let css = `${sel}{${decl.join('; ')};}`;

    const effectiveWt = getEffectiveWeight(payload);
    if (effectiveWt !== null) {
        let weightRule = `font-weight:${effectiveWt} !important`;
        if (customAxes.length > 0) {
            weightRule += `; font-variation-settings:${customAxes.join(', ')} !important`;
        }
        css += '\n' + weightSel + `{${weightRule};}`;
    }

    // Bold override — font-weight only; stretch/style inherit from parent
    if (effectiveWt !== null) {
        let boldRule = 'font-weight: 700 !important';
        if (customAxes.length > 0) {
            boldRule += `; font-variation-settings: ${customAxes.join(', ')} !important`;
        }
        css += `\nbody strong, body b, html body strong, html body b { ${boldRule}; }`;
    }

    return css;
}

// ── Body Contact mode CSS ────────────────────────────────────────────────────

function generateBodyContactCSS(payload) {
    if (!payload) return '';

    const lines = [];

    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);
    }

    const selector = `body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo)`;
    const weightSelector = `body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(strong):not(b):not(.no-affo)`;
    let styleRule = `${selector} {`;

    if (payload.fontName) {
        styleRule += ` font-family: "${payload.fontName}" !important;`;
    }

    if (payload.fontSize && isFinite(payload.fontSize)) {
        styleRule += ` font-size: ${payload.fontSize}px !important;`;
    }
    if (payload.lineHeight && isFinite(payload.lineHeight)) {
        styleRule += ` line-height: ${payload.lineHeight} !important;`;
    }
    if (payload.fontColor) {
        styleRule += ` color: ${payload.fontColor} !important;`;
    }

    const effectiveWdth = getEffectiveWidth(payload);
    if (effectiveWdth !== null) {
        styleRule += ` font-stretch: ${effectiveWdth}% !important;`;
    }
    const effectiveItal = getEffectiveItalic(payload);
    const effectiveSlnt = getEffectiveSlant(payload);
    if (effectiveItal !== null && effectiveItal >= 1) {
        styleRule += ` font-style: italic !important;`;
    } else if (effectiveSlnt !== null && effectiveSlnt !== 0) {
        styleRule += ` font-style: oblique ${effectiveSlnt}deg !important;`;
    }
    const customAxes = buildCustomAxisSettings(payload);
    if (customAxes.length > 0) {
        styleRule += ` font-variation-settings: ${customAxes.join(', ')} !important;`;
    }

    styleRule += ' }';
    lines.push(styleRule);

    const effectiveWeight = getEffectiveWeight(payload);
    if (effectiveWeight) {
        let weightProps = `font-weight: ${effectiveWeight} !important`;
        if (customAxes.length > 0) {
            weightProps += `; font-variation-settings: ${customAxes.join(', ')} !important`;
        }
        lines.push(`${weightSelector} { ${weightProps}; }`);
        let boldProps = 'font-weight: 700 !important';
        if (customAxes.length > 0) {
            boldProps += `; font-variation-settings: ${customAxes.join(', ')} !important`;
        }
        lines.push(`body strong, body b { ${boldProps}; }`);
    }

    return lines.join('\n');
}

// ── Third Man In mode CSS ────────────────────────────────────────────────────

function generateThirdManInCSS(fontType, payload) {
    if (!payload) return '';

    const lines = [];

    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);
    }

    const ft = fontType;

    const customAxes = buildCustomAxisSettings(payload);
    const effectiveWeight = getEffectiveWeight(payload);

    // Comprehensive rule for non-bold marked elements
    const nonBoldProps = [];
    if (payload.fontName) nonBoldProps.push(`font-family: "${payload.fontName}" !important`);
    if (effectiveWeight) {
        nonBoldProps.push(`font-weight: ${effectiveWeight} !important`);
    }
    const effectiveWdth = getEffectiveWidth(payload);
    if (effectiveWdth !== null) {
        nonBoldProps.push(`font-stretch: ${effectiveWdth}% !important`);
    }
    const effectiveItal = getEffectiveItalic(payload);
    const effectiveSlnt = getEffectiveSlant(payload);
    if (effectiveItal !== null && effectiveItal >= 1) {
        nonBoldProps.push('font-style: italic !important');
    } else if (effectiveSlnt !== null && effectiveSlnt !== 0) {
        nonBoldProps.push(`font-style: oblique ${effectiveSlnt}deg !important`);
    }
    if (customAxes.length > 0) {
        nonBoldProps.push(`font-variation-settings: ${customAxes.join(', ')} !important`);
    }
    if (nonBoldProps.length > 0) {
        lines.push(`[data-affo-font-type="${ft}"]:not(strong):not(b) { ${nonBoldProps.join('; ')}; }`);
    }

    // Bold rule
    if (payload.fontName || effectiveWeight) {
        const boldProps = [];
        if (payload.fontName) boldProps.push(`font-family: "${payload.fontName}" !important`);
        boldProps.push('font-weight: 700 !important');
        if (customAxes.length > 0) {
            boldProps.push(`font-variation-settings: ${customAxes.join(', ')} !important`);
        }
        lines.push(`strong[data-affo-font-type="${ft}"], b[data-affo-font-type="${ft}"], [data-affo-font-type="${ft}"] strong, [data-affo-font-type="${ft}"] b { ${boldProps.join('; ')}; }`);
    }

    // Other properties apply only to body text elements
    const otherProps = [];
    if (payload.fontSize && isFinite(payload.fontSize)) {
        otherProps.push(`font-size: ${payload.fontSize}px !important`);
    }
    if (payload.lineHeight && isFinite(payload.lineHeight)) {
        otherProps.push(`line-height: ${payload.lineHeight} !important`);
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

// ── DOM walker script for Third Man In ───────────────────────────────────────

function generateElementWalkerScript(fontType) {
    return `
        (function() {
            try {
                console.log('Third Man In walker script starting for fontType: ${fontType}');

                // Clear only existing markers for this specific font type
                const existingMarked = document.querySelectorAll('[data-affo-font-type="${fontType}"]');
                console.log('Clearing ' + existingMarked.length + ' existing ${fontType} markers');
                existingMarked.forEach(el => {
                    el.removeAttribute('data-affo-font-type');
                });

                // Element type detection logic - only mark elements that clearly match the target type
                function getElementFontType(element) {
                    const tagName = element.tagName.toLowerCase();

                    const className = element.className || '';
                    const style = element.style.fontFamily || '';

                    // Exclude pure UI elements (but not headings)
                    if (['nav', 'header', 'footer', 'aside', 'figcaption'].indexOf(tagName) !== -1) return null;

                    // Exclude children of figcaption (captions contain multiple spans/elements)
                    if (element.closest && element.closest('figcaption')) return null;

                    // Exclude navigation and UI class names
                    if (className && /\\b(nav|menu|header|footer|sidebar|toolbar|breadcrumb|caption)\\b/i.test(className)) return null;

                    // Get computed font-family (what WhatFont sees)
                    const computedStyle = window.getComputedStyle(element);
                    const computedFontFamily = computedStyle.fontFamily || '';

                    // Check for complete words/phrases in class names and styles
                    // Convert className to string safely (it might be a DOMTokenList)
                    const classText = (typeof className === 'string' ? className : className.toString()).toLowerCase();
                    const styleText = style.toLowerCase();
                    const computedText = computedFontFamily.toLowerCase();

                    // Check for monospace keywords
                    if (/\\b(monospace|mono|code)\\b/.test(classText) ||
                        /\\b(monospace|mono)\\b/.test(styleText)) return 'mono';

                    // Check for sans-serif as complete phrase first
                    if (/\\bsans-serif\\b/.test(classText) || /\\bsans-serif\\b/.test(styleText)) return 'sans';

                    // Check for standalone sans (but not sans-serif)
                    if (/\\bsans\\b(?!-serif)/.test(classText) || /\\bsans\\b(?!-serif)/.test(styleText)) return 'sans';

                    // Check for sans-serif in computed font-family (what WhatFont sees)
                    if (/\\bsans-serif\\b/.test(computedText)) {
                        console.log('SANS FOUND (computed):', element.tagName, 'computedFont:', computedFontFamily);
                        return 'sans';
                    }

                    // Check for serif in computed font-family (what WhatFont sees)
                    if (/\\bserif\\b/.test(computedText.replace('sans-serif', ''))) {
                        console.log('SERIF FOUND (computed):', element.tagName, 'computedFont:', computedFontFamily);
                        return 'serif';
                    }

                    // Check for serif (but not sans-serif) in class names and inline styles
                    if (/\\bserif\\b/.test(classText.replace('sans-serif', '')) ||
                        /\\bserif\\b/.test(styleText.replace('sans-serif', ''))) {
                        console.log('SERIF FOUND (class/style):', element.tagName, 'className:', classText, 'style:', styleText);
                        return 'serif';
                    }

                    // Tag-based detection for monospace
                    if (['code', 'pre', 'kbd', 'samp', 'tt'].indexOf(tagName) !== -1) return 'mono';

                    // Third Man In mode only finds explicit markers - no assumptions

                    // No explicit indicators found - don't mark this element
                    return null;
                }

                // Debug: Find and analyze the "17 November" text before processing
                const allElements = Array.from(document.querySelectorAll('*'));
                const novemberElements = allElements.filter(el => el.textContent && el.textContent.includes('17 November'));
                console.log('🔍 PRE-SCAN: Found', novemberElements.length, 'elements containing "17 November"');
                novemberElements.forEach((el, i) => {
                    console.log('🔍 Element', i+1, ':', el.tagName, el.className, 'text:', el.textContent.substring(0, 100));
                });

                // Walk all text-containing elements
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_ELEMENT,
                    {
                        acceptNode: function(node) {
                            // Skip elements that are hidden or have no text content
                            if (node.offsetParent === null && node.tagName !== 'BODY') return NodeFilter.FILTER_SKIP;
                            if (!node.textContent.trim()) return NodeFilter.FILTER_SKIP;

                            // Skip already processed elements and guard elements
                            if (node.hasAttribute('data-affo-guard') ||
                                node.hasAttribute('data-affo-font-type')) return NodeFilter.FILTER_SKIP;

                            return NodeFilter.FILTER_ACCEPT;
                        }
                    }
                );

                let element;
                let totalElements = 0;
                let markedElements = 0;

                while (element = walker.nextNode()) {
                    totalElements++;
                    const detectedType = getElementFontType(element);
                    if (detectedType === '${fontType}') {
                        element.setAttribute('data-affo-font-type', '${fontType}');
                        markedElements++;
                        console.log('Marked ${fontType} element:', element.tagName, element.className, 'willGetSize:', ['P', 'SPAN', 'TD', 'TH', 'LI'].indexOf(element.tagName) !== -1, element.textContent.substring(0, 50));

                        // Debug specific "17 November" paragraph
                        if (element.textContent.includes('17 November')) {
                            console.log('🔍 FOUND "17 November" paragraph - marked as: ${fontType}');
                            console.log('🔍 Element:', element);
                            console.log('🔍 Computed style font-size:', window.getComputedStyle(element).fontSize);
                            console.log('🔍 Has attribute data-affo-font-type:', element.getAttribute('data-affo-font-type'));
                        }
                    }
                }

                console.log('Third Man In walker completed: processed ' + totalElements + ' elements, marked ' + markedElements + ' as ${fontType}');
            } catch (e) {
                console.error('A Font Face-off: Element walker failed for ${fontType}:', e);
            }
        })();
    `;
}

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
