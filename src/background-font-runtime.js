(function(root) {
  'use strict';

  if (root.AFFOBackgroundFontRuntime) {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = root.AFFOBackgroundFontRuntime;
    }
    return;
  }

  const FONT_CACHE_KEY = 'affoFontCache';
  const FONT_CACHE_DB_NAME = 'affo-font-cache';
  const FONT_CACHE_DB_VERSION = 1;
  const FONT_CACHE_STORE = 'fonts';
  const CACHE_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year
  const MAX_CACHE_SIZE_BYTES = 80 * 1024 * 1024; // 80MB maximum cache size for Firefox
  const AFFO_FETCH_TIMEOUT_MS = 15000; // 15s timeout for remote CSS/font fetches
  const CACHE_WRITE_DEBOUNCE = 100; // Wait 100ms for more writes
  const TEXT_FETCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for Google Fonts CSS responses
  const MAX_TEXT_FETCH_CACHE_ENTRIES = 64;

  let fontCacheDbPromise = null;
  let pendingCacheWrites = new Map();
  let cacheWriteTimer = null;
  let inFlightFetches = new Map();
  let textFetchCache = new Map();
  let runtimeGfMetadata = null;
  let runtimeGfMetadataPromise = null;
  let runtimeCss2UrlMemo = {};

  function debugLog() {
    if (root.AFFO_DEBUG === true) console.log.apply(console, arguments);
  }

  function debugWarn() {
    if (root.AFFO_DEBUG === true) console.warn.apply(console, arguments);
  }

  function getIndexedDb() {
    return root.indexedDB || null;
  }

  function openFontCacheDb() {
    if (fontCacheDbPromise) return fontCacheDbPromise;
    fontCacheDbPromise = new Promise((resolve, reject) => {
      const idb = getIndexedDb();
      if (!idb) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }

      const request = idb.open(FONT_CACHE_DB_NAME, FONT_CACHE_DB_VERSION);
      request.onupgradeneeded = function(event) {
        const db = event.target.result;
        let store;
        if (!db.objectStoreNames.contains(FONT_CACHE_STORE)) {
          store = db.createObjectStore(FONT_CACHE_STORE, { keyPath: 'url' });
        } else {
          store = request.transaction.objectStore(FONT_CACHE_STORE);
        }
        if (!store.indexNames.contains('timestamp')) {
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = function(event) {
        const db = event.target.result;
        db.onversionchange = function() {
          try { db.close(); } catch (_) { }
          fontCacheDbPromise = null;
        };
        resolve(db);
      };
      request.onerror = function() {
        reject(request.error || new Error('IndexedDB open failed'));
      };
      request.onblocked = function() {
        debugWarn('[AFFO Background] Font cache IndexedDB open blocked');
      };
    }).catch(e => {
      fontCacheDbPromise = null;
      throw e;
    });
    return fontCacheDbPromise;
  }

  function idbRequestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error || new Error('IndexedDB request failed')); };
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = function() { resolve(); };
      transaction.onerror = function() { reject(transaction.error || new Error('IndexedDB transaction failed')); };
      transaction.onabort = function() { reject(transaction.error || new Error('IndexedDB transaction aborted')); };
    });
  }

  function cloneArrayBuffer(buffer) {
    if (buffer instanceof ArrayBuffer) {
      return buffer.slice(0);
    }
    if (ArrayBuffer.isView(buffer)) {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    return new Uint8Array(buffer || []).buffer;
  }

  async function removeLegacyStorageFontCache() {
    try {
      await browser.storage.local.remove(FONT_CACHE_KEY);
    } catch (_) { }
  }

  function getCachedTextFetch(url) {
    const entry = textFetchCache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.timestamp >= TEXT_FETCH_CACHE_TTL) {
      textFetchCache.delete(url);
      return null;
    }
    debugLog(`[AFFO Background] Text fetch cache HIT for ${url}`);
    return entry.text;
  }

  function setCachedTextFetch(url, text) {
    if (typeof text !== 'string') return;
    textFetchCache.set(url, {
      text,
      timestamp: Date.now()
    });
    while (textFetchCache.size > MAX_TEXT_FETCH_CACHE_ENTRIES) {
      const oldestKey = textFetchCache.keys().next().value;
      if (oldestKey === undefined) break;
      textFetchCache.delete(oldestKey);
    }
  }

  async function fetchGfMetadataForRuntime(url) {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return affoParseGfMetadataText(await res.text());
  }

  function getGfFamilyListForRuntime(metadata) {
    return affoGetMetadataFamilies(metadata)
      .map(family => family && (family.family || family.name))
      .filter(Boolean);
  }

  async function storeGfMetadataForRuntime(metadata) {
    const timestamp = Date.now();
    await browser.storage.local.set({
      gfMetadataCache: metadata,
      gfMetadataTimestamp: timestamp,
      gfFamilyListCache: Array.from(new Set(getGfFamilyListForRuntime(metadata))),
      gfFamilyListTimestamp: timestamp
    }).catch(e => debugWarn('[AFFO Background] Failed to store GF metadata:', e));
  }

  async function ensureRuntimeGfMetadata() {
    if (runtimeGfMetadata) return runtimeGfMetadata;
    if (runtimeGfMetadataPromise) return runtimeGfMetadataPromise;

    runtimeGfMetadataPromise = browser.storage.local.get('gfMetadataCache').then(async data => {
      if (data.gfMetadataCache && affoGetMetadataFamilies(data.gfMetadataCache).length) {
        return data.gfMetadataCache;
      }

      const localUrl = browser.runtime.getURL('data/gf-axis-registry.json');
      try {
        const metadata = await fetchGfMetadataForRuntime(localUrl);
        await storeGfMetadataForRuntime(metadata);
        return metadata;
      } catch (localError) {
        debugWarn('[AFFO Background] Local GF metadata load failed; trying remote metadata', localError);
        const metadata = await fetchGfMetadataForRuntime('https://fonts.google.com/metadata/fonts');
        await storeGfMetadataForRuntime(metadata);
        return metadata;
      }
    }).catch(e => {
      debugWarn('[AFFO Background] GF metadata unavailable for css2 URL resolution:', e);
      return { familyMetadataList: [] };
    }).then(metadata => {
      runtimeGfMetadata = metadata || { familyMetadataList: [] };
      runtimeGfMetadataPromise = null;
      return runtimeGfMetadata;
    });

    return runtimeGfMetadataPromise;
  }

  async function resolveCss2Url(fontName, options = {}) {
    const key = String(fontName || '').trim();
    if (!key || key.toLowerCase() === 'default') return '';
    const fallbackWhenMissing = !!options.fallbackWhenMissing;
    const memoKey = key + '|' + (fallbackWhenMissing ? 'fallback' : 'strict');
    if (Object.prototype.hasOwnProperty.call(runtimeCss2UrlMemo, memoKey)) {
      return runtimeCss2UrlMemo[memoKey];
    }

    const metadata = await ensureRuntimeGfMetadata();
    const css2Url = affoBuildCss2UrlFromMetadata(key, metadata, {
      fallbackWhenMissing,
      fallbackWhenMetadataEmpty: true
    });
    runtimeCss2UrlMemo[memoKey] = css2Url || '';
    return runtimeCss2UrlMemo[memoKey];
  }

  function resetGfMetadataCache() {
    runtimeGfMetadata = null;
    runtimeGfMetadataPromise = null;
    runtimeCss2UrlMemo = {};
  }

  async function getCachedFont(url) {
    const startTime = performance.now();
    try {
      if (!getIndexedDb()) return null;
      const pendingEntry = pendingCacheWrites.get(url);
      if (pendingEntry && Date.now() - pendingEntry.timestamp < CACHE_TTL) {
        const duration = (performance.now() - startTime).toFixed(2);
        debugLog(`[AFFO Background] Font cache HIT from pending writes (${duration}ms) for ${url}`);
        return cloneArrayBuffer(pendingEntry.data);
      }

      const db = await openFontCacheDb();
      const transaction = db.transaction(FONT_CACHE_STORE, 'readonly');
      const store = transaction.objectStore(FONT_CACHE_STORE);
      const entry = await idbRequestToPromise(store.get(url));
      if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        const duration = (performance.now() - startTime).toFixed(2);
        debugLog(`[AFFO Background] Font cache HIT from IndexedDB (${duration}ms) for ${url}`);
        return cloneArrayBuffer(entry.data);
      }
      if (entry) {
        const writeTx = db.transaction(FONT_CACHE_STORE, 'readwrite');
        const done = transactionDone(writeTx);
        writeTx.objectStore(FONT_CACHE_STORE).delete(url);
        await done.catch(() => { });
      }
      debugLog(`[AFFO Background] Font cache MISS for ${url}`);
      return null;
    } catch (e) {
      debugWarn('[AFFO Background] Error reading IndexedDB font cache:', e);
      return null;
    }
  }

  async function setCachedFont(url, arrayBufferData) {
    try {
      if (!getIndexedDb()) return;
      pendingCacheWrites.set(url, {
        url,
        data: cloneArrayBuffer(arrayBufferData),
        timestamp: Date.now(),
        size: arrayBufferData.byteLength
      });

      debugLog(`[AFFO Background] Queued font for IndexedDB cache write: ${url} (${arrayBufferData.byteLength} bytes), ${pendingCacheWrites.size} pending`);

      if (cacheWriteTimer) {
        clearTimeout(cacheWriteTimer);
      }

      cacheWriteTimer = setTimeout(async () => {
        await flushCacheWrites();
      }, CACHE_WRITE_DEBOUNCE);

    } catch (e) {
      console.error(`[AFFO Background] Error queuing font cache:`, e);
    }
  }

  async function flushCacheWrites() {
    if (cacheWriteTimer) {
      clearTimeout(cacheWriteTimer);
      cacheWriteTimer = null;
    }
    if (pendingCacheWrites.size === 0) return;
    if (!getIndexedDb()) {
      pendingCacheWrites.clear();
      return;
    }

    const entriesToWrite = Array.from(pendingCacheWrites.values()).map(entry => ({
      url: entry.url,
      data: cloneArrayBuffer(entry.data),
      timestamp: entry.timestamp,
      size: entry.size
    }));
    pendingCacheWrites.clear();

    try {
      debugLog(`[AFFO Background] Flushing ${entriesToWrite.length} cached fonts to IndexedDB...`);
      const startTime = performance.now();

      let totalSize = 0;
      const db = await openFontCacheDb();
      const transaction = db.transaction(FONT_CACHE_STORE, 'readwrite');
      const done = transactionDone(transaction);
      const store = transaction.objectStore(FONT_CACHE_STORE);
      for (const entry of entriesToWrite) {
        store.put(entry);
        totalSize += entry.size;
      }
      await done;
      await enforceCacheSizeLimit();
      await removeLegacyStorageFontCache();

      const duration = (performance.now() - startTime).toFixed(2);
      debugLog(`[AFFO Background] Cached ${entriesToWrite.length} fonts in IndexedDB (${(totalSize / (1024 * 1024)).toFixed(2)}MB) in ${duration}ms`);

    } catch (e) {
      debugWarn('[AFFO Background] Error flushing IndexedDB font cache:', e);
    }
  }

  async function collectCacheEntries() {
    const db = await openFontCacheDb();
    const transaction = db.transaction(FONT_CACHE_STORE, 'readonly');
    const store = transaction.objectStore(FONT_CACHE_STORE);
    return new Promise((resolve, reject) => {
      const entries = [];
      const request = store.openCursor();
      request.onsuccess = function(event) {
        const cursor = event.target.result;
        if (!cursor) {
          resolve(entries);
          return;
        }
        const entry = cursor.value || {};
        entries.push({
          url: entry.url || cursor.key,
          timestamp: Number(entry.timestamp) || 0,
          size: Number(entry.size) || (entry.data && entry.data.byteLength) || 0
        });
        cursor.continue();
      };
      request.onerror = function() {
        reject(request.error || new Error('IndexedDB cursor failed'));
      };
    });
  }

  async function enforceCacheSizeLimit() {
    const entries = await collectCacheEntries();
    const currentSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);
    if (currentSize <= MAX_CACHE_SIZE_BYTES) return;

    debugLog(`[AFFO Background] IndexedDB font cache too large (${(currentSize / (1024 * 1024)).toFixed(2)}MB), cleaning...`);
    const sorted = entries.slice().sort((a, b) => b.timestamp - a.timestamp);
    let newSize = 0;
    const urlsToDelete = [];

    sorted.forEach(entry => {
      if (newSize + entry.size <= MAX_CACHE_SIZE_BYTES) {
        newSize += entry.size;
      } else {
        urlsToDelete.push(entry.url);
      }
    });

    if (!urlsToDelete.length) return;
    const db = await openFontCacheDb();
    const transaction = db.transaction(FONT_CACHE_STORE, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(FONT_CACHE_STORE);
    urlsToDelete.forEach(url => store.delete(url));
    await done;
    debugLog(`[AFFO Background] Cleaned IndexedDB font cache: deleted ${urlsToDelete.length} entries, kept ${(newSize / (1024 * 1024)).toFixed(2)}MB`);
  }

  async function clearExpiredCache() {
    try {
      if (!getIndexedDb()) {
        await removeLegacyStorageFontCache();
        return;
      }
      const db = await openFontCacheDb();
      const now = Date.now();
      let cleaned = 0;
      const transaction = db.transaction(FONT_CACHE_STORE, 'readwrite');
      const done = transactionDone(transaction);
      const store = transaction.objectStore(FONT_CACHE_STORE);

      await new Promise((resolve, reject) => {
        const request = store.openCursor();
        request.onsuccess = function(event) {
          const cursor = event.target.result;
          if (!cursor) {
            resolve();
            return;
          }
          const entry = cursor.value || {};
          if (now - entry.timestamp >= CACHE_TTL) {
            cursor.delete();
            cleaned++;
          }
          cursor.continue();
        };
        request.onerror = function() {
          reject(request.error || new Error('IndexedDB cursor failed'));
        };
      });
      await done;

      if (cleaned > 0) {
        debugLog(`[AFFO Background] Cleaned ${cleaned} expired IndexedDB font cache entries`);
      }
      await removeLegacyStorageFontCache();
    } catch (e) {
      debugWarn('[AFFO Background] Error cleaning IndexedDB font cache:', e);
    }
  }

  async function clearCache() {
    if (cacheWriteTimer) {
      clearTimeout(cacheWriteTimer);
      cacheWriteTimer = null;
    }
    pendingCacheWrites.clear();
    inFlightFetches.clear();
    textFetchCache.clear();
    try {
      if (!getIndexedDb()) {
        await removeLegacyStorageFontCache();
        return;
      }
      const db = await openFontCacheDb();
      const transaction = db.transaction(FONT_CACHE_STORE, 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore(FONT_CACHE_STORE).clear();
      await done;
    } catch (e) {
      debugWarn('[AFFO Background] Error clearing IndexedDB font cache:', e);
    }
    await removeLegacyStorageFontCache();
  }

  async function getCacheInfo() {
    try {
      if (!getIndexedDb()) {
        return {
          ok: true,
          count: 0,
          totalSize: 0,
          oldestTimestamp: 0,
          newestTimestamp: 0,
          backend: 'unavailable'
        };
      }
      const entries = await collectCacheEntries();
      const totalSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);
      const timestamps = entries.map(entry => entry.timestamp).filter(Boolean);
      return {
        ok: true,
        count: entries.length,
        totalSize,
        oldestTimestamp: timestamps.length ? Math.min.apply(Math, timestamps) : 0,
        newestTimestamp: timestamps.length ? Math.max.apply(Math, timestamps) : 0,
        backend: 'indexedDB'
      };
    } catch (e) {
      debugWarn('[AFFO Background] Error reading IndexedDB font cache info:', e);
      return {
        ok: false,
        count: 0,
        totalSize: 0,
        oldestTimestamp: 0,
        newestTimestamp: 0,
        backend: 'indexedDB',
        error: e && e.message ? e.message : String(e)
      };
    }
  }

  async function logStartupCacheStatus() {
    const info = await getCacheInfo();
    if (info.ok) {
      debugLog(`[AFFO Background] Startup IndexedDB font cache status: ${info.count} fonts cached, ${(info.totalSize / (1024 * 1024)).toFixed(2)}MB`);
    }
  }

  function startup() {
    clearExpiredCache().then(logStartupCacheStatus);
  }

  async function handleFetchMessage(msg) {
    const url = msg.url;
    const binary = !!msg.binary;
    const fetchKey = (binary ? 'binary:' : 'text:') + url;

    if (binary) {
      const cachedData = await getCachedFont(url);
      if (cachedData) {
        return { ok: true, binary: true, data: cachedData, cached: true };
      }
    } else {
      const cachedText = getCachedTextFetch(url);
      if (cachedText != null) {
        return { ok: true, binary: false, data: cachedText, cached: true };
      }
    }

    if (inFlightFetches.has(fetchKey)) {
      debugLog(`[AFFO Background] Coalescing in-flight ${binary ? 'binary' : 'text'} fetch for ${url}`);
      return inFlightFetches.get(fetchKey);
    }

    const fetchPromise = (async function() {
      const controller = new AbortController();
      const timeoutId = setTimeout(function() {
        try { controller.abort(); } catch (_) { }
      }, AFFO_FETCH_TIMEOUT_MS);

      let res;
      try {
        res = await fetch(url, { credentials: 'omit', signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);

      if (binary) {
        const buf = await res.arrayBuffer();

        await setCachedFont(url, buf);

        return { ok: true, binary: true, data: buf, cached: false };
      }

      const text = await res.text();
      setCachedTextFetch(url, text);
      return { ok: true, binary: false, data: text, cached: false };
    })();

    inFlightFetches.set(fetchKey, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      inFlightFetches.delete(fetchKey);
    }
  }

  root.AFFOBackgroundFontRuntime = {
    clearCache: clearCache,
    clearExpiredCache: clearExpiredCache,
    flushCacheWrites: flushCacheWrites,
    getCacheInfo: getCacheInfo,
    handleFetchMessage: handleFetchMessage,
    resetGfMetadataCache: resetGfMetadataCache,
    resolveCss2Url: resolveCss2Url,
    startup: startup
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.AFFOBackgroundFontRuntime;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
