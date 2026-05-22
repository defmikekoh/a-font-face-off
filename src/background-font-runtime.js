(function(root) {
  'use strict';

  if (root.AFFOBackgroundFontRuntime) {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = root.AFFOBackgroundFontRuntime;
    }
    return;
  }

  const FONT_CACHE_KEY = 'affoFontCache';
  const CACHE_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year
  const MAX_CACHE_SIZE_BYTES = 80 * 1024 * 1024; // 80MB maximum cache size for Firefox
  const AFFO_FETCH_TIMEOUT_MS = 15000; // 15s timeout for remote CSS/font fetches
  const CACHE_STALE_TIME = 5000; // 5 seconds
  const CACHE_WRITE_DEBOUNCE = 100; // Wait 100ms for more writes

  let cacheReadPromise = null;
  let cachedFontData = null;
  let pendingCacheWrites = new Map();
  let cacheWriteTimer = null;
  let runtimeGfMetadata = null;
  let runtimeGfMetadataPromise = null;
  let runtimeCss2UrlMemo = {};

  function debugLog() {
    if (root.AFFO_DEBUG === true) console.log.apply(console, arguments);
  }

  function debugWarn() {
    if (root.AFFO_DEBUG === true) console.warn.apply(console, arguments);
  }

  async function fetchGfMetadataForRuntime(url) {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return affoParseGfMetadataText(await res.text());
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
        await browser.storage.local.set({
          gfMetadataCache: metadata,
          gfMetadataTimestamp: Date.now()
        }).catch(e => debugWarn('[AFFO Background] Failed to store local GF metadata:', e));
        return metadata;
      } catch (localError) {
        debugWarn('[AFFO Background] Local GF metadata load failed; trying remote metadata', localError);
        const metadata = await fetchGfMetadataForRuntime('https://fonts.google.com/metadata/fonts');
        await browser.storage.local.set({
          gfMetadataCache: metadata,
          gfMetadataTimestamp: Date.now()
        }).catch(e => debugWarn('[AFFO Background] Failed to store remote GF metadata:', e));
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
      if (cachedFontData && Date.now() - cachedFontData.timestamp < CACHE_STALE_TIME) {
        const entry = cachedFontData.cache[url];
        if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
          const duration = (performance.now() - startTime).toFixed(2);
          debugLog(`[AFFO Background] Font cache HIT from memory (${duration}ms) for ${url}`);
          return entry.data;
        }
      }

      if (!cacheReadPromise) {
        cacheReadPromise = browser.storage.local.get(FONT_CACHE_KEY).then(result => {
          const cache = result[FONT_CACHE_KEY] || {};
          cachedFontData = {
            cache: cache,
            timestamp: Date.now()
          };
          cacheReadPromise = null;
          return cache;
        });
      }

      const fontCache = await cacheReadPromise;
      const entry = fontCache[url];

      if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        const duration = (performance.now() - startTime).toFixed(2);
        debugLog(`[AFFO Background] Font cache HIT (${duration}ms) for ${url}`);
        return entry.data;
      }
      debugLog(`[AFFO Background] Font cache MISS for ${url}`);
      return null;
    } catch (e) {
      console.error(`[AFFO Background] Error reading font cache:`, e);
      return null;
    }
  }

  async function setCachedFont(url, arrayBufferData) {
    try {
      pendingCacheWrites.set(url, {
        data: Array.from(new Uint8Array(arrayBufferData)),
        timestamp: Date.now(),
        size: arrayBufferData.byteLength
      });

      debugLog(`[AFFO Background] Queued font for batch cache write: ${url} (${arrayBufferData.byteLength} bytes), ${pendingCacheWrites.size} pending`);

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
    if (pendingCacheWrites.size === 0) return;

    try {
      debugLog(`[AFFO Background] Flushing ${pendingCacheWrites.size} cached fonts to storage (batch write)...`);
      const startTime = performance.now();

      const cache = await browser.storage.local.get(FONT_CACHE_KEY);
      let fontCache = cache[FONT_CACHE_KEY] || {};

      let totalSize = 0;
      for (const [url, entry] of pendingCacheWrites.entries()) {
        fontCache[url] = entry;
        totalSize += entry.size;
      }

      const entries = Object.entries(fontCache);
      const currentSize = entries.reduce((sum, [_url, entry]) => sum + (entry.size || 0), 0);

      if (currentSize > MAX_CACHE_SIZE_BYTES) {
        debugLog(`[AFFO Background] Cache too large (${(currentSize / (1024 * 1024)).toFixed(2)}MB), cleaning...`);
        const sortedEntries = entries.sort((a, b) => b[1].timestamp - a[1].timestamp);

        let newSize = 0;
        const keptEntries = [];

        for (const [entryUrl, entry] of sortedEntries) {
          if (newSize + entry.size <= MAX_CACHE_SIZE_BYTES) {
            keptEntries.push([entryUrl, entry]);
            newSize += entry.size;
          }
        }

        fontCache = Object.fromEntries(keptEntries);
        debugLog(`[AFFO Background] Cleaned font cache: kept ${keptEntries.length} entries, ${(newSize / (1024 * 1024)).toFixed(2)}MB`);
      }

      await browser.storage.local.set({ [FONT_CACHE_KEY]: fontCache });

      cachedFontData = null;

      const duration = (performance.now() - startTime).toFixed(2);
      debugLog(`[AFFO Background] Batch cached ${pendingCacheWrites.size} fonts (${(totalSize / (1024 * 1024)).toFixed(2)}MB) in ${duration}ms`);

      pendingCacheWrites.clear();
      cacheWriteTimer = null;

    } catch (e) {
      console.error(`[AFFO Background] Error flushing font cache:`, e);
    }
  }

  async function clearExpiredCache() {
    try {
      const cache = await browser.storage.local.get(FONT_CACHE_KEY);
      const fontCache = cache[FONT_CACHE_KEY] || {};
      const now = Date.now();
      let cleaned = 0;

      for (const [url, entry] of Object.entries(fontCache)) {
        if (now - entry.timestamp >= CACHE_TTL) {
          delete fontCache[url];
          cleaned++;
        }
      }

      if (cleaned > 0) {
        await browser.storage.local.set({ [FONT_CACHE_KEY]: fontCache });
        debugLog(`[AFFO Background] Cleaned ${cleaned} expired font cache entries`);
      }
    } catch (e) {
      console.error(`[AFFO Background] Error cleaning font cache:`, e);
    }
  }

  function logStartupCacheStatus() {
    browser.storage.local.get(FONT_CACHE_KEY).then(cache => {
      const fontCache = cache[FONT_CACHE_KEY] || {};
      const count = Object.keys(fontCache).length;
      const totalSize = Object.values(fontCache).reduce((sum, entry) => sum + (entry.size || 0), 0);
      debugLog(`[AFFO Background] Startup cache status: ${count} fonts cached, ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);
    });
  }

  function startup() {
    clearExpiredCache().then(logStartupCacheStatus);
  }

  async function handleFetchMessage(msg) {
    const url = msg.url;
    const binary = !!msg.binary;

    if (binary) {
      const cachedData = await getCachedFont(url);
      if (cachedData) {
        return { ok: true, binary: true, data: cachedData, cached: true };
      }
    }

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
      const u8 = new Uint8Array(buf);
      const dataArray = Array.from(u8);

      await setCachedFont(url, buf);

      return { ok: true, binary: true, data: dataArray, cached: false };
    }

    const text = await res.text();
    return { ok: true, binary: false, data: text };
  }

  root.AFFOBackgroundFontRuntime = {
    clearExpiredCache: clearExpiredCache,
    flushCacheWrites: flushCacheWrites,
    handleFetchMessage: handleFetchMessage,
    resetGfMetadataCache: resetGfMetadataCache,
    resolveCss2Url: resolveCss2Url,
    startup: startup
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.AFFOBackgroundFontRuntime;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
