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

// Google Drive sync constants
const GDRIVE_TOKENS_KEY = 'affoGDriveTokens';
const GDRIVE_FOLDER_SUFFIX_KEY = 'affoGDriveFolderSuffix';
const GDRIVE_SYNC_META_KEY = 'affoSyncMeta';
const GDRIVE_FOLDER_NAME_BASE = 'A Font Face-off';
const GDRIVE_SYNC_MANIFEST_NAME = 'sync-manifest.json';
const GDRIVE_DOMAINS_FOLDER_NAME = 'domains';
const GDRIVE_FAVORITES_NAME = 'favorites.json';
const GDRIVE_CUSTOM_FONTS_NAME = 'custom-fonts.css';
const GDRIVE_KNOWN_SERIF_NAME = 'known-serif.json';
const GDRIVE_KNOWN_SANS_NAME = 'known-sans.json';
const GDRIVE_FFONLY_DOMAINS_NAME = 'fontface-only-domains.json';
const GDRIVE_INLINE_DOMAINS_NAME = 'inline-apply-domains.json';
const KNOWN_SERIF_KEY = 'affoKnownSerif';
const KNOWN_SANS_KEY = 'affoKnownSans';
const FFONLY_DOMAINS_KEY = 'affoFontFaceOnlyDomains';
const INLINE_DOMAINS_KEY = 'affoInlineApplyDomains';
// GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET are loaded from gdrive-config.js (gitignored)
const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GDRIVE_API = 'https://www.googleapis.com/drive/v3';
const GDRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
// Loopback redirect URI (native app OAuth flow) — intercepted via webRequest, port is arbitrary
const GDRIVE_FALLBACK_REDIRECT = 'http://127.0.0.1:45678/affo-oauth';

// Shared cache promise to avoid reading storage.local multiple times concurrently
let cacheReadPromise = null;
let cachedFontData = null;
const CACHE_STALE_TIME = 5000; // 5 seconds
let syncQueue = Promise.resolve();

// Cached folder IDs (cleared on background script restart)
let cachedAppFolderId = null;
let cachedDomainsFolderId = null;

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
  cachedAppFolderId = null;
  cachedDomainsFolderId = null;
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
  await browser.storage.local.remove([GDRIVE_TOKENS_KEY, GDRIVE_SYNC_META_KEY]);
  cachedAppFolderId = null;
  cachedDomainsFolderId = null;
  console.log('[AFFO Background] Google Drive disconnected');
  return { ok: true };
}

// ─── Google Drive: Folder & File Operations ────────────────────────────

async function getAppFolderName() {
  const data = await browser.storage.local.get(GDRIVE_FOLDER_SUFFIX_KEY);
  const suffix = String(data[GDRIVE_FOLDER_SUFFIX_KEY] || '').trim();
  return suffix ? `${GDRIVE_FOLDER_NAME_BASE} ${suffix}` : GDRIVE_FOLDER_NAME_BASE;
}

async function findFolder(name, parentId) {
  const q = parentId
    ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name}' and 'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
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

async function ensureAppFolder() {
  if (cachedAppFolderId && cachedDomainsFolderId) {
    return { appFolderId: cachedAppFolderId, domainsFolderId: cachedDomainsFolderId };
  }

  const folderName = await getAppFolderName();

  // Find or create app folder
  let appFolderId = await findFolder(folderName, null);
  if (!appFolderId) {
    appFolderId = await createFolder(folderName, null);
    console.log(`[AFFO Background] Created Google Drive folder: ${folderName}`);
  }

  // Find or create domains subfolder
  let domainsFolderId = await findFolder(GDRIVE_DOMAINS_FOLDER_NAME, appFolderId);
  if (!domainsFolderId) {
    domainsFolderId = await createFolder(GDRIVE_DOMAINS_FOLDER_NAME, appFolderId);
    console.log('[AFFO Background] Created domains subfolder');
  }

  cachedAppFolderId = appFolderId;
  cachedDomainsFolderId = domainsFolderId;
  return { appFolderId, domainsFolderId };
}

async function findFile(name, folderId) {
  const q = `name='${name}' and '${folderId}' in parents and trashed=false`;
  const res = await gdriveFetch(`${GDRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
  if (!res.ok) throw new Error(`Google Drive file search failed: ${res.status}`);
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function gdriveGetFile(name, folderId) {
  const fileId = await findFile(name, folderId);
  if (!fileId) return { notFound: true };
  const res = await gdriveFetch(`${GDRIVE_API}/files/${fileId}?alt=media`);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`Google Drive GET failed: ${res.status}`);
  const text = await res.text();
  return { data: text, fileId };
}

async function gdrivePutFile(name, folderId, content, contentType) {
  const existingId = await findFile(name, folderId);
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
    ? `${GDRIVE_UPLOAD_API}/files/${existingId}?uploadType=multipart`
    : `${GDRIVE_UPLOAD_API}/files?uploadType=multipart`;

  const res = await gdriveFetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });

  if (!res.ok) throw new Error(`Google Drive upload failed: ${res.status}`);
  const data = await res.json();
  return data.id;
}

async function gdriveDeleteFile(name, folderId) {
  const fileId = await findFile(name, folderId);
  if (!fileId) return;
  const res = await gdriveFetch(`${GDRIVE_API}/files/${fileId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Google Drive delete failed: ${res.status}`);
  }
}

async function gdriveListFiles(folderId) {
  const q = `'${folderId}' in parents and trashed=false`;
  let files = [];
  let pageToken = null;
  do {
    let url = `${GDRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name),nextPageToken&spaces=drive&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await gdriveFetch(url);
    if (!res.ok) throw new Error(`Google Drive list failed: ${res.status}`);
    const data = await res.json();
    files = files.concat(data.files || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return files;
}

// ─── Google Drive: Sync Algorithm ──────────────────────────────────────

function notifySyncFailure(errorMessage) {
  browser.runtime.sendMessage({
    type: 'affoSyncFailed',
    error: String(errorMessage || 'Unknown sync error')
  }).catch(() => {});
}

async function getLocalSyncMeta() {
  const data = await browser.storage.local.get(GDRIVE_SYNC_META_KEY);
  return data[GDRIVE_SYNC_META_KEY] || { lastSync: 0, items: {} };
}

async function saveLocalSyncMeta(meta) {
  await browser.storage.local.set({ [GDRIVE_SYNC_META_KEY]: meta });
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

async function runSync() {
  if (!navigator.onLine) {
    console.log('[AFFO Background] Offline — skipping sync');
    return { ok: true, skipped: true, reason: 'offline' };
  }

  if (!(await isGDriveConfigured())) {
    console.log('[AFFO Background] Google Drive not configured — skipping sync');
    return { ok: true, skipped: true, reason: 'not_configured' };
  }

  const now = Date.now();
  const { appFolderId, domainsFolderId } = await ensureAppFolder();

  // Fetch remote manifest
  const manifestResult = await gdriveGetFile(GDRIVE_SYNC_MANIFEST_NAME, appFolderId);
  let remoteManifest = { version: 1, lastSync: 0, items: {} };
  const firstSync = manifestResult.notFound;
  if (!firstSync) {
    try {
      remoteManifest = JSON.parse(manifestResult.data);
    } catch (e) {
      console.warn('[AFFO Background] Invalid sync manifest, starting fresh');
    }
  }

  const localMeta = await getLocalSyncMeta();
  let manifestChanged = false;
  const errors = [];

  // ── Domain settings (per-domain) ──
  try {
    const localApplyMapData = await browser.storage.local.get(APPLY_MAP_KEY);
    const localApplyMap = localApplyMapData[APPLY_MAP_KEY] || {};
    const localDomains = new Set(Object.keys(localApplyMap));

    // Find all remote domain files
    const remoteFiles = await gdriveListFiles(domainsFolderId);
    const remoteDomains = new Set();
    for (const file of remoteFiles) {
      if (file.name.endsWith('.json')) {
        remoteDomains.add(file.name.replace(/\.json$/, ''));
      }
    }

    // Sync each domain
    const allDomains = new Set([...localDomains, ...remoteDomains]);
    for (const domain of allDomains) {
      try {
        const filename = `${domain}.json`;
        const localItemKey = `domains/${filename}`;
        const localModified = (localMeta.items[localItemKey] || {}).modified || 0;
        const remoteModified = ((remoteManifest.items || {})[localItemKey] || {}).modified || 0;
        const inLocal = localDomains.has(domain);
        const inRemote = remoteDomains.has(domain);

        if (inLocal && inRemote) {
          // Both exist — compare timestamps
          if (remoteModified > localModified) {
            // Pull
            const fileResult = await gdriveGetFile(filename, domainsFolderId);
            if (!fileResult.notFound) {
              const domainConfig = JSON.parse(fileResult.data);
              localApplyMap[domain] = domainConfig;
              localMeta.items[localItemKey] = { modified: remoteModified };
            }
          } else if (localModified > remoteModified) {
            // Push
            await gdrivePutFile(filename, domainsFolderId, JSON.stringify(localApplyMap[domain], null, 2), 'application/json');
            remoteManifest.items[localItemKey] = { modified: localModified };
            manifestChanged = true;
          }
          // else: equal — skip
        } else if (inLocal && !inRemote) {
          // Only local — push
          const modified = localModified || now;
          await gdrivePutFile(filename, domainsFolderId, JSON.stringify(localApplyMap[domain], null, 2), 'application/json');
          remoteManifest.items[localItemKey] = { modified };
          localMeta.items[localItemKey] = { modified };
          manifestChanged = true;
        } else if (!inLocal && inRemote) {
          if (firstSync || !localMeta.lastSync) {
            // First sync — pull remote domains
            const fileResult = await gdriveGetFile(filename, domainsFolderId);
            if (!fileResult.notFound) {
              localApplyMap[domain] = JSON.parse(fileResult.data);
              localMeta.items[localItemKey] = { modified: remoteModified || now };
            }
          } else {
            // Domain was deleted locally — remove from remote
            await gdriveDeleteFile(filename, domainsFolderId);
            delete remoteManifest.items[localItemKey];
            delete localMeta.items[localItemKey];
            manifestChanged = true;
          }
        }
      } catch (e) {
        console.warn(`[AFFO Background] Sync error for domain ${domain}:`, e);
        errors.push(e);
      }
    }

    // Write back merged apply map
    await browser.storage.local.set({ [APPLY_MAP_KEY]: localApplyMap });
  } catch (e) {
    console.warn('[AFFO Background] Domain settings sync error:', e);
    errors.push(e);
  }

  // ── Favorites ──
  try {
    const localFavSnapshot = await getLocalFavoritesSnapshot();
    const favItemKey = GDRIVE_FAVORITES_NAME;
    const localModified = (localMeta.items[favItemKey] || {}).modified || 0;
    const remoteModified = ((remoteManifest.items || {})[favItemKey] || {}).modified || 0;

    if (remoteModified > localModified && !firstSync) {
      // Pull
      const fileResult = await gdriveGetFile(GDRIVE_FAVORITES_NAME, appFolderId);
      if (!fileResult.notFound) {
        const remoteFav = JSON.parse(fileResult.data);
        const favorites = (remoteFav[FAVORITES_KEY] && typeof remoteFav[FAVORITES_KEY] === 'object') ? remoteFav[FAVORITES_KEY] : {};
        const favoritesOrder = Array.isArray(remoteFav[FAVORITES_ORDER_KEY]) ? remoteFav[FAVORITES_ORDER_KEY] : Object.keys(favorites);
        await browser.storage.local.set({ [FAVORITES_KEY]: favorites, [FAVORITES_ORDER_KEY]: favoritesOrder });
        localMeta.items[favItemKey] = { modified: remoteModified };
      }
    } else if (localModified > remoteModified || firstSync) {
      // Push
      const modified = localModified || now;
      const payload = JSON.stringify(localFavSnapshot, null, 2);
      await gdrivePutFile(GDRIVE_FAVORITES_NAME, appFolderId, payload, 'application/json');
      remoteManifest.items[favItemKey] = { modified };
      localMeta.items[favItemKey] = { modified };
      manifestChanged = true;
    }
  } catch (e) {
    console.warn('[AFFO Background] Favorites sync error:', e);
    errors.push(e);
  }

  // ── Custom fonts CSS ──
  try {
    const cssItemKey = GDRIVE_CUSTOM_FONTS_NAME;
    const localModified = (localMeta.items[cssItemKey] || {}).modified || 0;
    const remoteModified = ((remoteManifest.items || {})[cssItemKey] || {}).modified || 0;

    if (remoteModified > localModified && !firstSync) {
      // Pull
      const fileResult = await gdriveGetFile(GDRIVE_CUSTOM_FONTS_NAME, appFolderId);
      if (!fileResult.notFound) {
        await browser.storage.local.set({ [CUSTOM_FONTS_CSS_KEY]: fileResult.data });
        localMeta.items[cssItemKey] = { modified: remoteModified };
      }
    } else if (localModified > remoteModified || firstSync) {
      // Push
      const stored = await browser.storage.local.get(CUSTOM_FONTS_CSS_KEY);
      let cssText = stored[CUSTOM_FONTS_CSS_KEY];
      if (!cssText) {
        const url = browser.runtime.getURL('custom-fonts.css');
        const response = await fetch(url);
        cssText = await response.text();
      }
      if (cssText) {
        const modified = localModified || now;
        await gdrivePutFile(GDRIVE_CUSTOM_FONTS_NAME, appFolderId, cssText, 'text/css');
        remoteManifest.items[cssItemKey] = { modified };
        localMeta.items[cssItemKey] = { modified };
        manifestChanged = true;
      }
    }
  } catch (e) {
    console.warn('[AFFO Background] Custom fonts sync error:', e);
    errors.push(e);
  }

  // ── Simple JSON array settings (known serif/sans, fontface-only/inline domains) ──
  const jsonArrayItems = [
    { key: KNOWN_SERIF_KEY, filename: GDRIVE_KNOWN_SERIF_NAME, label: 'Known serif' },
    { key: KNOWN_SANS_KEY, filename: GDRIVE_KNOWN_SANS_NAME, label: 'Known sans' },
    { key: FFONLY_DOMAINS_KEY, filename: GDRIVE_FFONLY_DOMAINS_NAME, label: 'FontFace-only domains' },
    { key: INLINE_DOMAINS_KEY, filename: GDRIVE_INLINE_DOMAINS_NAME, label: 'Inline apply domains' }
  ];
  for (const item of jsonArrayItems) {
    try {
      const localModified = (localMeta.items[item.filename] || {}).modified || 0;
      const remoteModified = ((remoteManifest.items || {})[item.filename] || {}).modified || 0;

      if (remoteModified > localModified && !firstSync) {
        // Pull
        const fileResult = await gdriveGetFile(item.filename, appFolderId);
        if (!fileResult.notFound) {
          const parsed = JSON.parse(fileResult.data);
          await browser.storage.local.set({ [item.key]: parsed });
          localMeta.items[item.filename] = { modified: remoteModified };
        }
      } else if (localModified > remoteModified || firstSync || (localModified === 0 && remoteModified === 0)) {
        // Push (includes never-synced items where both timestamps are 0)
        const stored = await browser.storage.local.get(item.key);
        const arr = stored[item.key];
        if (Array.isArray(arr)) {
          const modified = localModified || now;
          await gdrivePutFile(item.filename, appFolderId, JSON.stringify(arr, null, 2), 'application/json');
          remoteManifest.items[item.filename] = { modified };
          localMeta.items[item.filename] = { modified };
          manifestChanged = true;
        }
      }
    } catch (e) {
      console.warn(`[AFFO Background] ${item.label} sync error:`, e);
      errors.push(e);
    }
  }

  // ── Update manifests ──
  if (manifestChanged || firstSync) {
    remoteManifest.lastSync = now;
    await gdrivePutFile(GDRIVE_SYNC_MANIFEST_NAME, appFolderId, JSON.stringify(remoteManifest, null, 2), 'application/json');
  }

  localMeta.lastSync = now;
  await saveLocalSyncMeta(localMeta);

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
  syncQueue = syncQueue
    .then(async () => {
      if (!(await isGDriveConfigured()) || !navigator.onLine) return;
      await runSync();
    })
    .catch((e) => {
      console.warn('[AFFO Background] Auto-sync queue error:', e);
      notifySyncFailure(e && e.message ? e.message : String(e));
    });
}

// Update local sync timestamp when data changes
async function markLocalItemModified(itemKey) {
  const meta = await getLocalSyncMeta();
  meta.items[itemKey] = { modified: Date.now() };
  await saveLocalSyncMeta(meta);
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

    if (msg.type === 'affoSyncNow') {
      try {
        return await runSync();
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    if (msg.type === 'affoSyncRetry') {
      try {
        return await runSync();
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
    // Mark all changed domains with current timestamp
    const newMap = changes[APPLY_MAP_KEY].newValue || {};
    const oldMap = changes[APPLY_MAP_KEY].oldValue || {};
    const changedDomains = new Set([
      ...Object.keys(newMap).filter(d => JSON.stringify(newMap[d]) !== JSON.stringify(oldMap[d])),
      ...Object.keys(oldMap).filter(d => !(d in newMap))
    ]);
    if (changedDomains.size > 0) {
      (async () => {
        for (const domain of changedDomains) {
          await markLocalItemModified(`domains/${domain}.json`);
        }
        scheduleAutoSync();
      })();
    }
  }
  if (changes[FAVORITES_KEY] || changes[FAVORITES_ORDER_KEY]) {
    markLocalItemModified(GDRIVE_FAVORITES_NAME).then(() => scheduleAutoSync());
  }
  if (changes[KNOWN_SERIF_KEY]) {
    markLocalItemModified(GDRIVE_KNOWN_SERIF_NAME).then(() => scheduleAutoSync());
  }
  if (changes[KNOWN_SANS_KEY]) {
    markLocalItemModified(GDRIVE_KNOWN_SANS_NAME).then(() => scheduleAutoSync());
  }
  if (changes[FFONLY_DOMAINS_KEY]) {
    markLocalItemModified(GDRIVE_FFONLY_DOMAINS_NAME).then(() => scheduleAutoSync());
  }
  if (changes[INLINE_DOMAINS_KEY]) {
    markLocalItemModified(GDRIVE_INLINE_DOMAINS_NAME).then(() => scheduleAutoSync());
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
