const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createStorageStub(seed = {}) {
    const data = { ...seed };
    const onChangedListeners = [];

    const clone = (value) => {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    };

    const local = {
        async get(keys) {
            if (keys === undefined || keys === null) return clone(data);
            if (typeof keys === 'string') return { [keys]: clone(data[keys]) };
            if (Array.isArray(keys)) {
                const out = {};
                for (const key of keys) out[key] = clone(data[key]);
                return out;
            }
            if (typeof keys === 'object') {
                const out = {};
                for (const [key, fallback] of Object.entries(keys)) {
                    out[key] = key in data ? clone(data[key]) : clone(fallback);
                }
                return out;
            }
            return {};
        },
        async set(items) {
            const changes = {};
            for (const [key, newValueRaw] of Object.entries(items)) {
                const oldValue = clone(data[key]);
                const newValue = clone(newValueRaw);
                const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);
                data[key] = newValue;
                if (changed) {
                    changes[key] = { oldValue, newValue };
                }
            }
            if (Object.keys(changes).length > 0) {
                for (const listener of onChangedListeners) {
                    await listener(changes, 'local');
                }
            }
        },
        async remove(keys) {
            const arr = Array.isArray(keys) ? keys : [keys];
            const changes = {};
            for (const key of arr) {
                if (!(key in data)) continue;
                const oldValue = clone(data[key]);
                delete data[key];
                changes[key] = { oldValue, newValue: undefined };
            }
            if (Object.keys(changes).length > 0) {
                for (const listener of onChangedListeners) {
                    await listener(changes, 'local');
                }
            }
        }
    };

    return {
        data,
        local,
        onChanged: {
            addListener(listener) {
                onChangedListeners.push(listener);
            }
        }
    };
}

function createHarness({ localSeed, remoteManifest, remoteDomains, remoteAppFiles, remoteFileInfo }) {
    const storage = createStorageStub(localSeed);
    const calls = {
        put: [],
        delete: [],
    };
    let putCounter = 0;
    const parseOrRaw = (text) => {
        try {
            return JSON.parse(text);
        } catch (_e) {
            return text;
        }
    };
    const remote = {
        manifest: remoteManifest === null
            ? null
            : JSON.parse(JSON.stringify(remoteManifest || { version: 1, lastSync: 0, items: {} })),
        domains: JSON.parse(JSON.stringify(remoteDomains || {})),
        appFiles: JSON.parse(JSON.stringify(remoteAppFiles || {})),
        fileInfo: JSON.parse(JSON.stringify(remoteFileInfo || {})),
    };
    const remoteRevFromInfo = (info) => {
        if (!info || !info.id) return null;
        const version = String(info.version || '').trim();
        if (version && /^[0-9]+$/.test(version)) {
            return `${String(info.id)}:v${version}`;
        }
        if (!info.modifiedTime) return null;
        const ts = Date.parse(info.modifiedTime);
        if (!Number.isFinite(ts) || ts <= 0) return null;
        return `${String(info.id)}:${Math.floor(ts)}`;
    };
    const fileInfoKey = (folderId, name) => `${folderId}/${name}`;
    const getFallbackInfo = (folderId, name) => {
        const key = fileInfoKey(folderId, name);
        if (Object.prototype.hasOwnProperty.call(remote.fileInfo, key)) {
            return remote.fileInfo[key];
        }
        const hasAppFile = folderId === 'app-folder'
            && name !== 'sync-manifest.json'
            && Object.prototype.hasOwnProperty.call(remote.appFiles, name);
        const hasDomainFile = folderId === 'domains-folder'
            && Object.prototype.hasOwnProperty.call(remote.domains, name);
        if (!hasAppFile && !hasDomainFile) return null;
        return {
            id: `${folderId}:${name}`,
            modifiedTime: '2026-01-01T00:00:00.000Z'
        };
    };
    const setFileInfo = (folderId, name) => {
        putCounter += 1;
        const key = fileInfoKey(folderId, name);
        remote.fileInfo[key] = {
            id: `${folderId}:${name}`,
            version: String(putCounter),
            modifiedTime: new Date(1700000000000 + putCounter).toISOString()
        };
        return remote.fileInfo[key];
    };

    const browserStub = {
        storage: {
            local: storage.local,
            onChanged: storage.onChanged,
        },
        runtime: {
            sendMessage() { return Promise.resolve(); },
            getURL(file) { return `moz-extension://test/${file}`; },
            onMessage: { addListener() {} },
        },
        alarms: {
            create() { return Promise.resolve(); },
            clear() { return Promise.resolve(); },
            onAlarm: { addListener() {} },
        },
        tabs: {
            query() { return Promise.resolve([]); },
            sendMessage() { return Promise.resolve(); },
            create() { return Promise.resolve({ id: 1 }); },
        },
        identity: {
            launchWebAuthFlow() { return Promise.resolve(); },
        },
        browserAction: {
            openPopup() { return Promise.resolve(); },
        },
    };

    const context = vm.createContext({
        console,
        browser: browserStub,
        navigator: { onLine: true, userAgent: 'node-test' },
        fetch: async () => ({ ok: true, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }),
        performance: { now: () => 0 },
        crypto: globalThis.crypto,
        TextEncoder: globalThis.TextEncoder,
        URLSearchParams,
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        setTimeout,
        clearTimeout,
        Promise,
        Date,
    });

    const sourcePath = path.join(__dirname, '..', 'background.js');
    const source = fs.readFileSync(sourcePath, 'utf8') + '\n;globalThis.__affoTest = { runSync };';
    vm.runInContext(source, context, { filename: 'background.js' });

    context.isGDriveConfigured = async () => true;
    context.ensureAppFolder = async () => ({ appFolderId: 'app-folder', domainsFolderId: 'domains-folder' });
    context.gdriveListFiles = async () => Object.keys(remote.domains).map((name) => ({ id: name, name }));
    context.findFile = async (name, folderId) => {
        const info = getFallbackInfo(folderId, name);
        if (!info) return null;
        return JSON.parse(JSON.stringify(info));
    };
    context.gdriveGetFile = async (name, folderId) => {
        if (folderId === 'app-folder' && name === 'sync-manifest.json') {
            if (remote.manifest === null) return { notFound: true };
            return { data: JSON.stringify(remote.manifest) };
        }
        if (folderId === 'app-folder' && Object.prototype.hasOwnProperty.call(remote.appFiles, name)) {
            const value = remote.appFiles[name];
            const info = getFallbackInfo(folderId, name);
            return {
                data: typeof value === 'string' ? value : JSON.stringify(value),
                remoteRev: remoteRevFromInfo(info)
            };
        }
        if (folderId === 'domains-folder' && Object.prototype.hasOwnProperty.call(remote.domains, name)) {
            const value = remote.domains[name];
            const info = getFallbackInfo(folderId, name);
            return {
                data: typeof value === 'string' ? value : JSON.stringify(value),
                remoteRev: remoteRevFromInfo(info)
            };
        }
        return { notFound: true };
    };
    context.gdrivePutFile = async (name, folderId, content, contentType) => {
        calls.put.push({ name, folderId, contentType, content });
        if (folderId === 'app-folder' && name === 'sync-manifest.json') {
            remote.manifest = JSON.parse(content);
        } else if (folderId === 'app-folder') {
            remote.appFiles[name] = contentType === 'application/json' ? parseOrRaw(content) : content;
        } else if (folderId === 'domains-folder') {
            remote.domains[name] = contentType === 'application/json' ? parseOrRaw(content) : content;
        }
        const info = setFileInfo(folderId, name);
        return { id: info.id, remoteRev: remoteRevFromInfo(info) };
    };
    context.gdriveDeleteFile = async (name, folderId) => {
        calls.delete.push({ name, folderId });
        if (folderId === 'domains-folder') {
            delete remote.domains[name];
        }
        delete remote.fileInfo[fileInfoKey(folderId, name)];
    };

    return {
        runSync: context.__affoTest.runSync,
        storageData: storage.data,
        calls,
        remote,
    };
}

function createQueueHarness() {
    const storage = createStorageStub({
        affoGDriveTokens: { accessToken: 'access-token', refreshToken: 'refresh-token' }
    });
    const notifications = [];

    const browserStub = {
        storage: {
            local: storage.local,
            onChanged: storage.onChanged,
        },
        runtime: {
            sendMessage(msg) {
                notifications.push(msg);
                return Promise.resolve();
            },
            getURL(file) { return `moz-extension://test/${file}`; },
            onMessage: { addListener() {} },
        },
        alarms: {
            create() { return Promise.resolve(); },
            clear() { return Promise.resolve(); },
            onAlarm: { addListener() {} },
        },
        tabs: {
            query() { return Promise.resolve([]); },
            sendMessage() { return Promise.resolve(); },
            create() { return Promise.resolve({ id: 1 }); },
        },
        identity: {
            launchWebAuthFlow() { return Promise.resolve(); },
        },
        browserAction: {
            openPopup() { return Promise.resolve(); },
        },
    };

    const context = vm.createContext({
        console,
        browser: browserStub,
        navigator: { onLine: true, userAgent: 'node-test' },
        fetch: async () => ({ ok: true, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }),
        performance: { now: () => 0 },
        crypto: globalThis.crypto,
        TextEncoder: globalThis.TextEncoder,
        URLSearchParams,
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        setTimeout,
        clearTimeout,
        Promise,
        Date,
    });

    const sourcePath = path.join(__dirname, '..', 'background.js');
    const source = fs.readFileSync(sourcePath, 'utf8') + '\n;globalThis.__affoQueue = { enqueueSync };';
    vm.runInContext(source, context, { filename: 'background.js' });

    return {
        enqueueSync: context.__affoQueue.enqueueSync,
        notifications,
        setRunSync(fn) {
            context.runSync = fn;
        },
    };
}

function createSyncMetaHarness() {
    const storage = createStorageStub({
        affoSyncMeta: { lastSync: 0, items: {} }
    });

    const browserStub = {
        storage: {
            local: storage.local,
            onChanged: storage.onChanged,
        },
        runtime: {
            sendMessage() { return Promise.resolve(); },
            getURL(file) { return `moz-extension://test/${file}`; },
            onMessage: { addListener() {} },
        },
        alarms: {
            create() { return Promise.resolve(); },
            clear() { return Promise.resolve(); },
            onAlarm: { addListener() {} },
        },
        tabs: {
            query() { return Promise.resolve([]); },
            sendMessage() { return Promise.resolve(); },
            create() { return Promise.resolve({ id: 1 }); },
        },
        identity: {
            launchWebAuthFlow() { return Promise.resolve(); },
        },
        browserAction: {
            openPopup() { return Promise.resolve(); },
        },
    };

    const context = vm.createContext({
        console,
        browser: browserStub,
        navigator: { onLine: true, userAgent: 'node-test' },
        fetch: async () => ({ ok: true, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }),
        performance: { now: () => 0 },
        crypto: globalThis.crypto,
        TextEncoder: globalThis.TextEncoder,
        URLSearchParams,
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        setTimeout,
        clearTimeout,
        Promise,
        Date,
    });

    const sourcePath = path.join(__dirname, '..', 'background.js');
    const source = fs.readFileSync(sourcePath, 'utf8') + '\n;globalThis.__affoMeta = { markLocalItemModified, markLocalItemDeleted };';
    vm.runInContext(source, context, { filename: 'background.js' });

    return {
        markLocalItemModified: context.__affoMeta.markLocalItemModified,
        markLocalItemDeleted: context.__affoMeta.markLocalItemDeleted,
        storageData: storage.data,
    };
}

function createDriveOpsHarness() {
    const storage = createStorageStub({});
    const calls = [];

    const browserStub = {
        storage: {
            local: storage.local,
            onChanged: storage.onChanged,
        },
        runtime: {
            sendMessage() { return Promise.resolve(); },
            getURL(file) { return `moz-extension://test/${file}`; },
            onMessage: { addListener() {} },
        },
        alarms: {
            create() { return Promise.resolve(); },
            clear() { return Promise.resolve(); },
            onAlarm: { addListener() {} },
        },
        tabs: {
            query() { return Promise.resolve([]); },
            sendMessage() { return Promise.resolve(); },
            create() { return Promise.resolve({ id: 1 }); },
        },
        identity: {
            launchWebAuthFlow() { return Promise.resolve(); },
        },
        browserAction: {
            openPopup() { return Promise.resolve(); },
        },
    };

    const context = vm.createContext({
        console,
        browser: browserStub,
        navigator: { onLine: true, userAgent: 'node-test' },
        fetch: async () => ({ ok: true, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }),
        performance: { now: () => 0 },
        crypto: globalThis.crypto,
        TextEncoder: globalThis.TextEncoder,
        URLSearchParams,
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        setTimeout,
        clearTimeout,
        Promise,
        Date,
    });

    const sourcePath = path.join(__dirname, '..', 'background.js');
    const source = fs.readFileSync(sourcePath, 'utf8') + '\n;globalThis.__affoDriveOps = { gdrivePutFile, gdriveDeleteFile };';
    vm.runInContext(source, context, { filename: 'background.js' });

    return {
        driveOps: context.__affoDriveOps,
        setFindFilesByName(fn) {
            context.findFilesByName = fn;
        },
        setGdriveFetch(fn) {
            context.gdriveFetch = async (url, options = {}) => {
                calls.push({ url, options });
                return fn(url, options);
            };
        },
        calls,
    };
}

describe('Google Drive domain sync regression cases', () => {
    it('pulls remote-only domains instead of deleting them', async () => {
        const harness = createHarness({
            localSeed: {
                affoApplyMap: {},
                affoSyncMeta: { lastSync: 100, items: {} },
            },
            remoteManifest: {
                version: 1,
                lastSync: 200,
                items: {
                    'domains/news.example.json': { modified: 200 }
                }
            },
            remoteDomains: {
                'news.example.json': {
                    body: { fontName: 'Merriweather', variableAxes: {} }
                }
            }
        });

        const result = await harness.runSync();
        assert.equal(result.ok, true);
        assert.deepEqual(harness.calls.delete, []);
        assert.equal(harness.storageData.affoApplyMap['news.example'].body.fontName, 'Merriweather');
        assert.equal(
            harness.storageData.affoSyncMeta.items['domains/news.example.json'].modified,
            200
        );
    });

    it('preserves tombstones and deletes remote domain files for local deletions', async () => {
        const harness = createHarness({
            localSeed: {
                affoApplyMap: {},
                affoSyncMeta: {
                    lastSync: 300,
                    items: {
                        'domains/deleted.example.json': { modified: 300, deletedAt: 300 }
                    }
                },
            },
            remoteManifest: {
                version: 1,
                lastSync: 250,
                items: {
                    'domains/deleted.example.json': { modified: 200 }
                }
            },
            remoteDomains: {
                'deleted.example.json': {
                    body: { fontName: 'Roboto', variableAxes: {} }
                }
            }
        });

        const result = await harness.runSync();
        assert.equal(result.ok, true);
        assert.equal(harness.calls.delete.length, 1);
        assert.deepEqual(harness.calls.delete[0], { name: 'deleted.example.json', folderId: 'domains-folder' });

        const manifestPut = harness.calls.put.find((call) => call.name === 'sync-manifest.json');
        assert.ok(manifestPut, 'expected sync-manifest.json to be updated');
        const savedManifest = JSON.parse(manifestPut.content);
        assert.deepEqual(savedManifest.items['domains/deleted.example.json'], { modified: 300, deletedAt: 300 });
        assert.deepEqual(harness.storageData.affoApplyMap, {});
    });

    it('applies remote tombstones to local state so stale local copies do not survive', async () => {
        const harness = createHarness({
            localSeed: {
                affoApplyMap: {
                    'local.example': { body: { fontName: 'Inter', variableAxes: {} } }
                },
                affoSyncMeta: {
                    lastSync: 120,
                    items: {
                        'domains/local.example.json': { modified: 100 }
                    }
                },
            },
            remoteManifest: {
                version: 1,
                lastSync: 220,
                items: {
                    'domains/local.example.json': { modified: 210, deletedAt: 210 }
                }
            },
            remoteDomains: {}
        });

        const result = await harness.runSync();
        assert.equal(result.ok, true);
        assert.equal(harness.storageData.affoApplyMap['local.example'], undefined);
        assert.deepEqual(
            harness.storageData.affoSyncMeta.items['domains/local.example.json'],
            { modified: 210, deletedAt: 210 }
        );
    });

    it('resolves zero-vs-zero timestamp ties by comparing content instead of skipping', async () => {
        const harness = createHarness({
            localSeed: {
                affoApplyMap: {
                    'tie.example': { body: { fontName: 'LocalFont', variableAxes: {} } }
                },
                affoSyncMeta: {
                    lastSync: 500,
                    items: {}
                },
            },
            remoteManifest: {
                version: 1,
                lastSync: 400,
                items: {}
            },
            remoteDomains: {
                'tie.example.json': { body: { fontName: 'RemoteFont', variableAxes: {} } }
            }
        });

        const result = await harness.runSync();
        assert.equal(result.ok, true);

        const domainPut = harness.calls.put.find((call) =>
            call.folderId === 'domains-folder' && call.name === 'tie.example.json'
        );
        assert.ok(domainPut, 'expected domain file to be rewritten to resolve zero/zero tie');
        const pushedConfig = JSON.parse(domainPut.content);
        assert.equal(pushedConfig.body.fontName, 'LocalFont');
    });

    it('refuses to overwrite when remote revision changed since last seen', async () => {
        const harness = createHarness({
            localSeed: {
                affoApplyMap: {
                    'conflict.example': { body: { fontName: 'LocalFont', variableAxes: {} } }
                },
                affoSyncMeta: {
                    lastSync: 600,
                    items: {
                        'domains/conflict.example.json': {
                            modified: 500,
                            remoteRev: 'domains-folder:conflict.example.json:v1'
                        }
                    }
                },
            },
            remoteManifest: {
                version: 1,
                lastSync: 550,
                items: {
                    'domains/conflict.example.json': { modified: 400 }
                }
            },
            remoteDomains: {
                'conflict.example.json': { body: { fontName: 'RemoteFont', variableAxes: {} } }
            },
            remoteFileInfo: {
                'domains-folder/conflict.example.json': {
                    id: 'domains-folder:conflict.example.json',
                    version: '2',
                    modifiedTime: '2026-01-01T00:00:00.050Z'
                }
            }
        });

        const result = await harness.runSync();
        assert.equal(result.ok, false);

        const domainPut = harness.calls.put.find((call) =>
            call.folderId === 'domains-folder' && call.name === 'conflict.example.json'
        );
        assert.equal(domainPut, undefined);
    });

    it('does not apply remote tombstones destructively before this device has synced', async () => {
        const harness = createHarness({
            localSeed: {
                affoApplyMap: {
                    'fresh-device.example': { body: { fontName: 'Inter', variableAxes: {} } }
                },
                affoSyncMeta: {
                    lastSync: 0,
                    items: {
                        'domains/fresh-device.example.json': { modified: 100 }
                    }
                },
            },
            remoteManifest: {
                version: 1,
                lastSync: 220,
                items: {
                    'domains/fresh-device.example.json': { modified: 210, deletedAt: 210 }
                }
            },
            remoteDomains: {}
        });

        const result = await harness.runSync();
        assert.equal(result.ok, true);
        assert.ok(harness.storageData.affoApplyMap['fresh-device.example']);
        assert.equal(harness.calls.delete.length, 0);
    });
});

describe('Google Drive first-sync behavior', () => {
    it('pulls remote favorites when the manifest is missing instead of overwriting remote data', async () => {
        const harness = createHarness({
            localSeed: {
                affoApplyMap: {},
                affoFavorites: {
                    LocalOnly: { fontName: 'LocalOnly', variableAxes: {} }
                },
                affoFavoritesOrder: ['LocalOnly'],
                affoSyncMeta: { lastSync: 0, items: {} },
            },
            remoteManifest: null,
            remoteDomains: {},
            remoteAppFiles: {
                'favorites.json': {
                    affoFavorites: {
                        RemoteOnly: { fontName: 'RemoteOnly', variableAxes: {} }
                    },
                    affoFavoritesOrder: ['RemoteOnly']
                }
            }
        });

        const result = await harness.runSync();
        assert.equal(result.ok, true);
        assert.equal(harness.storageData.affoFavoritesOrder[0], 'RemoteOnly');
        assert.ok(harness.storageData.affoFavorites.RemoteOnly);

        const favoritesPush = harness.calls.put.find((call) => call.name === 'favorites.json');
        assert.equal(favoritesPush, undefined);
    });
});

describe('Google Drive sync queue behavior', () => {
    it('recovers after a thrown sync error and continues processing later sync requests', async () => {
        const harness = createQueueHarness();
        let runCount = 0;
        harness.setRunSync(async () => {
            runCount += 1;
            if (runCount === 1) {
                throw new Error('boom-once');
            }
            return { ok: true, attempt: runCount };
        });

        await assert.rejects(
            () => harness.enqueueSync({ notifyOnError: false }),
            /boom-once/
        );

        const second = await harness.enqueueSync({ notifyOnError: false });
        assert.equal(second.ok, true);
        assert.equal(runCount, 2);
        assert.equal(harness.notifications.length, 0);
    });
});

describe('Google Drive sync metadata writes', () => {
    it('serializes concurrent local metadata updates so keys are not lost', async () => {
        const harness = createSyncMetaHarness();

        await Promise.all([
            harness.markLocalItemModified('favorites.json'),
            harness.markLocalItemModified('known-serif.json'),
            harness.markLocalItemDeleted('domains/dead.example.json')
        ]);

        const items = harness.storageData.affoSyncMeta.items;
        assert.ok(items['favorites.json']);
        assert.ok(items['known-serif.json']);
        assert.ok(items['domains/dead.example.json']);
        assert.ok(items['domains/dead.example.json'].deletedAt > 0);
    });

    it('keeps previous lastSync when sync completes with errors', async () => {
        const harness = createHarness({
            localSeed: {
                affoApplyMap: {},
                affoSyncMeta: {
                    lastSync: 500,
                    items: {
                        'favorites.json': { modified: 100 }
                    }
                },
            },
            remoteManifest: {
                version: 1,
                lastSync: 600,
                items: {
                    'favorites.json': { modified: 600 }
                }
            },
            remoteDomains: {},
            remoteAppFiles: {
                'favorites.json': '{bad-json'
            }
        });

        const result = await harness.runSync();
        assert.equal(result.ok, false);
        assert.equal(harness.storageData.affoSyncMeta.lastSync, 500);
    });
});

describe('Google Drive duplicate file cleanup behavior', () => {
    it('deletes duplicate files after gdrivePutFile updates the canonical file', async () => {
        const harness = createDriveOpsHarness();
        harness.setFindFilesByName(async () => [
            { id: 'latest-id' },
            { id: 'dup-one' },
            { id: 'dup-two' },
        ]);
        harness.setGdriveFetch(async (url, options) => {
            const method = options.method || 'GET';
            if (method === 'PATCH' && url.includes('/files/latest-id?uploadType=multipart')) {
                return { ok: true, json: async () => ({ id: 'latest-id' }) };
            }
            if (method === 'DELETE' && (url.endsWith('/dup-one') || url.endsWith('/dup-two'))) {
                return { ok: true, status: 204 };
            }
            return { ok: false, status: 500, json: async () => ({}) };
        });

        await harness.driveOps.gdrivePutFile(
            'example.json',
            'domains-folder',
            JSON.stringify({ body: { fontName: 'Inter', variableAxes: {} } }),
            'application/json'
        );

        const deleteCalls = harness.calls.filter((call) => (call.options.method || 'GET') === 'DELETE');
        assert.equal(deleteCalls.length, 2);
        assert.ok(deleteCalls.some((call) => call.url.endsWith('/dup-one')));
        assert.ok(deleteCalls.some((call) => call.url.endsWith('/dup-two')));
    });

    it('removes all duplicate file IDs in gdriveDeleteFile', async () => {
        const harness = createDriveOpsHarness();
        harness.setFindFilesByName(async () => [
            { id: 'dup-a' },
            { id: 'dup-b' },
            { id: 'dup-c' },
        ]);
        harness.setGdriveFetch(async (_url, options) => {
            if ((options.method || 'GET') === 'DELETE') {
                return { ok: true, status: 204 };
            }
            return { ok: false, status: 500 };
        });

        await harness.driveOps.gdriveDeleteFile('stale.json', 'domains-folder');

        const deleteCalls = harness.calls.filter((call) => (call.options.method || 'GET') === 'DELETE');
        assert.equal(deleteCalls.length, 3);
        assert.ok(deleteCalls.some((call) => call.url.endsWith('/dup-a')));
        assert.ok(deleteCalls.some((call) => call.url.endsWith('/dup-b')));
        assert.ok(deleteCalls.some((call) => call.url.endsWith('/dup-c')));
    });
});

describe('Google Drive alarms API fallback', () => {
    it('does not crash when alarms API is unavailable', async () => {
        const storage = createStorageStub({
            affoGDriveTokens: { accessToken: 'access-token', refreshToken: 'refresh-token' }
        });
        const browserStub = {
            storage: {
                local: storage.local,
                onChanged: storage.onChanged,
            },
            runtime: {
                sendMessage() { return Promise.resolve(); },
                getURL(file) { return `moz-extension://test/${file}`; },
                onMessage: { addListener() {} },
            },
            tabs: {
                query() { return Promise.resolve([]); },
                sendMessage() { return Promise.resolve(); },
                create() { return Promise.resolve({ id: 1 }); },
            },
            identity: {
                launchWebAuthFlow() { return Promise.resolve(); },
            },
            browserAction: {
                openPopup() { return Promise.resolve(); },
            },
        };

        const context = vm.createContext({
            console,
            browser: browserStub,
            navigator: { onLine: true, userAgent: 'node-test' },
            fetch: async () => ({ ok: true, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }),
            performance: { now: () => 0 },
            crypto: globalThis.crypto,
            TextEncoder: globalThis.TextEncoder,
            URLSearchParams,
            btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
            setTimeout,
            clearTimeout,
            Promise,
            Date,
        });

        const sourcePath = path.join(__dirname, '..', 'background.js');
        const source = fs.readFileSync(sourcePath, 'utf8') + '\n;globalThis.__affoAlarms = { startSyncAlarm };';
        vm.runInContext(source, context, { filename: 'background.js' });

        const res = await context.__affoAlarms.startSyncAlarm();
        assert.equal(res.ok, true);
        assert.equal(res.skipped, true);
        assert.equal(res.reason, 'alarms_unavailable');
    });
});
