const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');

const source = fs.readFileSync(require.resolve('../src/content.js'), 'utf8');
const names = new Set(['registerFocusHandler', 'stopSharedInlinePolling',
    'maybeStopSharedInlinePollingForQuietPage', 'pauseInlinePollingWhenHidden',
    'resumeInlineStylesOnFocus', 'ensureSharedInlinePolling', 'checkExpiredInlineTypes',
    'cleanupSharedInlineInfra']);
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

function harness(hidden = false) {
    let now = 1000, nextId = 0;
    const timers = new Map(), listeners = new Map(), checks = [];
    const listen = (event, callback) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(callback);
    };
    const timer = (callback, delay, interval = false) => {
        timers.set(++nextId, { callback, at: now + delay, delay, interval });
        return nextId;
    };
    const context = vm.createContext({
        document: { hidden, addEventListener: listen }, window: { addEventListener: listen },
        Date: { now: () => now },
        setTimeout: (fn, ms) => timer(fn, ms), setInterval: (fn, ms) => timer(fn, ms, true),
        clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
        inlineConfigs: { body: { expiresAt: now + 180000 } }, inlineObserverWanted: true,
        sharedInlineTimers: [], sharedInlineCleanupTimer: null, sharedInlinePollingStartedAt: 0,
        sharedInlineLastActivityAt: now, inlinePollingVisibilityHookInstalled: false,
        focusHandlers: [], focusHooksInstalled: false,
        INLINE_POLLING_TOTAL_MS: 180000, INLINE_POLLING_QUIET_STOP_MS: 45000,
        shouldUseInlineApply: () => true, debugLog() {}, maybeCleanupSharedDomObserver() {},
        reapplyAllInlineStyles(options) { checks.push({ at: now, verifyFirst: !!options?.verifyFirst }); }
    });
    vm.runInContext(functions.join('\n'), context);
    context.ensureSharedInlinePolling();
    context.registerFocusHandler(context.resumeInlineStylesOnFocus);
    return {
        context, timers, checks, listeners,
        visibility(value) {
            context.document.hidden = value;
            listeners.get('visibilitychange').forEach(fn => fn());
        },
        advance(ms) {
            const end = now + ms;
            for (;;) {
                const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                const [id, t] = next;
                now = t.at;
                if (t.interval) t.at += t.delay;
                else timers.delete(id);
                t.callback();
            }
            now = end;
        }
    };
}

test('hidden tabs cancel periodic timers and verify immediately on return without duplicating timers', () => {
    const h = harness();
    h.advance(3100);
    assert.equal(h.checks.length, 1);
    const deadline = h.timers.get(h.context.sharedInlineCleanupTimer).at;
    h.visibility(true);
    assert.equal(h.context.sharedInlineTimers.length, 0);
    assert.equal(h.timers.size, 1, 'Only lifecycle expiry remains scheduled');
    h.advance(15000);
    assert.equal(h.checks.length, 1);
    h.visibility(false);
    assert.equal(h.checks.length, 2);
    assert.equal(h.checks[1].verifyFirst, false, 'Focus recovery still repairs all protected elements');
    const timerCount = h.timers.size;
    h.context.ensureSharedInlinePolling();
    assert.equal(h.timers.size, timerCount);
    assert.equal(h.timers.get(h.context.sharedInlineCleanupTimer).at, deadline);
    h.advance(3100);
    assert.equal(h.checks.length, 3);
});

test('starting hidden does not create polling timers; returning after the fast phase uses slow polling', () => {
    const h = harness(true);
    assert.equal(h.timers.size, 1);
    h.advance(35000);
    assert.equal(h.checks.length, 0);
    h.visibility(false);
    assert.equal(h.checks.length, 1);
    h.advance(1000);
    const intervals = [...h.timers.values()].filter(t => t.interval);
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].delay, 10000);
    assert.equal(h.listeners.get('visibilitychange').length, 2, 'One pause hook and the existing shared focus hook');
});

test('expiry still runs while hidden and returning cannot resurrect expired configs', () => {
    const h = harness(true);
    h.advance(180001);
    assert.equal(h.context.inlineObserverWanted, false);
    assert.equal(h.timers.size, 0);
    h.visibility(false);
    assert.equal(h.checks.length, 0);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(Object.keys(h.context.inlineConfigs), []);
});

test('a queued polling callback cannot verify styles after visibility changes', () => {
    const h = harness();
    h.advance(1000);
    const pending = [...h.timers.values()].find(t => t.interval).callback;
    h.visibility(true);
    pending();
    assert.equal(h.checks.length, 0);
});

test('focus while hidden is ignored, and cleanup prevents polling resumption', () => {
    const h = harness(true);
    h.context.resumeInlineStylesOnFocus();
    assert.equal(h.checks.length, 0);
    h.context.cleanupSharedInlineInfra();
    h.visibility(false);
    assert.equal(h.context.sharedInlineTimers.length, 0);
    assert.equal(h.timers.size, 0);
});
