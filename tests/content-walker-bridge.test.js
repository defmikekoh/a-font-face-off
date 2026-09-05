const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/content.js'), 'utf8');

function createWalker() {
    const listeners = new Map();
    const timers = new Map();
    const marked = [];
    let nextTimer = 0;
    let now = 0;
    let scans = 0;
    const context = vm.createContext({
        window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
        document: {
            body: {},
            addEventListener: (name, callback) => listeners.set(name, callback),
            createTreeWalker() {
                scans++;
                let index = 0;
                return { nextNode: () => index < 3 ? { tagName: 'P', index: index++ } : null };
            },
        },
        NodeFilter: { SHOW_ELEMENT: 1 },
        console,
        performance: { now: () => now },
        getAffoNow: () => { now += 10; return now; },
        setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
        clearTimeout: id => timers.delete(id),
        WALKER_YIELD_BUDGET_MS: 8,
        elementWalkerCompleted: {},
        elementWalkerInFlight: {},
        usesHybridInlineTmiSelectors: () => false,
        resetFixedPositionUiCache() {},
        getElementWalkerRoot: () => null,
        isTmiPrunedSubtreeRoot: () => false,
        elementMayOwnTmiText: () => true,
        markElementForTypes(element, style, types, counts) {
            marked.push(element.index);
            Object.keys(types).forEach(type => { counts[type]++; });
        },
        scheduleElementWalkerRechecks() {},
        reapplyActiveFontSizeScales() {},
        debugLog() {},
    });
    // Execute the real scheduler, walker, and popup event bridge with page timers
    // deliberately suspended, matching the Firefox Android source-tab condition.
    const scheduler = source.slice(source.indexOf('  var pendingElementWalkerChunks ='), source.indexOf('  function getElementWalkerRoot()'));
    const walker = source.slice(source.indexOf('  function runElementWalkerAll('), source.indexOf('  function resetWalkerStateForEntry('));
    const bridge = source.slice(source.indexOf('  window.__affoWalkerDone ='), source.indexOf('  // Stable font-swap bridge'));
    vm.runInContext(scheduler + walker + bridge, context);
    return {
        context, timers, marked,
        get scans() { return scans; },
        dispatch: (name, fontType) => listeners.get(name)({ detail: { fontType } }),
    };
}

describe('popup TMI walker bridge', () => {
    it('finishes a chunked scan through popup polls when source-tab timers never fire', async () => {
        const harness = createWalker();
        harness.dispatch('affo-run-walker', 'serif');
        const completion = harness.context.elementWalkerInFlight.serif;
        assert.deepEqual(harness.marked, [0]);
        const staleTimer = harness.timers.values().next().value;

        for (let index = 0; index < 3; index++) {
            harness.dispatch('affo-continue-walker', 'serif');
        }
        await completion;
        assert.deepEqual(harness.marked, [0, 1, 2]);
        assert.equal(harness.context.window.__affoWalkerDone.serif.done, true);
        assert.equal(harness.timers.size, 0);
        staleTimer();
        assert.deepEqual(harness.marked, [0, 1, 2], 'Returning to the tab must not rerun a consumed chunk');
    });

    it('reuses completed classification for repeated font swaps', async () => {
        const harness = createWalker();
        harness.context.elementWalkerCompleted.serif = true;
        for (let index = 0; index < 4; index++) {
            harness.dispatch('affo-run-walker', 'serif');
            await Promise.resolve();
            assert.equal(harness.context.window.__affoWalkerDone.serif.done, true);
        }
        assert.equal(harness.scans, 0);
        assert.equal(harness.timers.size, 0);
    });

    it('shares a pending scan and allows either TMI panel to advance it', async () => {
        const harness = createWalker();
        const completion = harness.context.runElementWalkerAll(['serif', 'sans']);
        harness.dispatch('affo-run-walker', 'sans');
        assert.equal(harness.scans, 1);
        harness.dispatch('affo-continue-walker', 'sans');
        harness.dispatch('affo-continue-walker', 'serif');
        harness.dispatch('affo-continue-walker', 'sans');
        await completion;
        assert.equal(harness.context.window.__affoWalkerDone.sans.count, 3);
        assert.equal(harness.timers.size, 0);
        assert.deepEqual(Object.keys(harness.context.pendingElementWalkerChunks), []);
    });

    it('still scans after navigation or other invalidation clears completion', async () => {
        const harness = createWalker();
        harness.context.elementWalkerCompleted.serif = true;
        harness.context.elementWalkerCompleted.serif = false;
        harness.dispatch('affo-run-walker', 'serif');
        const completion = harness.context.elementWalkerInFlight.serif;
        for (let index = 0; index < 3; index++) harness.dispatch('affo-continue-walker', 'serif');
        await completion;
        assert.equal(harness.scans, 1);
        assert.equal(harness.context.window.__affoWalkerDone.serif.count, 3);
    });

    it('continues normally through timers on an active page', async () => {
        const harness = createWalker();
        const completion = harness.context.runElementWalkerAll(['serif']);
        for (let index = 0; index < 3; index++) harness.timers.values().next().value();
        await completion;
        assert.deepEqual(harness.marked, [0, 1, 2]);
        assert.equal(harness.timers.size, 0);
    });
});
