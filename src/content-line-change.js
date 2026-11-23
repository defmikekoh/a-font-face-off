// Line Change operates on the elements that own nonblank page text nodes.
(() => {
    'use strict';
    const painted = new Map();
    const highlightName = 'affo-line-change';
    let highlightFamily = '';
    let rules = [];
    let runtime;
    let scope;
    let markVisible = false;
    let clearButton;
    let pendingFrame;
    const observer = new MutationObserver(schedule);
    const normalize = name => name.toLowerCase();

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
        const active = !!(rules.length || highlightFamily);
        if ((active || list) && document.body) {
            const replacements = new Map(rules.map(rule => [normalize(rule.source), rule.target]));
            const groups = new Map();
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const el = node.parentElement;
                if (!node.data.trim() || !el?.style || el.closest('script,style,noscript,template,[data-affo-guard],#affo-quick-pick-overlay')) continue;
                if (!groups.has(el)) groups.set(el, []);
                groups.get(el).push(node);
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
        if (active) observer.observe(document, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['class','style','hidden'] });
        return { families: [...families.values()].sort(), highlightFamily, rules, scope };
    }

    function configure(map) {
        const key = globalThis.AFFOScopeUtils.resolveKey(map, location);
        const entry = map[key] || {};
        const next = entry.lineChange || [];
        const clear = highlightFamily && (scope !== key || entry.body || entry.serif || entry.sans || entry.mono || entry.sroulette);
        if (scope === key && !clear && JSON.stringify(next) === JSON.stringify(rules)) return;
        if (clear) highlightFamily = '';
        scope = key;
        rules = next;
        if (runtime) {
            for (const rule of rules) runtime.loadFont(rule.target, 'line-change');
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
            for (const rule of rules) runtime.loadFont(rule.target, 'line-change');
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
        if (area === 'local' && changes.affoApplyMap) configure(changes.affoApplyMap.newValue || {});
    });
    browser.storage.local.get('affoApplyMap').then(data => {
        if (scope === undefined) configure(data.affoApplyMap || {});
    });
})();
