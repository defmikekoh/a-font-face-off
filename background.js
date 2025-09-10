// Background fetcher for cross-origin CSS/WOFF2 with host permissions and caching
const FONT_CACHE_KEY = 'affoFontCache';
const CACHE_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year
const MAX_CACHE_SIZE_BYTES = 80 * 1024 * 1024; // 80MB maximum cache size for Firefox

async function getCachedFont(url) {
  try {
    const cache = await browser.storage.local.get(FONT_CACHE_KEY);
    const fontCache = cache[FONT_CACHE_KEY] || {};
    const entry = fontCache[url];
    
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      console.log(`[AFFO Background] Font cache HIT for ${url}`);
      return entry.data;
    }
    console.log(`[AFFO Background] Font cache MISS for ${url}`);
    return null;
  } catch (e) {
    console.error(`[AFFO Background] Error reading font cache:`, e);
    return null;
  }
}

async function setCachedFont(url, arrayBufferData) {
  try {
    const cache = await browser.storage.local.get(FONT_CACHE_KEY);
    let fontCache = cache[FONT_CACHE_KEY] || {};
    
    // Calculate current cache size
    const entries = Object.entries(fontCache);
    const currentSize = entries.reduce((sum, [url, entry]) => sum + (entry.size || 0), 0);
    
    // Clean up if cache is too large (by size only)
    if (currentSize + arrayBufferData.byteLength > MAX_CACHE_SIZE_BYTES) {
      // Sort by timestamp and keep only the newest entries that fit within size limit
      const sortedEntries = entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      
      let newSize = arrayBufferData.byteLength;
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
    
    fontCache[url] = {
      data: Array.from(new Uint8Array(arrayBufferData)),
      timestamp: Date.now(),
      size: arrayBufferData.byteLength
    };
    
    await browser.storage.local.set({ [FONT_CACHE_KEY]: fontCache });
    console.log(`[AFFO Background] Cached font ${url} (${arrayBufferData.byteLength} bytes)`);
  } catch (e) {
    console.error(`[AFFO Background] Error caching font:`, e);
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

// Clean expired cache entries on startup
clearExpiredCache();

browser.runtime.onMessage.addListener(async (msg, sender) => {
  try {
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
