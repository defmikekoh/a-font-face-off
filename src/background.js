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
const CUSTOM_FONTS_CSS_KEY = 'affoCustomFontsCss';
const APPLY_MAP_KEY = 'affoApplyMap';
const FAVORITES_KEY = 'affoFavorites';
const FAVORITES_ORDER_KEY = 'affoFavoritesOrder';

// Sync constants (backend-agnostic)
const SYNC_BACKEND_KEY = 'affoSyncBackend';       // 'gdrive' | 'webdav'
const SYNC_META_KEY = 'affoSyncMeta';
const SYNC_FOLDER_NAME = 'A Font Face-off';
const SYNC_MANIFEST_NAME = 'sync-manifest.json';
const SYNC_DOMAINS_NAME = 'domains.json';
const SYNC_FAVORITES_NAME = 'favorites.json';
const SYNC_CUSTOM_FONTS_NAME = 'custom-fonts.css';
const SYNC_KNOWN_SERIF_NAME = 'known-serif.json';
const SYNC_KNOWN_SANS_NAME = 'known-sans.json';
const SYNC_FFONLY_DOMAINS_NAME = 'fontface-only-domains.json';
const SYNC_INLINE_DOMAINS_NAME = 'inline-apply-domains.json';
const SYNC_AGGRESSIVE_DOMAINS_NAME = 'aggressive-domains.json';
const SYNC_PRESERVED_FONTS_NAME = 'preserved-fonts.json';
const SYNC_SUBSTACK_ROULETTE_NAME = 'substack-roulette.json';
const KNOWN_SERIF_KEY = 'affoKnownSerif';
const KNOWN_SANS_KEY = 'affoKnownSans';
const FFONLY_DOMAINS_KEY = 'affoFontFaceOnlyDomains';
const INLINE_DOMAINS_KEY = 'affoInlineApplyDomains';
const AGGRESSIVE_DOMAINS_KEY = 'affoAggressiveDomains';
const PRESERVED_FONTS_KEY = 'affoPreservedFonts';
const SUBSTACK_ROULETTE_KEY = 'affoSubstackRoulette';
const SUBSTACK_ROULETTE_SERIF_KEY = 'affoSubstackRouletteSerif';
const SUBSTACK_ROULETTE_SANS_KEY = 'affoSubstackRouletteSans';
const SYNC_ALARM_NAME = 'affoPeriodicSync';
const SYNC_ALARM_PERIOD_MINUTES = 60; // 1 hour

// Google Drive constants
const GDRIVE_TOKENS_KEY = 'affoGDriveTokens';
const GDRIVE_FOLDER_SUFFIX_KEY = 'affoGDriveFolderSuffix';
// GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET are loaded from gdrive-config.js (gitignored)
const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GDRIVE_API = 'https://www.googleapis.com/drive/v3';
const GDRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
// Loopback redirect URI (native app OAuth flow) — intercepted via webRequest, port is arbitrary
const GDRIVE_FALLBACK_REDIRECT = 'http://127.0.0.1:45678/affo-oauth';

// WebDAV constants
const WEBDAV_CONFIG_KEY = 'affoWebDavConfig';     // { serverUrl, username, password, anonymous }

// Shared cache promise to avoid reading storage.local multiple times concurrently
let cacheReadPromise = null;
let cachedFontData = null;
const CACHE_STALE_TIME = 5000; // 5 seconds
let syncQueue = Promise.resolve();
let syncMetaQueue = Promise.resolve();
let syncWriteDepth = 0;

// Cached folder ID (cleared on background script restart)
let cachedAppFolderId = null;

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
  syncMetaQueue = queued.catch(() => {});
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

async function saveGDriveTokens(tokens) {
  await browser.storage.local.set({ [GDRIVE_TOKENS_KEY]: tokens });
}

async function isGDriveConfigured() {
  const tokens = await getGDriveTokens();
  return !!(tokens && tokens.accessToken && tokens.refreshToken);
}

async function refreshAccessToken() {
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
    throw new Error(`Token refresh failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  const updated = {
    accessToken: data.access_token,
    refreshToken: tokens.refreshToken,
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
  const tokens = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000
  };
  await saveGDriveTokens(tokens);
  await browser.storage.local.set({ [SYNC_BACKEND_KEY]: 'gdrive' });
  cachedAppFolderId = null;
  await startSyncAlarm();
  console.log('[AFFO Background] Google Drive connected');
  return { ok: true };
}

function buildAuthUrl(codeChallenge, redirectUri) {
  const params = new URLSearchParams({
    client_id: GDRIVE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GDRIVE_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Primary auth: uses browser.identity.launchWebAuthFlow (desktop Firefox)
async function startGDriveAuthIdentity() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const redirectUri = browser.identity.getRedirectURL();
  const authUrl = buildAuthUrl(codeChallenge, redirectUri);

  const responseUrl = await browser.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true
  });

  const url = new URL(responseUrl);
  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code received');
  }

  return exchangeCodeForTokens(code, codeVerifier, redirectUri);
}

// Fallback auth: opens tab + intercepts redirect via webRequest (Firefox Android)
function startGDriveAuthViaTab() {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const redirectUri = GDRIVE_FALLBACK_REDIRECT;
    const authUrl = buildAuthUrl(codeChallenge, redirectUri);

    const listener = (details) => {
      if (settled) return;
      // The filter pattern is broad (port stripped for Firefox compat),
      // so verify this is actually our redirect before acting
      if (!details.url.startsWith(redirectUri)) return;
      const url = new URL(details.url);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      settled = true;
      browser.webRequest.onBeforeRequest.removeListener(listener);

      // Close the OAuth tab
      if (details.tabId >= 0) {
        browser.tabs.remove(details.tabId).catch(() => {});
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

      return { cancel: true };
    };

    // Firefox match patterns don't support port numbers — strip port for the filter,
    // then do precise matching inside the listener via full URL comparison
    const filterPattern = redirectUri.replace(/:\d+/, '') + '*';
    browser.webRequest.onBeforeRequest.addListener(
      listener,
      { urls: [filterPattern] },
      ['blocking']
    );

    try {
      await browser.tabs.create({ url: authUrl, active: true });
    } catch (e) {
      settled = true;
      browser.webRequest.onBeforeRequest.removeListener(listener);
      reject(e);
    }

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!settled) {
        settled = true;
        browser.webRequest.onBeforeRequest.removeListener(listener);
        reject(new Error('OAuth flow timed out'));
      }
    }, 5 * 60 * 1000);
  });
}

async function startGDriveAuth() {
  if (typeof browser.identity !== 'undefined' && browser.identity.launchWebAuthFlow) {
    return startGDriveAuthIdentity();
  }
  return startGDriveAuthViaTab();
}

async function disconnectGDrive() {
  const tokens = await getGDriveTokens();
  if (tokens && tokens.accessToken) {
    // Best-effort revoke
    fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`, {
      method: 'POST',
      credentials: 'omit'
    }).catch(() => {});
  }
  await browser.storage.local.remove([GDRIVE_TOKENS_KEY, SYNC_META_KEY, SYNC_BACKEND_KEY]);
  cachedAppFolderId = null;
  await stopSyncAlarm();
  console.log('[AFFO Background] Google Drive disconnected');
  return { ok: true };
}

// ─── Google Drive: Folder & File Operations ────────────────────────────

async function getAppFolderName() {
  const data = await browser.storage.local.get(GDRIVE_FOLDER_SUFFIX_KEY);
  const suffix = String(data[GDRIVE_FOLDER_SUFFIX_KEY] || '').trim();
  return suffix ? `${SYNC_FOLDER_NAME} ${suffix}` : SYNC_FOLDER_NAME;
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
    console.log(`[AFFO Background] Created Google Drive folder: ${folderName}`);
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
    console.warn(`[AFFO Background] Duplicate Google Drive files found for ${name}; using latest modified file`);
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
      console.warn(`[AFFO Background] Failed deleting duplicate file ${name} (${dupId}):`, e);
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
  console.log('[AFFO Background] WebDAV connected');
  return { ok: true };
}

async function disconnectWebDav() {
  await browser.storage.local.remove([WEBDAV_CONFIG_KEY, SYNC_META_KEY, SYNC_BACKEND_KEY]);
  await stopSyncAlarm();
  console.log('[AFFO Background] WebDAV disconnected');
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

async function webdavInit() {
  const config = await getWebDavConfig();
  if (!config || !config.serverUrl) throw new Error('WebDAV not configured');
  let url = config.serverUrl.trim();
  if (!url.endsWith('/')) url += '/';
  const folderSuffixData = await browser.storage.local.get(GDRIVE_FOLDER_SUFFIX_KEY);
  const suffix = (folderSuffixData[GDRIVE_FOLDER_SUFFIX_KEY] || '').trim();
  const folderName = suffix ? `${SYNC_FOLDER_NAME} ${suffix}` : SYNC_FOLDER_NAME;
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
// put returns { remoteRev } (null for backends without revision tracking)

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
    return { data, remoteRev: null };
  },
  async put(name, content, contentType) {
    const res = await fetch(this._baseUrl + encodeURIComponent(name), {
      method: 'PUT',
      headers: { ...this._headers, 'Content-Type': contentType },
      body: content,
      credentials: 'omit'
    });
    if (!res.ok) throw new Error('WebDAV PUT failed: ' + res.status);
    return { remoteRev: null };
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

// ─── Sync Algorithm ───────────────────────────────────────────────────

function notifySyncFailure(errorMessage) {
  browser.runtime.sendMessage({
    type: 'affoSyncFailed',
    error: String(errorMessage || 'Unknown sync error')
  }).catch(() => {});
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

async function getLocalFavoritesSnapshot() {
  const data = await browser.storage.local.get([FAVORITES_KEY, FAVORITES_ORDER_KEY]);
  const favorites = (data[FAVORITES_KEY] && typeof data[FAVORITES_KEY] === 'object') ? data[FAVORITES_KEY] : {};
  const favoritesOrder = Array.isArray(data[FAVORITES_ORDER_KEY]) ? data[FAVORITES_ORDER_KEY] : Object.keys(favorites);
  return {
    [FAVORITES_KEY]: favorites,
    [FAVORITES_ORDER_KEY]: favoritesOrder
  };
}

// Push helper: optionally checks GDrive revision before writing
async function syncPush(backend, localState, filename, content, contentType) {
  if (backend.name === 'gdrive') {
    const revCheck = await ensureRemoteRevisionUnchanged(localState, filename, backend._folderId);
    assertRemoteRevisionUnchanged(revCheck, filename);
    const putResult = await backend.put(filename, content, contentType);
    return putResult.remoteRev || revCheck.currentRemoteRev || null;
  }
  const putResult = await backend.put(filename, content, contentType);
  return putResult.remoteRev || null;
}

async function runSync() {
  if (!navigator.onLine) {
    console.log('[AFFO Background] Offline — skipping sync');
    return { ok: true, skipped: true, reason: 'offline' };
  }

  const backend = await getActiveBackend();
  if (!backend || !(await backend.isConfigured())) {
    console.log('[AFFO Background] Sync not configured — skipping sync');
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
      console.warn('[AFFO Background] Invalid sync manifest, starting fresh');
    }
  }

  const localMeta = await getLocalSyncMeta();
  let manifestChanged = false;
  const errors = [];
  // ── Domain settings (single file) ──
  try {
    const domainsItemKey = SYNC_DOMAINS_NAME;
    const localApplyMapData = await browser.storage.local.get(APPLY_MAP_KEY);
    const localApplyMap = localApplyMapData[APPLY_MAP_KEY] || {};
    const localState = localMeta.items[domainsItemKey] || {};
    const localModified = localState.modified || 0;
    const remoteModified = ((remoteManifest.items || {})[domainsItemKey] || {}).modified || 0;

    if (firstSync) {
      const fileResult = await backend.get(SYNC_DOMAINS_NAME);
      if (!fileResult.notFound) {
        const remoteDomains = JSON.parse(fileResult.data);
        await setStorageDuringSync({ [APPLY_MAP_KEY]: remoteDomains });
        const modified = remoteModified || now;
        setModified(localMeta.items, domainsItemKey, modified, { remoteRev: fileResult.remoteRev });
        setModified(remoteManifest.items, domainsItemKey, modified, { remoteRev: fileResult.remoteRev });
        manifestChanged = true;
      } else {
        const modified = localModified || now;
        const remoteRev = await syncPush(backend, localState, SYNC_DOMAINS_NAME, JSON.stringify(localApplyMap, null, 2), 'application/json');
        setModified(remoteManifest.items, domainsItemKey, modified, { remoteRev });
        setModified(localMeta.items, domainsItemKey, modified, { remoteRev });
        manifestChanged = true;
      }
    } else if (remoteModified > localModified) {
      // Pull
      const fileResult = await backend.get(SYNC_DOMAINS_NAME);
      if (!fileResult.notFound) {
        const remoteDomains = JSON.parse(fileResult.data);
        await setStorageDuringSync({ [APPLY_MAP_KEY]: remoteDomains });
        setModified(localMeta.items, domainsItemKey, remoteModified, { remoteRev: fileResult.remoteRev });
      }
    } else if (localModified > remoteModified) {
      // Push
      const modified = localModified || now;
      const remoteRev = await syncPush(backend, localState, SYNC_DOMAINS_NAME, JSON.stringify(localApplyMap, null, 2), 'application/json');
      setModified(remoteManifest.items, domainsItemKey, modified, { remoteRev });
      setModified(localMeta.items, domainsItemKey, modified, { remoteRev });
      manifestChanged = true;
    }
    // else: equal timestamps — skip
  } catch (e) {
    console.warn('[AFFO Background] Domain settings sync error:', e);
    errors.push(e);
  }

  // ── Favorites ──
  try {
    const localFavSnapshot = await getLocalFavoritesSnapshot();
    const favItemKey = SYNC_FAVORITES_NAME;
    const localState = localMeta.items[favItemKey] || {};
    const localModified = (localMeta.items[favItemKey] || {}).modified || 0;
    const remoteModified = ((remoteManifest.items || {})[favItemKey] || {}).modified || 0;

    if (firstSync) {
      const fileResult = await backend.get(SYNC_FAVORITES_NAME);
      if (!fileResult.notFound) {
        const remoteFav = JSON.parse(fileResult.data);
        const favorites = (remoteFav[FAVORITES_KEY] && typeof remoteFav[FAVORITES_KEY] === 'object') ? remoteFav[FAVORITES_KEY] : {};
        const favoritesOrder = Array.isArray(remoteFav[FAVORITES_ORDER_KEY]) ? remoteFav[FAVORITES_ORDER_KEY] : Object.keys(favorites);
        await setStorageDuringSync({ [FAVORITES_KEY]: favorites, [FAVORITES_ORDER_KEY]: favoritesOrder });
        const modified = remoteModified || now;
        setModified(localMeta.items, favItemKey, modified, { remoteRev: fileResult.remoteRev });
        setModified(remoteManifest.items, favItemKey, modified, { remoteRev: fileResult.remoteRev });
        manifestChanged = true;
      } else {
        const modified = localModified || now;
        const payload = JSON.stringify(localFavSnapshot, null, 2);
        const remoteRev = await syncPush(backend, localState, SYNC_FAVORITES_NAME, payload, 'application/json');
        setModified(remoteManifest.items, favItemKey, modified, { remoteRev });
        setModified(localMeta.items, favItemKey, modified, { remoteRev });
        manifestChanged = true;
      }
    } else if (remoteModified > localModified) {
      // Pull
      const fileResult = await backend.get(SYNC_FAVORITES_NAME);
      if (!fileResult.notFound) {
        const remoteFav = JSON.parse(fileResult.data);
        const favorites = (remoteFav[FAVORITES_KEY] && typeof remoteFav[FAVORITES_KEY] === 'object') ? remoteFav[FAVORITES_KEY] : {};
        const favoritesOrder = Array.isArray(remoteFav[FAVORITES_ORDER_KEY]) ? remoteFav[FAVORITES_ORDER_KEY] : Object.keys(favorites);
        await setStorageDuringSync({ [FAVORITES_KEY]: favorites, [FAVORITES_ORDER_KEY]: favoritesOrder });
        setModified(localMeta.items, favItemKey, remoteModified, { remoteRev: fileResult.remoteRev });
      }
    } else if (localModified > remoteModified) {
      // Push
      const modified = localModified || now;
      const payload = JSON.stringify(localFavSnapshot, null, 2);
      const remoteRev = await syncPush(backend, localState, SYNC_FAVORITES_NAME, payload, 'application/json');
      setModified(remoteManifest.items, favItemKey, modified, { remoteRev });
      setModified(localMeta.items, favItemKey, modified, { remoteRev });
      manifestChanged = true;
    }
  } catch (e) {
    console.warn('[AFFO Background] Favorites sync error:', e);
    errors.push(e);
  }

  // ── Custom fonts CSS ──
  try {
    const cssItemKey = SYNC_CUSTOM_FONTS_NAME;
    const localState = localMeta.items[cssItemKey] || {};
    const localModified = (localMeta.items[cssItemKey] || {}).modified || 0;
    const remoteModified = ((remoteManifest.items || {})[cssItemKey] || {}).modified || 0;

    if (firstSync) {
      const fileResult = await backend.get(SYNC_CUSTOM_FONTS_NAME);
      if (!fileResult.notFound) {
        await setStorageDuringSync({ [CUSTOM_FONTS_CSS_KEY]: fileResult.data });
        const modified = remoteModified || now;
        setModified(localMeta.items, cssItemKey, modified, { remoteRev: fileResult.remoteRev });
        setModified(remoteManifest.items, cssItemKey, modified, { remoteRev: fileResult.remoteRev });
        manifestChanged = true;
      } else {
        const stored = await browser.storage.local.get(CUSTOM_FONTS_CSS_KEY);
        let cssText = stored[CUSTOM_FONTS_CSS_KEY];
        if (!cssText) {
          const url = browser.runtime.getURL('custom-fonts-starter.css');
          const response = await fetch(url);
          cssText = await response.text();
        }
        if (cssText) {
          const modified = localModified || now;
          const remoteRev = await syncPush(backend, localState, SYNC_CUSTOM_FONTS_NAME, cssText, 'text/css');
          setModified(remoteManifest.items, cssItemKey, modified, { remoteRev });
          setModified(localMeta.items, cssItemKey, modified, { remoteRev });
          manifestChanged = true;
        }
      }
    } else if (remoteModified > localModified) {
      // Pull
      const fileResult = await backend.get(SYNC_CUSTOM_FONTS_NAME);
      if (!fileResult.notFound) {
        await setStorageDuringSync({ [CUSTOM_FONTS_CSS_KEY]: fileResult.data });
        setModified(localMeta.items, cssItemKey, remoteModified, { remoteRev: fileResult.remoteRev });
      }
    } else if (localModified > remoteModified) {
      // Push
      const stored = await browser.storage.local.get(CUSTOM_FONTS_CSS_KEY);
      let cssText = stored[CUSTOM_FONTS_CSS_KEY];
      if (!cssText) {
        const url = browser.runtime.getURL('custom-fonts-starter.css');
        const response = await fetch(url);
        cssText = await response.text();
      }
      if (cssText) {
        const modified = localModified || now;
        const remoteRev = await syncPush(backend, localState, SYNC_CUSTOM_FONTS_NAME, cssText, 'text/css');
        setModified(remoteManifest.items, cssItemKey, modified, { remoteRev });
        setModified(localMeta.items, cssItemKey, modified, { remoteRev });
        manifestChanged = true;
      }
    }
  } catch (e) {
    console.warn('[AFFO Background] Custom fonts sync error:', e);
    errors.push(e);
  }

  // ── Simple JSON array settings (known serif/sans, fontface-only/inline domains) ──
  const jsonArrayItems = [
    { key: KNOWN_SERIF_KEY, filename: SYNC_KNOWN_SERIF_NAME, label: 'Known serif' },
    { key: KNOWN_SANS_KEY, filename: SYNC_KNOWN_SANS_NAME, label: 'Known sans' },
    { key: FFONLY_DOMAINS_KEY, filename: SYNC_FFONLY_DOMAINS_NAME, label: 'FontFace-only domains' },
    { key: INLINE_DOMAINS_KEY, filename: SYNC_INLINE_DOMAINS_NAME, label: 'Inline apply domains' },
    { key: AGGRESSIVE_DOMAINS_KEY, filename: SYNC_AGGRESSIVE_DOMAINS_NAME, label: 'Aggressive domains' },
    { key: PRESERVED_FONTS_KEY, filename: SYNC_PRESERVED_FONTS_NAME, label: 'Preserved fonts' }
  ];
  for (const item of jsonArrayItems) {
    try {
      const localState = localMeta.items[item.filename] || {};
      const localModified = (localMeta.items[item.filename] || {}).modified || 0;
      const remoteModified = ((remoteManifest.items || {})[item.filename] || {}).modified || 0;

      if (firstSync) {
        const fileResult = await backend.get(item.filename);
        if (!fileResult.notFound) {
          const parsed = JSON.parse(fileResult.data);
          await setStorageDuringSync({ [item.key]: parsed });
          const modified = remoteModified || now;
          setModified(localMeta.items, item.filename, modified, { remoteRev: fileResult.remoteRev });
          setModified(remoteManifest.items, item.filename, modified, { remoteRev: fileResult.remoteRev });
          manifestChanged = true;
        } else {
          const stored = await browser.storage.local.get(item.key);
          const arr = stored[item.key];
          if (Array.isArray(arr)) {
            const modified = localModified || now;
            const remoteRev = await syncPush(backend, localState, item.filename, JSON.stringify(arr, null, 2), 'application/json');
            setModified(remoteManifest.items, item.filename, modified, { remoteRev });
            setModified(localMeta.items, item.filename, modified, { remoteRev });
            manifestChanged = true;
          }
        }
      } else if (remoteModified > localModified) {
        // Pull
        const fileResult = await backend.get(item.filename);
        if (!fileResult.notFound) {
          const parsed = JSON.parse(fileResult.data);
          await setStorageDuringSync({ [item.key]: parsed });
          setModified(localMeta.items, item.filename, remoteModified, { remoteRev: fileResult.remoteRev });
        }
      } else if (localModified > remoteModified) {
        // Push
        const stored = await browser.storage.local.get(item.key);
        const arr = stored[item.key];
        if (Array.isArray(arr)) {
          const modified = localModified || now;
          const remoteRev = await syncPush(backend, localState, item.filename, JSON.stringify(arr, null, 2), 'application/json');
          setModified(remoteManifest.items, item.filename, modified, { remoteRev });
          setModified(localMeta.items, item.filename, modified, { remoteRev });
          manifestChanged = true;
        }
      }
    } catch (e) {
      console.warn(`[AFFO Background] ${item.label} sync error:`, e);
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

    if (firstSync) {
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
        setModified(remoteManifest.items, rouletteItemKey, modified, { remoteRev: fileResult.remoteRev });
        manifestChanged = true;
      } else {
        const snapshot = await getLocalRouletteSnapshot();
        const modified = localModified || now;
        const remoteRev = await syncPush(backend, localState, SYNC_SUBSTACK_ROULETTE_NAME, JSON.stringify(snapshot, null, 2), 'application/json');
        setModified(remoteManifest.items, rouletteItemKey, modified, { remoteRev });
        setModified(localMeta.items, rouletteItemKey, modified, { remoteRev });
        manifestChanged = true;
      }
    } else if (remoteModified > localModified) {
      // Pull
      const fileResult = await backend.get(SYNC_SUBSTACK_ROULETTE_NAME);
      if (!fileResult.notFound) {
        const remote = JSON.parse(fileResult.data);
        await setStorageDuringSync({
          [SUBSTACK_ROULETTE_KEY]: remote[SUBSTACK_ROULETTE_KEY] !== false,
          [SUBSTACK_ROULETTE_SERIF_KEY]: Array.isArray(remote[SUBSTACK_ROULETTE_SERIF_KEY]) ? remote[SUBSTACK_ROULETTE_SERIF_KEY] : [],
          [SUBSTACK_ROULETTE_SANS_KEY]: Array.isArray(remote[SUBSTACK_ROULETTE_SANS_KEY]) ? remote[SUBSTACK_ROULETTE_SANS_KEY] : []
        });
        setModified(localMeta.items, rouletteItemKey, remoteModified, { remoteRev: fileResult.remoteRev });
      }
    } else if (localModified > remoteModified) {
      // Push
      const snapshot = await getLocalRouletteSnapshot();
      const modified = localModified || now;
      const remoteRev = await syncPush(backend, localState, SYNC_SUBSTACK_ROULETTE_NAME, JSON.stringify(snapshot, null, 2), 'application/json');
      setModified(remoteManifest.items, rouletteItemKey, modified, { remoteRev });
      setModified(localMeta.items, rouletteItemKey, modified, { remoteRev });
      manifestChanged = true;
    }
  } catch (e) {
    console.warn('[AFFO Background] Substack roulette sync error:', e);
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
    console.warn(`[AFFO Background] Sync completed with ${errors.length} error(s): ${msg}`);
    notifySyncFailure(msg);
    return { ok: false, error: msg, partialErrors: errors.length };
  }

  console.log('[AFFO Background] Sync completed successfully');
  return { ok: true };
}

function scheduleAutoSync() {
  enqueueSync({ notifyOnError: true }).catch(() => {});
}

function enqueueSync(options = {}) {
  const notifyOnError = options.notifyOnError !== false;
  const queued = syncQueue
    .catch(() => undefined)
    .then(async () => {
      if (!(await isSyncConfigured()) || !navigator.onLine) {
        return { ok: true, skipped: true, reason: 'offline_or_not_configured' };
      }
      return runSync();
    });

  syncQueue = queued.then(
    () => undefined,
    (e) => {
      if (notifyOnError) {
        console.warn('[AFFO Background] Auto-sync queue error:', e);
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
    console.warn('[AFFO Background] browser.alarms API unavailable; periodic sync disabled');
    return { ok: true, skipped: true, reason: 'alarms_unavailable' };
  }
  await browser.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: SYNC_ALARM_PERIOD_MINUTES });
  console.log(`[AFFO Background] Periodic sync alarm started (every ${SYNC_ALARM_PERIOD_MINUTES}m)`);
  return { ok: true };
}

async function stopSyncAlarm() {
  if (!hasAlarmsApi()) {
    return { ok: true, skipped: true, reason: 'alarms_unavailable' };
  }
  await browser.alarms.clear(SYNC_ALARM_NAME);
  console.log('[AFFO Background] Periodic sync alarm stopped');
  return { ok: true };
}

if (hasAlarmsApi()) {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM_NAME) {
      console.log('[AFFO Background] Periodic sync alarm fired');
      scheduleAutoSync();
    }
  });
}

// On background script wake, ensure alarm is running if sync is configured
isSyncConfigured().then(configured => {
  if (configured) startSyncAlarm();
});

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

browser.runtime.onMessage.addListener(async (msg, sender) => {
  try {
    // Handle cache flush requests
    if (msg.type === 'flushFontCache') {
      await flushCacheWrites();
      return { ok: true };
    }

    if (msg.type === 'affoGDriveAuth') {
      try {
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

    if (msg.type === 'affoWebDavConnect') {
      try {
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
        return await enqueueSync({ notifyOnError: true });
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoSyncRetry') {
      try {
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
        if (fontConfig.fontSize) payload.fontSize = fontConfig.fontSize;
        if (fontConfig.lineHeight) payload.lineHeight = fontConfig.lineHeight;
        if (fontConfig.fontWeight) payload.fontWeight = fontConfig.fontWeight;
        if (fontConfig.fontColor) payload.fontColor = fontConfig.fontColor;
        if (fontConfig.variableAxes) payload.variableAxes = fontConfig.variableAxes;

        // Save to storage
        const result = await browser.storage.local.get(APPLY_MAP_KEY);
        const applyMap = result[APPLY_MAP_KEY] || {};
        if (!applyMap[origin]) applyMap[origin] = {};
        applyMap[origin][position] = payload;

        await browser.storage.local.set({ [APPLY_MAP_KEY]: applyMap });

        // Run DOM walker via content script message
        await browser.tabs.sendMessage(tabId, { type: 'runElementWalker', fontType: position });

        // Generate and inject CSS
        const css = generateThirdManInCSS(position, payload, origin);
        await browser.tabs.insertCSS(tabId, { code: css, cssOrigin: 'user' });

        console.log('[AFFO Background] Quick-apply font applied to', position, 'on', origin);
        return { success: true };
      } catch (e) {
        console.error('[AFFO Background] Quick-apply failed:', e);
        return { success: false, error: e.message };
      }
    }

    // Handle quick-unapply from toolbar
    if (msg.type === 'quickUnapplyFonts') {
      try {
        const { origin } = msg;
        const tabId = sender.tab ? sender.tab.id : null;

        if (!origin || !tabId) {
          return { success: false, error: 'Missing required parameters' };
        }

        // Remove domain fonts from storage
        const result = await browser.storage.local.get(APPLY_MAP_KEY);
        const applyMap = result[APPLY_MAP_KEY] || {};
        if (applyMap[origin]) {
          delete applyMap[origin];
          await browser.storage.local.set({ [APPLY_MAP_KEY]: applyMap });
        }

        // Clear all applied styles by removing the injected CSS
        try {
          await browser.tabs.removeCSS(tabId, { code: '' });
        } catch (e) {
          // removeCSS might fail, but we still cleared storage
          console.log('[AFFO Background] RemoveCSS note:', e.message);
        }

        // Reload page content script to clean up
        await browser.tabs.executeScript(tabId, {
          code: 'if (window.affoRemoveAllStyles) { window.affoRemoveAllStyles(); }'
        }).catch(e => {
          // Script execution might fail, but storage is cleared
          console.log('[AFFO Background] Reload script note:', e.message);
        });

        console.log('[AFFO Background] Fonts removed for', origin);
        return { success: true };
      } catch (e) {
        console.error('[AFFO Background] Unapply failed:', e);
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
  if (changes[GDRIVE_FOLDER_SUFFIX_KEY]) {
    cachedAppFolderId = null;
  }
  const trackSyncManagedChanges = syncWriteDepth === 0;

  // Only mark items modified when data actually changed (avoid unnecessary sync cycles)
  const storageValueChanged = (c) =>
    JSON.stringify(c.oldValue) !== JSON.stringify(c.newValue);

  if (changes[APPLY_MAP_KEY] && trackSyncManagedChanges && storageValueChanged(changes[APPLY_MAP_KEY])) {
    markLocalItemModified(SYNC_DOMAINS_NAME).then(() => scheduleAutoSync());
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
    markLocalItemModified(SYNC_FFONLY_DOMAINS_NAME).then(() => scheduleAutoSync());
  }
  if (changes[INLINE_DOMAINS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[INLINE_DOMAINS_KEY])) {
    markLocalItemModified(SYNC_INLINE_DOMAINS_NAME).then(() => scheduleAutoSync());
  }
  if (changes[CUSTOM_FONTS_CSS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[CUSTOM_FONTS_CSS_KEY])) {
    markLocalItemModified(SYNC_CUSTOM_FONTS_NAME).then(() => scheduleAutoSync());
  }
  if (changes[AGGRESSIVE_DOMAINS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[AGGRESSIVE_DOMAINS_KEY])) {
    markLocalItemModified(SYNC_AGGRESSIVE_DOMAINS_NAME).then(() => scheduleAutoSync());
  }
  if (changes[PRESERVED_FONTS_KEY] && trackSyncManagedChanges && storageValueChanged(changes[PRESERVED_FONTS_KEY])) {
    markLocalItemModified(SYNC_PRESERVED_FONTS_NAME).then(() => scheduleAutoSync());
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
