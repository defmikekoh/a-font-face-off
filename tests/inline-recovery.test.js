const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');

const source = fs.readFileSync(require.resolve('../src/content.js'), 'utf8');
const names = new Set([
    'applyTmiProtection', 'applyAffoProtection', 'setImportantStyleIfChanged',
    'setAttributeIfChanged', 'isBoldFontWeightValue', 'buildBoldAxisSettings', 'extractVariationAxes',
    'ensureFontSizeScaleObserver', 'reapplyPageTypographyAfterNavigation',
    'reapplyFontSizeScalesAfterNavigation', 'reapplyFontSizeScalesOnFocus',
    'resumeInlineStylesOnFocus', 'reapplyActiveFontSizeScales',
    'getTmiElementBoldness', 'applyTmiProtectionToElements',
]);
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
function harness(overrides) {
    const context = vm.createContext(overrides);
    vm.runInContext(functions.join('\n'), context);
    return context;
}

test('TMI snapshots every weight before any style write and refreshes non-bold nodes on reuse', () => {
    const events = [];
    const elements = [0, 1, 2].map(id => ({ id, weight: '400', getAttribute: () => null }));
    const context = harness({
        window: { getComputedStyle(el) { events.push('read:' + el.id); return { fontWeight: el.weight }; } },
        filterInlineTmiTargets: (_, targets) => targets,
        applyAffoTextColor() {},
    });
    context.applyTmiProtection = (el, _props, _weight, bold) => events.push('write:' + el.id + ':' + bold);
    context.applyTmiProtectionToElements(elements, {}, 'sans');
    assert.deepEqual(events, ['read:0', 'read:1', 'read:2', 'write:0:false', 'write:1:false', 'write:2:false']);
    events.length = 0;
    elements[1].weight = '700';
    context.applyTmiProtectionToElements(elements, {}, 'sans');
    assert.equal(events[4], 'write:1:true', 'Reused nodes must not retain a cached non-bold result');
});

for (const settings of [undefined, '"wght" 400, "wdth" 90']) {
    test(`bold recovery writes final values once and unchanged recovery does not mutate (${settings})`, () => {
        const styles = new Map(), attrs = new Map(), writes = [];
        const el = {
            style: {
                getPropertyValue: key => styles.get(key)?.value || '',
                getPropertyPriority: key => styles.get(key)?.priority || '',
                setProperty(key, value, priority) { styles.set(key, { value, priority }); writes.push([key, value]); },
                removeProperty(key) { styles.delete(key); writes.push([key, null]); },
            },
            getAttribute: key => attrs.get(key) ?? null,
            setAttribute(key, value) { attrs.set(key, value); writes.push([key, value]); },
            removeAttribute(key) { attrs.delete(key); writes.push([key, null]); },
        };
        const context = harness({ window: { getComputedStyle: () => ({ fontWeight: '700' }) } });
        const props = { 'font-family': 'Test', 'font-weight': 400 };
        if (settings) props['font-variation-settings'] = settings;
        const original = { ...props };
        context.applyTmiProtection(el, props, 400);
        assert.deepEqual(writes.filter(([key]) => key === 'font-weight'), [['font-weight', '700']]);
        assert.equal(styles.get('font-variation-settings').value, settings ? '"wght" 700, "wdth" 90' : '"wght" 700');
        assert.deepEqual(props, original, 'Shared configuration remains unchanged');
        writes.length = 0;
        context.applyTmiProtection(el, props, 400);
        assert.deepEqual(writes, [], 'Already-correct protected state must not be mutated');
    });
}

function recoveryHarness() {
    const calls = [], spa = new Set(), focus = new Set();
    const context = harness({
        document: { hidden: false }, inlineConfigs: { sans: {} }, inlineObserverWanted: true,
        fontSizeScaleConfigs: { sans: { fontSizeScale: 120 }, body: { fontSizeScale: 110 } },
        getActiveFontSizeScaleTypes: () => ['sans', 'body'],
        hasFontSizeScale: config => config?.fontSizeScale != null,
        usesHybridInlineTmiSelectors: () => true,
        applyFontSizeScale: (_, type) => calls.push(type),
        reapplyAllInlineStyles() { Object.keys(context.inlineConfigs).forEach(type => calls.push(type)); },
        checkExpiredInlineTypes() {}, ensureSharedInlinePolling() {}, ensureSharedDomObserver() {},
        registerSpaHandler: fn => spa.add(fn), registerFocusHandler: fn => focus.add(fn),
    });
    return { context, calls, spa, focus };
}

test('inline and scale consumers register one recovery handler and scale each type once', () => {
    const h = recoveryHarness();
    h.context.registerSpaHandler(h.context.reapplyPageTypographyAfterNavigation);
    h.context.registerFocusHandler(h.context.resumeInlineStylesOnFocus);
    h.context.ensureFontSizeScaleObserver();
    assert.equal(h.spa.size, 1);
    assert.equal(h.focus.size, 1);
    for (const handlers of [h.spa, h.focus]) {
        h.calls.length = 0;
        handlers.forEach(fn => fn());
        assert.deepEqual(h.calls, ['sans', 'body']);
    }
});

test('focus still recovers scale-only types when inline configs expire', () => {
    const h = recoveryHarness();
    h.context.checkExpiredInlineTypes = () => { h.context.inlineConfigs = {}; };
    h.context.resumeInlineStylesOnFocus();
    assert.deepEqual(h.calls, ['sans', 'body']);
    h.calls.length = 0;
    h.context.document.hidden = true;
    h.context.resumeInlineStylesOnFocus();
    assert.deepEqual(h.calls, []);
});

test('non-inline TMI navigation retains classification before scaling', () => {
    const h = recoveryHarness();
    h.context.inlineConfigs = {};
    h.context.usesHybridInlineTmiSelectors = () => false;
    h.context.rewalkTmiTypes = (types, done) => {
        assert.deepEqual(Array.from(types), ['sans']);
        h.calls.push('walk');
        done();
    };
    h.context.reapplyPageTypographyAfterNavigation();
    assert.deepEqual(h.calls, ['walk', 'sans', 'body']);
});
