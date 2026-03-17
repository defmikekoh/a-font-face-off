// ==UserScript==
// @name        A Font Face-off TMI Mono
// @namespace   defmikekoh
// @description Changes monospace text fonts per domain with AFFO-style mono detection
// @version     1.0.0
// @match       *://*/*
// @run-at      document-start
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_registerMenuCommand
// @grant       GM_xmlhttpRequest
// @connect     raw.githubusercontent.com
// ==/UserScript==

(function () {
    'use strict';

    const hostname = location.hostname;
    const storageKey = 'font:' + hostname;

    // Keep these as script-level lists so per-domain storage stays just the font name.
    const INLINE_APPLY_DOMAINS = [
        'x.com',
        'twitter.com',
    ];
    const AGGRESSIVE_DOMAINS_EXCLUDE = [];

    const IOSEVKA_FIXED_SS05_BASE =
        'https://raw.githubusercontent.com/iosevka-webfonts/iosevka-fixed-ss05/3bf42861a5bcf6dc8156344f0ecee063b89b5cd5/woff2';

    const IOSKELEY_MONO_BASE =
        'https://raw.githubusercontent.com/defmikekoh/IoskeleyMono/main/woff2';
    const JULIA_MONO_BASE =
        'https://raw.githubusercontent.com/defmikekoh/juliamono/master/webfonts';

    const FONT_PRESETS = {
        'Iosevka Charon Mono': {
            source: 'google',
            fontFamily: 'Iosevka Charon Mono',
            css2Url: 'https://fonts.googleapis.com/css2?family=Iosevka+Charon+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap',
        },
        'Iosevka Fixed SS05': {
            source: 'sil',
            cacheKey: 'iosevka-fixed-ss05',
            baseUrl: IOSEVKA_FIXED_SS05_BASE,
            fontFamily: 'Iosevka Fixed SS05',
            variants: [
                { style: 'normal', weight: 400, file: 'iosevka-fixed-ss05-extended.woff2' },
                { style: 'italic', weight: 400, file: 'iosevka-fixed-ss05-extendeditalic.woff2' },
                { style: 'normal', weight: 700, file: 'iosevka-fixed-ss05-extendedbold.woff2' },
                { style: 'italic', weight: 700, file: 'iosevka-fixed-ss05-extendedbolditalic.woff2' },
            ],
        },
        'Ioskeley Mono': {
            source: 'sil',
            cacheKey: 'ioskeley-mono',
            baseUrl: IOSKELEY_MONO_BASE,
            fontFamily: 'Ioskeley Mono',
            variants: [
                { style: 'normal', weight: 400, file: 'IoskeleyMono-Regular.woff2' },
                { style: 'italic', weight: 400, file: 'IoskeleyMono-Italic.woff2' },
                { style: 'normal', weight: 700, file: 'IoskeleyMono-Bold.woff2' },
                { style: 'italic', weight: 700, file: 'IoskeleyMono-BoldItalic.woff2' },
            ],
        },
        'Julia Mono': {
            source: 'sil',
            cacheKey: 'julia-mono',
            baseUrl: JULIA_MONO_BASE,
            fontFamily: 'Julia Mono',
            variants: [
                { style: 'normal', weight: 400, file: 'JuliaMono-Regular.woff2' },
                { style: 'italic', weight: 400, file: 'JuliaMono-RegularItalic.woff2' },
                { style: 'normal', weight: 700, file: 'JuliaMono-Bold.woff2' },
                { style: 'italic', weight: 700, file: 'JuliaMono-BoldItalic.woff2' },
            ],
        },
    };
    const PRESET_NAMES = Object.keys(FONT_PRESETS);
    const selectedPresetName = GM_getValue(storageKey, null);
    const selectedPreset = selectedPresetName ? FONT_PRESETS[selectedPresetName] : null;

    const STYLE_ID = 'affo-tmi-mono-style';
    const MARKER_ATTR = 'data-affo-font-type';
    const MARKER_VALUE = 'mono';
    const INLINE_ATTR = 'data-affo-inline-mono';
    const BOLD_ATTR = 'data-affo-was-bold';
    const INLINE_REAPPLY_DEBOUNCE_MS = 250;
    const INLINE_MEANINGFUL_MIN_TEXT = 10;
    const INLINE_MEANINGFUL_MIN_CHILDREN = 1;
    const INLINE_MEANINGFUL_IGNORE_TAGS = {
        SCRIPT: true,
        STYLE: true,
        LINK: true,
        META: true,
        NOSCRIPT: true,
        TEMPLATE: true,
    };

    let refreshTimer = null;
    let refreshRunning = false;
    let refreshQueued = false;
    let domObserver = null;
    let styleOrderObserver = null;
    let embeddedVariantSrcByFile = {};
    let embeddedFontsPromise = null;

    for (const presetName of PRESET_NAMES) {
        const label = presetName + (presetName === selectedPresetName ? ' (active)' : '');
        GM_registerMenuCommand(label, () => {
            GM_setValue(storageKey, presetName);
            location.reload();
        });
    }

    GM_registerMenuCommand('Remove mono font for this domain', () => {
        GM_setValue(storageKey, null);
        location.reload();
    });

    if (!selectedPreset) return;

    const shouldInlineApply = matchesDomain(hostname, INLINE_APPLY_DOMAINS);
    const shouldUseAggressive = !matchesDomain(hostname, AGGRESSIVE_DOMAINS_EXCLUDE);
    const fontStack = `"${selectedPreset.fontFamily}", "Courier New", Courier, monospace`;

    hydrateEmbeddedFontsFromCache();
    ensureMainStyle();
    primeFontSource();
    installDomObserver();
    installSpaHooks();
    installFocusHooks();

    if (!shouldInlineApply && !shouldUseAggressive) {
        ensureStyleOrderChaser();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
        onReady();
    }

    function onReady() {
        ensureMainStyle();
        ensureStyleIsLast();
        ensureStyleOrderChaser();
        queueRefresh(0);
        setTimeout(() => queueRefresh(0), 700);
        setTimeout(() => queueRefresh(0), 1600);

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                queueRefresh(0);
            }).catch(() => { });
        }
    }

    function matchesDomain(domain, patterns) {
        return patterns.some((pattern) => domain === pattern || domain.endsWith('.' + pattern));
    }

    function buildFontSourceCss() {
        if (selectedPreset.source === 'google') {
            return `@import url("${selectedPreset.css2Url}");`;
        }

        return selectedPreset.variants
            .filter((variant) => embeddedVariantSrcByFile[variant.file])
            .map((variant) => `@font-face {
  font-family: "${selectedPreset.fontFamily}";
  src: url("${embeddedVariantSrcByFile[variant.file]}") format("woff2");
  font-style: ${variant.style};
  font-weight: ${variant.weight};
  font-display: swap;
}`)
            .join('\n');
    }

    function getEmbeddedFontCacheKey(fileName) {
        return `font-data:${selectedPreset.cacheKey}:${fileName}`;
    }

    function hydrateEmbeddedFontsFromCache() {
        if (selectedPreset.source !== 'sil') {
            return;
        }

        selectedPreset.variants.forEach((variant) => {
            try {
                const cachedDataUrl = GM_getValue(getEmbeddedFontCacheKey(variant.file), null);
                if (typeof cachedDataUrl === 'string' && cachedDataUrl.startsWith('data:font/woff2;base64,')) {
                    embeddedVariantSrcByFile[variant.file] = cachedDataUrl;
                }
            } catch (_) { }
        });
    }

    function primeFontSource() {
        if (selectedPreset.source === 'google') {
            kickFontLoad();
            return;
        }

        ensureEmbeddedFontData().then(() => {
            ensureMainStyle();
            kickFontLoad();
            queueRefresh(0);
        }).catch((error) => {
            console.error('[AFFO TMI Mono] Failed to embed font data:', error);
        });
    }

    function ensureEmbeddedFontData() {
        if (selectedPreset.source !== 'sil') {
            return Promise.resolve();
        }

        if (embeddedFontsPromise) {
            return embeddedFontsPromise;
        }

        embeddedFontsPromise = Promise.all(selectedPreset.variants.map(async (variant) => {
            if (embeddedVariantSrcByFile[variant.file]) {
                return;
            }

            const fontUrl = `${selectedPreset.baseUrl}/${variant.file}`;
            const dataUrl = await fetchFontAsDataUrl(fontUrl);
            embeddedVariantSrcByFile[variant.file] = dataUrl;
            try {
                GM_setValue(getEmbeddedFontCacheKey(variant.file), dataUrl);
            } catch (_) { }
        }));

        return embeddedFontsPromise;
    }

    function fetchFontAsDataUrl(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'arraybuffer',
                onload(response) {
                    if (response.status < 200 || response.status >= 300 || !response.response) {
                        reject(new Error(`Unexpected font response ${response.status} for ${url}`));
                        return;
                    }

                    try {
                        const base64 = arrayBufferToBase64(response.response);
                        resolve(`data:font/woff2;base64,${base64}`);
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror() {
                    reject(new Error(`Font fetch failed for ${url}`));
                },
            });
        });
    }

    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = '';

        for (let index = 0; index < bytes.length; index += chunkSize) {
            const chunk = bytes.subarray(index, index + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }

        return btoa(binary);
    }

    function buildMainCss() {
        const imp = shouldUseAggressive ? ' !important' : '';
        const headingReset = `[${MARKER_ATTR}="${MARKER_VALUE}"] h1, ` +
            `[${MARKER_ATTR}="${MARKER_VALUE}"] h2, ` +
            `[${MARKER_ATTR}="${MARKER_VALUE}"] h3, ` +
            `[${MARKER_ATTR}="${MARKER_VALUE}"] h4, ` +
            `[${MARKER_ATTR}="${MARKER_VALUE}"] h5, ` +
            `[${MARKER_ATTR}="${MARKER_VALUE}"] h6 { ` +
            `font-family: revert${imp}; font-weight: revert${imp}; font-style: revert${imp}; ` +
            `font-variation-settings: normal${imp}; }`;

        const cssParts = [buildFontSourceCss(), headingReset];

        if (!shouldInlineApply) {
            cssParts.push(
                `[${MARKER_ATTR}="${MARKER_VALUE}"]:not(strong):not(b) { font-family: ${fontStack}${imp}; }`,
                `strong[${MARKER_ATTR}="${MARKER_VALUE}"], ` +
                `b[${MARKER_ATTR}="${MARKER_VALUE}"], ` +
                `[${MARKER_ATTR}="${MARKER_VALUE}"] strong, ` +
                `[${MARKER_ATTR}="${MARKER_VALUE}"] b { ` +
                `font-family: ${fontStack}${imp}; font-weight: 700${imp}; }`
            );
        }

        return cssParts.join('\n\n');
    }

    function ensureMainStyle() {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }

        const css = buildMainCss();
        if (style.textContent !== css) {
            style.textContent = css;
        }
    }

    function ensureStyleIsLast() {
        if (shouldInlineApply || shouldUseAggressive) return;

        const style = document.getElementById(STYLE_ID);
        const head = document.head;
        if (!style || !head) return;

        if (style.parentNode !== head) {
            head.appendChild(style);
            return;
        }

        if (head.lastElementChild !== style) {
            head.appendChild(style);
        }
    }

    function ensureStyleOrderChaser() {
        if (styleOrderObserver || shouldInlineApply || shouldUseAggressive) return;
        if (!document.head) return;

        styleOrderObserver = new MutationObserver((mutations) => {
            const sawStyleOrLink = mutations.some((mutation) =>
                Array.from(mutation.addedNodes || []).some((node) =>
                    node && node.nodeType === 1 && (node.nodeName === 'STYLE' || node.nodeName === 'LINK')
                )
            );
            if (sawStyleOrLink) {
                ensureStyleIsLast();
            }
        });

        styleOrderObserver.observe(document.head, { childList: true });
        ensureStyleIsLast();
    }

    function kickFontLoad() {
        if (!document.fonts || !document.fonts.load) return;

        const specs = [
            `400 1em "${selectedPreset.fontFamily}"`,
            `700 1em "${selectedPreset.fontFamily}"`,
            `italic 400 1em "${selectedPreset.fontFamily}"`,
            `italic 700 1em "${selectedPreset.fontFamily}"`,
        ];

        specs.forEach((spec) => {
            try {
                document.fonts.load(spec).catch(() => { });
            } catch (_) { }
        });
    }

    function queueRefresh(delay) {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(runRefresh, delay);
    }

    function runRefresh() {
        refreshTimer = null;

        if (!document.body) {
            queueRefresh(50);
            return;
        }

        if (refreshRunning) {
            refreshQueued = true;
            return;
        }

        refreshRunning = true;
        ensureMainStyle();
        ensureStyleIsLast();

        scanAndMarkMono().then(() => {
            if (shouldInlineApply) {
                applyInlineMonoStyles();
            }
        }).finally(() => {
            refreshRunning = false;
            if (refreshQueued) {
                refreshQueued = false;
                queueRefresh(0);
            }
        });
    }

    function scanAndMarkMono() {
        return new Promise((resolve) => {
            const currentMarked = new Set(document.querySelectorAll(`[${MARKER_ATTR}="${MARKER_VALUE}"]`));
            const nextMarked = new Set();
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_ELEMENT,
                {
                    acceptNode(node) {
                        if (!node.textContent || node.textContent.trim().length === 0) {
                            return NodeFilter.FILTER_SKIP;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    },
                }
            );

            function processChunk() {
                let processed = 0;
                let element = null;

                while (processed < 1500) {
                    element = walker.nextNode();
                    if (!element) {
                        break;
                    }
                    processed += 1;

                    let computedStyle;
                    try {
                        computedStyle = window.getComputedStyle(element);
                    } catch (_) {
                        continue;
                    }

                    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
                        continue;
                    }

                    if (isMonoElement(element, computedStyle)) {
                        nextMarked.add(element);
                    }
                }

                if (element) {
                    setTimeout(processChunk, 0);
                    return;
                }

                nextMarked.forEach((node) => {
                    currentMarked.delete(node);
                    if (node.getAttribute(MARKER_ATTR) !== MARKER_VALUE) {
                        node.setAttribute(MARKER_ATTR, MARKER_VALUE);
                    }
                });

                currentMarked.forEach((node) => {
                    node.removeAttribute(MARKER_ATTR);
                });

                resolve();
            }

            processChunk();
        });
    }

    function isMonoElement(element, computedStyle) {
        const tagName = (element.tagName || '').toLowerCase();
        const role = element.getAttribute && element.getAttribute('role');
        const className = typeof element.className === 'string' ? element.className : String(element.className || '');
        const classText = className.toLowerCase();
        const inlineFontFamily = String(element.style.fontFamily || '').toLowerCase();

        if (!tagName) return false;

        if ([
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'nav', 'header', 'footer', 'aside', 'figcaption',
            'button', 'input', 'select', 'textarea', 'label',
        ].includes(tagName)) {
            return false;
        }

        if (element.closest) {
            const excludedAncestor = element.closest(
                'figcaption, button, .no-affo, [data-affo-guard], .post-header, .main-menu, [class*="topBar"], [role="dialog"]'
            );
            if (excludedAncestor) {
                return false;
            }
        }

        if (role && ['navigation', 'banner', 'contentinfo', 'complementary'].includes(role)) {
            return false;
        }

        if (classText && /\b(nav|menu|header|footer|sidebar|toolbar|breadcrumb|caption)\b/i.test(classText)) {
            return false;
        }

        if (['code', 'pre', 'kbd', 'samp', 'tt'].includes(tagName)) {
            return true;
        }

        if (classText && /\b(hljs|token|prettyprint|prettyprinted|sourcecode|wp-block-code|wp-block-preformatted|terminal)\b/.test(classText)) {
            return false;
        }

        if (classText && /\blanguage-/.test(classText)) {
            return false;
        }

        if (classText && /\b(small-caps|smallcaps|smcp|byline|author|date|meta|widget|dropdown|modal|tooltip|advertisement)\b/.test(classText)) {
            return false;
        }

        if ((classText && /whatfont/.test(classText)) || /whatfont/.test(String(element.id || ''))) {
            return false;
        }

        if (!elementHasOwnText(element)) {
            return false;
        }

        const computedFontFamily = String(computedStyle.fontFamily || '').toLowerCase();

        if (/\b(monospace|mono|code)\b/.test(classText) || /\b(monospace|mono)\b/.test(inlineFontFamily)) {
            return true;
        }

        return /\b(ui-monospace|monospace)\b/.test(computedFontFamily);
    }

    function elementHasOwnText(node) {
        if (!node || !node.childNodes) return false;

        for (let i = 0; i < node.childNodes.length; i += 1) {
            const child = node.childNodes[i];
            if (child && child.nodeType === Node.TEXT_NODE && /\S/.test(child.nodeValue || '')) {
                return true;
            }
        }

        return false;
    }

    function applyInlineMonoStyles() {
        const inlineNodes = document.querySelectorAll(`[${INLINE_ATTR}="true"]`);
        inlineNodes.forEach((node) => {
            if (node.getAttribute(MARKER_ATTR) !== MARKER_VALUE) {
                clearInlineMonoStyles(node);
            }
        });

        const monoNodes = document.querySelectorAll(`[${MARKER_ATTR}="${MARKER_VALUE}"]`);
        monoNodes.forEach((node) => {
            node.style.setProperty('font-family', fontStack, 'important');
            node.setAttribute(INLINE_ATTR, 'true');

            if (isBoldNode(node)) {
                node.style.setProperty('font-weight', '700', 'important');
                node.setAttribute(BOLD_ATTR, 'true');
            } else {
                node.style.removeProperty('font-weight');
                node.removeAttribute(BOLD_ATTR);
            }
        });
    }

    function clearInlineMonoStyles(node) {
        node.style.removeProperty('font-family');
        node.style.removeProperty('font-weight');
        node.removeAttribute(INLINE_ATTR);
        node.removeAttribute(BOLD_ATTR);
    }

    function isBoldNode(node) {
        const tagName = (node.tagName || '').toLowerCase();
        if (tagName === 'strong' || tagName === 'b') {
            return true;
        }

        if (node.getAttribute(BOLD_ATTR) === 'true') {
            return true;
        }

        try {
            const weight = Number(window.getComputedStyle(node).fontWeight);
            return Number.isFinite(weight) && weight >= 700;
        } catch (_) {
            return false;
        }
    }

    function installDomObserver() {
        if (domObserver) return;

        domObserver = new MutationObserver((mutations) => {
            const hasMeaningfulAddition = mutations.some((mutation) =>
                Array.from(mutation.addedNodes || []).some((node) => isMeaningfulAddedNode(node))
            );

            if (hasMeaningfulAddition) {
                queueRefresh(INLINE_REAPPLY_DEBOUNCE_MS);
            }
        });

        domObserver.observe(document.documentElement || document, {
            childList: true,
            subtree: true,
        });
    }

    function isMeaningfulAddedNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
        if (INLINE_MEANINGFUL_IGNORE_TAGS[node.tagName]) return false;
        if (node.namespaceURI === 'http://www.w3.org/2000/svg') return false;

        try {
            if (node.children && node.children.length >= INLINE_MEANINGFUL_MIN_CHILDREN) {
                return true;
            }
        } catch (_) { }

        try {
            const textLength = String(node.textContent || '').trim().length;
            if (textLength >= INLINE_MEANINGFUL_MIN_TEXT) {
                return true;
            }
        } catch (_) { }

        return false;
    }

    function installSpaHooks() {
        const scheduleAfterNavigation = () => {
            setTimeout(() => {
                ensureMainStyle();
                ensureStyleIsLast();
                queueRefresh(0);
            }, 100);
        };

        try {
            const originalPushState = history.pushState;
            history.pushState = function () {
                const result = originalPushState.apply(this, arguments);
                scheduleAfterNavigation();
                return result;
            };
        } catch (_) { }

        try {
            const originalReplaceState = history.replaceState;
            history.replaceState = function () {
                const result = originalReplaceState.apply(this, arguments);
                scheduleAfterNavigation();
                return result;
            };
        } catch (_) { }

        try {
            window.addEventListener('popstate', scheduleAfterNavigation, true);
        } catch (_) { }
    }

    function installFocusHooks() {
        const onFocus = () => {
            ensureMainStyle();
            ensureStyleIsLast();
            queueRefresh(100);
        };

        try {
            window.addEventListener('focus', onFocus, true);
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    onFocus();
                }
            }, true);
        } catch (_) { }
    }
})();
