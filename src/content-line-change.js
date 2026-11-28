// Line Change operates on the elements that own nonblank page text nodes.
(() => {
    'use strict';
    const painted = new Map();
    const highlightName = 'affo-line-change';
    let highlightFamily = '';
    let rules = [];
    let resolvedRules = [];
    let runtime;
    let scope;
    let markVisible = false;
    let clearButton;
    let pendingFrame;
    let preservedFonts = new Set();
    let ignoreCommentsDomains = [];
    const isChatGpt = AFFOSiteDetection.isChatGptHost(location.hostname);
    const isSubstack = AFFOSiteDetection.isSubstackDocument(document, location, window);
    const chatGptRootSelector = AFFOSiteDetection.CHATGPT_CONTENT_ROOT_SELECTOR;
    let chatGptScanRoots = [];
    const deckHints = ['summary', 'subtitle', 'dek', 'deck', 'standfirst', 'subheadline', 'excerpt'];
    const deckAttrs = ['id', 'class', 'data-testid', 'itemprop', 'name'];
    const observer = new MutationObserver(records => {
        if (!isChatGpt || records.some(affectsChatGptContent)) schedule();
    });
    const normalize = name => name.toLowerCase();

    function isProtectedDropCap(el) {
        if (!el || /^(P|LI|BLOCKQUOTE)$/.test(el.tagName)) return false;
        if (el.matches('[style*="var(--drop-cap" i], [style*="initial-letter" i], [class~="drop-cap" i], [class~="dropcap" i], [class~="drop_cap" i], [data-testid*="drop-cap" i], [data-testid*="dropcap" i]')) return true;
        if (!el.hasAttribute('data-drop-cap') && !el.hasAttribute('data-dropcap')) return false;
        return !el.matches(':is([data-drop-cap], [data-dropcap]):has(> :is(p, li, blockquote) ~ :is(p, li, blockquote))');
    }

    function isArticleDeck(el) {
        if (!el || !/^(P|DIV)$/.test(el.tagName)) return false;
        const header = el.closest('article header');
        if (!header) return false;
        const hints = deckAttrs.map(attr => el.getAttribute(attr) || '').join(' ').toLowerCase();
        if (!deckHints.some(hint => hints.includes(hint))) return el.matches('#fullBleedHeaderContent header p');
        return el.tagName !== 'DIV' || el.querySelectorAll('p, li, blockquote, ul, ol').length <= 1;
    }

    function isExcluded(el) {
        if (el.closest('script,style,noscript,template,[data-affo-guard],.no-affo,#affo-quick-pick-overlay')) return true;
        if (isSubstack && isSubstackPrimaryButtonText(el)) return true;
        if (el.closest('h1,h2,h3,h4,h5,h6,nav,header,footer:not(article footer),aside,form,button,input,select,textarea,label,figcaption,[role="navigation"],[role="banner"],[role="contentinfo"],[role="complementary"],[role="dialog"],[aria-modal="true"],[role="toolbar"],[role="button"],[contenteditable]:not([contenteditable="false"]),[role="textbox"],.post-header,.main-menu,[class*="topBar"]')) return true;
        if (ignoreCommentsDomains.includes(location.hostname) && el.closest('.comments-page')) return true;
        const codeContainer = el.closest('[class~="hljs"],[class~="token"],[class~="prettyprint"],[class~="prettyprinted"],[class~="sourceCode"],[class~="wp-block-code"],[class~="wp-block-preformatted"],[class~="terminal"],[class*="language-"]');
        if (codeContainer && codeContainer !== document.documentElement && codeContainer !== document.body) return true;
        const classText = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        if (/\b(nav|menu|header|footer|sidebar|toolbar|breadcrumb|caption|small-caps|smallcaps|smcp|widget|dropdown|modal|tooltip|advertisement|whatfont)\b/.test(classText)) return true;
        if (/(?:^|[-_])(byline|author|date|meta)(?:[-_]|$)/.test(classText)) return true;
        if (/whatfont/i.test(el.id || '')) return true;
        if (el.closest('[class*="drop-cap" i],[class~="dropcap" i],[class~="drop_cap" i],[data-drop-cap],[data-dropcap],[data-testid*="drop-cap" i],[data-testid*="dropcap" i]')) {
            let node = el;
            while (node && node !== document.body) { if (isProtectedDropCap(node)) return true; node = node.parentElement; }
        }
        let node = el;
        while (node && node !== document.body) { if (isArticleDeck(node)) return true; node = node.parentElement; }
        for (node = el; node && node !== document.body; node = node.parentElement) {
            if (getComputedStyle(node).position === 'fixed') return true;
        }
        return false;
    }

    function isSubstackPrimaryButtonText(el) {
        const wrapper = el.closest('p.button-wrapper');
        if (!wrapper) return false;
        const link = Array.from(wrapper.children).find(child => child.tagName === 'A' && child.classList.contains('button') && child.classList.contains('primary'));
        if (!link || !Array.from(link.children).some(child => child.tagName === 'SPAN')) return false;
        return el === link || link.contains(el) || el === wrapper;
    }

    function containsChatGptRoot(node) {
        return node.nodeType === 1 && (node.matches(chatGptRootSelector) || !!node.querySelector(chatGptRootSelector));
    }

    function affectsChatGptContent(record) {
        if (chatGptScanRoots.some(root => root.contains(record.target))) return true;
        // Ancestor visibility changes can reveal an already mounted main.
        if (record.type === 'attributes') return containsChatGptRoot(record.target);
        if (record.type !== 'childList') return false;
        return Array.from(record.addedNodes).some(containsChatGptRoot) ||
            Array.from(record.removedNodes).some(node => chatGptScanRoots.some(root => node.contains(root)));
    }

    function schedule() {
        if (!pendingFrame) pendingFrame = requestAnimationFrame(() => scan());
    }

    function restoreStyles() {
        for (const [element, originals] of painted) {
            for (const [prop, original] of originals) {
                const style = element.style;
                if (style.getPropertyValue(prop) !== original.applied || style.getPropertyPriority(prop) !== 'important') continue;
                if (original.value) style.setProperty(prop, original.value, original.priority);
                else style.removeProperty(prop);
            }
        }
        painted.clear();
    }

    function clearHighlight() {
        highlightFamily = '';
        scan();
    }

    function updateClearControl() {
        const frame = document.querySelector('#affo-left-toolbar-iframe');
        if (frame?.dataset.affoToolbarLoaded === 'true') {
            frame.contentWindow?.postMessage({ type: 'affoLineHighlight', active: !!highlightFamily }, browser.runtime.getURL('').replace(/\/$/, ''));
        }
        if (!highlightFamily || frame) {
            clearButton?.remove();
            clearButton = null;
        } else if (!clearButton && document.body) {
            clearButton = document.createElement('button');
            clearButton.dataset.affoGuard = '';
            clearButton.textContent = 'Clear highlight';
            clearButton.style.cssText = 'all:initial;position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#fff;color:#172d29;padding:12px;border:1px solid;border-radius:6px;cursor:pointer;font:16px system-ui';
            clearButton.onclick = clearHighlight;
            document.body.appendChild(clearButton);
        }
    }

    function scan(list = false) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = 0;
        observer.disconnect();
        restoreStyles();
        const families = new Map();
        const familyCoverage = new Map();
        const active = !!(rules.length || highlightFamily);
        chatGptScanRoots = [];
        if ((active || list) && document.body) {
            const replacements = new Map(resolvedRules.map(rule => [normalize(rule.source), rule.target]));
            const groups = new Map();
            if (isChatGpt) chatGptScanRoots = AFFOSiteDetection.getVisibleChatGptContentRoots(document);
            for (const root of isChatGpt ? chatGptScanRoots : [document.body]) {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                    const el = node.parentElement;
                    if (!node.data.trim() || !el?.style || isExcluded(el)) continue;
                    if (!groups.has(el)) groups.set(el, []);
                    groups.get(el).push(node);
                }
            }
            const ranges = [];
            const changes = new Map();
            // Finish all computed-style reads before changing an inherited family.
            for (const [el, nodes] of groups) {
                const css = getComputedStyle(el);
                if (css.visibility !== 'visible') continue;
                if (!el.getClientRects().length) {
                    if (css.display !== 'contents') continue;
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    if (!range.getClientRects().length) continue;
                }
                const first = css.fontFamily.match(/^(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^,]+))/);
                if (!first) continue;
                const name = (first[1] || first[2] || first[3]).trim().replace(/\\(["'\\])/g, '$1');
                const key = normalize(name);
                families.set(key, name);
                const readableCharacters = nodes.reduce((total, text) => total + (text.data.match(/\S/g) || []).length, 0);
                const coverage = familyCoverage.get(key) || { name, characters: 0 };
                coverage.characters += readableCharacters;
                familyCoverage.set(key, coverage);
                const stack = css.fontFamily.split(',').map(part => part.trim().replace(/["']/g, '').toLowerCase());
                if (stack.some(part => preservedFonts.has(part))) continue;
                const config = replacements.get(key);
                if (config && runtime) {
                    const props = runtime.buildInlineFontProperties(config);
                    if (config.fontSizeScale != null) props['font-size'] = parseFloat(css.fontSize) * config.fontSizeScale / 100 + 'px';
                    if (config.fontColor) props.color = config.fontColor;
                    changes.set(el, props);
                }
                if (highlightFamily && key === normalize(highlightFamily)) {
                    for (const text of nodes) {
                        const range = document.createRange();
                        range.selectNodeContents(text);
                        ranges.push(range);
                    }
                }
            }
            // A paragraph can contain only inline text owners. Its own font still
            // contributes a line-box strut, so replace it when its original
            // family has a rule, even though it owns no direct text node.
            const paragraphs = new Set([...changes.keys()].map(el => el.closest('p')).filter(Boolean));
            for (const paragraph of paragraphs) {
                if (changes.has(paragraph) || isExcluded(paragraph)) continue;
                const css = getComputedStyle(paragraph);
                const first = css.fontFamily.match(/^(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^,]+))/);
                if (!first) continue;
                const name = (first[1] || first[2] || first[3]).trim().replace(/\\(["'\\])/g, '$1');
                const stack = css.fontFamily.split(',').map(part => part.trim().replace(/["']/g, '').toLowerCase());
                const config = replacements.get(normalize(name));
                if (!config || stack.some(part => preservedFonts.has(part))) continue;
                const props = runtime.buildInlineFontProperties(config);
                const lineBoxProps = {};
                if (props['font-family']) lineBoxProps['font-family'] = props['font-family'];
                if (props['line-height']) lineBoxProps['line-height'] = props['line-height'];
                if (Object.keys(lineBoxProps).length) changes.set(paragraph, lineBoxProps);
            }
            // Preserve inheritance across nested stacks. An unmatched child of a
            // changed text owner must retain its original size, color, and axes.
            for (const [el, props] of [...changes]) {
                for (const child of el.children) {
                    if (!child.style) continue;
                    const own = changes.get(child) || {};
                    const css = getComputedStyle(child);
                    for (const prop of Object.keys(props)) {
                        if (!(prop in own)) own[prop] = css.getPropertyValue(prop);
                    }
                    changes.set(child, own);
                }
            }
            for (const [el, props] of changes) {
                const originals = new Map();
                for (const [prop, value] of Object.entries(props)) {
                    const original = { value: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) };
                    el.style.setProperty(prop, value, 'important');
                    original.applied = el.style.getPropertyValue(prop);
                    originals.set(prop, original);
                }
                painted.set(el, originals);
            }
            if (highlightFamily) {
                const mark = new globalThis.Highlight();
                for (const range of ranges) mark.add(range);
                globalThis.CSS.highlights.set(highlightName, mark);
                markVisible = true;
            }
        }
        if (!highlightFamily && markVisible) {
            globalThis.CSS.highlights.delete(highlightName);
            markVisible = false;
        }
        updateClearControl();
        if (active) {
            const attributeFilter = ['class', 'style', 'hidden'];
            if (isChatGpt) attributeFilter.push('role');
            observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter });
        }
        const preferredFamily = [...familyCoverage.values()]
            .sort((a, b) => b.characters - a.characters || a.name.localeCompare(b.name))[0]?.name || '';
        return { families: [...families.values()].sort(), preferredFamily, highlightFamily, rules, scope };
    }

    function configure(map, forceRefresh = false) {
        const key = globalThis.AFFOScopeUtils.resolveKey(map, location);
        const entry = map[key] || {};
        const next = entry.lineChange || [];
        const clear = highlightFamily && (scope !== key || entry.body || entry.serif || entry.sans || entry.mono || entry.sroulette);
        if (!forceRefresh && scope === key && !clear && JSON.stringify(next) === JSON.stringify(rules)) return;
        if (clear) highlightFamily = '';
        scope = key;
        rules = next;
        resolvedRules = next.filter(rule => rule.target && rule.target.kind !== 'sroulette');
        const poolRules = next.filter(rule => rule.target && rule.target.kind === 'sroulette');
        if (poolRules.length) {
            browser.storage.local.get(['affoSubstackRoulette', 'affoSubstackRouletteSerif', 'affoSubstackRouletteSans', 'affoFavorites']).then(data => {
                if (scope !== key || rules !== next) return;
                const materialized = poolRules.map(rule => {
                    const config = AFFOContentSroulette.pickFontConfig(data, rule.target.pool);
                    return config ? { source: rule.source, target: config } : null;
                }).filter(Boolean);
                resolvedRules = resolvedRules.concat(materialized);
                if (runtime) materialized.forEach(rule => runtime.loadFont(rule.target, 'line-change'));
                scan();
            }).catch(() => {});
        }
        if (runtime) {
            for (const rule of resolvedRules) runtime.loadFont(rule.target, 'line-change');
        }
        scan();
    }

    window.addEventListener('resize', () => {
        if (rules.length || highlightFamily) schedule();
    });
    globalThis.AFFOLineChange = {
        configure,
        clearHighlight,
        connect(helpers) {
            runtime = helpers;
            for (const rule of resolvedRules) runtime.loadFont(rule.target, 'line-change');
            if (rules.length) scan();
        },
        get highlighting() { return !!highlightFamily; }
    };
    browser.runtime.onMessage.addListener((msg, sender, respond) => {
        if (msg.type !== 'affoLineChange') return;
        browser.storage.local.get('affoApplyMap').then(data => {
            configure(data.affoApplyMap || {});
            if (msg.action === 'toggle') highlightFamily = highlightFamily === msg.family ? '' : msg.family;
            if (msg.action === 'select') highlightFamily = msg.family;
            if (msg.action === 'clear') highlightFamily = '';
            respond(scan(true));
        }).catch(error => respond({ error: error.message }));
        return true;
    });
    browser.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.affoApplyMap) configure(changes.affoApplyMap.newValue || {});
        if (changes.affoPreservedFonts) {
            preservedFonts = new Set((changes.affoPreservedFonts.newValue || []).map(value => String(value || '').toLowerCase().trim()));
            schedule();
        }
        if (changes.affoIgnoreCommentsDomains) {
            ignoreCommentsDomains = changes.affoIgnoreCommentsDomains.newValue || [];
            schedule();
        }
    });
    browser.storage.local.get(['affoApplyMap', 'affoPreservedFonts', 'affoIgnoreCommentsDomains']).then(data => {
        preservedFonts = new Set((data.affoPreservedFonts || []).map(value => String(value || '').toLowerCase().trim()));
        ignoreCommentsDomains = data.affoIgnoreCommentsDomains || [];
        if (scope === undefined) configure(data.affoApplyMap || {});
    });
})();
