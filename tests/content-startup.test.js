const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/content.js'), 'utf8');
const startup = source.slice(source.indexOf('(async function'), source.indexOf('  // Classify page base font')) +
    'globalThis.started = true; })();';

async function harness(data = {}, host = 'www.tomsguide.com', body = true) {
    const listeners = new Map();
    let mutation;
    let disconnected = false;
    const document = {
        body: body ? {} : null, head: {}, readyState: 'loading',
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: name => listeners.delete(name)
    };
    const context = vm.createContext({
        document, location: { hostname: host },
        browser: { storage: { local: { get: async () => data } } },
        MutationObserver: class {
            constructor(fn) { mutation = fn; }
            observe() {}
            disconnect() { disconnected = true; }
        }
    });
    vm.runInContext(startup, context);
    const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
    await flush();
    return { context, document, listeners, flush, mutate: () => mutation(), disconnected: () => disconnected };
}

it('early startup is the default; only exact after-parsing or Wait For It domains delay it', async () => {
    for (const [data, host, expected] of [
        [{}, 'www.tomsguide.com', true],
        [{}, 'x.com', true],
        [{}, 'www.thedeepview.com', true],
        [{}, 'tomsguide.com', true],
        [{ affoApplyAfterParsingDomains: [] }, 'www.tomsguide.com', true],
        [{ affoApplyAfterParsingDomains: ['example.com'] }, 'example.com', false],
        [{ affoApplyAfterParsingDomains: ['example.com'] }, 'www.example.com', true],
        [{ affoApplyEarlyDomains: [] }, 'example.com', true],
        [{ affoWaitForItDomains: ['www.tomsguide.com'] }, 'www.tomsguide.com', false]
    ]) {
        const h = await harness(data, host);
        assert.equal(!!h.context.started, expected);
        h.document.readyState = 'interactive';
        h.listeners.get('readystatechange')?.();
        await h.flush();
        assert.equal(h.context.started, true);
        assert.equal(h.listeners.size, 0);
        assert.equal(h.disconnected(), true);
    }
});

it('early startup waits for a body and disconnects its observer afterward', async () => {
    const h = await harness({}, 'www.tomsguide.com', false);
    assert.equal(h.context.started, undefined);
    h.document.body = {};
    h.mutate();
    await h.flush();
    assert.equal(h.context.started, true);
    assert.equal(h.disconnected(), true);
});
