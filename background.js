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
    
    // Handle fallback popup opening (open in new tab/window)
    if (msg.type === 'openPopupFallback') {
      try {
        console.log('[AFFO Background] Attempting fallback: open popup in new tab');
        
        // For Firefox Android, open the popup HTML in a new tab since popups don't exist
        const popup = browser.runtime.getURL('popup.html');
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
