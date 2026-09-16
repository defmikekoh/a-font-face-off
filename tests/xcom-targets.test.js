const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');
const source = fs.readFileSync(require.resolve('../src/content.js'), 'utf8');
const names = new Set(['elementHasOwnText', 'isHybridInlineTarget', 'filterInlineTmiTargets', 'getHybridInlineMutationRoot']);
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
function node({ tag = 'DIV', text = '', children = [], matches = true, guarded = false } = {}) {
    return {
        nodeType: 1, tagName: tag, children,
        childNodes: [...children, ...(text ? [{ nodeType: 3, nodeValue: text }] : [])],
        namespaceURI: tag === 'SVG' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml',
        matches: () => matches, hasAttribute: key => key === 'data-affo-guard' && guarded,
    };
}
function harness() {
    const context = vm.createContext({
        usesHybridInlineTmiSelectors: () => true,
        getAffoSelector: type => type,
        INLINE_MEANINGFUL_IGNORE_TAGS: { SCRIPT: true, STYLE: true },
        inlineConfigs: { sans: {} }, fontSizeScaleConfigs: {},
        isMeaningfulInlineAddedNode: () => true,
    });
    vm.runInContext(functions.join('\n'), context);
    return context;
}

test('hybrid target filtering omits empty and independently covered wrappers but retains inherited text', () => {
    const h = harness();
    const leaf = node({ tag: 'SPAN', text: 'Hi' });
    const wrapper = node({ children: [leaf] });
    const empty = node();
    const linkWrapper = node({ children: [node({ tag: 'A', text: 'Link', matches: false })] });
    const mixed = node({ text: 'own text', children: [leaf] });
    const icon = node({ children: [node({ tag: 'SVG', matches: false })] });
    const guardWrapper = node({ children: [node({ guarded: true, matches: false })] });
    const candidates = [wrapper, empty, linkWrapper, leaf, mixed, icon, guardWrapper];
    assert.deepEqual(Array.from(h.filterInlineTmiTargets('sans', candidates)), [linkWrapper, leaf, mixed]);
    assert.deepEqual(Array.from(h.filterInlineTmiTargets('mono', candidates)), candidates);
    h.usesHybridInlineTmiSelectors = () => false;
    assert.deepEqual(Array.from(h.filterInlineTmiTargets('sans', candidates)), candidates);
});

test('new short text and unmatched links revisit the nearest active candidate', () => {
    const h = harness(), wrapper = node();
    const link = node({ tag: 'A', text: 'Go', matches: false });
    link.closest = selector => { assert.equal(selector, 'sans'); return wrapper; };
    const text = { nodeType: 3, nodeValue: 'Go', parentElement: link };
    assert.equal(h.getHybridInlineMutationRoot(text), wrapper);
    assert.equal(h.getHybridInlineMutationRoot(link), wrapper);
    link.childNodes = [{ nodeType: 3, nodeValue: ' ' }];
    assert.equal(h.getHybridInlineMutationRoot(text), null);
    h.inlineConfigs = {};
    h.fontSizeScaleConfigs = { sans: {} };
    assert.equal(h.getHybridInlineMutationRoot(link), wrapper, 'Scale-only recovery still gets dynamic roots');
});
