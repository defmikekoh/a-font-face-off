const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');

const source = fs.readFileSync(require.resolve('../src/content.js'), 'utf8');
const names = new Set([
    'discoverInlineBatchSources', 'inlineTypographyNeedsRepair', 'inlineFontSizeNeedsRepair',
    'applyInlineFontSizeScale', 'reapplyAllInlineStylesNow',
    'prepareInlineProperty', 'prepareInlineComparisons', 'inlinePropertyNeedsRepair', 'applyPreparedInlineProperty',
    'applyTmiProtectionBatch', 'inlineGroupIsCurrent', 'inlineGroupElements', 'tmiProtectionBatchSteps', 'resetHeadingTypographySteps',
    'restorePreparedFontSwapAnchor', 'canonicalInlineValue', 'queueInlineWork', 'scheduleInlineWorkChunk', 'inlineElementNeedsRepair',
    'prepareTmiProtection', 'applyTmiProtection', 'applyAffoProtection', 'setImportantStyleIfChanged',
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
    const context = vm.createContext({
        inlineCssValues: new Map(), inlineCssParser: null,
        inlineWorkQueue: [], pendingInlineWorkChunk: null, pendingTmiProtectionBatch: null, inlineConfigs: {},
        getAffoNow: () => performance.now(), setTimeout, clearTimeout,
        usesHybridInlineTmiSelectors: () => false, isXCom: false,
        getArticleDeckExcludeSelector: () => '', shouldUseAggressive: () => false,
        getAffoSelector: () => '[data-affo-font-type]',
        hasFontSizeScale: () => false,
        document: { createElement: () => ({ style: {
            value: '', set cssText(_value) { this.value = ''; },
            setProperty(_prop, value) { this.value = value; },
            getPropertyValue() { return this.value; },
        } }) },
        ...overrides,
    });
    vm.runInContext(functions.join('\n'), context);
    return context;
}

test('TMI snapshots every weight before any style write and refreshes non-bold nodes on reuse', async () => {
    const events = [];
    const elements = [0, 1, 2].map(id => ({ id, weight: '400', getAttribute: () => null, isConnected: true, matches: () => true, closest: () => null }));
    const context = harness({
        window: { getComputedStyle(el) { events.push('read:' + el.id); return { fontWeight: el.weight }; } },
        filterInlineTmiTargets: (_, targets) => targets,
        applyAffoTextColor() {},
    });
    context.applyTmiProtection = (el, _cfg, bold) => events.push('write:' + el.id + ':' + bold);
    context.inlineConfigs.sans = { comparison: {} };
    await context.applyTmiProtectionToElements(elements, context.inlineConfigs.sans, 'sans');
    assert.deepEqual(events, ['read:0', 'read:1', 'read:2', 'write:0:false', 'write:1:false', 'write:2:false']);
    events.length = 0;
    elements[1].weight = '700';
    await context.applyTmiProtectionToElements(elements, context.inlineConfigs.sans, 'sans');
    assert.equal(events[4], 'write:1:true', 'Reused nodes must not retain a cached non-bold result');
});

for (const settings of [undefined, '"wght" 400, "wdth" 90', '"wght" 400, "GRAD" 50']) {
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
        const cfg = { cssPropsObject: props, inlineEffectiveWeight: 400, tmiProtection: context.prepareTmiProtection(props, 400) };
        context.buildBoldAxisSettings = () => { throw new Error('Axes must be prepared before per-element application'); };
        context.applyTmiProtection(el, cfg);
        assert.deepEqual(writes.filter(([key]) => key === 'font-weight'), [['font-weight', '700']]);
        assert.equal(styles.get('font-variation-settings').value, settings ? settings.replace('"wght" 400', '"wght" 700') : '"wght" 700');
        assert.deepEqual(props, original, 'Shared configuration remains unchanged');
        writes.length = 0;
        context.applyTmiProtection(el, cfg);
        assert.deepEqual(writes, [], 'Already-correct protected state must not be mutated');
    });
}

test('prepared protection preserves normal properties and leaves unspecified weight alone', () => {
    const context = harness({});
    const props = { 'font-family': 'Test', 'font-variation-settings': '"GRAD" 50' };
    const cfg = { cssPropsObject: props, inlineEffectiveWeight: null, tmiProtection: context.prepareTmiProtection(props, null) };
    const calls = [];
    context.applyAffoProtection = (_el, finalProps, entries) => calls.push({ finalProps, entries });
    context.applyTmiProtection({}, cfg, true);
    context.applyTmiProtection({}, cfg, false);
    for (const call of calls) {
        assert.equal(call.finalProps, props);
        assert.deepEqual(Array.from(call.entries, entry => Array.from(entry)), Object.entries(props));
        assert.equal(call.finalProps['font-weight'], undefined);
    }
    const weighted = context.prepareTmiProtection({ ...props, 'font-weight': 450 }, 450);
    assert.equal(weighted.boldProps['font-weight'], '700');
    assert.equal(weighted.boldProps['font-variation-settings'], '"GRAD" 50, "wght" 700');
    assert.equal(context.prepareTmiProtection({ ...props, 'font-weight': 500 }, 500).normalEntries.find(([key]) => key === 'font-weight')[1], 500);
});

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

function queuedHarness() {
    const timers = new Map();
    const events = [];
    let time = 0, id = 0;
    const context = harness({
        setTimeout(fn) { timers.set(++id, fn); return id; },
        clearTimeout(key) { timers.delete(key); },
        getAffoNow() { return time; },
        window: { getComputedStyle(el) { time += 3; events.push('read:' + el.id); return { fontWeight: '400' }; } },
        applyAffoTextColor() {},
    });
    context.applyTmiProtection = el => { time += 3; events.push('write:' + el.id); };
    const cfg = { comparison: {} };
    context.inlineConfigs.sans = cfg;
    const elements = Array.from({ length: 9 }, (_, id) => ({
        id, isConnected: true, guarded: false, matches: () => true,
        closest() { return this.guarded ? {} : null; }, getAttribute: key => key === 'data-affo-font-type' ? 'sans' : null,
    }));
    function flush() {
        const first = timers.entries().next().value;
        if (first) { timers.delete(first[0]); first[1](); }
    }
    return { context, cfg, elements, events, timers, flush };
}

test('inline queue yields during reads and writes, rechecks guards, and settles after all writes', async () => {
    const h = queuedHarness();
    let done = false;
    const promise = h.context.applyTmiProtectionToElements(h.elements, h.cfg, 'sans').then(count => { done = true; return count; });
    h.flush();
    assert.equal(h.events.length, 3);
    assert.equal(done, false);
    h.flush(); h.flush();
    assert.equal(h.events.length, 9);
    assert.ok(h.events.every(event => event.startsWith('read:')));
    h.elements[4].isConnected = false;
    h.elements[5].guarded = true;
    h.flush();
    assert.equal(done, false);
    while (h.timers.size) h.flush();
    assert.equal(await promise, 7);
    assert.equal(h.events.includes('write:4'), false);
    assert.equal(h.events.includes('write:5'), false);
    assert.equal(h.context.pendingInlineWorkChunk, null);
});

for (const action of ['reset', 'replace']) {
    test(`inline queue stops stale writes on ${action} and continues newer work`, async () => {
        const h = queuedHarness();
        const first = h.context.applyTmiProtectionToElements(h.elements, h.cfg, 'sans');
        h.flush(); h.flush(); h.flush(); h.flush();
        const writes = h.events.filter(event => event.startsWith('write:')).length;
        assert.equal(writes, 3);
        if (action === 'reset') delete h.context.inlineConfigs.sans;
        else h.context.inlineConfigs.sans = {};
        while (h.timers.size) h.flush();
        await first;
        assert.equal(h.events.filter(event => event.startsWith('write:')).length, writes);
        const next = { comparison: {} };
        h.context.inlineConfigs.sans = next;
        const second = h.context.applyTmiProtectionToElements(h.elements, next, 'sans');
        while (h.timers.size) h.flush();
        assert.equal(await second, 9);
    });
}

test('CSSOM-normalized comparison skips equivalent values but repairs changed values and priority', () => {
    const values = new Map(), priorities = new Map(), attributes = new Map();
    let parses = 0, writes = 0;
    const context = harness({
        document: { createElement: () => ({ style: {
            value: '', set cssText(_value) { this.value = ''; },
            setProperty(_prop, value) { parses++; this.value = value.replace('"Times New Roman"', 'Times New Roman').replace('#ff0000', 'rgb(255, 0, 0)'); },
            getPropertyValue() { return this.value; },
        } }) },
        canApplyAffoTextColor: () => true,
    });
    const el = {
        getAttribute: name => attributes.get(name) || null,
        style: {
            getPropertyValue: prop => values.get(prop) || '',
            getPropertyPriority: prop => priorities.get(prop) || '',
            setProperty(prop, value, priority) { writes++; values.set(prop, value); priorities.set(prop, priority); },
        },
    };
    const cfg = { cssPropsObject: { 'font-family': '"Times New Roman", serif' }, fontConfig: { fontColor: '#ff0000' } };
    cfg.comparison = context.prepareInlineComparisons(cfg, 'sans');
    attributes.set('data-affo-protected', 'true');
    attributes.set('data-affo-font-name', cfg.cssPropsObject['font-family']);
    attributes.set('data-affo-font-family', cfg.cssPropsObject['font-family']);
    attributes.set('data-affo-color', '#ff0000');
    values.set('--affo-font-family', cfg.cssPropsObject['font-family']);
    values.set('--affo-color', '#ff0000');
    priorities.set('--affo-font-family', 'important');
    priorities.set('--affo-color', 'important');
    values.set('font-family', 'Times New Roman, serif'); priorities.set('font-family', 'important');
    values.set('color', 'rgb(255, 0, 0)'); priorities.set('color', 'important');
    assert.equal(context.inlineElementNeedsRepair(el, cfg, 'sans'), false);
    context.setImportantStyleIfChanged(el, 'font-family', cfg.cssPropsObject['font-family']);
    context.setImportantStyleIfChanged(el, 'color', cfg.fontConfig.fontColor);
    assert.equal(writes, 0);
    assert.equal(parses, 2, 'Parsed expectations are reused across verification and writes');
    priorities.set('font-family', '');
    assert.equal(context.inlineElementNeedsRepair(el, cfg, 'sans'), true);
    context.setImportantStyleIfChanged(el, 'font-family', cfg.cssPropsObject['font-family']);
    values.set('font-family', 'Other');
    assert.equal(context.inlineElementNeedsRepair(el, cfg, 'sans'), true);
    context.setImportantStyleIfChanged(el, 'font-family', cfg.cssPropsObject['font-family']);
    assert.equal(writes, 2);
    for (let i = 0; i < 300; i++) context.canonicalInlineValue('font-weight', i);
    assert.ok(context.inlineCssValues.size <= 256);
});

test('font-swap restoration waits for replacement application to finish', async () => {
    let finishFirst, finishSecond;
    const first = new Promise(resolve => { finishFirst = resolve; });
    const second = new Promise(resolve => { finishSecond = resolve; });
    let restores = 0;
    const context = harness({
        inlineConfigs: { sans: { application: first } },
        preparedFontSwapAnchors: { sans: {} },
        getPreparedFontSwapAnchor: () => 'anchor', window: {},
        AFFOFontSwapUtils: { restoreViewportAnchorAfterLayout(anchor) { assert.equal(anchor, 'anchor'); restores++; return true; } },
    });
    const completion = context.restorePreparedFontSwapAnchor('sans');
    assert.equal(restores, 0);
    context.inlineConfigs.sans = { application: second };
    finishFirst();
    await Promise.resolve();
    assert.equal(restores, 0);
    delete context.inlineConfigs.sans.application;
    finishSecond();
    assert.equal(await completion, true);
    assert.equal(restores, 1);
});

test('popup continuation advances one bounded chunk without double-running its timer', async () => {
    const h = queuedHarness();
    const promise = h.context.applyTmiProtectionToElements(h.elements, h.cfg, 'sans');
    const resume = h.context.pendingInlineWorkChunk;
    resume();
    assert.equal(h.events.length, 3);
    resume();
    assert.equal(h.events.length, 3);
    while (h.timers.size) h.flush();
    assert.equal(await promise, 9);
});

test('one batch reads every root and type before writing, deduplicating overlapping roots', async () => {
    const h = queuedHarness();
    const serif = { comparison: {} };
    h.context.inlineConfigs.serif = serif;
    const rootA = { isConnected: true, matches: () => false, querySelectorAll: () => h.elements.slice(0, 3) };
    const rootB = { isConnected: true, matches: () => false, querySelectorAll: () => h.elements.slice(2, 5) };
    const promise = h.context.applyTmiProtectionBatch([
        { roots: [rootA, rootB], cfg: h.cfg, fontType: 'sans' },
        { elements: h.elements.slice(5), cfg: serif, fontType: 'serif' },
    ]);
    while (h.timers.size) h.flush();
    await promise;
    assert.deepEqual(h.events.slice(0, 9), h.elements.map(el => 'read:' + el.id));
    assert.deepEqual(h.events.slice(9), h.elements.map(el => 'write:' + el.id));
});

test('ready calls coalesce before reading; a later call starts another batch', async () => {
    const h = queuedHarness();
    const serif = { comparison: {} };
    const mono = { comparison: {} };
    h.context.inlineConfigs.serif = serif;
    h.context.inlineConfigs.mono = mono;
    const one = h.context.applyTmiProtectionToElements(h.elements.slice(0, 3), h.cfg, 'sans');
    const two = h.context.applyTmiProtectionToElements(h.elements.slice(3, 6), serif, 'serif');
    assert.equal(h.context.inlineWorkQueue.length, 1);
    h.flush();
    const three = h.context.applyTmiProtectionToElements(h.elements.slice(6), mono, 'mono');
    assert.equal(h.context.inlineWorkQueue.length, 2);
    while (h.timers.size) h.flush();
    assert.deepEqual(await Promise.all([one, two, three]), [3, 3, 3]);
    assert.deepEqual(h.events.slice(0, 6), h.elements.slice(0, 6).map(el => 'read:' + el.id));
    assert.deepEqual(h.events.slice(6, 12), h.elements.slice(0, 6).map(el => 'write:' + el.id));
});

test('resetting one batched type preserves other types and resets shared headings once', async () => {
    const h = queuedHarness();
    const serif = { comparison: {} };
    h.context.inlineConfigs.serif = serif;
    const headings = [{ isConnected: true, closest: () => null }];
    let queries = 0, headingWrites = 0;
    const root = { isConnected: true, contains: () => true, querySelectorAll() { queries++; return headings; } };
    h.context.setImportantStyleIfChanged = () => { headingWrites++; };
    const one = h.context.applyTmiProtectionToElements(h.elements.slice(0, 3), h.cfg, 'sans', false, [root]);
    const two = h.context.applyTmiProtectionToElements(h.elements.slice(3, 6), serif, 'serif', false, [root]);
    h.flush(); h.flush();
    delete h.context.inlineConfigs.sans;
    while (h.timers.size) h.flush();
    assert.deepEqual(await Promise.all([one, two]), [0, 3]);
    assert.equal(queries, 1);
    assert.equal(headingWrites, 5);
    assert.deepEqual(h.events.filter(event => event.startsWith('write:')), ['write:3', 'write:4', 'write:5']);
});

test('prepared comparison and write records avoid CSS normalization in the per-element path', () => {
    const context = harness({});
    const props = { 'font-family': 'Test', 'font-weight': 450, 'font-variation-settings': '"GRAD" 20' };
    const cfg = { cssPropsObject: props, inlineEffectiveWeight: 450, tmiProtection: context.prepareTmiProtection(props, 450) };
    cfg.comparison = context.prepareInlineComparisons(cfg, 'serif');
    const values = new Map(), priorities = new Map(), attrs = new Map();
    const el = {
        style: {
            getPropertyValue: key => values.get(key) || '', getPropertyPriority: key => priorities.get(key) || '',
            setProperty(key, value, priority) { values.set(key, value); priorities.set(key, priority); },
        },
        getAttribute: key => attrs.get(key) || null, setAttribute(key, value) { attrs.set(key, value); },
    };
    context.canonicalInlineValue = () => { throw Error('Per-element normalization is unnecessary'); };
    context.applyTmiProtection(el, cfg, true);
    assert.equal(context.inlineElementNeedsRepair(el, cfg, 'serif'), false);
    values.set('font-variation-settings', '"GRAD" 1');
    assert.equal(context.inlineElementNeedsRepair(el, cfg, 'serif'), true);
    context.applyTmiProtection(el, cfg, true);
    assert.equal(context.inlineElementNeedsRepair(el, cfg, 'serif'), false);
});

test('empty scale cleanup creates no queued job', async () => {
    const cfg = { fontConfig: {} };
    let jobs = 0, refreshes = 0;
    const context = harness({
        inlineConfigs: { sans: cfg }, fontSizeScaleConfigs: {},
        document: { querySelectorAll: () => [] }, getFontSizeScaleAttr: () => 'data-scale',
        refreshFontSizeScaleObserver: () => { refreshes++; },
    });
    context.queueInlineWork = () => { jobs++; return Promise.resolve(); };
    await context.applyInlineFontSizeScale(cfg, 'sans');
    assert.equal(jobs, 0);
    assert.equal(refreshes, 1);
});

test('recovery handles ready types before waiting for an in-flight Apply, then verifies the completed type', async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const calls = [];
    const sans = { application: pending }, serif = {};
    const context = harness({
        inlineConfigs: { sans, serif },
        document: { body: {}, querySelectorAll: () => [{}] },
    });
    context.applyTmiProtectionBatch = async groups => { groups.forEach(group => { group.candidates = 1; }); calls.push(Array.from(groups, group => group.fontType)); };
    context.applyInlineFontSizeScale = async () => {};
    const recovery = context.reapplyAllInlineStylesNow({ verifyFirst: false });
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(calls, [['serif']]);
    delete sans.application;
    finish();
    await recovery;
    assert.deepEqual(calls, [['serif'], ['sans']]);
});

test('duplicate pending groups verify and write each target once; full application wins over repair-only', async () => {
    for (const order of [[true, false], [false, true], [true, true]]) {
        const h = queuedHarness();
        let checks = 0;
        h.context.inlineTypographyNeedsRepair = () => { checks++; return false; };
        const groups = order.map(repairOnly => ({ elements: h.elements, cfg: h.cfg, fontType: 'sans', repairOnly }));
        const done = h.context.applyTmiProtectionBatch(groups);
        while (h.timers.size) h.flush();
        await done;
        const expectedWrites = order.every(Boolean) ? 0 : h.elements.length;
        assert.equal(h.events.filter(event => event.startsWith('write:')).length, expectedWrites);
        assert.ok(checks <= h.elements.length, 'Overlapping repair groups must share verification');
    }
});

test('marked roots are queried once and partitioned across three types; hybrid selectors stay independent', async () => {
    for (const hybrid of [false, true]) {
        const h = queuedHarness();
        let queries = 0;
        h.context.isXCom = hybrid;
        h.context.usesHybridInlineTmiSelectors = () => hybrid;
        h.context.isHybridInlineTarget = () => true;
        const types = ['sans', 'serif', 'mono'];
        const configs = types.map(() => ({ comparison: {} }));
        types.forEach((type, index) => { h.context.inlineConfigs[type] = configs[index]; });
        h.context.getAffoSelector = type => type;
        h.elements.forEach((el, index) => {
            el.getAttribute = name => name === 'data-affo-font-type' ? types[index % 3] : null;
            el.matches = selector => selector === types[index % 3];
        });
        const root = { isConnected: true, matches: () => false, querySelectorAll(selector) {
            queries++;
            return hybrid ? h.elements.filter(el => el.matches(selector)) : h.elements;
        } };
        const done = h.context.applyTmiProtectionBatch(types.map((type, index) => ({ roots: [root], cfg: configs[index], fontType: type })));
        while (h.timers.size) h.flush();
        await done;
        assert.equal(queries, hybrid ? 3 : 1);
        assert.equal(h.events.filter(event => event.startsWith('write:')).length, 9);
    }
});

test('scale verification ignores non-targets and intentional inheritance, but catches changed size and priority', () => {
    const context = harness({ window: { getComputedStyle: el => ({ getPropertyValue: () => el.computed }) } });
    const cfg = { comparison: { scale: { selector: 'scale', originalAttr: 'original', scaledAttr: 'scaled', factor: 1.25 } } };
    const ancestor = { computed: '20px' };
    const el = {
        matches: () => false, getAttribute: () => null, hasAttribute: () => false,
        parentElement: { closest: () => ancestor }, computed: '20px',
        style: { getPropertyValue: () => '20px', getPropertyPriority: () => '' },
    };
    assert.equal(context.inlineFontSizeNeedsRepair(el, cfg), false, 'Marked nodes outside scaling selector must not trigger polling');
    el.matches = () => true;
    assert.equal(context.inlineFontSizeNeedsRepair(el, cfg), false, 'Inherited scaled pixels need no own scale record');
    el.computed = '16px';
    assert.equal(context.inlineFontSizeNeedsRepair(el, cfg), true);
    el.hasAttribute = () => true; el.getAttribute = () => '16';
    assert.equal(context.inlineFontSizeNeedsRepair(el, cfg), false);
    context.shouldUseAggressive = () => true;
    assert.equal(context.inlineFontSizeNeedsRepair(el, cfg), true, 'Important priority must be restored');
});

test('scale recovery reuses checked targets while retaining unmarked descendants', async () => {
    const cfg = { fontConfig: { fontSizeScale: 125 } };
    const targets = [{ name: 'intact' }, { name: 'damaged' }, { name: 'unmarked link' }];
    const checks = { checked: new WeakSet(targets.slice(0, 2)), repairs: new Set([targets[1]]), full: false };
    const context = harness({
        inlineConfigs: { sans: cfg }, fontSizeScaleConfigs: {},
        hasFontSizeScale: () => true, getFontSizeScaleTargets: () => targets,
        refreshFontSizeScaleObserver() {},
        fontSizeScaleSteps: (_config, _type, elements) => elements,
    });
    let visited;
    context.queueInlineWork = async steps => { visited = Array.from(steps); };
    await context.applyInlineFontSizeScale(cfg, 'sans', null, checks);
    assert.deepEqual(visited, targets.slice(1));
    checks.full = true;
    await context.applyInlineFontSizeScale(cfg, 'sans', null, checks);
    assert.deepEqual(visited, targets, 'A concurrent full Apply invalidates the scale shortcut');
});
