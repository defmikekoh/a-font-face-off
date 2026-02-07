// Dev-mode logging: build step sets AFFO_DEBUG = false for production
var AFFO_DEBUG = true;
if (!AFFO_DEBUG) {
  console.log = function() {};
  console.warn = function() {};
}

// Background fetcher for cross-origin CSS/WOFF2 with host permissions and caching
const FONT_CACHE_KEY = 'affoFontCache';
const CACHE_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year
const MAX_CACHE_SIZE_BYTES = 80 * 1024 * 1024; // 80MB maximum cache size for Firefox
const WEBDAV_CONFIG_KEY = 'affoWebDavConfig';
const CUSTOM_FONTS_CSS_KEY = 'affoCustomFontsCss';
const APPLY_MAP_KEY = 'affoApplyMap';
const FAVORITES_KEY = 'affoFavorites';
const FAVORITES_ORDER_KEY = 'affoFavoritesOrder';
const WEBDAV_DIR = 'a-font-face-off';
const CUSTOM_FONTS_CSS_FILENAME = 'custom-fonts.css';
const APPLY_MAP_FILENAME = 'affo-apply-map.json';
const FAVORITES_FILENAME = 'affo-favorites.json';

// Shared cache promise to avoid reading storage.local multiple times concurrently
let cacheReadPromise = null;
let cachedFontData = null;
const CACHE_STALE_TIME = 5000; // 5 seconds
let applyMapSyncQueue = Promise.resolve();
let favoritesSyncQueue = Promise.resolve();

function normalizeWebDavUrl(url) {
  let cleaned = String(url || '').trim();
  if (!cleaned) throw new Error('WebDAV server URL is required');
  if (!cleaned.includes('://')) cleaned = `http://${cleaned}`;
  if (!cleaned.endsWith('/')) cleaned += '/';
  return cleaned;
}

function buildWebDavBaseUrl(config) {
  const root = normalizeWebDavUrl(config.serverUrl);
  return `${root}${WEBDAV_DIR}/`;
}

function getWebDavHeaders(config) {
  const headers = {};
  if (config.anonymous) return headers;
  const username = String(config.username || '').trim();
  const password = String(config.password || '');
  if (!username || !password) {
    throw new Error('WebDAV username and password are required');
  }
  headers.Authorization = `Basic ${btoa(`${username}:${password}`)}`;
  return headers;
}

async function ensureWebDavDir(baseUrl, headers) {
  const response = await fetch(baseUrl, {
    method: 'PROPFIND',
    headers: Object.assign({ Depth: '0' }, headers),
    credentials: 'omit'
  });
  if (response.status === 404) {
    const mkcol = await fetch(baseUrl, {
      method: 'MKCOL',
      headers,
      credentials: 'omit'
    });
    if (!mkcol.ok && mkcol.status !== 405) {
      throw new Error(`WebDAV MKCOL failed: ${mkcol.status}`);
    }
    return;
  }
  if (!response.ok) {
    throw new Error(`WebDAV PROPFIND failed: ${response.status}`);
  }
}

async function webDavGetFile(baseUrl, headers, filename) {
  const response = await fetch(baseUrl + filename, {
    method: 'GET',
    headers,
    credentials: 'omit'
  });
  if (response.status === 404) throw new Error('WebDAV file not found');
  if (!response.ok) throw new Error(`WebDAV GET failed: ${response.status}`);
  return response.text();
}

async function webDavPutFile(baseUrl, headers, filename, body, contentType = 'text/plain') {
  const response = await fetch(baseUrl + filename, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': contentType }, headers),
    body,
    credentials: 'omit'
  });
  if (!response.ok) throw new Error(`WebDAV PUT failed: ${response.status}`);
}

async function getWebDavConfig() {
  const data = await browser.storage.local.get(WEBDAV_CONFIG_KEY);
  return data[WEBDAV_CONFIG_KEY] || {};
}

async function pullCustomFontsFromWebDav() {
  const config = await getWebDavConfig();
  const headers = getWebDavHeaders(config);
  const baseUrl = buildWebDavBaseUrl(config);
  await ensureWebDavDir(baseUrl, headers);
  const cssText = await webDavGetFile(baseUrl, headers, CUSTOM_FONTS_CSS_FILENAME);
  await browser.storage.local.set({ [CUSTOM_FONTS_CSS_KEY]: cssText });
  return { ok: true };
}

async function pushCustomFontsToWebDav() {
  const config = await getWebDavConfig();
  const headers = getWebDavHeaders(config);
  const baseUrl = buildWebDavBaseUrl(config);
  await ensureWebDavDir(baseUrl, headers);
  const stored = await browser.storage.local.get(CUSTOM_FONTS_CSS_KEY);
  let cssText = stored[CUSTOM_FONTS_CSS_KEY];
  if (!cssText) {
    const url = browser.runtime.getURL('custom-fonts.css');
    const response = await fetch(url);
    cssText = await response.text();
  }
  await webDavPutFile(baseUrl, headers, CUSTOM_FONTS_CSS_FILENAME, cssText || '', 'text/css');
  return { ok: true };
}

function isWebDavConfigured(config) {
  return !!String(config && config.serverUrl || '').trim();
}

function notifyWebDavSyncFailure(type, fallbackMessage, errorMessage) {
  browser.runtime.sendMessage({
    type,
    error: String(errorMessage || fallbackMessage)
  }).catch(() => {
    // Ignore when no extension page is listening.
  });
}

function notifyDomainSyncFailure(errorMessage) {
  notifyWebDavSyncFailure('affoWebDavDomainSyncFailed', 'Unknown WebDAV domain sync error', errorMessage);
}

function notifyFavoritesSyncFailure(errorMessage) {
  notifyWebDavSyncFailure('affoWebDavFavoritesSyncFailed', 'Unknown WebDAV favorites sync error', errorMessage);
}

async function pullJsonObjectFromWebDav(filename, invalidFormatMessage) {
  const config = await getWebDavConfig();
  if (!isWebDavConfigured(config)) return { ok: true, skipped: true };
  const headers = getWebDavHeaders(config);
  const baseUrl = buildWebDavBaseUrl(config);
  await ensureWebDavDir(baseUrl, headers);
  const jsonText = await webDavGetFile(baseUrl, headers, filename);
  const parsed = JSON.parse(jsonText || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(invalidFormatMessage);
  }
  return { ok: true, data: parsed };
}

async function pushJsonToWebDav(filename, payloadObject) {
  const config = await getWebDavConfig();
  if (!isWebDavConfigured(config)) return { ok: true, skipped: true };
  const headers = getWebDavHeaders(config);
  const baseUrl = buildWebDavBaseUrl(config);
  await ensureWebDavDir(baseUrl, headers);
  const payload = JSON.stringify(payloadObject || {}, null, 2);
  await webDavPutFile(baseUrl, headers, filename, payload, 'application/json');
  return { ok: true };
}

async function syncJsonSnapshotOnce(options) {
  const {
    filename,
    snapshot,
    label,
    notifyOnFailure = true,
    notifyFailure
  } = options;

  const config = await getWebDavConfig();
  if (!isWebDavConfigured(config)) {
    throw new Error('WebDAV not configured');
  }

  try {
    await pullJsonObjectFromWebDav(filename, `Invalid ${label} format in WebDAV file`);
  } catch (e) {
    if (!String(e && e.message || e).includes('WebDAV file not found')) {
      console.warn(`[AFFO Background] ${label} pull failed before push:`, e);
    }
  }

  try {
    await pushJsonToWebDav(filename, snapshot);
    console.log(`[AFFO Background] ${label} synced to WebDAV`);
    return { ok: true };
  } catch (e) {
    console.warn(`[AFFO Background] ${label} sync failed:`, e);
    if (notifyOnFailure && typeof notifyFailure === 'function') {
      notifyFailure(e && e.message ? e.message : String(e));
    }
    throw e;
  }
}

function scheduleWebDavAutoSync(queue, runSync, label) {
  return queue
    .then(async () => {
      const config = await getWebDavConfig();
      if (!isWebDavConfigured(config)) {
        console.log(`[AFFO Background] WebDAV not configured; skipping ${label} sync`);
        return;
      }
      await runSync();
    })
    .catch((e) => {
      console.warn(`[AFFO Background] ${label} sync queue error:`, e);
    });
}

async function pullDomainSettingsFromWebDav() {
  return pullJsonObjectFromWebDav(APPLY_MAP_FILENAME, 'Invalid domain settings format in WebDAV file');
}

async function importDomainSettingsFromWebDav() {
  const pulled = await pullDomainSettingsFromWebDav();
  if (pulled.skipped) return { ok: true, skipped: true };
  const applyMap = pulled.data || {};
  await browser.storage.local.set({ [APPLY_MAP_KEY]: applyMap });
  return { ok: true, count: Object.keys(applyMap).length };
}

async function pushDomainSettingsToWebDav(applyMapSnapshot) {
  return pushJsonToWebDav(
    APPLY_MAP_FILENAME,
    (applyMapSnapshot && typeof applyMapSnapshot === 'object') ? applyMapSnapshot : {}
  );
}

async function getLocalFavoritesSnapshot() {
  const data = await browser.storage.local.get([FAVORITES_KEY, FAVORITES_ORDER_KEY]);
  const favorites = (data[FAVORITES_KEY] && typeof data[FAVORITES_KEY] === 'object') ? data[FAVORITES_KEY] : {};
  const favoritesOrder = Array.isArray(data[FAVORITES_ORDER_KEY]) ? data[FAVORITES_ORDER_KEY] : Object.keys(favorites);
  return {
    [FAVORITES_KEY]: favorites,
    [FAVORITES_ORDER_KEY]: favoritesOrder
  };
}

async function pullFavoritesFromWebDav() {
  return pullJsonObjectFromWebDav(FAVORITES_FILENAME, 'Invalid favorites format in WebDAV file');
}

async function importFavoritesFromWebDav() {
  const pulled = await pullFavoritesFromWebDav();
  if (pulled.skipped) return { ok: true, skipped: true };
  const payload = pulled.data || {};
  const favorites = (payload[FAVORITES_KEY] && typeof payload[FAVORITES_KEY] === 'object') ? payload[FAVORITES_KEY] : {};
  const favoritesOrder = Array.isArray(payload[FAVORITES_ORDER_KEY]) ? payload[FAVORITES_ORDER_KEY] : Object.keys(favorites);
  await browser.storage.local.set({
    [FAVORITES_KEY]: favorites,
    [FAVORITES_ORDER_KEY]: favoritesOrder
  });
  return { ok: true, count: Object.keys(favorites).length };
}

async function pushFavoritesToWebDav(favoritesSnapshot) {
  return pushJsonToWebDav(FAVORITES_FILENAME, {
    [FAVORITES_KEY]: (favoritesSnapshot && favoritesSnapshot[FAVORITES_KEY] && typeof favoritesSnapshot[FAVORITES_KEY] === 'object') ? favoritesSnapshot[FAVORITES_KEY] : {},
    [FAVORITES_ORDER_KEY]: Array.isArray(favoritesSnapshot && favoritesSnapshot[FAVORITES_ORDER_KEY]) ? favoritesSnapshot[FAVORITES_ORDER_KEY] : []
  });
}

async function syncFavoritesOnce(favoritesSnapshot, notifyOnFailure = true) {
  return syncJsonSnapshotOnce({
    filename: FAVORITES_FILENAME,
    snapshot: {
      [FAVORITES_KEY]: (favoritesSnapshot && favoritesSnapshot[FAVORITES_KEY] && typeof favoritesSnapshot[FAVORITES_KEY] === 'object') ? favoritesSnapshot[FAVORITES_KEY] : {},
      [FAVORITES_ORDER_KEY]: Array.isArray(favoritesSnapshot && favoritesSnapshot[FAVORITES_ORDER_KEY]) ? favoritesSnapshot[FAVORITES_ORDER_KEY] : []
    },
    label: 'Favorites',
    notifyOnFailure,
    notifyFailure: notifyFavoritesSyncFailure
  });
}

function scheduleFavoritesAutoSync() {
  favoritesSyncQueue = scheduleWebDavAutoSync(
    favoritesSyncQueue,
    async () => {
      const snapshot = await getLocalFavoritesSnapshot();
      await syncFavoritesOnce(snapshot, true);
    },
    'favorites'
  );
}

async function syncDomainSettingsOnce(applyMapSnapshot, notifyOnFailure = true) {
  return syncJsonSnapshotOnce({
    filename: APPLY_MAP_FILENAME,
    snapshot: (applyMapSnapshot && typeof applyMapSnapshot === 'object') ? applyMapSnapshot : {},
    label: 'Domain settings',
    notifyOnFailure,
    notifyFailure: notifyDomainSyncFailure
  });
}

function scheduleDomainSettingsAutoSync(applyMapSnapshot) {
  applyMapSyncQueue = scheduleWebDavAutoSync(
    applyMapSyncQueue,
    async () => {
      await syncDomainSettingsOnce(applyMapSnapshot, true);
    },
    'domain settings'
  );
}

function isMissingWebDavFileError(error) {
  return String(error && error.message || error).includes('WebDAV file not found');
}

async function runWebDavMessage(operation) {
  try {
    return await operation();
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

async function handleWebDavPullWithBootstrap(importFn, bootstrapFn, countFn) {
  try {
    return await importFn();
  } catch (e) {
    if (!isMissingWebDavFileError(e)) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    try {
      const bootstrapSnapshot = await bootstrapFn();
      return { ok: true, bootstrapped: true, count: countFn(bootstrapSnapshot) };
    } catch (pushErr) {
      return { ok: false, error: pushErr && pushErr.message ? pushErr.message : String(pushErr) };
    }
  }
}

async function getCachedFont(url) {
  const startTime = performance.now();
  try {
    // If we have a recent cache read, use it
    if (cachedFontData && Date.now() - cachedFontData.timestamp < CACHE_STALE_TIME) {
      const entry = cachedFontData.cache[url];
      if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        const duration = (performance.now() - startTime).toFixed(2);
        console.log(`[AFFO Background] Font cache HIT from memory (${duration}ms) for ${url}`);
        return entry.data;
      }
    }

    // If a cache read is already in progress, wait for it
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
      console.log(`[AFFO Background] Font cache HIT (${duration}ms) for ${url}`);
      return entry.data;
    }
    console.log(`[AFFO Background] Font cache MISS for ${url}`);
    return null;
  } catch (e) {
    console.error(`[AFFO Background] Error reading font cache:`, e);
    return null;
  }
}

// Pending cache writes - batch them to avoid storage thrashing
let pendingCacheWrites = new Map();
let cacheWriteTimer = null;
const CACHE_WRITE_DEBOUNCE = 100; // Wait 100ms for more writes

async function setCachedFont(url, arrayBufferData) {
  try {
    // Add to pending writes (in-memory)
    pendingCacheWrites.set(url, {
      data: Array.from(new Uint8Array(arrayBufferData)),
      timestamp: Date.now(),
      size: arrayBufferData.byteLength
    });

    console.log(`[AFFO Background] Queued font for batch cache write: ${url} (${arrayBufferData.byteLength} bytes), ${pendingCacheWrites.size} pending`);

    // Debounce: wait for more writes to come in
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
    console.log(`[AFFO Background] Flushing ${pendingCacheWrites.size} cached fonts to storage (batch write)...`);
    const startTime = performance.now();

    // Read cache once
    const cache = await browser.storage.local.get(FONT_CACHE_KEY);
    let fontCache = cache[FONT_CACHE_KEY] || {};

    // Add all pending writes to cache
    let totalSize = 0;
    for (const [url, entry] of pendingCacheWrites.entries()) {
      fontCache[url] = entry;
      totalSize += entry.size;
    }

    // Calculate current cache size
    const entries = Object.entries(fontCache);
    const currentSize = entries.reduce((sum, [_url, entry]) => sum + (entry.size || 0), 0);

    // Clean up if cache is too large
    if (currentSize > MAX_CACHE_SIZE_BYTES) {
      console.log(`[AFFO Background] Cache too large (${(currentSize / (1024 * 1024)).toFixed(2)}MB), cleaning...`);
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
      console.log(`[AFFO Background] Cleaned font cache: kept ${keptEntries.length} entries, ${(newSize / (1024 * 1024)).toFixed(2)}MB`);
    }

    // Write cache once
    await browser.storage.local.set({ [FONT_CACHE_KEY]: fontCache });

    // Invalidate in-memory cache so next read gets fresh data
    cachedFontData = null;

    const duration = (performance.now() - startTime).toFixed(2);
    console.log(`[AFFO Background] Batch cached ${pendingCacheWrites.size} fonts (${(totalSize / (1024 * 1024)).toFixed(2)}MB) in ${duration}ms`);

    // Clear pending writes
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
      console.log(`[AFFO Background] Cleaned ${cleaned} expired font cache entries`);
    }
  } catch (e) {
    console.error(`[AFFO Background] Error cleaning font cache:`, e);
  }
}

// Clean expired cache entries on startup and log cache status
clearExpiredCache().then(() => {
  browser.storage.local.get(FONT_CACHE_KEY).then(cache => {
    const fontCache = cache[FONT_CACHE_KEY] || {};
    const count = Object.keys(fontCache).length;
    const totalSize = Object.values(fontCache).reduce((sum, entry) => sum + (entry.size || 0), 0);
    console.log(`[AFFO Background] Startup cache status: ${count} fonts cached, ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);
  });
});

browser.runtime.onMessage.addListener(async (msg, _sender) => {
  try {
    // Handle cache flush requests
    if (msg.type === 'flushFontCache') {
      await flushCacheWrites();
      return { ok: true };
    }

    if (msg.type === 'affoWebDavPull') {
      return runWebDavMessage(() => pullCustomFontsFromWebDav());
    }

    if (msg.type === 'affoWebDavPush') {
      return runWebDavMessage(() => pushCustomFontsToWebDav());
    }

    if (msg.type === 'affoWebDavPullDomainSettings') {
      return handleWebDavPullWithBootstrap(
        () => importDomainSettingsFromWebDav(),
        async () => {
          const local = await browser.storage.local.get(APPLY_MAP_KEY);
          const localSnapshot = local[APPLY_MAP_KEY] || {};
          await pushDomainSettingsToWebDav(localSnapshot);
          return localSnapshot;
        },
        (snapshot) => Object.keys(snapshot || {}).length
      );
    }

    if (msg.type === 'affoWebDavRetryDomainSettingsSync') {
      return runWebDavMessage(async () => {
        const data = await browser.storage.local.get(APPLY_MAP_KEY);
        const applyMapSnapshot = data[APPLY_MAP_KEY] || {};
        await syncDomainSettingsOnce(applyMapSnapshot, false);
        return { ok: true };
      });
    }

    if (msg.type === 'affoWebDavPullFavorites') {
      return handleWebDavPullWithBootstrap(
        () => importFavoritesFromWebDav(),
        async () => {
          const localSnapshot = await getLocalFavoritesSnapshot();
          await pushFavoritesToWebDav(localSnapshot);
          return localSnapshot;
        },
        (snapshot) => Object.keys((snapshot && snapshot[FAVORITES_KEY]) || {}).length
      );
    }

    if (msg.type === 'affoWebDavPushFavorites') {
      return runWebDavMessage(async () => {
        const localSnapshot = await getLocalFavoritesSnapshot();
        await pushFavoritesToWebDav(localSnapshot);
        return { ok: true, count: Object.keys(localSnapshot[FAVORITES_KEY] || {}).length };
      });
    }

    if (msg.type === 'affoWebDavRetryFavoritesSync') {
      return runWebDavMessage(async () => {
        const localSnapshot = await getLocalFavoritesSnapshot();
        await syncFavoritesOnce(localSnapshot, false);
        return { ok: true };
      });
    }

    // Handle toolbar options requests
    if (msg.type === 'getToolbarOptions') {
      try {
        const result = await browser.storage.local.get([
          'affoToolbarEnabled',
          'affoToolbarWidth',
          'affoToolbarHeight',
          'affoToolbarPosition',
          'affoToolbarTransparency',
          'affoToolbarGap'
        ]);
        console.log('[AFFO Background] Returning toolbar options:', result);
        return result;
      } catch (e) {
        console.warn('[AFFO Background] Error getting toolbar options:', e);
        return {};
      }
    }
    
    // Handle toolbar popup opening requests
    if (msg.type === 'openPopup') {
      console.log('[AFFO Background] Received openPopup request');
      console.log('[AFFO Background] User agent:', navigator.userAgent);
      console.log('[AFFO Background] Available APIs:', Object.keys(browser.browserAction || {}));
      
      try {
        console.log('[AFFO Background] Attempting browserAction.openPopup()...');
        
        // For Firefox Android, try the standard API
        if (browser.browserAction && browser.browserAction.openPopup) {
          await browser.browserAction.openPopup();
          console.log('[AFFO Background] browserAction.openPopup() call completed');
          return { success: true, method: 'browserAction.openPopup' };
        } else {
          console.warn('[AFFO Background] browserAction.openPopup not available');
          return { success: false, error: 'browserAction.openPopup not available' };
        }
      } catch (e) {
        console.error('[AFFO Background] browserAction.openPopup() failed:', e.message);
        console.error('[AFFO Background] Full error:', e);
        return { success: false, error: e.message };
      }
    }
    
    // Handle close current tab requests
    if (msg.type === 'closeCurrentTab') {
      try {
        console.log('[AFFO Background] Closing current tab');
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
          await browser.tabs.remove(tabs[0].id);
          console.log('[AFFO Background] Tab closed successfully');
          return { success: true };
        } else {
          console.warn('[AFFO Background] No active tab found');
          return { success: false, error: 'No active tab found' };
        }
      } catch (e) {
        console.error('[AFFO Background] Error closing tab:', e);
        return { success: false, error: e.message };
      }
    }
    
    // Handle getting current tab info
    if (msg.type === 'getCurrentTab') {
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
          return { success: true, tabId: tabs[0].id, url: tabs[0].url };
        } else {
          return { success: false, error: 'No active tab found' };
        }
      } catch (e) {
        console.error('[AFFO Background] Error getting current tab:', e);
        return { success: false, error: e.message };
      }
    }
    
    // Handle fallback popup opening (open in new tab/window)
    if (msg.type === 'openPopupFallback') {
      try {
        console.log('[AFFO Background] Attempting fallback: open popup in new tab');
        
        // For Firefox Android, open the popup HTML in a new tab since popups don't exist
        let popup = browser.runtime.getURL('popup.html');
        
        // If domain and sourceTabId are provided, pass them as URL parameters
        const params = new URLSearchParams();
        if (msg.domain) {
          params.set('domain', msg.domain);
          console.log('[AFFO Background] Added domain parameter:', msg.domain);
        }
        if (msg.sourceTabId) {
          params.set('sourceTabId', msg.sourceTabId.toString());
          console.log('[AFFO Background] Added sourceTabId parameter:', msg.sourceTabId);
        }
        
        if (params.toString()) {
          popup += '?' + params.toString();
        }
        
        console.log('[AFFO Background] Popup URL:', popup);
        
        const tab = await browser.tabs.create({ 
          url: popup,
          active: true // Make sure the tab is focused
        });
        console.log('[AFFO Background] Tab created:', tab);
        return { success: true, tabId: tab.id, url: popup };
      } catch (e) {
        console.error('[AFFO Background] Could not open popup fallback:', e);
        console.error('[AFFO Background] Error details:', e);
        return { success: false, error: e.message };
      }
    }
    
    // Handle font fetching requests
    if (!msg || msg.type !== 'affoFetch') return;
    const url = msg.url;
    const binary = !!msg.binary;
    
    // For binary requests (fonts), check cache first
    if (binary) {
      const cachedData = await getCachedFont(url);
      if (cachedData) {
        return { ok: true, binary: true, data: cachedData, cached: true };
      }
    }
    
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    if (binary) {
      const buf = await res.arrayBuffer();
      const u8 = new Uint8Array(buf);
      const dataArray = Array.from(u8);
      
      // Cache the font data
      await setCachedFont(url, buf);
      
      return { ok: true, binary: true, data: dataArray, cached: false };
    } else {
      const text = await res.text();
      return { ok: true, binary: false, data: text };
    }
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

// Listen for toolbar option changes and notify content scripts
browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;

  if (changes[APPLY_MAP_KEY]) {
    scheduleDomainSettingsAutoSync(changes[APPLY_MAP_KEY].newValue || {});
  }
  if (changes[FAVORITES_KEY] || changes[FAVORITES_ORDER_KEY]) {
    scheduleFavoritesAutoSync();
  }
  
  // Check if any toolbar options changed
  const toolbarOptionsChanged = {};
  let hasToolbarChanges = false;
  
  if (changes.affoToolbarEnabled) {
    toolbarOptionsChanged.affoToolbarEnabled = changes.affoToolbarEnabled.newValue;
    hasToolbarChanges = true;
  }
  if (changes.affoToolbarWidth) {
    toolbarOptionsChanged.affoToolbarWidth = changes.affoToolbarWidth.newValue;
    hasToolbarChanges = true;
  }
  if (changes.affoToolbarHeight) {
    toolbarOptionsChanged.affoToolbarHeight = changes.affoToolbarHeight.newValue;
    hasToolbarChanges = true;
  }
  if (changes.affoToolbarPosition) {
    toolbarOptionsChanged.affoToolbarPosition = changes.affoToolbarPosition.newValue;
    hasToolbarChanges = true;
  }
  if (changes.affoToolbarTransparency) {
    toolbarOptionsChanged.affoToolbarTransparency = changes.affoToolbarTransparency.newValue;
    hasToolbarChanges = true;
  }
  if (changes.affoToolbarGap) {
    toolbarOptionsChanged.affoToolbarGap = changes.affoToolbarGap.newValue;
    hasToolbarChanges = true;
  }
  
  if (hasToolbarChanges) {
    console.log('[AFFO Background] Toolbar options changed, notifying content scripts:', toolbarOptionsChanged);
    
    try {
      // Get all tabs and send message to content scripts
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        try {
          await browser.tabs.sendMessage(tab.id, {
            type: 'toolbarOptionsChanged',
            options: toolbarOptionsChanged
          });
        } catch (e) {
          // Ignore errors for tabs that don't have content scripts
        }
      }
    } catch (e) {
      console.warn('[AFFO Background] Error notifying content scripts of toolbar changes:', e);
    }
  }
});
