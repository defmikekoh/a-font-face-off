const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cloneArrayBuffer(buffer) {
    return buffer.slice(0);
}

function cloneEntry(entry) {
    if (!entry) return entry;
    return {
        url: entry.url,
        data: cloneArrayBuffer(entry.data),
        timestamp: entry.timestamp,
        size: entry.size
    };
}

function createFakeIndexedDB() {
    const stores = new Map();

    function getStoreRecord(name) {
        const record = stores.get(name);
        if (!record) throw new Error(`Object store not found: ${name}`);
        return record;
    }

    function scheduleTransactionComplete(transaction) {
        if (!transaction || transaction._completed || transaction._pending > 0 || transaction._completeScheduled) return;
        transaction._completeScheduled = true;
        setTimeout(() => {
            transaction._completeScheduled = false;
            if (transaction._completed || transaction._pending > 0) return;
            transaction._completed = true;
            if (typeof transaction.oncomplete === 'function') transaction.oncomplete();
        }, 0);
    }

    function startTransactionRequest(transaction) {
        if (transaction && !transaction._completed) transaction._pending++;
    }

    function finishTransactionRequest(transaction) {
        if (!transaction || transaction._completed) return;
        transaction._pending = Math.max(0, transaction._pending - 1);
        scheduleTransactionComplete(transaction);
    }

    function makeRequestSuccess(transaction, valueFactory) {
        const request = {};
        startTransactionRequest(transaction);
        setTimeout(() => {
            try {
                request.result = valueFactory();
                if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
                finishTransactionRequest(transaction);
            } catch (e) {
                request.error = e;
                if (typeof request.onerror === 'function') request.onerror({ target: request });
                if (transaction && typeof transaction.onerror === 'function') {
                    transaction.error = e;
                    transaction.onerror({ target: transaction });
                }
            }
        }, 0);
        return request;
    }

    function createObjectStoreApi(record, transaction) {
        return {
            indexNames: {
                contains(name) {
                    return record.indexes.has(name);
                }
            },
            createIndex(name) {
                record.indexes.add(name);
            },
            get(url) {
                return makeRequestSuccess(transaction, () => cloneEntry(record.entries.get(url)));
            },
            put(entry) {
                return makeRequestSuccess(transaction, () => {
                    record.entries.set(entry.url, cloneEntry(entry));
                    return entry.url;
                });
            },
            delete(url) {
                return makeRequestSuccess(transaction, () => {
                    record.entries.delete(url);
                    return undefined;
                });
            },
            clear() {
                return makeRequestSuccess(transaction, () => {
                    record.entries.clear();
                    return undefined;
                });
            },
            openCursor() {
                const request = {};
                const rows = Array.from(record.entries.entries()).map(([key, value]) => [key, cloneEntry(value)]);
                let index = 0;
                startTransactionRequest(transaction);

                function deliver() {
                    const row = rows[index];
                    if (!row) {
                        request.result = null;
                        if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
                        finishTransactionRequest(transaction);
                        return;
                    }

                    const key = row[0];
                    request.result = {
                        key,
                        value: cloneEntry(row[1]),
                        delete() {
                            record.entries.delete(key);
                        },
                        continue() {
                            index++;
                            setTimeout(deliver, 0);
                        }
                    };
                    if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
                }

                setTimeout(deliver, 0);
                return request;
            }
        };
    }

    function createTransaction() {
        const transaction = {
            _pending: 0,
            _completed: false,
            _completeScheduled: false,
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore(name) {
                return createObjectStoreApi(getStoreRecord(name), transaction);
            }
        };
        setTimeout(() => scheduleTransactionComplete(transaction), 0);
        return transaction;
    }

    function createDb() {
        return {
            objectStoreNames: {
                contains(name) {
                    return stores.has(name);
                }
            },
            createObjectStore(name) {
                const record = { entries: new Map(), indexes: new Set() };
                stores.set(name, record);
                return createObjectStoreApi(record, null);
            },
            transaction(name) {
                getStoreRecord(name);
                return createTransaction();
            },
            close() {}
        };
    }

    return {
        open() {
            const request = {};
            setTimeout(() => {
                const db = createDb();
                request.result = db;
                request.transaction = createTransaction();
                if (typeof request.onupgradeneeded === 'function') {
                    request.onupgradeneeded({ target: request });
                }
                setTimeout(() => {
                    if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
                }, 0);
            }, 0);
            return request;
        }
    };
}

function createStorage(seed = {}) {
    const data = { ...seed };
    return {
        data,
        local: {
            async get(key) {
                if (typeof key === 'string') return { [key]: data[key] };
                return { ...data };
            },
            async set(items) {
                Object.assign(data, items);
            },
            async remove(keys) {
                const arr = Array.isArray(keys) ? keys : [keys];
                arr.forEach(key => { delete data[key]; });
            }
        }
    };
}

function loadRuntime({ fetchImpl, indexedDB, storageSeed } = {}) {
    const storage = createStorage(storageSeed);
    const context = vm.createContext({
        console,
        browser: {
            storage: { local: storage.local },
            runtime: { getURL(file) { return `moz-extension://test/${file}`; } }
        },
        fetch: fetchImpl || (async () => ({ ok: true, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) })),
        indexedDB,
        performance: { now: () => 0 },
        setTimeout,
        clearTimeout,
        AbortController: globalThis.AbortController,
        ArrayBuffer,
        Uint8Array,
        Promise,
        Date,
        AFFO_DEBUG: false,
        affoParseGfMetadataText: () => ({}),
        affoGetMetadataFamilies: () => [],
        affoBuildCss2UrlFromMetadata: () => ''
    });

    const sourcePath = path.join(__dirname, '..', 'src', 'background-font-runtime.js');
    vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: 'background-font-runtime.js' });
    return { runtime: context.AFFOBackgroundFontRuntime, storage };
}

describe('background font runtime cache', () => {
    it('stores binary font responses in IndexedDB and returns cache hits as ArrayBuffers', async () => {
        let fetchCount = 0;
        const { runtime } = loadRuntime({
            indexedDB: createFakeIndexedDB(),
            fetchImpl: async () => {
                fetchCount++;
                return {
                    ok: true,
                    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
                    text: async () => ''
                };
            }
        });

        const first = await runtime.handleFetchMessage({
            type: 'affoFetch',
            url: 'https://fonts.gstatic.com/test.woff2',
            binary: true
        });
        assert.equal(first.ok, true);
        assert.equal(first.cached, false);
        assert.deepEqual(Array.from(new Uint8Array(first.data)), [1, 2, 3, 4]);

        await runtime.flushCacheWrites();

        const info = await runtime.getCacheInfo();
        assert.equal(info.ok, true);
        assert.equal(info.backend, 'indexedDB');
        assert.equal(info.count, 1);
        assert.equal(info.totalSize, 4);

        const second = await runtime.handleFetchMessage({
            type: 'affoFetch',
            url: 'https://fonts.gstatic.com/test.woff2',
            binary: true
        });
        assert.equal(second.ok, true);
        assert.equal(second.cached, true);
        assert.equal(fetchCount, 1);
        assert.deepEqual(Array.from(new Uint8Array(second.data)), [1, 2, 3, 4]);
    });

    it('clears IndexedDB cache and removes the legacy storage.local cache key', async () => {
        const { runtime, storage } = loadRuntime({
            indexedDB: createFakeIndexedDB(),
            storageSeed: { affoFontCache: { legacy: true } },
            fetchImpl: async () => ({
                ok: true,
                arrayBuffer: async () => new Uint8Array([5, 6]).buffer,
                text: async () => ''
            })
        });

        await runtime.handleFetchMessage({
            type: 'affoFetch',
            url: 'https://fonts.gstatic.com/clear-me.woff2',
            binary: true
        });
        await runtime.flushCacheWrites();

        assert.equal((await runtime.getCacheInfo()).count, 1);
        await runtime.clearCache();

        assert.equal((await runtime.getCacheInfo()).count, 0);
        assert.equal(storage.data.affoFontCache, undefined);
    });

    it('coalesces concurrent binary fetches before the IndexedDB write flushes', async () => {
        let fetchCount = 0;
        const { runtime } = loadRuntime({
            indexedDB: createFakeIndexedDB(),
            fetchImpl: async () => {
                fetchCount++;
                await new Promise(resolve => setTimeout(resolve, 5));
                return {
                    ok: true,
                    arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
                    text: async () => ''
                };
            }
        });

        const [first, second] = await Promise.all([
            runtime.handleFetchMessage({
                type: 'affoFetch',
                url: 'https://fonts.gstatic.com/coalesce.woff2',
                binary: true
            }),
            runtime.handleFetchMessage({
                type: 'affoFetch',
                url: 'https://fonts.gstatic.com/coalesce.woff2',
                binary: true
            })
        ]);

        assert.equal(fetchCount, 1);
        assert.equal(first.ok, true);
        assert.equal(second.ok, true);
        assert.equal(first.cached, false);
        assert.equal(second.cached, false);
        assert.deepEqual(Array.from(new Uint8Array(first.data)), [9, 8, 7]);
        assert.deepEqual(Array.from(new Uint8Array(second.data)), [9, 8, 7]);
    });

    it('caches text fetches in memory for repeated Google CSS requests', async () => {
        let fetchCount = 0;
        const { runtime } = loadRuntime({
            indexedDB: createFakeIndexedDB(),
            fetchImpl: async () => {
                fetchCount++;
                return {
                    ok: true,
                    arrayBuffer: async () => new ArrayBuffer(0),
                    text: async () => '@font-face { font-family: Test; }'
                };
            }
        });

        const first = await runtime.handleFetchMessage({
            type: 'affoFetch',
            url: 'https://fonts.googleapis.com/css2?family=Test',
            binary: false
        });
        const second = await runtime.handleFetchMessage({
            type: 'affoFetch',
            url: 'https://fonts.googleapis.com/css2?family=Test',
            binary: false
        });

        assert.equal(fetchCount, 1);
        assert.equal(first.cached, false);
        assert.equal(second.cached, true);
        assert.equal(second.data, '@font-face { font-family: Test; }');
    });
});
