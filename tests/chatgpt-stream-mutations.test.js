const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');

const source = fs.readFileSync(require.resolve('../src/content.js'), 'utf8');
const names = new Set(['anyMutationConsumerActive', 'getChatGptStreamTextRoot', 'ensureSharedDomObserver',
    'maybeCleanupSharedDomObserver', 'dispatchMeaningfulMutations', 'isMeaningfulInlineAddedNode',
    'elementHasOwnText', 'directTextHasMinNonWhitespace', 'markTypesInRoots']);
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

function paragraph({ message = true, pruned = false, marked = false } = {}) {
    const attrs = new Map(marked ? [['data-affo-font-type', 'sans']] : []);
    const p = {
        nodeType: 1, tagName: 'P', children: [], childNodes: [], connected: true, message, pruned,
        hasAttribute: name => attrs.has(name),
        getAttribute: name => attrs.get(name),
        contains(node) { return this === node || this.children.includes(node); },
        attrs
    };
    return p;
}
function text(parent, value) {
    const node = { nodeType: 3, nodeValue: value, parentElement: parent };
    parent.childNodes.push(node);
    return node;
}

function harness(chatgpt = true) {
    const timers = new Map();
    const classified = [];
    const walked = [];
    let callback;
    let observed;
    let nextId = 0;
    const context = vm.createContext({
        isChatGpt: chatgpt,
        sharedDomObserver: null, sharedDomDebounceTimer: null, pendingMeaningfulRoots: new Set(),
        inlineObserverWanted: false, inlineConfigs: {},
        getObservedTmiCssTypes: () => ['sans'], getActiveFontSizeScaleTypes: () => [],
        isInsideInteractiveSubtree: node => !!(node.parentElement || node).pruned,
        isInsideTmiPrunedSubtree: node => node.pruned,
        isTmiPrunedSubtreeRoot: node => node.pruned,
        isInsideChatGptMessage: node => node.message,
        isInOrContainsChatGptMessage: node => !chatgpt || node.message,
        resetFixedPositionUiCache() {},
        elementMayOwnTmiText: node => node.childNodes.some(child => /\S/.test(child.nodeValue || '')),
        markElementForTypes(node) { classified.push(node); node.attrs.set('data-affo-font-type', 'sans'); },
        window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
        document: {
            documentElement: {}, contains: node => node.connected,
            createTreeWalker(root) { walked.push(root); return { nextNode: () => null }; }
        },
        NodeFilter: { SHOW_ELEMENT: 1 },
        MutationObserver: class {
            constructor(fn) { callback = fn; }
            observe(_root, options) { observed = options; }
            disconnect() {}
        },
        INLINE_MEANINGFUL_IGNORE_TAGS: { SCRIPT: true, STYLE: true },
        INLINE_MEANINGFUL_MIN_TEXT: 10, INLINE_MEANINGFUL_MIN_CHILDREN: 1,
        INLINE_REAPPLY_DEBOUNCE_MS: 250,
        setTimeout(fn) { timers.set(++nextId, fn); return nextId; },
        clearTimeout(id) { timers.delete(id); },
        debugLog() {}
    });
    vm.runInContext(functions.join('\n'), context);
    context.ensureSharedDomObserver();
    return {
        context, timers, classified, walked, observed,
        mutate: records => callback(records),
        flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }
    };
}

for (const type of ['childList', 'characterData']) {
    test('classifies a previously empty ChatGPT paragraph when text arrives via ' + type, () => {
        const h = harness();
        const p = paragraph();
        h.mutate([{ type: 'childList', target: paragraph(), addedNodes: [p] }]);
        assert.equal(h.timers.size, 0, 'An empty paragraph should not trigger a walk');
        const token = text(p, 'Hi');
        h.mutate([type === 'characterData'
            ? { type, target: token }
            : { type, target: p, addedNodes: [token] }]);
        h.flush();
        assert.deepEqual(h.classified, [p]);
        assert.deepEqual(h.walked, [p], 'Only the new text owner should be walked');
        assert.equal(p.attrs.get('data-affo-font-type'), 'sans');
    });
}

test('deduplicates streamed tokens across batches without postponing the first flush', () => {
    const h = harness();
    const p = paragraph();
    const token = text(p, 'A');
    for (let i = 0; i < 50; i++) {
        token.nodeValue += ' text';
        h.mutate([{ type: 'characterData', target: token }]);
    }
    assert.deepEqual([...h.timers.keys()], [1], 'Streaming must not continually restart the timer');
    assert.equal(h.context.pendingMeaningfulRoots.size, 1);
    h.flush();
    assert.deepEqual(h.classified, [p]);
    for (let i = 0; i < 50; i++) h.mutate([{ type: 'characterData', target: token }]);
    assert.equal(h.timers.size, 0, 'Already marked text needs no additional work');
});

test('revisits the missed paragraph even if a later emphasis element is already marked', () => {
    const h = harness();
    const p = paragraph();
    const em = paragraph({ marked: true });
    em.tagName = 'EM';
    p.children.push(em);
    const token = text(p, 'The unstyled second paragraph');
    h.mutate([{ type: 'childList', target: p, addedNodes: [token] }]);
    h.flush();
    assert.deepEqual(h.classified, [p]);
});

test('ignores composer/sidebar, pruned UI, whitespace and detached text owners', () => {
    const h = harness();
    for (const options of [{ message: false }, { pruned: true }]) {
        const p = paragraph(options);
        h.mutate([{ type: 'characterData', target: text(p, 'Some input text') }]);
    }
    const p = paragraph();
    h.mutate([{ type: 'characterData', target: text(p, '   ') }]);
    assert.equal(h.timers.size, 0);
    const detached = paragraph();
    h.mutate([{ type: 'characterData', target: text(detached, 'Removed before flush') }]);
    detached.connected = false;
    h.flush();
    assert.deepEqual(h.classified, []);
});

test('non-ChatGPT pages retain child-list-only observation and their existing debounce', () => {
    const h = harness(false);
    assert.equal(h.observed.characterData, false);
    const p = paragraph();
    const token = text(p, 'Some text');
    h.mutate([{ type: 'childList', target: p, addedNodes: [token] }]);
    assert.equal(h.timers.size, 0);
    text(p, 'More than ten characters');
    h.mutate([{ type: 'childList', target: paragraph(), addedNodes: [p] }]);
    h.mutate([{ type: 'childList', target: paragraph(), addedNodes: [p] }]);
    assert.deepEqual([...h.timers.keys()], [2]);
    h.flush();
    assert.deepEqual(h.classified, [p]);
});

test('cleanup cancels pending text work when the last consumer is disabled', () => {
    const h = harness();
    const p = paragraph();
    h.mutate([{ type: 'characterData', target: text(p, 'pending text') }]);
    h.context.getObservedTmiCssTypes = () => [];
    h.context.maybeCleanupSharedDomObserver();
    assert.equal(h.timers.size, 0);
    assert.equal(h.context.pendingMeaningfulRoots.size, 0);
    assert.equal(h.context.sharedDomObserver, null);
});
