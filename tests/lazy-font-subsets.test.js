const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');
const source = fs.readFileSync(require.resolve('../src/content.js'), 'utf8');
const names = new Set(['ensureLazyGoogleSubsetObserver', 'stopLazyGoogleSubsetObserver',
    'scanNeededCodePoints', 'addTextCodePoints', 'hasHiddenAncestorForFontSubsetScan']);
const functions = [];
function collect(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && names.has(node.id.name)) functions.push(source.slice(node.start, node.end));
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') collect(value);
    }
}
collect(acorn.parse(source, { ecmaVersion: 2022 }));
assert.equal(functions.length, names.size);
function element(parent = null, hidden = false) {
    const node = { nodeType: 1, tagName: 'DIV', parentElement: parent, children: [], hidden,
        getAttribute: () => null };
    if (parent) parent.children.push(node);
    return node;
}
function text(parent, value) {
    const node = { nodeType: 3, parentElement: parent, nodeValue: value };
    parent.children.push(node);
    return node;
}
function harness() {
    let observerCount = 0, disconnects = 0, nextTimer = 0;
    const callbacks = [], timers = new Map(), scans = [];
    const body = element();
    const context = vm.createContext({
        lazyGoogleSubsetObservers: {}, sharedLazySubsetObserver: null, sharedLazySubsetTimer: null,
        pendingLazySubsetRoots: new Set(), FONTFACE_LAZY_SUBSET_DEBOUNCE_MS: 600,
        FONTFACE_SUBSET_SAMPLE_LIMIT: 20000, FONTFACE_VISIBLE_TEXT_NODE_LIMIT: 5000,
        FONTFACE_MAX_UNIQUE_CODEPOINTS: 2000, INLINE_MEANINGFUL_IGNORE_TAGS: { SCRIPT: true, STYLE: true },
        debugLog() {},
        window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
        setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
        clearTimeout: id => timers.delete(id),
        MutationObserver: class {
            constructor(fn) { observerCount++; callbacks.push(fn); }
            observe() {}
            disconnect() { disconnects++; }
        },
        document: {
            body, contains: node => !node.detached,
            createTreeWalker(root, _what, filter) {
                scans.push(root);
                const nodes = [];
                function visit(node) {
                    if (node.nodeType === 3 && filter.acceptNode(node) === 1) nodes.push(node);
                    (node.children || []).forEach(visit);
                }
                visit(root);
                return { nextNode: () => nodes.shift() || null };
            },
        },
    });
    vm.runInContext(functions.join('\n'), context);
    return { context, body, scans, timers,
        get observerCount() { return observerCount; }, get disconnects() { return disconnects; },
        mutate: mutations => callbacks.at(-1)(mutations),
        flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    };
}

test('multiple fonts share one observer and a deduplicated changed-subtree scan', () => {
    const h = harness(), results = [];
    for (const font of ['one', 'two']) {
        h.context.lazyGoogleSubsetObservers[font] = { check: points => results.push([font, [...points]]) };
        h.context.ensureLazyGoogleSubsetObserver();
    }
    assert.equal(h.observerCount, 1);
    const root = element(h.body), nested = element(root);
    const japanese = text(nested, '日😀');
    const hidden = element(root, true);
    text(hidden, '秘');
    const unrelated = element(h.body);
    text(unrelated, '外');
    h.mutate([{ addedNodes: [root, nested] }, { type: 'characterData', target: japanese }]);
    h.mutate([{ addedNodes: [root] }]);
    assert.equal(h.timers.size, 1, 'Continuous changes retain a single bounded batch');
    h.flush();
    assert.deepEqual(h.scans, [root]);
    assert.deepEqual(results, [['one', [0x65e5, 0x1f600]], ['two', [0x65e5, 0x1f600]]]);
});

test('character-data-only changes are scanned without a page walk; detached and hidden text are ignored', () => {
    const h = harness(), results = [];
    h.context.lazyGoogleSubsetObservers.font = { check: points => results.push([...points]) };
    h.context.ensureLazyGoogleSubsetObserver();
    const owner = element(h.body), changed = text(owner, 'Ж');
    const detached = text(owner, '日');
    detached.detached = true;
    h.mutate([{ type: 'characterData', target: changed }, { addedNodes: [detached] }]);
    h.flush();
    assert.deepEqual(results, [[0x416]]);
    assert.deepEqual(h.scans, []);
    owner.hidden = true;
    h.mutate([{ type: 'characterData', target: changed }]);
    h.flush();
    assert.equal(results.length, 1, 'A scoped empty scan does not substitute Latin or rescan the document');
});

test('per-font teardown preserves other fonts; final teardown cancels pending work and permits restart', () => {
    const h = harness(), calls = [];
    h.context.lazyGoogleSubsetObservers.one = { check: () => calls.push('one') };
    h.context.lazyGoogleSubsetObservers.two = { check: () => calls.push('two') };
    h.context.ensureLazyGoogleSubsetObserver();
    const node = text(h.body, '日');
    h.mutate([{ addedNodes: [node] }]);
    h.context.stopLazyGoogleSubsetObserver('one', 'timeout');
    assert.equal(h.disconnects, 0);
    h.flush();
    assert.deepEqual(calls, ['two']);
    h.mutate([{ addedNodes: [node] }]);
    h.context.stopLazyGoogleSubsetObserver('two', 'timeout');
    assert.equal(h.disconnects, 1);
    assert.equal(h.timers.size, 0);
    assert.equal(h.context.pendingLazySubsetRoots.size, 0);
    h.context.lazyGoogleSubsetObservers.three = { check() {} };
    h.context.ensureLazyGoogleSubsetObserver();
    assert.equal(h.observerCount, 2);
});
