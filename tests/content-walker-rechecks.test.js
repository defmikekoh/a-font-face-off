const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/content.js'), 'utf8');
const scheduler = source.slice(source.indexOf('  function scheduleElementWalkerRechecks('),
    source.indexOf('  // Unified element walker —'));

function createHarness({ isChatGpt = false, elements = 69, fontsLoading = true } = {}) {
    const timers = [];
    const scans = [];
    let resolveFonts;
    const ready = new Promise(resolve => { resolveFonts = resolve; });
    const context = vm.createContext({
        document: { fonts: { status: fontsLoading ? 'loading' : 'loaded', ready } },
        isChatGpt,
        currentOrigin: 'www.thedeepview.com',
        lastWalkElementCount: elements,
        LARGE_PAGE_ELEMENT_THRESHOLD: 5000,
        elementWalkerRechecksScheduled: {},
        elementWalkerCompleted: { serif: true, sans: true },
        setTimeout(callback, delay) { timers.push({ callback, delay }); },
        runElementWalkerAll(types) {
            assert.ok(types.every(type => context.elementWalkerCompleted[type] === false));
            scans.push(Array.from(types));
            types.forEach(type => { context.elementWalkerCompleted[type] = true; });
        },
        debugLog() {},
    });
    vm.runInContext(scheduler, context);
    return {
        context, timers, scans,
        schedule: types => context.scheduleElementWalkerRechecks(types),
        async fontsReady() {
            context.document.fonts.status = 'loaded';
            resolveFonts();
            await ready;
            await Promise.resolve();
        },
        fireTimer() { timers.shift().callback(); },
    };
}

describe('TMI walker rechecks', () => {
    it('shares the original safety pass when fonts become ready before its deadline', async () => {
        const h = createHarness();
        h.schedule(['serif', 'sans']);
        const originalTimer = h.timers[0];
        await h.fontsReady();
        assert.deepEqual(h.scans, [], 'Font readiness must not start an extra scan');
        assert.equal(h.timers.length, 1);
        assert.equal(h.timers[0], originalTimer, 'Keep the safety deadline for late page content');
        assert.equal(originalTimer.delay, 700);
        h.fireTimer();
        assert.deepEqual(h.scans, [['serif', 'sans']]);
    });

    it('rechecks again when fonts finish after the safety pass', async () => {
        const h = createHarness();
        h.schedule(['sans']);
        h.fireTimer();
        assert.deepEqual(h.scans, [['sans']]);
        await h.fontsReady();
        assert.deepEqual(h.scans, [['sans'], ['sans']]);
    });

    for (const options of [{ isChatGpt: true }, { elements: 5000 }]) {
        it(`retains font-ready coverage without a timed pass: ${JSON.stringify(options)}`, async () => {
            const h = createHarness(options);
            h.schedule(['serif']);
            assert.equal(h.timers.length, 0);
            await h.fontsReady();
            assert.deepEqual(h.scans, [['serif']]);
        });
    }

    it('keeps only the safety pass when fonts were already loaded', async () => {
        const h = createHarness({ fontsLoading: false });
        h.schedule(['sans']);
        h.fireTimer();
        await h.fontsReady();
        assert.deepEqual(h.scans, [['sans']]);
    });

    it('does not schedule the same types again while waiting for fonts', async () => {
        const h = createHarness();
        h.schedule(['serif', 'sans']);
        h.schedule(['sans']);
        h.schedule(['serif', 'sans']);
        h.fireTimer();
        await h.fontsReady();
        assert.equal(h.timers.length, 0);
        assert.deepEqual(h.scans, [['serif', 'sans'], ['serif', 'sans']]);
    });
});
