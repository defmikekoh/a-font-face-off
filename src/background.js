/* global AFFOPageFontUtils */
// Dev-mode logging: build step sets AFFO_DEBUG = false for production
var AFFO_DEBUG = true;
function affoDebugLog() {
  if (AFFO_DEBUG) console.log.apply(console, arguments);
}
function affoDebugWarn() {
  if (AFFO_DEBUG) console.warn.apply(console, arguments);
}
// Background sync/message coordinator. Font fetch/cache runtime lives in background-font-runtime.js.
const CUSTOM_FONTS_CSS_KEY = 'affoCustomFontsCss';
const APPLY_MAP_KEY = 'affoApplyMap';
const APPLY_MAP_META_KEY = 'affoApplyMapMeta';
const FAVORITES_KEY = 'affoFavorites';
const FAVORITES_ORDER_KEY = 'affoFavoritesOrder';
const FACEOFF_PAGE_FONT_DRAFT_KEY = 'affoFaceoffPageFontDraft';
const PAGE_FONT_STYLESHEET_FETCH_LIMIT = 12;

// Sync constants (backend-agnostic)
const SYNC_BACKEND_KEY = 'affoSyncBackend';       // 'gdrive' | 'webdav'
const SYNC_META_KEY = 'affoSyncMeta';
const SYNC_FOLDER_NAME = 'A Font Face-off';
const SYNC_MANIFEST_NAME = 'sync-manifest.json';
const SYNC_DOMAINS_NAME = 'domains.json';
const SYNC_DOMAINS_META_NAME = 'domains-meta.json';
const SYNC_FAVORITES_NAME = 'favorites.json';
const SYNC_CUSTOM_FONTS_NAME = 'custom-fonts.css';
const SYNC_KNOWN_SERIF_NAME = 'known-serif.json';
const SYNC_KNOWN_SANS_NAME = 'known-sans.json';
const SYNC_FFONLY_DOMAINS_NAME = 'fontface-only-domains.json';
const SYNC_FFONLY_DOMAINS_META_NAME = 'fontface-only-domains-meta.json';
const SYNC_INLINE_DOMAINS_NAME = 'inline-apply-domains.json';
const SYNC_INLINE_DOMAINS_META_NAME = 'inline-apply-domains-meta.json';
const SYNC_AGGRESSIVE_DOMAINS_NAME = 'aggressive-domains.json';
const SYNC_AGGRESSIVE_DOMAINS_META_NAME = 'aggressive-domains-meta.json';
const SYNC_WAITFORIT_DOMAINS_NAME = 'waitforit-domains.json';
const SYNC_WAITFORIT_DOMAINS_META_NAME = 'waitforit-domains-meta.json';
const SYNC_IGNORE_COMMENTS_DOMAINS_NAME = 'ignore-comments-domains.json';
const SYNC_IGNORE_COMMENTS_DOMAINS_META_NAME = 'ignore-comments-domains-meta.json';
const SYNC_SUBSTACK_BEIGE_DISABLED_DOMAINS_NAME = 'substack-beige-disabled-domains.json';
const SYNC_SUBSTACK_BEIGE_DISABLED_DOMAINS_META_NAME = 'substack-beige-disabled-domains-meta.json';
const SYNC_PRESERVED_FONTS_NAME = 'preserved-fonts.json';
const SYNC_SUBSTACK_ROULETTE_NAME = 'substack-roulette.json';
const SYNC_CUSTOM_FONT_AXES_NAME = 'custom-font-axes.json';
const SYNC_MODE_MERGE = 'merge';
const SYNC_MODE_PUSH = 'push';
const SYNC_MODE_PULL = 'pull';
const KNOWN_SERIF_KEY = 'affoKnownSerif';
const KNOWN_SANS_KEY = 'affoKnownSans';
const FFONLY_DOMAINS_KEY = 'affoFontFaceOnlyDomains';
const FFONLY_DOMAINS_META_KEY = 'affoFontFaceOnlyDomainsMeta';
const INLINE_DOMAINS_KEY = 'affoInlineApplyDomains';
const INLINE_DOMAINS_META_KEY = 'affoInlineApplyDomainsMeta';
const AGGRESSIVE_DOMAINS_KEY = 'affoAggressiveDomains';
const AGGRESSIVE_DOMAINS_META_KEY = 'affoAggressiveDomainsMeta';
const WAITFORIT_DOMAINS_KEY = 'affoWaitForItDomains';
const WAITFORIT_DOMAINS_META_KEY = 'affoWaitForItDomainsMeta';
const IGNORE_COMMENTS_DOMAINS_KEY = 'affoIgnoreCommentsDomains';
const IGNORE_COMMENTS_DOMAINS_META_KEY = 'affoIgnoreCommentsDomainsMeta';
const SUBSTACK_BEIGE_DISABLED_DOMAINS_KEY = 'affoSubstackRouletteBeigeDisabledDomains';
const SUBSTACK_BEIGE_DISABLED_DOMAINS_META_KEY = 'affoSubstackRouletteBeigeDisabledDomainsMeta';
const PRESERVED_FONTS_KEY = 'affoPreservedFonts';
const CUSTOM_FONT_AXES_KEY = 'affoCustomFontAxes';
const SUBSTACK_ROULETTE_KEY = 'affoSubstackRoulette';
const SUBSTACK_ROULETTE_SERIF_KEY = 'affoSubstackRouletteSerif';
const SUBSTACK_ROULETTE_SANS_KEY = 'affoSubstackRouletteSans';
const SYNC_ALARM_NAME = 'affoPeriodicSync';
const SYNC_ALARM_PERIOD_MINUTES = 60; // 1 hour
const SYNC_OPTIONAL_DATA_COLLECTION = ['browsingActivity', 'authenticationInfo', 'technicalAndInteraction'];
const SYNC_LEGACY_DATA_CONSENT_KEY = 'affoLegacySyncDataConsent';

// Google Drive constants
const GDRIVE_TOKENS_KEY = 'affoGDriveTokens';
const GDRIVE_AUTH_STATUS_KEY = 'affoGDriveAuthStatus';
const GDRIVE_FOLDER_SUFFIX_KEY = 'affoGDriveFolderSuffix';
// GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET are loaded from gdrive-config.js (gitignored)
const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GDRIVE_API = 'https://www.googleapis.com/drive/v3';
const GDRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
// Loopback redirect URIs (native app OAuth flow) — intercepted via webRequest.
// Some desktop Firefox + Google account combinations fail on one host and succeed on the other.
const GDRIVE_REDIRECT_URIS = [
  'http://127.0.0.1:45678/',
  'http://localhost:45678/'
];

// WebDAV constants
const WEBDAV_CONFIG_KEY = 'affoWebDavConfig';     // { serverUrl, username, password, anonymous }
const WEBDAV_FOLDER_SUFFIX_KEY = 'affoWebDavFolderSuffix';

let syncQueue = Promise.resolve();
let syncMetaQueue = Promise.resolve();
let syncWriteDepth = 0;

// Cached folder ID (cleared on background script restart)
let cachedAppFolderId = null;

const srouletteInsertedCssByTab = new Map();

function sanitizeTimestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function sanitizeSyncItem(rawItem) {
  const item = (rawItem && typeof rawItem === 'object') ? rawItem : {};
  const modified = sanitizeTimestamp(item.modified);
  const deletedAt = sanitizeTimestamp(item.deletedAt);
  const remoteRev = (typeof item.remoteRev === 'string' && item.remoteRev.trim())
    ? item.remoteRev.trim()
    : null;
  if (deletedAt > 0 && deletedAt >= modified) {
    return remoteRev ? { modified: deletedAt, deletedAt, remoteRev } : { modified: deletedAt, deletedAt };
  }
  return remoteRev ? { modified, remoteRev } : { modified };
}

function sanitizeSyncContainer(raw) {
  const source = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = sanitizeSyncItem(value);
  }
  return out;
}

function sanitizeApplyMap(rawMap) {
  const source = (rawMap && typeof rawMap === 'object') ? rawMap : {};
  const out = {};
  for (const origin of Object.keys(source).sort()) {
    const value = source[origin];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[origin] = value;
    }
  }
  return out;
}

function sanitizeApplyMapMeta(rawMeta) {
  const source = (rawMeta && typeof rawMeta === 'object') ? rawMeta : {};
  const maybeByOrigin = (source.byOrigin && typeof source.byOrigin === 'object')
    ? source.byOrigin
    : source;
  const byOrigin = {};
  for (const origin of Object.keys(maybeByOrigin).sort()) {
    const item = sanitizeSyncItem(maybeByOrigin[origin]);
    if (item.modified > 0) {
      byOrigin[origin] = item;
    }
  }
  return {
    version: 1,
    byOrigin
  };
}

function getApplyMapMetaMaxModified(metaByOrigin) {
  let max = 0;
  for (const item of Object.values(metaByOrigin || {})) {
    const modified = sanitizeSyncItem(item).modified;
    if (modified > max) max = modified;
  }
  return max;
}

function compareSyncItems(localItemRaw, remoteItemRaw) {
  const local = sanitizeSyncItem(localItemRaw);
  const remote = sanitizeSyncItem(remoteItemRaw);

  if (local.modified > remote.modified) return 1;
  if (remote.modified > local.modified) return -1;

  const localDeletedAt = sanitizeTimestamp(local.deletedAt);
  const remoteDeletedAt = sanitizeTimestamp(remote.deletedAt);
  if (localDeletedAt > remoteDeletedAt) return 1;
  if (remoteDeletedAt > localDeletedAt) return -1;
  if (localDeletedAt > 0 && remoteDeletedAt === 0) return 1;
  if (remoteDeletedAt > 0 && localDeletedAt === 0) return -1;
  return 0;
}

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isSroulettePool(value) {
  return AFFOSroulette.isPool(value);
}

function isSrouletteTarget(value) {
  return AFFOSroulette.isTarget(value);
}

function isSrouletteCssTarget(value) {
  return AFFOSroulette.isCssTarget(value);
}

function clearSrouletteIntentForTarget(entry, target) {
  AFFOSroulette.clearIntent(entry, target);
}

function setSrouletteIntentForTarget(entry, target, pool) {
  return AFFOSroulette.setIntent(entry, target, pool);
}

async function removeTrackedSrouletteCss(tabId, targets) {
  if (tabId == null) return;
  const tracked = srouletteInsertedCssByTab.get(tabId);
  if (!tracked) return;

  const trackedTargets = Array.isArray(targets) && targets.length
    ? targets.filter(isSrouletteCssTarget)
    : Object.keys(tracked).filter(isSrouletteCssTarget);

  for (const target of trackedTargets) {
    const css = tracked[target];
    if (!css) continue;
    for (const cssOrigin of ['author', 'user']) {
      try {
        await browser.tabs.removeCSS(tabId, { code: css, cssOrigin });
      } catch (e) {
        affoDebugLog('[AFFO Background] Sroulette removeCSS note:', e.message);
      }
    }
    delete tracked[target];
  }

  if (!tracked.serif && !tracked.sans && !tracked.mono) {
    srouletteInsertedCssByTab.delete(tabId);
  }
}

async function insertTrackedSrouletteCss(tabId, target, css) {
  if (tabId == null || !isSrouletteCssTarget(target) || typeof css !== 'string' || !css.trim()) {
    return false;
  }

  await removeTrackedSrouletteCss(tabId, [target]);
  await browser.tabs.insertCSS(tabId, { code: css, cssOrigin: 'author' });
  await browser.tabs.insertCSS(tabId, { code: css, cssOrigin: 'user' });

  let tracked = srouletteInsertedCssByTab.get(tabId);
  if (!tracked) {
    tracked = {};
    srouletteInsertedCssByTab.set(tabId, tracked);
  }
  tracked[target] = css;
  return true;
}

try {
  if (browser.tabs && browser.tabs.onRemoved) {
    browser.tabs.onRemoved.addListener(tabId => {
      srouletteInsertedCssByTab.delete(tabId);
    });
  }
} catch (_) {}

function getAffoBrowserActionOriginFromUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.hostname || '';
  } catch (_) {
    return '';
  }
}

function getAffoBrowserActionTitleForTab(tab, applyMap) {
  const origin = getAffoBrowserActionOriginFromUrl(tab && tab.url);
  const domainData = origin && applyMap && applyMap[origin] ? applyMap[origin] : null;
  const formatter = typeof globalThis !== 'undefined' && typeof globalThis.formatAffoBrowserActionTitle === 'function'
    ? globalThis.formatAffoBrowserActionTitle
    : null;
  if (formatter) {
    return formatter(domainData);
  }
  return 'A Font Face-off';
}

function canSetAffoBrowserActionTitle() {
  return browser &&
    browser.browserAction &&
    typeof browser.browserAction.setTitle === 'function';
}

function sanitizeApplyMapForTitle(rawMap) {
  return (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) ? rawMap : {};
}

async function getAffoApplyMapForTitle() {
  const data = await browser.storage.local.get(APPLY_MAP_KEY);
  return sanitizeApplyMapForTitle(data && data[APPLY_MAP_KEY]);
}

async function updateAffoBrowserActionTitleForTab(tab, applyMap = null) {
  if (!canSetAffoBrowserActionTitle() || !tab || tab.id == null) return false;
  const map = applyMap || await getAffoApplyMapForTitle();
  const title = getAffoBrowserActionTitleForTab(tab, map);
  await browser.browserAction.setTitle({ tabId: tab.id, title });
  return true;
}

async function updateAffoBrowserActionTitleForTabId(tabId) {
  if (tabId == null || !browser.tabs || typeof browser.tabs.get !== 'function') return false;
  try {
    const tab = await browser.tabs.get(tabId);
    return updateAffoBrowserActionTitleForTab(tab);
  } catch (e) {
    affoDebugWarn('[AFFO Background] Failed to update browser action title for tab:', e);
    return false;
  }
}

async function updateAffoBrowserActionTitleForActiveTabs() {
  if (!canSetAffoBrowserActionTitle() || !browser.tabs || typeof browser.tabs.query !== 'function') return false;
  try {
    const tabs = await browser.tabs.query({ active: true });
    if (!tabs || !tabs.length) return false;
    const applyMap = await getAffoApplyMapForTitle();
    await Promise.all(tabs.map(tab => updateAffoBrowserActionTitleForTab(tab, applyMap)));
    return true;
  } catch (e) {
    affoDebugWarn('[AFFO Background] Failed to update active browser action titles:', e);
    return false;
  }
}

function initAffoBrowserActionTitleUpdates() {
  try {
    if (browser.tabs && browser.tabs.onActivated) {
      browser.tabs.onActivated.addListener(info => {
        updateAffoBrowserActionTitleForTabId(info && info.tabId);
      });
    }
    if (browser.tabs && browser.tabs.onUpdated) {
      browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo && changeInfo.url && tab && tab.active) {
          updateAffoBrowserActionTitleForTab(tab);
        } else if (changeInfo && changeInfo.url && tabId != null) {
          updateAffoBrowserActionTitleForTabId(tabId);
        }
      });
    }
    if (browser.windows && browser.windows.onFocusChanged) {
      browser.windows.onFocusChanged.addListener(() => {
        updateAffoBrowserActionTitleForActiveTabs();
      });
    }
    updateAffoBrowserActionTitleForActiveTabs();
  } catch (e) {
    affoDebugWarn('[AFFO Background] Failed to initialize browser action title updates:', e);
  }
}

if (typeof self !== 'undefined') {
  self.affoGetBrowserActionTitleForTab = getAffoBrowserActionTitleForTab;
  self.affoUpdateBrowserActionTitleForTab = updateAffoBrowserActionTitleForTab;
  self.affoUpdateBrowserActionTitleForActiveTabs = updateAffoBrowserActionTitleForActiveTabs;
} else if (typeof globalThis !== 'undefined') {
  globalThis.affoGetBrowserActionTitleForTab = getAffoBrowserActionTitleForTab;
  globalThis.affoUpdateBrowserActionTitleForTab = updateAffoBrowserActionTitleForTab;
  globalThis.affoUpdateBrowserActionTitleForActiveTabs = updateAffoBrowserActionTitleForActiveTabs;
}

initAffoBrowserActionTitleUpdates();

async function markApplyMapOriginsModified(change) {
  const oldMap = sanitizeApplyMap(change && change.oldValue);
  const newMap = sanitizeApplyMap(change && change.newValue);
  const allOrigins = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
  const changedOrigins = [];
  for (const origin of allOrigins) {
    if (!jsonEqual(oldMap[origin], newMap[origin])) {
      changedOrigins.push(origin);
    }
  }
  if (!changedOrigins.length) return false;

  const now = Date.now();
  const stored = await browser.storage.local.get(APPLY_MAP_META_KEY);
  const nextMeta = sanitizeApplyMapMeta(stored[APPLY_MAP_META_KEY]);

  for (const origin of changedOrigins.sort()) {
    if (Object.prototype.hasOwnProperty.call(newMap, origin)) {
      nextMeta.byOrigin[origin] = { modified: now };
    } else {
      nextMeta.byOrigin[origin] = { modified: now, deletedAt: now };
    }
  }

  await browser.storage.local.set({ [APPLY_MAP_META_KEY]: nextMeta });
  await queueSyncMetaMutation((meta) => {
    setModified(meta.items, SYNC_DOMAINS_NAME, now);
    setModified(meta.items, SYNC_DOMAINS_META_NAME, now);
  });
  return true;
}

function sanitizeDomainOriginArray(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  const uniq = new Set();
  for (const item of rawArray) {
    const origin = (typeof item === 'string') ? item.trim() : '';
    if (origin) uniq.add(origin);
  }
  return Array.from(uniq).sort();
}

function sanitizeDomainOriginMeta(rawMeta) {
  return sanitizeApplyMapMeta(rawMeta);
}

function seedDomainMetaFromArray(meta, origins, fallbackModified, now) {
  const modified = sanitizeTimestamp(fallbackModified) || now;
  for (const origin of origins) {
    if (!meta.byOrigin[origin]) {
      meta.byOrigin[origin] = { modified };
    }
  }
}

function mergeDomainOriginMeta(localMeta, remoteMeta) {
  const allOrigins = new Set([
    ...Object.keys(localMeta.byOrigin),
    ...Object.keys(remoteMeta.byOrigin)
  ]);
  const mergedByOrigin = {};

  for (const origin of Array.from(allOrigins).sort()) {
    const localItem = localMeta.byOrigin[origin] || null;
    const remoteItem = remoteMeta.byOrigin[origin] || null;
    const cmp = compareSyncItems(localItem, remoteItem);
    const winning = sanitizeSyncItem(
      cmp < 0 || (cmp === 0 && remoteItem)
        ? remoteItem
        : localItem
    );
    if (winning.modified > 0) {
      if (sanitizeTimestamp(winning.deletedAt) > 0) {
        mergedByOrigin[origin] = { modified: winning.modified, deletedAt: winning.deletedAt };
      } else {
        mergedByOrigin[origin] = { modified: winning.modified };
      }
    }
  }

  const mergedMeta = { version: 1, byOrigin: mergedByOrigin };
  const mergedOrigins = Object.keys(mergedByOrigin).filter((origin) => !sanitizeTimestamp(mergedByOrigin[origin].deletedAt)).sort();
  return { mergedMeta, mergedOrigins };
}

async function markDomainOriginArrayModified(change, options) {
  const {
    localMetaStorageKey,
    syncArrayFilename,
    syncMetaFilename
  } = options;
  const oldOrigins = sanitizeDomainOriginArray(change && change.oldValue);
  const newOrigins = sanitizeDomainOriginArray(change && change.newValue);
  const allOrigins = new Set([...oldOrigins, ...newOrigins]);
  const oldSet = new Set(oldOrigins);
  const newSet = new Set(newOrigins);
  const changedOrigins = [];
  for (const origin of allOrigins) {
    if (oldSet.has(origin) !== newSet.has(origin)) {
      changedOrigins.push(origin);
    }
  }
  if (!changedOrigins.length) return false;

  const now = Date.now();
  const stored = await browser.storage.local.get(localMetaStorageKey);
  const nextMeta = sanitizeDomainOriginMeta(stored[localMetaStorageKey]);
  for (const origin of changedOrigins.sort()) {
    if (newSet.has(origin)) {
      nextMeta.byOrigin[origin] = { modified: now };
    } else {
      nextMeta.byOrigin[origin] = { modified: now, deletedAt: now };
    }
  }
  await browser.storage.local.set({ [localMetaStorageKey]: nextMeta });
  await queueSyncMetaMutation((meta) => {
    setModified(meta.items, syncArrayFilename, now);
    setModified(meta.items, syncMetaFilename, now);
  });
  return true;
}

function setModified(items, itemKey, modified, options = {}) {
  const explicitRemoteRev = Object.prototype.hasOwnProperty.call(options, 'remoteRev');
  const remoteRev = explicitRemoteRev
    ? ((typeof options.remoteRev === 'string' && options.remoteRev.trim()) ? options.remoteRev.trim() : null)
    : ((typeof (items[itemKey] && items[itemKey].remoteRev) === 'string' && items[itemKey].remoteRev.trim())
      ? items[itemKey].remoteRev.trim()
      : null);
  const next = { modified };
  if (remoteRev) next.remoteRev = remoteRev;
  items[itemKey] = next;
}

function normalizeSyncMode(mode) {
  if (mode === SYNC_MODE_PUSH || mode === SYNC_MODE_PULL) return mode;
  return SYNC_MODE_MERGE;
}

function createForcedDomainMeta(activeOrigins, deletedOrigins, modified) {
  const byOrigin = {};
  for (const origin of Array.from(new Set(activeOrigins || [])).sort()) {
    byOrigin[origin] = { modified };
  }
  for (const origin of Array.from(new Set(deletedOrigins || [])).sort()) {
    if (byOrigin[origin]) continue;
    byOrigin[origin] = { modified, deletedAt: modified };
  }
  return { version: 1, byOrigin };
}



function buildRemoteRevision(file) {
  if (!file || !file.id) return null;
  const version = String(file.version || '').trim();
  if (version && /^[0-9]+$/.test(version)) {
    return `${String(file.id)}:v${version}`;
  }
  const modified = sanitizeTimestamp(Date.parse(file.modifiedTime));
  if (!modified) return null;
  return `${String(file.id)}:${modified}`;
}

function parseRemoteRevision(remoteRev) {
  const raw = (typeof remoteRev === 'string') ? remoteRev.trim() : '';
  if (!raw) return null;

  const idx = raw.lastIndexOf(':');
  if (idx <= 0 || idx === raw.length - 1) return null;

  const fileId = raw.slice(0, idx);
  const token = raw.slice(idx + 1);
  if (/^v[0-9]+$/.test(token)) {
    return { raw, fileId, kind: 'version', value: token.slice(1) };
  }
  if (/^[0-9]+$/.test(token)) {
    return { raw, fileId, kind: 'mtime', value: Number(token) };
  }
  return { raw, fileId, kind: 'opaque', value: token };
}

function getExpectedRemoteRevision(itemState) {
  return (typeof (itemState && itemState.remoteRev) === 'string' && itemState.remoteRev.trim())
    ? itemState.remoteRev.trim()
    : null;
}

function getPushExpectedRemoteRevision(itemState, options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'expectedRemoteRev')) {
    return (typeof options.expectedRemoteRev === 'string' && options.expectedRemoteRev.trim())
      ? options.expectedRemoteRev.trim()
      : null;
  }
  return getExpectedRemoteRevision(itemState);
}

async function ensureRemoteRevisionUnchanged(itemState, filename, folderId) {
  const expectedRemoteRev = getExpectedRemoteRevision(itemState);
  if (!expectedRemoteRev) {
    return { ok: true, expectedRemoteRev: null, currentRemoteRev: null };
  }
  const expected = parseRemoteRevision(expectedRemoteRev);
  if (!expected) {
    return { ok: true, expectedRemoteRev, currentRemoteRev: null, legacyWeakRev: true };
  }

  const latest = await findFile(filename, folderId);
  if (!latest) {
    return { ok: false, expectedRemoteRev, currentRemoteRev: null };
  }

  const currentRemoteRev = buildRemoteRevision(latest);
  if (String(latest.id) !== expected.fileId) {
    return { ok: false, expectedRemoteRev, currentRemoteRev: currentRemoteRev || null };
  }

  if (expected.kind === 'version') {
    const currentVersion = String(latest.version || '').trim();
    if (!currentVersion || currentVersion !== expected.value) {
      return { ok: false, expectedRemoteRev, currentRemoteRev: currentRemoteRev || null };
    }
    return { ok: true, expectedRemoteRev, currentRemoteRev };
  }

  // Legacy timestamp-based revisions were coarse and can drift subtly across APIs.
  // Treat them as weak hints to avoid false conflict failures and upgrade to version-based revisions on next write.
  if (expected.kind === 'mtime') {
    return { ok: true, expectedRemoteRev, currentRemoteRev, legacyWeakRev: true };
  }

  if (!currentRemoteRev || currentRemoteRev !== expectedRemoteRev) {
    return { ok: false, expectedRemoteRev, currentRemoteRev: currentRemoteRev || null };
  }
  return { ok: true, expectedRemoteRev, currentRemoteRev };
}

function assertRemoteRevisionUnchanged(checkResult, filename) {
  if (checkResult.ok) return;
  if (checkResult.currentRemoteRev) {
    throw new Error(
      `Remote revision changed for ${filename}; expected ${checkResult.expectedRemoteRev} but found ${checkResult.currentRemoteRev}`
    );
  }
  throw new Error(`Remote revision changed for ${filename}; expected ${checkResult.expectedRemoteRev} but file is missing`);
}

function escapeGDriveQueryLiteral(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function pickNewerSyncItem(currentItem, nextItem) {
  const current = sanitizeSyncItem(currentItem);
  const next = sanitizeSyncItem(nextItem);
  const currentModified = sanitizeTimestamp(current.modified);
  const nextModified = sanitizeTimestamp(next.modified);
  if (nextModified > currentModified) return next;
  if (currentModified > nextModified) return current;

  const currentDeletedAt = sanitizeTimestamp(current.deletedAt);
  const nextDeletedAt = sanitizeTimestamp(next.deletedAt);
  if (nextDeletedAt > currentDeletedAt) return next;
  if (currentDeletedAt > nextDeletedAt) return current;
  if (nextDeletedAt > 0 && currentDeletedAt === 0) return next;
  if (currentDeletedAt > 0 && nextDeletedAt === 0) return current;
  return next;
}

function mergeSyncMeta(baseMeta, nextMeta) {
  const base = {
    lastSync: sanitizeTimestamp(baseMeta && baseMeta.lastSync),
    items: sanitizeSyncContainer(baseMeta && baseMeta.items)
  };
  const next = {
    lastSync: sanitizeTimestamp(nextMeta && nextMeta.lastSync),
    items: sanitizeSyncContainer(nextMeta && nextMeta.items)
  };
  const items = Object.assign({}, base.items);
  for (const [itemKey, nextItem] of Object.entries(next.items)) {
    items[itemKey] = pickNewerSyncItem(items[itemKey], nextItem);
  }
  return {
    lastSync: Math.max(base.lastSync, next.lastSync),
    items
  };
}

function queueSyncMetaMutation(mutator) {
  const queued = syncMetaQueue.then(async () => {
    const meta = await getLocalSyncMeta();
    await mutator(meta);
    await saveLocalSyncMeta(meta);
    return meta;
  });
  syncMetaQueue = queued.catch(() => { });
  return queued;
}

async function mergeAndSaveLocalSyncMeta(nextMeta) {
  await queueSyncMetaMutation((currentMeta) => {
    const merged = mergeSyncMeta(currentMeta, nextMeta);
    currentMeta.lastSync = merged.lastSync;
    currentMeta.items = merged.items;
  });
}

async function setStorageDuringSync(values) {
  syncWriteDepth += 1;
  try {
    await browser.storage.local.set(values);
  } finally {
    syncWriteDepth -= 1;
  }
}

// ─── Google Drive: OAuth & Token Management ────────────────────────────

async function getGDriveTokens() {
  const data = await browser.storage.local.get(GDRIVE_TOKENS_KEY);
  return data[GDRIVE_TOKENS_KEY] || null;
}

async function getGDriveAuthStatus() {
  const data = await browser.storage.local.get(GDRIVE_AUTH_STATUS_KEY);
  return data[GDRIVE_AUTH_STATUS_KEY] || null;
}

async function saveGDriveAuthStatus(status) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    await browser.storage.local.remove(GDRIVE_AUTH_STATUS_KEY);
    return;
  }
  await browser.storage.local.set({ [GDRIVE_AUTH_STATUS_KEY]: status });
}

async function clearGDriveAuthStatus() {
  await browser.storage.local.remove(GDRIVE_AUTH_STATUS_KEY);
}

async function saveGDriveTokens(tokens) {
  await browser.storage.local.set({ [GDRIVE_TOKENS_KEY]: tokens });
  await clearGDriveAuthStatus();
}

async function isGDriveConfigured() {
  const tokens = await getGDriveTokens();
  return !!(tokens && tokens.accessToken && tokens.refreshToken);
}

let _refreshPromise = null;

function parseOAuthErrorResponse(text) {
  if (!text) {
    return { raw: '', error: '', errorDescription: '', errorSubtype: '' };
  }
  try {
    const parsed = JSON.parse(text);
    return {
      raw: text,
      error: parsed && parsed.error ? String(parsed.error) : '',
      errorDescription: parsed && parsed.error_description ? String(parsed.error_description) : '',
      errorSubtype: parsed && parsed.error_subtype ? String(parsed.error_subtype) : ''
    };
  } catch (_) {
    return { raw: text, error: '', errorDescription: '', errorSubtype: '' };
  }
}

function buildGDriveReconnectMessage(oauthError) {
  const detail = oauthError.errorDescription || oauthError.error || 'refresh token revoked';
  const subtype = oauthError.errorSubtype ? `; subtype: ${oauthError.errorSubtype}` : '';
  return `Google Drive authorization expired (${detail}${subtype}). Reconnect Google Drive.`;
}

function buildGDriveReconnectStatus(oauthError) {
  return {
    state: 'reconnect_required',
    reason: oauthError.error || 'invalid_grant',
    detail: oauthError.errorDescription || oauthError.error || 'refresh token revoked',
    errorSubtype: oauthError.errorSubtype || '',
    updatedAt: Date.now(),
    message: buildGDriveReconnectMessage(oauthError)
  };
}

async function clearGDriveTokens(options = {}) {
  const authStatus = options.authStatus || null;
  if (authStatus) {
    await browser.storage.local.set({ [SYNC_BACKEND_KEY]: 'gdrive' });
    await saveGDriveAuthStatus(authStatus);
  } else {
    await clearGDriveAuthStatus();
  }
  await browser.storage.local.remove(GDRIVE_TOKENS_KEY);
  cachedAppFolderId = null;
  await stopSyncAlarm();
}

async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _doRefreshAccessToken();
  return _refreshPromise.finally(() => { _refreshPromise = null; });
}

async function _doRefreshAccessToken() {
  const tokens = await getGDriveTokens();
  if (!tokens || !tokens.refreshToken) {
    throw new Error('No refresh token available — please reconnect Google Drive');
  }
  const body = new URLSearchParams({
    client_id: GDRIVE_CLIENT_ID,
    client_secret: GDRIVE_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    credentials: 'omit'
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const oauthError = parseOAuthErrorResponse(errText);
    if (oauthError.error === 'invalid_grant') {
      const authStatus = buildGDriveReconnectStatus(oauthError);
      await clearGDriveTokens({ authStatus });
      throw new Error(authStatus.message);
    }
    throw new Error(`Token refresh failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  if (!data || !data.access_token) {
    throw new Error('Token refresh failed: missing access token in response');
  }
  const updated = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000
  };
  await saveGDriveTokens(updated);
  return updated;
}

async function gdriveFetch(url, options = {}) {
  if (!navigator.onLine) {
    throw new Error('Device is offline');
  }

  let tokens = await getGDriveTokens();
  if (!tokens || !tokens.accessToken) {
    const authStatus = await getGDriveAuthStatus();
    if (authStatus && authStatus.state === 'reconnect_required' && authStatus.message) {
      throw new Error(authStatus.message);
    }
    throw new Error('Google Drive not connected');
  }

  // Proactively refresh if token is expired or about to expire (1 minute buffer)
  if (tokens.expiresAt && Date.now() > tokens.expiresAt - 60000) {
    tokens = await refreshAccessToken();
  }

  const doFetch = async (accessToken) => {
    const headers = Object.assign({}, options.headers || {}, {
      Authorization: `Bearer ${accessToken}`
    });
    return fetch(url, Object.assign({}, options, { headers, credentials: 'omit' }));
  };

  let res = await doFetch(tokens.accessToken);

  // On 401, try refresh once
  if (res.status === 401) {
    tokens = await refreshAccessToken();
    res = await doFetch(tokens.accessToken);
  }

  // On 429, exponential backoff
  if (res.status === 429) {
    let delay = 1000;
    for (let attempt = 0; attempt < 5; attempt++) {
      const retryAfter = res.headers.get('retry-after');
      if (retryAfter) {
        const serverDelay = isNaN(+retryAfter)
          ? new Date(retryAfter).getTime() - Date.now()
          : +retryAfter * 1000;
        if (serverDelay > 0) delay = serverDelay;
      }
      await new Promise(r => setTimeout(r, delay));
      res = await doFetch(tokens.accessToken);
      if (res.status !== 429) break;
      delay = Math.min(delay * 2, 32000);
    }
  }

  return res;
}

// ─── Google Drive: PKCE helpers ────────────────────────────────────────

function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function exchangeCodeForTokens(code, codeVerifier, redirectUri) {
  const existingTokens = await getGDriveTokens();
  const tokenBody = new URLSearchParams({
    client_id: GDRIVE_CLIENT_ID,
    client_secret: GDRIVE_CLIENT_SECRET,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody,
    credentials: 'omit'
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
  }

  const tokenData = await tokenRes.json();
  const refreshToken = tokenData.refresh_token || (existingTokens && existingTokens.refreshToken) || null;
  if (!tokenData || !tokenData.access_token) {
    throw new Error('Token exchange failed: missing access token in response');
  }
  if (!refreshToken) {
    throw new Error(
      'Google OAuth did not return a refresh token. Check that you are using a Desktop app OAuth client and that the consent screen is not stuck in Testing.'
    );
  }
  const tokens = {
    accessToken: tokenData.access_token,
    refreshToken,
    expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000
  };
  await saveGDriveTokens(tokens);
  await browser.storage.local.set({ [SYNC_BACKEND_KEY]: 'gdrive' });
  cachedAppFolderId = null;
  await startSyncAlarm();
  affoDebugLog('[AFFO Background] Google Drive connected');
  return { ok: true };
}

function buildAuthUrl(codeChallenge, redirectUri, state, forceConsent) {
  const params = new URLSearchParams({
    client_id: GDRIVE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GDRIVE_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    state
  });
  if (forceConsent) params.set('prompt', 'consent');
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Tab-based auth for one loopback redirect URI:
// opens tab + intercepts redirect via webRequest (desktop + Android)
function startGDriveAuthViaTab(redirectUri, forceConsent) {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    let oauthTabId = -1;
    let canCancelOAuthRedirect = false;
    let webRequestListenerRegistered = false;
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateCodeVerifier(); // random string for CSRF protection
    const authUrl = buildAuthUrl(codeChallenge, redirectUri, state, forceConsent);

    const cleanup = () => {
      if (webRequestListenerRegistered) {
        browser.webRequest.onBeforeRequest.removeListener(listener);
      }
      browser.tabs.onUpdated.removeListener(onTabUpdated);
    };

    const handleRedirectUrl = (redirectUrl, tabId) => {
      if (settled) return;
      // The filter pattern is broad (port stripped for Firefox compat),
      // so verify this is actually our redirect before acting
      if (!redirectUrl || !redirectUrl.startsWith(redirectUri)) return false;
      const url = new URL(redirectUrl);
      if (url.searchParams.get('state') !== state) return; // CSRF check
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      settled = true;
      cleanup();

      // Close the OAuth tab
      if (tabId >= 0) {
        browser.tabs.remove(tabId).catch(() => { });
      } else if (oauthTabId >= 0) {
        browser.tabs.remove(oauthTabId).catch(() => { });
      }

      if (error) {
        reject(new Error(`OAuth error: ${error}`));
      } else if (code) {
        exchangeCodeForTokens(code, codeVerifier, redirectUri)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error('No authorization code received'));
      }

      return true;
    };

    const listener = (details) => {
      const handled = handleRedirectUrl(details.url, details.tabId);
      return handled && canCancelOAuthRedirect ? { cancel: true } : undefined;
    };

    const onTabUpdated = (tabId, changeInfo) => {
      if (settled) return;
      if (tabId !== oauthTabId) return;
      if (!changeInfo.url) return;
      if (handleRedirectUrl(changeInfo.url, tabId)) return;
      if (changeInfo.url.startsWith('https://accounts.google.com/info/unknownerror')) {
        settled = true;
        if (oauthTabId >= 0) {
          browser.tabs.remove(oauthTabId).catch(() => { });
        }
        cleanup();
        reject(new Error('Google OAuth returned unknownerror during account selection'));
      }
    };

    // Firefox match patterns don't support port numbers — strip port for the filter,
    // then do precise matching inside the listener via full URL comparison
    const filterPattern = redirectUri.replace(/:\d+/, '') + '*';
    const webRequestFilter = { urls: [filterPattern], types: ['main_frame', 'xmlhttprequest'] };
    try {
      browser.webRequest.onBeforeRequest.addListener(listener, webRequestFilter, ['blocking']);
      canCancelOAuthRedirect = true;
      webRequestListenerRegistered = true;
    } catch (e) {
      affoDebugWarn('[AFFO Background] Blocking OAuth redirect listener unavailable; observing redirect without cancellation:', e);
      browser.webRequest.onBeforeRequest.addListener(listener, webRequestFilter);
      webRequestListenerRegistered = true;
    }
    browser.tabs.onUpdated.addListener(onTabUpdated);

    try {
      const tab = await browser.tabs.create({ url: authUrl, active: true });
      oauthTabId = tab && typeof tab.id === 'number' ? tab.id : -1;
    } catch (e) {
      settled = true;
      cleanup();
      reject(e);
    }

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('OAuth flow timed out'));
      }
    }, 5 * 60 * 1000);
  });
}

async function startGDriveAuth() {
  // Always use tab-based OAuth with loopback redirect (native app flow).
  // Try localhost + 127.0.0.1 because some desktop Firefox account flows
  // fail with one host and succeed with the other.
  const existingTokens = await getGDriveTokens();
  const forceConsent = !(existingTokens && existingTokens.refreshToken);
  const errors = [];
  for (const redirectUri of GDRIVE_REDIRECT_URIS) {
    try {
      return await startGDriveAuthViaTab(redirectUri, forceConsent);
    } catch (e) {
      errors.push(`${redirectUri} -> ${e && e.message ? e.message : String(e)}`);
    }
  }
  throw new Error(`OAuth failed for all redirect hosts: ${errors.join(' | ')}`);
}

async function disconnectGDrive() {
  const tokens = await getGDriveTokens();
  const revokeToken = tokens && (tokens.refreshToken || tokens.accessToken);
  if (revokeToken) {
    // Best-effort revoke
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(revokeToken)}`, {
      method: 'POST',
      credentials: 'omit'
    }).catch(() => { });
  }
  await browser.storage.local.remove([GDRIVE_TOKENS_KEY, GDRIVE_AUTH_STATUS_KEY, SYNC_META_KEY, SYNC_BACKEND_KEY]);
  cachedAppFolderId = null;
  await stopSyncAlarm();
  affoDebugLog('[AFFO Background] Google Drive disconnected');
  return { ok: true };
}

// ─── Google Drive: Folder & File Operations ────────────────────────────

function buildSyncFolderName(suffix) {
  const trimmed = String(suffix || '').trim();
  return trimmed ? `${SYNC_FOLDER_NAME} ${trimmed}` : SYNC_FOLDER_NAME;
}

async function getAppFolderName() {
  const data = await browser.storage.local.get(GDRIVE_FOLDER_SUFFIX_KEY);
  const suffix = data[GDRIVE_FOLDER_SUFFIX_KEY];
  return buildSyncFolderName(suffix);
}

async function getWebDavFolderName() {
  const data = await browser.storage.local.get([WEBDAV_FOLDER_SUFFIX_KEY, GDRIVE_FOLDER_SUFFIX_KEY]);
  const suffix = data[WEBDAV_FOLDER_SUFFIX_KEY] !== undefined
    ? data[WEBDAV_FOLDER_SUFFIX_KEY]
    : data[GDRIVE_FOLDER_SUFFIX_KEY];
  return buildSyncFolderName(suffix);
}

async function findFolder(name, parentId) {
  const escapedName = escapeGDriveQueryLiteral(name);
  const escapedParentId = parentId ? escapeGDriveQueryLiteral(parentId) : null;
  const q = parentId
    ? `name='${escapedName}' and '${escapedParentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${escapedName}' and 'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await gdriveFetch(`${GDRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
  if (!res.ok) throw new Error(`Google Drive list failed: ${res.status}`);
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function createFolder(name, parentId) {
  const metadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) metadata.parents = [parentId];
  const res = await gdriveFetch(`${GDRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
  });
  if (!res.ok) throw new Error(`Google Drive folder creation failed: ${res.status}`);
  const data = await res.json();
  return data.id;
}

// ─── Google Drive: Sync I/O Layer ──────────────────────────────────────
// These four functions form the sync backend interface. runSync() calls
// only these (plus ensureAppFolder for init). To add WebDAV or another
// backend, implement the same interface:
//   init()                          → backend-specific setup (folder, auth)
//   get(name)                       → { data, remoteRev } | { notFound: true }
//   put(name, content, contentType) → { id, remoteRev }
//   remove(name)                    → void

async function ensureAppFolder() {
  if (cachedAppFolderId) {
    return { appFolderId: cachedAppFolderId };
  }

  const folderName = await getAppFolderName();

  // Find or create app folder
  let appFolderId = await findFolder(folderName, null);
  if (!appFolderId) {
    appFolderId = await createFolder(folderName, null);
    affoDebugLog(`[AFFO Background] Created Google Drive folder: ${folderName}`);
  }

  cachedAppFolderId = appFolderId;
  return { appFolderId };
}

async function findFilesByName(name, folderId) {
  const escapedName = escapeGDriveQueryLiteral(name);
  const escapedFolderId = escapeGDriveQueryLiteral(folderId);
  const q = `name='${escapedName}' and '${escapedFolderId}' in parents and trashed=false`;
  const res = await gdriveFetch(
    `${GDRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime,createdTime)&spaces=drive&orderBy=modifiedTime desc,createdTime desc&pageSize=100`
  );
  if (!res.ok) throw new Error(`Google Drive file search failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

async function findFile(name, folderId) {
  const files = await findFilesByName(name, folderId);
  if (files.length > 1) {
    affoDebugWarn(`[AFFO Background] Duplicate Google Drive files found for ${name}; using latest modified file`);
  }
  return files.length > 0 ? files[0] : null;
}

async function gdriveGetFile(name, folderId) {
  const file = await findFile(name, folderId);
  if (!file) return { notFound: true };
  const res = await gdriveFetch(`${GDRIVE_API}/files/${file.id}?alt=media`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`Google Drive GET failed: ${res.status}`);
  const text = await res.text();
  return { data: text, fileId: file.id, remoteRev: buildRemoteRevision(file) };
}

async function gdrivePutFile(name, folderId, content, contentType) {
  const matches = await findFilesByName(name, folderId);
  const existingId = matches.length > 0 ? matches[0].id : null;
  const boundary = '----AffoSyncBoundary' + Date.now();
  const metadata = existingId
    ? { name }
    : { name, parents: [folderId] };

  const body = [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${contentType}\r\n\r\n`,
    content,
    `\r\n--${boundary}--`
  ].join('');

  const url = existingId
    ? `${GDRIVE_UPLOAD_API}/files/${existingId}?uploadType=multipart&fields=id,modifiedTime`
    : `${GDRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,modifiedTime`;

  const res = await gdriveFetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });

  if (!res.ok) throw new Error(`Google Drive upload failed: ${res.status}`);
  const data = await res.json();

  // Best-effort cleanup: keep one canonical file for a given name.
  for (let i = 1; i < matches.length; i++) {
    const dupId = matches[i] && matches[i].id;
    if (!dupId || dupId === data.id) continue;
    try {
      await gdriveFetch(`${GDRIVE_API}/files/${dupId}`, { method: 'DELETE' });
    } catch (e) {
      affoDebugWarn(`[AFFO Background] Failed deleting duplicate file ${name} (${dupId}):`, e);
    }
  }

  return {
    id: data.id,
    remoteRev: buildRemoteRevision(data)
  };
}

async function gdriveDeleteFile(name, folderId) {
  const matches = await findFilesByName(name, folderId);
  for (const match of matches) {
    const fileId = match && match.id;
    if (!fileId) continue;
    const res = await gdriveFetch(`${GDRIVE_API}/files/${fileId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Google Drive delete failed: ${res.status}`);
    }
  }
}

// ─── WebDAV I/O ───────────────────────────────────────────────────────

async function getWebDavConfig() {
  const data = await browser.storage.local.get(WEBDAV_CONFIG_KEY);
  return data[WEBDAV_CONFIG_KEY] || null;
}

async function isWebDavConfigured() {
  const config = await getWebDavConfig();
  if (!config || !config.serverUrl) return false;
  if (config.anonymous) return true;
  return !!(config.username && config.password);
}

async function connectWebDav(config) {
  await browser.storage.local.set({
    [WEBDAV_CONFIG_KEY]: config,
    [SYNC_BACKEND_KEY]: 'webdav'
  });
  await startSyncAlarm();
  affoDebugLog('[AFFO Background] WebDAV connected');
  return { ok: true };
}

async function disconnectWebDav() {
  await browser.storage.local.remove([WEBDAV_CONFIG_KEY, SYNC_META_KEY, SYNC_BACKEND_KEY]);
  await stopSyncAlarm();
  affoDebugLog('[AFFO Background] WebDAV disconnected');
  return { ok: true };
}

async function testWebDavConnection(config) {
  let url = config.serverUrl.trim();
  if (!url.endsWith('/')) url += '/';
  const headers = webdavHeaders(config);
  // Try a simple PROPFIND on the root to verify connectivity + auth
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: { ...headers, Depth: '0' },
    credentials: 'omit'
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Authentication failed');
  }
  if (!res.ok && res.status !== 207) {
    throw new Error('WebDAV server returned: ' + res.status);
  }
  return { ok: true };
}

function webdavHeaders(config) {
  const headers = {};
  if (!config.anonymous && config.username && config.password) {
    headers['Authorization'] = 'Basic ' + btoa(config.username + ':' + config.password);
  }
  return headers;
}

function normalizeWebDavEtag(rawEtag) {
  if (typeof rawEtag !== 'string') return null;
  const etag = rawEtag.trim();
  return etag ? etag : null;
}

function buildWebDavRemoteRevision(etag) {
  const normalized = normalizeWebDavEtag(etag);
  return normalized ? `webdav-etag:${normalized}` : null;
}

function parseWebDavRemoteRevision(remoteRev) {
  const raw = (typeof remoteRev === 'string') ? remoteRev.trim() : '';
  if (!raw.startsWith('webdav-etag:')) return null;
  const etag = normalizeWebDavEtag(raw.slice('webdav-etag:'.length));
  return etag ? { etag } : null;
}

async function webdavInit() {
  const config = await getWebDavConfig();
  if (!config || !config.serverUrl) throw new Error('WebDAV not configured');
  let url = config.serverUrl.trim();
  if (!url.endsWith('/')) url += '/';
  const folderName = await getWebDavFolderName();
  url += encodeURIComponent(folderName) + '/';
  const headers = webdavHeaders(config);
  // Ensure folder exists (MKCOL; 405 = already exists on most servers)
  const mkcolRes = await fetch(url, {
    method: 'MKCOL', headers, credentials: 'omit'
  });
  if (!mkcolRes.ok && mkcolRes.status !== 405) {
    throw new Error('WebDAV MKCOL failed: ' + mkcolRes.status);
  }
  return { baseUrl: url, headers };
}

// ─── Sync Backend Interface ───────────────────────────────────────────
// Each backend provides: init(), isConfigured(), get(name), put(name, content, contentType), remove(name)
// get returns { data, remoteRev } | { notFound: true }
// put returns { remoteRev } (if backend supports revision tracking)

const gdriveBackend = {
  name: 'gdrive',
  _folderId: null,
  async init() {
    const { appFolderId } = await ensureAppFolder();
    this._folderId = appFolderId;
  },
  async isConfigured() { return isGDriveConfigured(); },
  async get(name) { return gdriveGetFile(name, this._folderId); },
  async put(name, content, contentType) { return gdrivePutFile(name, this._folderId, content, contentType); },
  async remove(name) { return gdriveDeleteFile(name, this._folderId); },
};

const webdavBackend = {
  name: 'webdav',
  _baseUrl: null,
  _headers: {},
  async init() {
    const { baseUrl, headers } = await webdavInit();
    this._baseUrl = baseUrl;
    this._headers = headers;
  },
  async isConfigured() { return isWebDavConfigured(); },
  async get(name) {
    const res = await fetch(this._baseUrl + encodeURIComponent(name), {
      headers: this._headers, credentials: 'omit'
    });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error('WebDAV GET failed: ' + res.status);
    const data = await res.text();
    const remoteRev = buildWebDavRemoteRevision(res.headers.get('ETag'));
    return { data, remoteRev };
  },
  async put(name, content, contentType, options = {}) {
    const expected = parseWebDavRemoteRevision(options.expectedRemoteRev);
    const headers = { ...this._headers, 'Content-Type': contentType };
    if (expected && expected.etag) {
      headers['If-Match'] = expected.etag;
    }
    const res = await fetch(this._baseUrl + encodeURIComponent(name), {
      method: 'PUT',
      headers,
      body: content,
      credentials: 'omit'
    });
    if (res.status === 412) {
      throw new Error(`Remote revision changed for ${name}; WebDAV If-Match precondition failed`);
    }
    if (!res.ok) throw new Error('WebDAV PUT failed: ' + res.status);
    const remoteRev = buildWebDavRemoteRevision(res.headers.get('ETag'));
    return { remoteRev };
  },
  async remove(name) {
    const res = await fetch(this._baseUrl + encodeURIComponent(name), {
      method: 'DELETE', headers: this._headers, credentials: 'omit'
    });
    if (!res.ok && res.status !== 404) throw new Error('WebDAV DELETE failed: ' + res.status);
  },
};

async function getActiveBackend() {
  const data = await browser.storage.local.get(SYNC_BACKEND_KEY);
  const backend = data[SYNC_BACKEND_KEY];
  if (backend === 'webdav') return webdavBackend;
  if (backend === 'gdrive') return gdriveBackend;
  return null;
}

async function isSyncConfigured() {
  const backend = await getActiveBackend();
  return backend ? backend.isConfigured() : false;
}

async function setSyncBackendSelection(backendName) {
  const normalized = backendName === 'gdrive' || backendName === 'webdav' ? backendName : '';
  if (!normalized) {
    await browser.storage.local.remove(SYNC_BACKEND_KEY);
    await stopSyncAlarm();
    return { ok: true };
  }

  await browser.storage.local.set({ [SYNC_BACKEND_KEY]: normalized });
  if (await isSyncConfigured()) {
    await startSyncAlarm();
  } else {
    await stopSyncAlarm();
  }
  return { ok: true };
}

async function hasDataCollectionPermissionsApi() {
  if (!browser.permissions || typeof browser.permissions.getAll !== 'function') {
    return false;
  }
  try {
    const permissions = await browser.permissions.getAll();
    return !!(permissions && Object.prototype.hasOwnProperty.call(permissions, 'data_collection'));
  } catch (_) {
    return false;
  }
}

async function hasSyncDataCollectionConsent() {
  async function hasLegacySyncDataConsent() {
    try {
      const data = await browser.storage.local.get(SYNC_LEGACY_DATA_CONSENT_KEY);
      return data[SYNC_LEGACY_DATA_CONSENT_KEY] === true;
    } catch (e) {
      affoDebugWarn('[AFFO Background] Failed checking legacy sync consent:', e);
      return false;
    }
  }

  if (!browser.permissions || typeof browser.permissions.contains !== 'function') {
    return hasLegacySyncDataConsent();
  }
  const hasDataCollectionApi = await hasDataCollectionPermissionsApi();
  if (!hasDataCollectionApi) return hasLegacySyncDataConsent();
  try {
    return await browser.permissions.contains({
      data_collection: SYNC_OPTIONAL_DATA_COLLECTION
    });
  } catch (e) {
    affoDebugWarn('[AFFO Background] Failed checking sync data consent:', e);
    return false;
  }
}

async function assertSyncDataCollectionConsent() {
  const granted = await hasSyncDataCollectionConsent();
  if (!granted) {
    throw new Error('Sync consent was not granted');
  }
}

// ─── Sync Algorithm ───────────────────────────────────────────────────

function notifySyncFailure(errorMessage) {
  browser.runtime.sendMessage({
    type: 'affoSyncFailed',
    error: String(errorMessage || 'Unknown sync error')
  }).catch(() => { });
}

async function getLocalSyncMeta() {
  const data = await browser.storage.local.get(SYNC_META_KEY);
  const raw = data[SYNC_META_KEY];
  return {
    lastSync: sanitizeTimestamp(raw && raw.lastSync),
    items: sanitizeSyncContainer(raw && raw.items)
  };
}

async function saveLocalSyncMeta(meta) {
  await browser.storage.local.set({
    [SYNC_META_KEY]: {
      lastSync: sanitizeTimestamp(meta && meta.lastSync),
      items: sanitizeSyncContainer(meta && meta.items)
    }
  });
}

function sanitizeFavoriteConfigForSync(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) return null;
  const config = { ...rawConfig };
  if (Object.prototype.hasOwnProperty.call(config, 'fontFaceRule')) {
    delete config.fontFaceRule;
  }
  if (Object.prototype.hasOwnProperty.call(config, 'css2Url')) {
    delete config.css2Url;
  }
  if (Object.prototype.hasOwnProperty.call(config, '_css2Url')) {
    delete config._css2Url;
  }
  return config;
}

function sanitizeFavoritesForSync(rawFavorites, rawOrder) {
  const input = (rawFavorites && typeof rawFavorites === 'object' && !Array.isArray(rawFavorites)) ? rawFavorites : {};
  const favorites = {};
  Object.entries(input).forEach(([name, rawConfig]) => {
    const sanitized = sanitizeFavoriteConfigForSync(rawConfig);
    if (sanitized) favorites[name] = sanitized;
  });
  const orderBase = Array.isArray(rawOrder) ? rawOrder : Object.keys(favorites);
  const favoritesOrder = orderBase.filter(name => favorites[name] !== undefined);
  return { favorites, favoritesOrder };
}

async function getLocalFavoritesSnapshot() {
  const data = await browser.storage.local.get([FAVORITES_KEY, FAVORITES_ORDER_KEY]);
  const sanitized = sanitizeFavoritesForSync(data[FAVORITES_KEY], data[FAVORITES_ORDER_KEY]);
  return {
    [FAVORITES_KEY]: sanitized.favorites,
    [FAVORITES_ORDER_KEY]: sanitized.favoritesOrder
  };
}

// Push helper: normal sync checks remote revisions; one-shot push intentionally overwrites remote.
async function syncPush(backend, localState, filename, content, contentType, options = {}) {
  const force = options.force === true;
  if (backend.name === 'gdrive') {
    if (force) {
      const putResult = await backend.put(filename, content, contentType);
      return putResult.remoteRev || null;
    }
    const expectedRemoteRev = getPushExpectedRemoteRevision(localState, options);
    const revCheck = await ensureRemoteRevisionUnchanged({ remoteRev: expectedRemoteRev }, filename, backend._folderId);
    assertRemoteRevisionUnchanged(revCheck, filename);
    const putResult = await backend.put(filename, content, contentType);
    return putResult.remoteRev || revCheck.currentRemoteRev || null;
  }
  const expectedRemoteRev = force ? null : getPushExpectedRemoteRevision(localState, options);
  const putResult = await backend.put(filename, content, contentType, { expectedRemoteRev });
  return putResult.remoteRev || null;
}

async function runSync(options = {}) {
  const syncMode = normalizeSyncMode(options.mode);
  const forcePush = syncMode === SYNC_MODE_PUSH;
  const forcePull = syncMode === SYNC_MODE_PULL;

  if (!(await hasSyncDataCollectionConsent())) {
    affoDebugWarn('[AFFO Background] Sync skipped — optional data collection consent not granted');
    return { ok: true, skipped: true, reason: 'data_consent_not_granted' };
  }

  const backend = await getActiveBackend();
  if (!backend || !(await backend.isConfigured())) {
    affoDebugLog('[AFFO Background] Sync not configured — skipping sync');
    return { ok: true, skipped: true, reason: 'not_configured' };
  }

  const now = Date.now();
  await backend.init();

  // Fetch remote manifest
  const manifestResult = await backend.get(SYNC_MANIFEST_NAME);
  let remoteManifest = { version: 1, lastSync: 0, items: {} };
  const firstSync = manifestResult.notFound;
  if (!firstSync) {
    try {
      const parsed = JSON.parse(manifestResult.data);
      remoteManifest = {
        version: parsed && parsed.version ? parsed.version : 1,
        lastSync: sanitizeTimestamp(parsed && parsed.lastSync),
        items: sanitizeSyncContainer(parsed && parsed.items)
      };
    } catch (e) {
      affoDebugWarn('[AFFO Background] Invalid sync manifest, starting fresh');
    }
  }

  const localMeta = await getLocalSyncMeta();
  let manifestChanged = false;
  const errors = [];
  // ── Domain settings (per-domain merge via domains.json + domains-meta.json) ──
  try {
    const domainsItemKey = SYNC_DOMAINS_NAME;
    const domainsMetaItemKey = SYNC_DOMAINS_META_NAME;
    const localDomainsState = localMeta.items[domainsItemKey] || {};
    const localDomainsMetaState = localMeta.items[domainsMetaItemKey] || {};
    const localDomainsModified = sanitizeTimestamp(localDomainsState.modified);
    const remoteDomainsModified = sanitizeTimestamp(((remoteManifest.items || {})[domainsItemKey] || {}).modified);

    const [localDomainData, remoteDomainsResult, remoteDomainsMetaResult] = await Promise.all([
      browser.storage.local.get([APPLY_MAP_KEY, APPLY_MAP_META_KEY]),
      backend.get(SYNC_DOMAINS_NAME),
      backend.get(SYNC_DOMAINS_META_NAME)
    ]);

    const localApplyMap = sanitizeApplyMap(localDomainData[APPLY_MAP_KEY]);
    const localApplyMapMeta = sanitizeApplyMapMeta(localDomainData[APPLY_MAP_META_KEY]);

    const remoteApplyMap = (!remoteDomainsResult.notFound)
      ? sanitizeApplyMap(JSON.parse(remoteDomainsResult.data))
      : {};
    const remoteApplyMapMeta = (!remoteDomainsMetaResult.notFound)
      ? sanitizeApplyMapMeta(JSON.parse(remoteDomainsMetaResult.data))
      : { version: 1, byOrigin: {} };

    let mergedApplyMap;
    let mergedApplyMapMeta;
    let mergedModified;

    if (forcePush) {
      mergedApplyMap = localApplyMap;
      mergedApplyMapMeta = createForcedDomainMeta(
        Object.keys(localApplyMap),
        Object.keys(remoteApplyMap).filter((origin) => !Object.prototype.hasOwnProperty.call(localApplyMap, origin)),
        now
      );
      mergedModified = now;
    } else if (forcePull) {
      for (const origin of Object.keys(remoteApplyMap)) {
        if (!remoteApplyMapMeta.byOrigin[origin]) {
          remoteApplyMapMeta.byOrigin[origin] = { modified: remoteDomainsModified || now };
        }
      }
      mergedApplyMap = remoteApplyMap;
      mergedApplyMapMeta = remoteApplyMapMeta;
      mergedModified = getApplyMapMetaMaxModified(mergedApplyMapMeta.byOrigin) || remoteDomainsModified || now;
    } else {
      // Migration fallback: if per-origin metadata is absent, seed from whole-file timestamps.
      if (!Object.keys(localApplyMapMeta.byOrigin).length && localDomainsModified > 0) {
        for (const origin of Object.keys(localApplyMap)) {
          localApplyMapMeta.byOrigin[origin] = { modified: localDomainsModified };
        }
      }
      if (!Object.keys(remoteApplyMapMeta.byOrigin).length && remoteDomainsModified > 0) {
        for (const origin of Object.keys(remoteApplyMap)) {
          remoteApplyMapMeta.byOrigin[origin] = { modified: remoteDomainsModified };
        }
      }

      const allOrigins = new Set([
        ...Object.keys(localApplyMap),
        ...Object.keys(remoteApplyMap),
        ...Object.keys(localApplyMapMeta.byOrigin),
        ...Object.keys(remoteApplyMapMeta.byOrigin)
      ]);

      const mergedApplyMapByOriginMeta = {};
      mergedApplyMap = {};

      for (const origin of Array.from(allOrigins).sort()) {
        const localMetaItem = localApplyMapMeta.byOrigin[origin] || null;
        const remoteMetaItem = remoteApplyMapMeta.byOrigin[origin] || null;
        const cmp = compareSyncItems(localMetaItem, remoteMetaItem);
        const preferRemote = cmp < 0 || (cmp === 0 && (remoteMetaItem || remoteApplyMap[origin]));
        const winningMeta = sanitizeSyncItem(preferRemote ? remoteMetaItem : localMetaItem);
        const winningIsDeleted = sanitizeTimestamp(winningMeta.deletedAt) > 0;

        if (winningMeta.modified > 0) {
          if (winningIsDeleted) {
            mergedApplyMapByOriginMeta[origin] = {
              modified: winningMeta.modified,
              deletedAt: winningMeta.deletedAt
            };
            continue;
          }

          let winningConfig = preferRemote ? remoteApplyMap[origin] : localApplyMap[origin];
          if (!winningConfig || typeof winningConfig !== 'object' || Array.isArray(winningConfig)) {
            winningConfig = preferRemote ? localApplyMap[origin] : remoteApplyMap[origin];
          }
          if (winningConfig && typeof winningConfig === 'object' && !Array.isArray(winningConfig)) {
            mergedApplyMap[origin] = winningConfig;
            mergedApplyMapByOriginMeta[origin] = { modified: winningMeta.modified };
          }
          continue;
        }

        // Legacy fallback when both sides lack metadata.
        if (Object.prototype.hasOwnProperty.call(remoteApplyMap, origin)) {
          mergedApplyMap[origin] = remoteApplyMap[origin];
        } else if (Object.prototype.hasOwnProperty.call(localApplyMap, origin)) {
          mergedApplyMap[origin] = localApplyMap[origin];
        }
      }

      mergedApplyMapMeta = { version: 1, byOrigin: mergedApplyMapByOriginMeta };
      mergedModified = getApplyMapMetaMaxModified(mergedApplyMapByOriginMeta);
    }

    const localNeedsUpdate = !jsonEqual(localApplyMap, mergedApplyMap) || !jsonEqual(localApplyMapMeta, mergedApplyMapMeta);
    const remoteNeedsUpdate = !forcePull && (!jsonEqual(remoteApplyMap, mergedApplyMap) || !jsonEqual(remoteApplyMapMeta, mergedApplyMapMeta));

    if (localNeedsUpdate) {
      await setStorageDuringSync({
        [APPLY_MAP_KEY]: mergedApplyMap,
        [APPLY_MAP_META_KEY]: mergedApplyMapMeta
      });
    }

    let domainsRemoteRev = remoteDomainsResult.notFound ? null : (remoteDomainsResult.remoteRev || null);
    let domainsMetaRemoteRev = remoteDomainsMetaResult.notFound ? null : (remoteDomainsMetaResult.remoteRev || null);

    if (remoteNeedsUpdate) {
      domainsRemoteRev = await syncPush(
        backend,
        localDomainsState,
        SYNC_DOMAINS_NAME,
        JSON.stringify(mergedApplyMap, null, 2),
        'application/json',
        { force: forcePush, expectedRemoteRev: domainsRemoteRev }
      );
      domainsMetaRemoteRev = await syncPush(
        backend,
        localDomainsMetaState,
        SYNC_DOMAINS_META_NAME,
        JSON.stringify(mergedApplyMapMeta, null, 2),
        'application/json',
        { force: forcePush, expectedRemoteRev: domainsMetaRemoteRev }
      );
      manifestChanged = true;
    }

    if (mergedModified > 0 || domainsRemoteRev || domainsMetaRemoteRev) {
      if (mergedModified > 0) {
        setModified(localMeta.items, domainsItemKey, mergedModified, { remoteRev: domainsRemoteRev });
        setModified(localMeta.items, domainsMetaItemKey, mergedModified, { remoteRev: domainsMetaRemoteRev });
      } else {
        setModified(localMeta.items, domainsItemKey, localDomainsModified || now, { remoteRev: domainsRemoteRev });
        setModified(localMeta.items, domainsMetaItemKey, localDomainsModified || now, { remoteRev: domainsMetaRemoteRev });
      }
      if (remoteNeedsUpdate || mergedModified > 0) {
        const manifestModified = mergedModified || now;
        setModified(remoteManifest.items, domainsItemKey, manifestModified, { remoteRev: domainsRemoteRev });
        setModified(remoteManifest.items, domainsMetaItemKey, manifestModified, { remoteRev: domainsMetaRemoteRev });
      }
    }
  } catch (e) {
    affoDebugWarn('[AFFO Background] Domain settings sync error:', e);
    errors.push(e);
  }

  // ── Favorites ──
  try {
    const localFavSnapshot = await getLocalFavoritesSnapshot();
    const favItemKey = SYNC_FAVORITES_NAME;
    const localState = localMeta.items[favItemKey] || {};
    const localModified = (localMeta.items[favItemKey] || {}).modified || 0;
    const remoteModified = ((remoteManifest.items || {})[favItemKey] || {}).modified || 0;

    let handled = false;
    if (!forcePush && (forcePull || firstSync || remoteModified > localModified)) {
      const fileResult = await backend.get(SYNC_FAVORITES_NAME);
      if (!fileResult.notFound) {
        const remoteFav = JSON.parse(fileResult.data);
        const sanitized = sanitizeFavoritesForSync(remoteFav[FAVORITES_KEY], remoteFav[FAVORITES_ORDER_KEY]);
        await setStorageDuringSync({ [FAVORITES_KEY]: sanitized.favorites, [FAVORITES_ORDER_KEY]: sanitized.favoritesOrder });
        const modified = remoteModified || now;
        setModified(localMeta.items, favItemKey, modified, { remoteRev: fileResult.remoteRev });
        if (firstSync) {
          setModified(remoteManifest.items, favItemKey, modified, { remoteRev: fileResult.remoteRev });
          manifestChanged = true;
        }
        handled = true;
      } else if (forcePull) {
        await setStorageDuringSync({ [FAVORITES_KEY]: {}, [FAVORITES_ORDER_KEY]: [] });
        setModified(localMeta.items, favItemKey, now);
        handled = true;
      }
    }
    if (!handled && (forcePush || (!forcePull && (firstSync || localModified > remoteModified)))) {
      // Push
      const modified = forcePush ? now : (localModified || now);
      const payload = JSON.stringify(localFavSnapshot, null, 2);
      const remoteRev = await syncPush(backend, localState, SYNC_FAVORITES_NAME, payload, 'application/json', { force: forcePush });
      setModified(remoteManifest.items, favItemKey, modified, { remoteRev });
      setModified(localMeta.items, favItemKey, modified, { remoteRev });
      manifestChanged = true;
    }
  } catch (e) {
    affoDebugWarn('[AFFO Background] Favorites sync error:', e);
    errors.push(e);
  }

  // ── Custom fonts CSS ──
  try {
    const cssItemKey = SYNC_CUSTOM_FONTS_NAME;
    const localState = localMeta.items[cssItemKey] || {};
    const localModified = (localMeta.items[cssItemKey] || {}).modified || 0;
    const remoteModified = ((remoteManifest.items || {})[cssItemKey] || {}).modified || 0;

    let handled = false;
    if (!forcePush && (forcePull || firstSync || remoteModified > localModified)) {
      const fileResult = await backend.get(SYNC_CUSTOM_FONTS_NAME);
      if (!fileResult.notFound) {
        await setStorageDuringSync({ [CUSTOM_FONTS_CSS_KEY]: fileResult.data });
        const modified = remoteModified || now;
        setModified(localMeta.items, cssItemKey, modified, { remoteRev: fileResult.remoteRev });
        if (firstSync) {
          setModified(remoteManifest.items, cssItemKey, modified, { remoteRev: fileResult.remoteRev });
          manifestChanged = true;
        }
        handled = true;
      } else if (forcePull) {
        await setStorageDuringSync({ [CUSTOM_FONTS_CSS_KEY]: '' });
        setModified(localMeta.items, cssItemKey, now);
        handled = true;
      }
    }
    if (!handled && (forcePush || (!forcePull && (firstSync || localModified > remoteModified)))) {
      // Push
      const stored = await browser.storage.local.get(CUSTOM_FONTS_CSS_KEY);
      let cssText = stored[CUSTOM_FONTS_CSS_KEY];
      if (!cssText) {
        const url = browser.runtime.getURL('custom-fonts-starter.css');
        const response = await fetch(url);
        cssText = await response.text();
      }
      if (cssText) {
        const modified = forcePush ? now : (localModified || now);
        const remoteRev = await syncPush(backend, localState, SYNC_CUSTOM_FONTS_NAME, cssText, 'text/css', { force: forcePush });
        setModified(remoteManifest.items, cssItemKey, modified, { remoteRev });
        setModified(localMeta.items, cssItemKey, modified, { remoteRev });
        manifestChanged = true;
      }
    }
  } catch (e) {
    affoDebugWarn('[AFFO Background] Custom fonts sync error:', e);
    errors.push(e);
  }

  // ── Per-origin domain array settings (FF-only / inline / aggressive / waitforit / ignore-comments) ──
  const domainArrayItems = [
    {
      key: FFONLY_DOMAINS_KEY,
      localMetaStorageKey: FFONLY_DOMAINS_META_KEY,
      filename: SYNC_FFONLY_DOMAINS_NAME,
      metaFilename: SYNC_FFONLY_DOMAINS_META_NAME,
      label: 'FontFace-only domains'
    },
    {
      key: INLINE_DOMAINS_KEY,
      localMetaStorageKey: INLINE_DOMAINS_META_KEY,
      filename: SYNC_INLINE_DOMAINS_NAME,
      metaFilename: SYNC_INLINE_DOMAINS_META_NAME,
      label: 'Inline apply domains'
    },
    {
      key: AGGRESSIVE_DOMAINS_KEY,
      localMetaStorageKey: AGGRESSIVE_DOMAINS_META_KEY,
      filename: SYNC_AGGRESSIVE_DOMAINS_NAME,
      metaFilename: SYNC_AGGRESSIVE_DOMAINS_META_NAME,
      label: 'Aggressive domains'
    },
    {
      key: WAITFORIT_DOMAINS_KEY,
      localMetaStorageKey: WAITFORIT_DOMAINS_META_KEY,
      filename: SYNC_WAITFORIT_DOMAINS_NAME,
      metaFilename: SYNC_WAITFORIT_DOMAINS_META_NAME,
      label: 'Wait For It domains'
    },
    {
      key: IGNORE_COMMENTS_DOMAINS_KEY,
      localMetaStorageKey: IGNORE_COMMENTS_DOMAINS_META_KEY,
      filename: SYNC_IGNORE_COMMENTS_DOMAINS_NAME,
      metaFilename: SYNC_IGNORE_COMMENTS_DOMAINS_META_NAME,
      label: 'Ignore comments domains'
    },
    {
      key: SUBSTACK_BEIGE_DISABLED_DOMAINS_KEY,
      localMetaStorageKey: SUBSTACK_BEIGE_DISABLED_DOMAINS_META_KEY,
      filename: SYNC_SUBSTACK_BEIGE_DISABLED_DOMAINS_NAME,
      metaFilename: SYNC_SUBSTACK_BEIGE_DISABLED_DOMAINS_META_NAME,
      label: 'Substack Roulette beige disabled domains'
    }
  ];
  for (const item of domainArrayItems) {
    try {
      const localArrayState = localMeta.items[item.filename] || {};
      const localMetaState = localMeta.items[item.metaFilename] || {};
      const localArrayModified = sanitizeTimestamp(localArrayState.modified);
      const remoteArrayModified = sanitizeTimestamp(((remoteManifest.items || {})[item.filename] || {}).modified);

      const [localData, remoteArrayResult, remoteMetaResult] = await Promise.all([
        browser.storage.local.get([item.key, item.localMetaStorageKey]),
        backend.get(item.filename),
        backend.get(item.metaFilename)
      ]);

      const localOrigins = sanitizeDomainOriginArray(localData[item.key]);
      const remoteOrigins = (!remoteArrayResult.notFound)
        ? sanitizeDomainOriginArray(JSON.parse(remoteArrayResult.data))
        : [];
      const localOriginMeta = sanitizeDomainOriginMeta(localData[item.localMetaStorageKey]);
      const remoteOriginMeta = (!remoteMetaResult.notFound)
        ? sanitizeDomainOriginMeta(JSON.parse(remoteMetaResult.data))
        : { version: 1, byOrigin: {} };

      let mergedMeta;
      let mergedOrigins;
      let mergedModified;
      if (forcePush) {
        mergedOrigins = localOrigins;
        mergedMeta = createForcedDomainMeta(
          localOrigins,
          remoteOrigins.filter((origin) => !localOrigins.includes(origin)),
          now
        );
        mergedModified = now;
      } else if (forcePull) {
        seedDomainMetaFromArray(remoteOriginMeta, remoteOrigins, remoteArrayModified, now);
        mergedOrigins = remoteOrigins;
        mergedMeta = remoteOriginMeta;
        mergedModified = getApplyMapMetaMaxModified(mergedMeta.byOrigin) || remoteArrayModified || now;
      } else {
        seedDomainMetaFromArray(localOriginMeta, localOrigins, localArrayModified, now);
        seedDomainMetaFromArray(remoteOriginMeta, remoteOrigins, remoteArrayModified, now);
        const merged = mergeDomainOriginMeta(localOriginMeta, remoteOriginMeta);
        mergedMeta = merged.mergedMeta;
        mergedOrigins = merged.mergedOrigins;
        mergedModified = getApplyMapMetaMaxModified(mergedMeta.byOrigin);
      }
      const remoteMetaAsOrigins = Object.keys(remoteOriginMeta.byOrigin)
        .filter((origin) => !sanitizeTimestamp(remoteOriginMeta.byOrigin[origin].deletedAt))
        .sort();
      const localNeedsUpdate = !jsonEqual(localOrigins, mergedOrigins) || !jsonEqual(localOriginMeta, mergedMeta);
      const remoteNeedsUpdate = !forcePull && (!jsonEqual(remoteOrigins, mergedOrigins)
        || !jsonEqual(remoteOriginMeta, mergedMeta)
        || !jsonEqual(remoteMetaAsOrigins, mergedOrigins));

      if (localNeedsUpdate) {
        await setStorageDuringSync({
          [item.key]: mergedOrigins,
          [item.localMetaStorageKey]: mergedMeta
        });
      }

      let arrayRemoteRev = remoteArrayResult.notFound ? null : (remoteArrayResult.remoteRev || null);
      let metaRemoteRev = remoteMetaResult.notFound ? null : (remoteMetaResult.remoteRev || null);
      if (remoteNeedsUpdate) {
        arrayRemoteRev = await syncPush(
          backend,
          localArrayState,
          item.filename,
          JSON.stringify(mergedOrigins, null, 2),
          'application/json',
          { force: forcePush, expectedRemoteRev: arrayRemoteRev }
        );
        metaRemoteRev = await syncPush(
          backend,
          localMetaState,
          item.metaFilename,
          JSON.stringify(mergedMeta, null, 2),
          'application/json',
          { force: forcePush, expectedRemoteRev: metaRemoteRev }
        );
        manifestChanged = true;
      }

      if (mergedModified > 0 || arrayRemoteRev || metaRemoteRev) {
        setModified(localMeta.items, item.filename, mergedModified || localArrayModified || now, { remoteRev: arrayRemoteRev });
        setModified(localMeta.items, item.metaFilename, mergedModified || localArrayModified || now, { remoteRev: metaRemoteRev });
        if (remoteNeedsUpdate || mergedModified > 0) {
          const manifestModified = mergedModified || now;
          setModified(remoteManifest.items, item.filename, manifestModified, { remoteRev: arrayRemoteRev });
          setModified(remoteManifest.items, item.metaFilename, manifestModified, { remoteRev: metaRemoteRev });
        }
      }
    } catch (e) {
      affoDebugWarn(`[AFFO Background] ${item.label} sync error:`, e);
      errors.push(e);
    }
  }

  // ── Simple JSON array settings (known serif/sans, preserved fonts) ──
  const jsonArrayItems = [
    { key: KNOWN_SERIF_KEY, filename: SYNC_KNOWN_SERIF_NAME, label: 'Known serif' },
    { key: KNOWN_SANS_KEY, filename: SYNC_KNOWN_SANS_NAME, label: 'Known sans' },
    { key: PRESERVED_FONTS_KEY, filename: SYNC_PRESERVED_FONTS_NAME, label: 'Preserved fonts' }
  ];
  for (const item of jsonArrayItems) {
    try {
      const localState = localMeta.items[item.filename] || {};
      const localModified = (localMeta.items[item.filename] || {}).modified || 0;
      const remoteModified = ((remoteManifest.items || {})[item.filename] || {}).modified || 0;

      let handled = false;
      if (!forcePush && (forcePull || firstSync || remoteModified > localModified)) {
        const fileResult = await backend.get(item.filename);
        if (!fileResult.notFound) {
          const parsed = JSON.parse(fileResult.data);
          await setStorageDuringSync({ [item.key]: parsed });
          const modified = remoteModified || now;
          setModified(localMeta.items, item.filename, modified, { remoteRev: fileResult.remoteRev });
          if (firstSync) {
            setModified(remoteManifest.items, item.filename, modified, { remoteRev: fileResult.remoteRev });
            manifestChanged = true;
          }
          handled = true;
        } else if (forcePull) {
          await setStorageDuringSync({ [item.key]: [] });
          setModified(localMeta.items, item.filename, now);
          handled = true;
        }
      }
      if (!handled && (forcePush || (!forcePull && (firstSync || localModified > remoteModified)))) {
        // Push
        const stored = await browser.storage.local.get(item.key);
        const arr = stored[item.key];
        if (Array.isArray(arr)) {
          const modified = forcePush ? now : (localModified || now);
          const remoteRev = await syncPush(backend, localState, item.filename, JSON.stringify(arr, null, 2), 'application/json', { force: forcePush });
          setModified(remoteManifest.items, item.filename, modified, { remoteRev });
          setModified(localMeta.items, item.filename, modified, { remoteRev });
          manifestChanged = true;
        }
      }
    } catch (e) {
      affoDebugWarn(`[AFFO Background] ${item.label} sync error:`, e);
      errors.push(e);
    }
  }

  // ── Simple JSON object settings (custom font axes) ──
  const jsonObjectItems = [
    { key: CUSTOM_FONT_AXES_KEY, filename: SYNC_CUSTOM_FONT_AXES_NAME, label: 'Custom font axes' }
  ];
  for (const item of jsonObjectItems) {
    try {
      const localState = localMeta.items[item.filename] || {};
      const localModified = (localMeta.items[item.filename] || {}).modified || 0;
      const remoteModified = ((remoteManifest.items || {})[item.filename] || {}).modified || 0;

      let handled = false;
      if (!forcePush && (forcePull || firstSync || remoteModified > localModified)) {
        const fileResult = await backend.get(item.filename);
        if (!fileResult.notFound) {
          const parsed = JSON.parse(fileResult.data);
          await setStorageDuringSync({ [item.key]: parsed });
          const modified = remoteModified || now;
          setModified(localMeta.items, item.filename, modified, { remoteRev: fileResult.remoteRev });
          if (firstSync) {
            setModified(remoteManifest.items, item.filename, modified, { remoteRev: fileResult.remoteRev });
            manifestChanged = true;
          }
          handled = true;
        } else if (forcePull) {
          await setStorageDuringSync({ [item.key]: {} });
          setModified(localMeta.items, item.filename, now);
          handled = true;
        }
      }
      if (!handled && (forcePush || (!forcePull && (firstSync || localModified > remoteModified)))) {
        const stored = await browser.storage.local.get(item.key);
        const obj = stored[item.key];
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          const modified = forcePush ? now : (localModified || now);
          const remoteRev = await syncPush(backend, localState, item.filename, JSON.stringify(obj, null, 2), 'application/json', { force: forcePush });
          setModified(remoteManifest.items, item.filename, modified, { remoteRev });
          setModified(localMeta.items, item.filename, modified, { remoteRev });
          manifestChanged = true;
        }
      }
    } catch (e) {
      affoDebugWarn(`[AFFO Background] ${item.label} sync error:`, e);
      errors.push(e);
    }
  }

  // ── Substack Roulette (compound object: enabled + serif/sans name arrays) ──
  try {
    const rouletteItemKey = SYNC_SUBSTACK_ROULETTE_NAME;
    const localState = localMeta.items[rouletteItemKey] || {};
    const localModified = (localMeta.items[rouletteItemKey] || {}).modified || 0;
    const remoteModified = ((remoteManifest.items || {})[rouletteItemKey] || {}).modified || 0;

    const getLocalRouletteSnapshot = async () => {
      const stored = await browser.storage.local.get([SUBSTACK_ROULETTE_KEY, SUBSTACK_ROULETTE_SERIF_KEY, SUBSTACK_ROULETTE_SANS_KEY]);
      return {
        [SUBSTACK_ROULETTE_KEY]: stored[SUBSTACK_ROULETTE_KEY] !== false,
        [SUBSTACK_ROULETTE_SERIF_KEY]: Array.isArray(stored[SUBSTACK_ROULETTE_SERIF_KEY]) ? stored[SUBSTACK_ROULETTE_SERIF_KEY] : [],
        [SUBSTACK_ROULETTE_SANS_KEY]: Array.isArray(stored[SUBSTACK_ROULETTE_SANS_KEY]) ? stored[SUBSTACK_ROULETTE_SANS_KEY] : []
      };
    };

    let handled = false;
    if (!forcePush && (forcePull || firstSync || remoteModified > localModified)) {
      const fileResult = await backend.get(SYNC_SUBSTACK_ROULETTE_NAME);
      if (!fileResult.notFound) {
        const remote = JSON.parse(fileResult.data);
        await setStorageDuringSync({
          [SUBSTACK_ROULETTE_KEY]: remote[SUBSTACK_ROULETTE_KEY] !== false,
          [SUBSTACK_ROULETTE_SERIF_KEY]: Array.isArray(remote[SUBSTACK_ROULETTE_SERIF_KEY]) ? remote[SUBSTACK_ROULETTE_SERIF_KEY] : [],
          [SUBSTACK_ROULETTE_SANS_KEY]: Array.isArray(remote[SUBSTACK_ROULETTE_SANS_KEY]) ? remote[SUBSTACK_ROULETTE_SANS_KEY] : []
        });
        const modified = remoteModified || now;
        setModified(localMeta.items, rouletteItemKey, modified, { remoteRev: fileResult.remoteRev });
        if (firstSync) {
          setModified(remoteManifest.items, rouletteItemKey, modified, { remoteRev: fileResult.remoteRev });
          manifestChanged = true;
        }
        handled = true;
      } else if (forcePull) {
        await setStorageDuringSync({
          [SUBSTACK_ROULETTE_KEY]: true,
          [SUBSTACK_ROULETTE_SERIF_KEY]: [],
          [SUBSTACK_ROULETTE_SANS_KEY]: []
        });
        setModified(localMeta.items, rouletteItemKey, now);
        handled = true;
      }
    }
    if (!handled && (forcePush || (!forcePull && (firstSync || localModified > remoteModified)))) {
      // Push
      const snapshot = await getLocalRouletteSnapshot();
      const modified = forcePush ? now : (localModified || now);
      const remoteRev = await syncPush(backend, localState, SYNC_SUBSTACK_ROULETTE_NAME, JSON.stringify(snapshot, null, 2), 'application/json', { force: forcePush });
      setModified(remoteManifest.items, rouletteItemKey, modified, { remoteRev });
      setModified(localMeta.items, rouletteItemKey, modified, { remoteRev });
      manifestChanged = true;
    }
  } catch (e) {
    affoDebugWarn('[AFFO Background] Substack roulette sync error:', e);
    errors.push(e);
  }

  // ── Update manifests ──
  if (manifestChanged || firstSync) {
    remoteManifest.lastSync = now;
    await backend.put(SYNC_MANIFEST_NAME, JSON.stringify(remoteManifest, null, 2), 'application/json');
  }

  if (errors.length === 0) {
    localMeta.lastSync = now;
  }
  await mergeAndSaveLocalSyncMeta(localMeta);

  if (errors.length > 0) {
    const msg = errors.map(e => e && e.message ? e.message : String(e)).join('; ');
    affoDebugWarn(`[AFFO Background] Sync completed with ${errors.length} error(s): ${msg}`);
    notifySyncFailure(msg);
    return { ok: false, error: msg, partialErrors: errors.length };
  }

  affoDebugLog('[AFFO Background] Sync completed successfully');
  return { ok: true };
}

function scheduleAutoSync() {
  enqueueSync({ notifyOnError: true }).catch(() => { });
}

function enqueueSync(options = {}) {
  const notifyOnError = options.notifyOnError !== false;
  const queued = syncQueue
    .catch(() => undefined)
    .then(async () => {
      if (!(await isSyncConfigured())) {
        return { ok: true, skipped: true, reason: 'not_configured' };
      }
      return runSync({ mode: options.mode });
    });

  syncQueue = queued.then(
    () => undefined,
    (e) => {
      if (notifyOnError) {
        affoDebugWarn('[AFFO Background] Auto-sync queue error:', e);
        notifySyncFailure(e && e.message ? e.message : String(e));
      }
      return undefined;
    }
  );

  return queued;
}

// Update local sync timestamp when data changes
async function markLocalItemModified(itemKey) {
  await queueSyncMetaMutation((meta) => {
    setModified(meta.items, itemKey, Date.now());
  });
}


// ─── Periodic Sync Alarm ────────────────────────────────────────────────

function hasAlarmsApi() {
  return !!(
    browser &&
    browser.alarms &&
    typeof browser.alarms.create === 'function' &&
    typeof browser.alarms.clear === 'function' &&
    browser.alarms.onAlarm &&
    typeof browser.alarms.onAlarm.addListener === 'function'
  );
}

async function startSyncAlarm() {
  if (!hasAlarmsApi()) {
    affoDebugWarn('[AFFO Background] browser.alarms API unavailable; periodic sync disabled');
    return { ok: true, skipped: true, reason: 'alarms_unavailable' };
  }
  await browser.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: SYNC_ALARM_PERIOD_MINUTES });
  affoDebugLog(`[AFFO Background] Periodic sync alarm started (every ${SYNC_ALARM_PERIOD_MINUTES}m)`);
  return { ok: true };
}

async function stopSyncAlarm() {
  if (!hasAlarmsApi()) {
    return { ok: true, skipped: true, reason: 'alarms_unavailable' };
  }
  await browser.alarms.clear(SYNC_ALARM_NAME);
  affoDebugLog('[AFFO Background] Periodic sync alarm stopped');
  return { ok: true };
}

if (hasAlarmsApi()) {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM_NAME) {
      affoDebugLog('[AFFO Background] Periodic sync alarm fired');
      scheduleAutoSync();
    }
  });
}

// Sync when device comes back online (covers wake-from-sleep scenarios)
if (typeof self !== 'undefined' && self.addEventListener) {
  self.addEventListener('online', () => {
    affoDebugLog('[AFFO Background] Network restored — triggering sync');
    isSyncConfigured().then(configured => {
      if (configured) scheduleAutoSync();
    });
  });
}

// On background script wake, ensure alarm is running if sync is configured
isSyncConfigured().then(configured => {
  if (configured) startSyncAlarm();
});

AFFOBackgroundFontRuntime.startup();

function appendUniquePageFontRules(target, rules) {
  (Array.isArray(rules) ? rules : []).forEach(rule => {
    const text = String(rule || '').trim();
    if (text && !target.includes(text)) target.push(text);
  });
}

function arrayBufferToPageFontDataUrl(buffer, fontUrl) {
  const bytes = new Uint8Array(buffer);
  const parts = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize)));
  }
  const mimeType = /\.woff2(?:[?#]|$)/i.test(fontUrl) ? 'font/woff2' : 'font/woff';
  return `data:${mimeType};base64,${btoa(parts.join(''))}`;
}

async function embedPageFontSource(rule) {
  const urls = AFFOPageFontUtils.extractRemoteFontUrls(rule);
  for (const url of urls) {
    try {
      const response = await AFFOBackgroundFontRuntime.handleFetchMessage({ url, binary: true });
      if (!response || !response.ok || !response.data) continue;
      const dataUrl = arrayBufferToPageFontDataUrl(response.data, url);
      return AFFOPageFontUtils.replaceFontFaceUrl(rule, url, dataUrl);
    } catch (e) {
      affoDebugWarn('[AFFO Background] Page font binary fetch failed:', url, e);
    }
  }
  return rule;
}

async function prepareFaceoffPageFontDraft(msg, sender) {
  const fontName = AFFOPageFontUtils.cleanFontFamilyName(msg.fontName);
  if (!fontName) return { success: false, error: 'Missing detected font family' };

  const rules = [];
  (Array.isArray(msg.fontFaceRules) ? msg.fontFaceRules : []).forEach(entry => {
    if (!entry || typeof entry.cssText !== 'string') return;
    appendUniquePageFontRules(
      rules,
      AFFOPageFontUtils.extractMatchingFontFaceRules(entry.cssText, fontName, entry.baseUrl || msg.pageUrl)
    );
  });

  if (rules.length === 0) {
    const stylesheetUrls = AFFOPageFontUtils.rankStylesheetUrls(msg.stylesheetUrls, fontName)
      .slice(0, PAGE_FONT_STYLESHEET_FETCH_LIMIT);

    for (const url of stylesheetUrls) {
      try {
        const response = await AFFOBackgroundFontRuntime.handleFetchMessage({ url, binary: false });
        if (!response || !response.ok || typeof response.data !== 'string') continue;
        appendUniquePageFontRules(
          rules,
          AFFOPageFontUtils.extractMatchingFontFaceRules(response.data, fontName, url)
        );
        if (rules.length > 0) break;
      } catch (e) {
        affoDebugWarn('[AFFO Background] Page font stylesheet fetch failed:', url, e);
      }
    }
  }

  if (rules.length === 0) {
    return {
      success: false,
      error: `Could not find a reusable @font-face rule for ${fontName}`
    };
  }

  const selectedRule = AFFOPageFontUtils.selectBestFontFaceRule(rules, msg.fontWeight, msg.fontStyle);
  const embeddedRule = await embedPageFontSource(selectedRule);
  const fontDefinition = AFFOPageFontUtils.buildFontFaceAxisDefinition(selectedRule);
  const variableAxes = {};
  fontDefinition.axes.forEach(axis => {
    const value = Number(msg.variableAxes && msg.variableAxes[axis]);
    if (Number.isFinite(value)) variableAxes[axis] = value;
  });
  const config = {
    fontName,
    variableAxes,
    fontFaceRule: embeddedRule
  };
  const fontWeight = Number(msg.fontWeight);
  if (Number.isFinite(fontWeight) && !Object.prototype.hasOwnProperty.call(variableAxes, 'wght')) {
    config.fontWeight = fontWeight;
  }
  if (msg.fontStyle === 'italic') config.fontStyle = 'italic';

  const sourceTabId = sender && sender.tab && sender.tab.id != null ? sender.tab.id : null;
  const sourceUrl = (sender && sender.tab && sender.tab.url) || String(msg.pageUrl || '');
  let domain = '';
  try {
    domain = new URL(sourceUrl).hostname;
  } catch (_) { }

  await browser.storage.local.set({
    [FACEOFF_PAGE_FONT_DRAFT_KEY]: {
      createdAt: Date.now(),
      sourceTabId,
      sourceUrl,
      config,
      fontDefinition
    }
  });

  return { success: true, sourceTabId, domain, fontName };
}

async function handleAffoRuntimeMessage(msg, sender) {
  try {
    // Handle cache flush requests
    if (msg.type === 'flushFontCache') {
      await AFFOBackgroundFontRuntime.flushCacheWrites();
      return { ok: true };
    }

    if (msg.type === 'clearFontCache') {
      await AFFOBackgroundFontRuntime.clearCache();
      return { ok: true };
    }

    if (msg.type === 'getFontCacheInfo') {
      return AFFOBackgroundFontRuntime.getCacheInfo();
    }

    if (msg.type === 'affoGDriveAuth') {
      try {
        await assertSyncDataCollectionConsent();
        return await startGDriveAuth();
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoGDriveDisconnect') {
      try {
        return await disconnectGDrive();
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoSyncSetBackend') {
      try {
        return await setSyncBackendSelection(msg.backend);
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoWebDavConnect') {
      try {
        await assertSyncDataCollectionConsent();
        return await connectWebDav(msg.config);
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoWebDavDisconnect') {
      try {
        return await disconnectWebDav();
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoWebDavTest') {
      try {
        await assertSyncDataCollectionConsent();
        return await testWebDavConnection(msg.config);
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoClearLocalSync') {
      try {
        await browser.storage.local.remove(SYNC_META_KEY);
        cachedAppFolderId = null;
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoSyncNow') {
      try {
        await assertSyncDataCollectionConsent();
        return await enqueueSync({ notifyOnError: true, mode: msg.mode });
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoSyncRetry') {
      try {
        await assertSyncDataCollectionConsent();
        return await enqueueSync({ notifyOnError: true });
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
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
        affoDebugLog('[AFFO Background] Returning toolbar options:', result);
        return result;
      } catch (e) {
        affoDebugWarn('[AFFO Background] Error getting toolbar options:', e);
        return {};
      }
    }

    if (msg.type === 'resolveCss2Url') {
      try {
        const css2Url = await AFFOBackgroundFontRuntime.resolveCss2Url(msg.fontName, {
          fallbackWhenMissing: !!msg.fallbackWhenMissing
        });
        return { ok: true, css2Url };
      } catch (e) {
        affoDebugWarn('[AFFO Background] css2 URL resolution failed:', e);
        return { ok: false, css2Url: '', error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoPrepareFaceoffPageFont') {
      try {
        return await prepareFaceoffPageFontDraft(msg, sender);
      } catch (e) {
        console.error('[AFFO Background] Could not prepare page font for Face-off:', e);
        return { success: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoEnsureWhatFontScripts') {
      try {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        if (tabId == null) {
          return { success: false, error: 'Missing sender tab' };
        }
        const injectionTarget = { runAt: 'document_end' };
        if (sender && typeof sender.frameId === 'number') {
          injectionTarget.frameId = sender.frameId;
        }
        const existingResults = await browser.tabs.executeScript(tabId, Object.assign({
          code: `window._WHATFONT === true && !!document.querySelector('.__whatfont_control');`
        }, injectionTarget));
        if (existingResults && existingResults[0]) {
          return { success: true };
        }
        await browser.tabs.executeScript(tabId, Object.assign({ file: 'jquery.js' }, injectionTarget));
        try {
          await browser.tabs.executeScript(tabId, Object.assign({ file: 'whatfont_core.js' }, injectionTarget));
        } catch (e) {
          // whatfont_core.js ends by assigning a function, which Firefox reports
          // as a non-clonable executeScript result even though the load succeeded.
          const message = e && e.message ? e.message : String(e);
          if (!/non-structured-clonable data/i.test(message)) {
            throw e;
          }
        }
        const cssUrl = browser.runtime.getURL('wf.css');
        const activationResults = await browser.tabs.executeScript(tabId, Object.assign({
          code: `
            (function() {
              try {
                if (window._WHATFONT === true && document.querySelector('.__whatfont_control')) {
                  return { success: true, alreadyActive: true };
                }

                var jq = null;
                if (typeof window.jQuery === 'function') {
                  jq = window.jQuery;
                } else if (typeof window.$ === 'function' && window.$.fn && window.$.fn.jquery) {
                  jq = window.$;
                }

                if (!jq) {
                  return { success: false, error: 'jQuery was not available after injection' };
                }
                if (typeof window._whatFont !== 'function') {
                  return { success: false, error: '_whatFont was not available after injection' };
                }

                if (typeof window.WhatFont === 'undefined') {
                  window.WhatFont = window._whatFont();
                }
                if (typeof window.WhatFont.setJQuery === 'function') {
                  window.WhatFont.setJQuery(jq);
                }
                window.WhatFont.setCSSURL(${JSON.stringify(cssUrl)});
                window.WhatFont.init();

                return {
                  success: window._WHATFONT === true && !!document.querySelector('.__whatfont_control'),
                  active: window._WHATFONT === true,
                  hasControl: !!document.querySelector('.__whatfont_control')
                };
              } catch (e) {
                return { success: false, error: e && e.message ? e.message : String(e) };
              }
            })();
          `
        }, injectionTarget));
        const activation = activationResults && activationResults[0];
        if (!activation || !activation.success) {
          return {
            success: false,
            error: activation && activation.error ? activation.error : 'Unable to activate WhatFont'
          };
        }
        return { success: true };
      } catch (e) {
        console.error('[AFFO Background] WhatFont script injection failed:', e);
        return { success: false, error: e && e.message ? e.message : String(e) };
      }
    }

    // Handle toolbar popup opening requests
    if (msg.type === 'openPopup') {
      affoDebugLog('[AFFO Background] Received openPopup request');
      affoDebugLog('[AFFO Background] User agent:', navigator.userAgent);
      affoDebugLog('[AFFO Background] Available APIs:', Object.keys(browser.browserAction || {}));

      try {
        affoDebugLog('[AFFO Background] Attempting browserAction.openPopup()...');

        // For Firefox Android, try the standard API
        if (browser.browserAction && browser.browserAction.openPopup) {
          await browser.browserAction.openPopup();
          affoDebugLog('[AFFO Background] browserAction.openPopup() call completed');
          return { success: true, method: 'browserAction.openPopup' };
        } else {
          affoDebugWarn('[AFFO Background] browserAction.openPopup not available');
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
        affoDebugLog('[AFFO Background] Closing current tab');
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId) {
          await browser.tabs.remove(tabId);
          affoDebugLog('[AFFO Background] Tab closed successfully');
          return { success: true };
        } else {
          affoDebugWarn('[AFFO Background] No sender tab found');
          return { success: false, error: 'No sender tab found' };
        }
      } catch (e) {
        console.error('[AFFO Background] Error closing tab:', e);
        return { success: false, error: e.message };
      }
    }

    // Handle getting current tab info
    if (msg.type === 'getCurrentTab') {
      try {
        if (sender && sender.tab && sender.tab.id != null) {
          return { success: true, tabId: sender.tab.id, url: sender.tab.url };
        }

        const queries = [
          { active: true, currentWindow: true },
          { active: true, lastFocusedWindow: true },
          { active: true }
        ];
        for (const queryInfo of queries) {
          const tabs = await browser.tabs.query(queryInfo).catch(() => []);
          const tab = tabs.find(candidate => candidate && /^https?:\/\//.test(candidate.url || ''))
            || tabs.find(candidate => candidate && candidate.id != null)
            || tabs[0];
          if (tab && tab.id != null) {
            return { success: true, tabId: tab.id, url: tab.url };
          }
        }
        return { success: false, error: 'No active tab found' };
      } catch (e) {
        console.error('[AFFO Background] Error getting current tab:', e);
        return { success: false, error: e.message };
      }
    }

    // Handle fallback popup opening (open in new tab/window)
    if (msg.type === 'openPopupFallback') {
      try {
        affoDebugLog('[AFFO Background] Attempting fallback: open popup in new tab');

        // For Firefox Android, open the popup HTML in a new tab since popups don't exist
        let popup = browser.runtime.getURL('popup.html');

        // If domain and sourceTabId are provided, pass them as URL parameters
        const params = new URLSearchParams();
        if (msg.domain) {
          params.set('domain', msg.domain);
          affoDebugLog('[AFFO Background] Added domain parameter:', msg.domain);
        }
        if (msg.sourceTabId) {
          params.set('sourceTabId', msg.sourceTabId.toString());
          affoDebugLog('[AFFO Background] Added sourceTabId parameter:', msg.sourceTabId);
        }

        if (params.toString()) {
          popup += '?' + params.toString();
        }

        affoDebugLog('[AFFO Background] Popup URL:', popup);

        const tab = await browser.tabs.create({
          url: popup,
          active: true // Make sure the tab is focused
        });
        affoDebugLog('[AFFO Background] Tab created:', tab);
        return { success: true, tabId: tab.id, url: popup };
      } catch (e) {
        console.error('[AFFO Background] Could not open popup fallback:', e);
        console.error('[AFFO Background] Error details:', e);
        return { success: false, error: e.message };
      }
    }

    // Content scripts resolve Sroulette locally, then ask background to inject
    // user-origin CSS so page style churn cannot temporarily outrank AFFO.
    if (msg.type === 'affoInsertSrouletteCss') {
      try {
        const tabId = sender.tab ? sender.tab.id : null;
        const { fontType: target, css } = msg;

        if (tabId == null || !isSrouletteCssTarget(target) || typeof css !== 'string' || !css.trim()) {
          return { success: false, error: 'Missing required parameters' };
        }

        const inserted = await insertTrackedSrouletteCss(tabId, target, css);
        return inserted ? { success: true } : { success: false, error: 'Invalid Sroulette CSS request' };
      } catch (e) {
        console.error('[AFFO Background] Sroulette CSS injection failed:', e);
        return { success: false, error: e.message };
      }
    }

    if (msg.type === 'affoRemoveSrouletteCss') {
      try {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId == null) return { success: false, error: 'Missing tab' };
        const targets = Array.isArray(msg.fontTypes) ? msg.fontTypes.filter(isSrouletteCssTarget) : null;
        await removeTrackedSrouletteCss(tabId, targets);
        return { success: true };
      } catch (e) {
        console.error('[AFFO Background] Sroulette CSS cleanup failed:', e);
        return { success: false, error: e.message };
      }
    }

    // Handle quick-apply favorite from toolbar
    if (msg.type === 'quickApplyFavorite') {
      try {
        const { origin, fontConfig, position } = msg;
        const tabId = sender.tab ? sender.tab.id : null;

        if (!origin || !fontConfig || !position || !tabId) {
          return { success: false, error: 'Missing required parameters' };
        }

        // Build payload (simple version - includes only needed properties)
        const payload = {
          fontName: fontConfig.fontName
        };
        if (fontConfig.fontSizeScale != null) payload.fontSizeScale = fontConfig.fontSizeScale;
        else if (fontConfig.fontSize) payload.fontSize = fontConfig.fontSize;
        if (fontConfig.lineHeight) payload.lineHeight = fontConfig.lineHeight;
        if (fontConfig.letterSpacing != null) payload.letterSpacing = fontConfig.letterSpacing;
        if (fontConfig.fontWeight) payload.fontWeight = fontConfig.fontWeight;
        if (fontConfig.fontStyle === 'italic') payload.fontStyle = 'italic';
        if (fontConfig.fontColor) payload.fontColor = fontConfig.fontColor;
        if (fontConfig.variableAxes) payload.variableAxes = fontConfig.variableAxes;
        if (fontConfig.fontSource === 'local') payload.fontSource = 'local';

        // Save to storage
        const result = await browser.storage.local.get([APPLY_MAP_KEY, AGGRESSIVE_DOMAINS_KEY]);
        const applyMap = result[APPLY_MAP_KEY] || {};
        if (!applyMap[origin]) applyMap[origin] = {};
        applyMap[origin][position] = payload;
        clearSrouletteIntentForTarget(applyMap[origin], position);

        await browser.storage.local.set({ [APPLY_MAP_KEY]: applyMap });
        await removeTrackedSrouletteCss(tabId, [position]);

        const aggressiveDomains = result[AGGRESSIVE_DOMAINS_KEY] || [];
        const aggressive = aggressiveDomains.includes(origin);

        // Run DOM walker via content script message
        await browser.tabs.sendMessage(tabId, { type: 'runElementWalker', fontType: position });

        // Generate and inject CSS
        const css = generateThirdManInCSS(position, payload, aggressive);
        await browser.tabs.insertCSS(tabId, { code: css, cssOrigin: 'user' });

        affoDebugLog('[AFFO Background] Quick-apply font applied to', position, 'on', origin);
        return { success: true };
      } catch (e) {
        console.error('[AFFO Background] Quick-apply failed:', e);
        return { success: false, error: e.message };
      }
    }

    // Handle quick-apply Sroulette intent from toolbar. The stored value is only
    // the synced on/off intent; content.js resolves a fresh random font locally.
    if (msg.type === 'quickApplySroulette') {
      try {
        const { origin, position, pool } = msg;
        const tabId = sender.tab ? sender.tab.id : null;

        if (!origin || !isSrouletteTarget(position) || !isSroulettePool(pool) || !tabId) {
          return { success: false, error: 'Missing required parameters' };
        }

        const result = await browser.storage.local.get(APPLY_MAP_KEY);
        const applyMap = result[APPLY_MAP_KEY] || {};
        if (!applyMap[origin]) applyMap[origin] = {};

        if (!setSrouletteIntentForTarget(applyMap[origin], position, pool)) {
          return { success: false, error: 'Invalid Sroulette target' };
        }

        await browser.storage.local.set({ [APPLY_MAP_KEY]: applyMap });

        affoDebugLog('[AFFO Background] Quick-apply Sroulette set', pool, 'pool for', position, 'on', origin);
        return { success: true };
      } catch (e) {
        console.error('[AFFO Background] Quick-apply Sroulette failed:', e);
        return { success: false, error: e.message };
      }
    }

    // Handle font fetching requests
    if (!msg || msg.type !== 'affoFetch') return;
    return AFFOBackgroundFontRuntime.handleFetchMessage(msg);
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

if (typeof self !== 'undefined') {
  self.affoHandleRuntimeMessage = handleAffoRuntimeMessage;
} else if (typeof globalThis !== 'undefined') {
  globalThis.affoHandleRuntimeMessage = handleAffoRuntimeMessage;
}

browser.runtime.onMessage.addListener((msg, sender) => handleAffoRuntimeMessage(msg, sender));

// Listen for toolbar option changes and notify content scripts
browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  if (changes[GDRIVE_FOLDER_SUFFIX_KEY]) {
    cachedAppFolderId = null;
  }
  if (changes.gfMetadataCache || changes.gfMetadataTimestamp) {
    AFFOBackgroundFontRuntime.resetGfMetadataCache();
  }
  const trackSyncManagedChanges = syncWriteDepth === 0;

  // Only mark items modified when data actually changed (avoid unnecessary sync cycles)
  const storageValueChanged = (c) =>
    JSON.stringify(c.oldValue) !== JSON.stringify(c.newValue);

  if (changes[APPLY_MAP_KEY] && storageValueChanged(changes[APPLY_MAP_KEY])) {
    updateAffoBrowserActionTitleForActiveTabs();
  }

  if (changes[APPLY_MAP_KEY] && trackSyncManagedChanges && storageValueChanged(changes[APPLY_MAP_KEY])) {
    markApplyMapOriginsModified(changes[APPLY_MAP_KEY]).then((changed) => {
      if (changed) scheduleAutoSync();
    }).catch((e) => {
      affoDebugWarn('[AFFO Background] Failed to update per-domain sync metadata:', e);
      markLocalItemModified(SYNC_DOMAINS_NAME).then(() => scheduleAutoSync());
    });
  }
  if (trackSyncManagedChanges) {
    const favChanged = changes[FAVORITES_KEY] && storageValueChanged(changes[FAVORITES_KEY]);
    const orderChanged = changes[FAVORITES_ORDER_KEY] && storageValueChanged(changes[FAVORITES_ORDER_KEY]);
    if (favChanged || orderChanged) {
      markLocalItemModified(SYNC_FAVORITES_NAME).then(() => scheduleAutoSync());
    }
  }
  if (changes[KNOWN_SERIF_KEY] && trackSyncManagedChanges && storageValueChanged(changes[KNOWN_SERIF_KEY])) {
    markLocalItemModified(SYNC_KNOWN_SERIF_NAME).then(() => scheduleAutoSync());
  }
  if (changes[KNOWN_SANS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[KNOWN_SANS_KEY])) {
    markLocalItemModified(SYNC_KNOWN_SANS_NAME).then(() => scheduleAutoSync());
  }
  if (changes[FFONLY_DOMAINS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[FFONLY_DOMAINS_KEY])) {
    markDomainOriginArrayModified(changes[FFONLY_DOMAINS_KEY], {
      localMetaStorageKey: FFONLY_DOMAINS_META_KEY,
      syncArrayFilename: SYNC_FFONLY_DOMAINS_NAME,
      syncMetaFilename: SYNC_FFONLY_DOMAINS_META_NAME
    }).then((changed) => {
      if (changed) scheduleAutoSync();
    }).catch((e) => {
      affoDebugWarn('[AFFO Background] Failed to update FontFace-only domains metadata:', e);
      markLocalItemModified(SYNC_FFONLY_DOMAINS_NAME).then(() => scheduleAutoSync());
    });
  }
  if (changes[INLINE_DOMAINS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[INLINE_DOMAINS_KEY])) {
    markDomainOriginArrayModified(changes[INLINE_DOMAINS_KEY], {
      localMetaStorageKey: INLINE_DOMAINS_META_KEY,
      syncArrayFilename: SYNC_INLINE_DOMAINS_NAME,
      syncMetaFilename: SYNC_INLINE_DOMAINS_META_NAME
    }).then((changed) => {
      if (changed) scheduleAutoSync();
    }).catch((e) => {
      affoDebugWarn('[AFFO Background] Failed to update inline-apply domains metadata:', e);
      markLocalItemModified(SYNC_INLINE_DOMAINS_NAME).then(() => scheduleAutoSync());
    });
  }
  if (changes[CUSTOM_FONTS_CSS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[CUSTOM_FONTS_CSS_KEY])) {
    markLocalItemModified(SYNC_CUSTOM_FONTS_NAME).then(() => scheduleAutoSync());
  }
  if (changes[AGGRESSIVE_DOMAINS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[AGGRESSIVE_DOMAINS_KEY])) {
    markDomainOriginArrayModified(changes[AGGRESSIVE_DOMAINS_KEY], {
      localMetaStorageKey: AGGRESSIVE_DOMAINS_META_KEY,
      syncArrayFilename: SYNC_AGGRESSIVE_DOMAINS_NAME,
      syncMetaFilename: SYNC_AGGRESSIVE_DOMAINS_META_NAME
    }).then((changed) => {
      if (changed) scheduleAutoSync();
    }).catch((e) => {
      affoDebugWarn('[AFFO Background] Failed to update aggressive domains metadata:', e);
      markLocalItemModified(SYNC_AGGRESSIVE_DOMAINS_NAME).then(() => scheduleAutoSync());
    });
  }
  if (changes[WAITFORIT_DOMAINS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[WAITFORIT_DOMAINS_KEY])) {
    markDomainOriginArrayModified(changes[WAITFORIT_DOMAINS_KEY], {
      localMetaStorageKey: WAITFORIT_DOMAINS_META_KEY,
      syncArrayFilename: SYNC_WAITFORIT_DOMAINS_NAME,
      syncMetaFilename: SYNC_WAITFORIT_DOMAINS_META_NAME
    }).then((changed) => {
      if (changed) scheduleAutoSync();
    }).catch((e) => {
      affoDebugWarn('[AFFO Background] Failed to update Wait For It domains metadata:', e);
      markLocalItemModified(SYNC_WAITFORIT_DOMAINS_NAME).then(() => scheduleAutoSync());
    });
  }
  if (changes[IGNORE_COMMENTS_DOMAINS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[IGNORE_COMMENTS_DOMAINS_KEY])) {
    markDomainOriginArrayModified(changes[IGNORE_COMMENTS_DOMAINS_KEY], {
      localMetaStorageKey: IGNORE_COMMENTS_DOMAINS_META_KEY,
      syncArrayFilename: SYNC_IGNORE_COMMENTS_DOMAINS_NAME,
      syncMetaFilename: SYNC_IGNORE_COMMENTS_DOMAINS_META_NAME
    }).then((changed) => {
      if (changed) scheduleAutoSync();
    }).catch((e) => {
      affoDebugWarn('[AFFO Background] Failed to update ignore-comments domains metadata:', e);
      markLocalItemModified(SYNC_IGNORE_COMMENTS_DOMAINS_NAME).then(() => scheduleAutoSync());
    });
  }
  if (changes[SUBSTACK_BEIGE_DISABLED_DOMAINS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[SUBSTACK_BEIGE_DISABLED_DOMAINS_KEY])) {
    markDomainOriginArrayModified(changes[SUBSTACK_BEIGE_DISABLED_DOMAINS_KEY], {
      localMetaStorageKey: SUBSTACK_BEIGE_DISABLED_DOMAINS_META_KEY,
      syncArrayFilename: SYNC_SUBSTACK_BEIGE_DISABLED_DOMAINS_NAME,
      syncMetaFilename: SYNC_SUBSTACK_BEIGE_DISABLED_DOMAINS_META_NAME
    }).then((changed) => {
      if (changed) scheduleAutoSync();
    }).catch((e) => {
      affoDebugWarn('[AFFO Background] Failed to update Substack Roulette beige disabled domains metadata:', e);
      markLocalItemModified(SYNC_SUBSTACK_BEIGE_DISABLED_DOMAINS_NAME).then(() => scheduleAutoSync());
    });
  }
  if (changes[PRESERVED_FONTS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[PRESERVED_FONTS_KEY])) {
    markLocalItemModified(SYNC_PRESERVED_FONTS_NAME).then(() => scheduleAutoSync());
  }
  if (changes[CUSTOM_FONT_AXES_KEY] && trackSyncManagedChanges && storageValueChanged(changes[CUSTOM_FONT_AXES_KEY])) {
    markLocalItemModified(SYNC_CUSTOM_FONT_AXES_NAME).then(() => scheduleAutoSync());
  }
  if (trackSyncManagedChanges) {
    const rouletteChanged = (changes[SUBSTACK_ROULETTE_KEY] && storageValueChanged(changes[SUBSTACK_ROULETTE_KEY]))
      || (changes[SUBSTACK_ROULETTE_SERIF_KEY] && storageValueChanged(changes[SUBSTACK_ROULETTE_SERIF_KEY]))
      || (changes[SUBSTACK_ROULETTE_SANS_KEY] && storageValueChanged(changes[SUBSTACK_ROULETTE_SANS_KEY]));
    if (rouletteChanged) {
      markLocalItemModified(SYNC_SUBSTACK_ROULETTE_NAME).then(() => scheduleAutoSync());
    }
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
    affoDebugLog('[AFFO Background] Toolbar options changed, notifying content scripts:', toolbarOptionsChanged);

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
      affoDebugWarn('[AFFO Background] Error notifying content scripts of toolbar changes:', e);
    }
  }
});
