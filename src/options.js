/* Options page logic: manage known serif/sans lists and cloud sync (Google Drive / WebDAV) */
(function(){
  let syncRetryAction = null;

  function showSyncFailureModal(message, retryAction) {
    const overlay = document.getElementById('sync-failure-modal');
    const messageEl = document.getElementById('sync-failure-message');
    const retryBtn = document.getElementById('sync-failure-retry');
    if (!overlay || !messageEl || !retryBtn) return;

    syncRetryAction = typeof retryAction === 'function' ? retryAction : null;
    messageEl.textContent = message || 'Unknown sync error';
    retryBtn.disabled = !syncRetryAction;
    overlay.classList.add('show');
  }

  function hideSyncFailureModal() {
    const overlay = document.getElementById('sync-failure-modal');
    if (overlay) overlay.classList.remove('show');
    syncRetryAction = null;
  }

  async function runSyncModalRetry() {
    const retry = syncRetryAction;
    hideSyncFailureModal();
    if (!retry) return;
    try {
      await retry();
    } catch (e) {
      showSyncFailureModal(e && e.message ? e.message : String(e), retry);
    }
  }

  // Theme functionality to match essential-buttons-toolbar
  function overrideTheme(theme) {
    document.documentElement.classList.toggle('dark-theme', theme === 'dark');
    document.documentElement.classList.toggle('light-theme', theme === 'light');
  }

  // Use auto theme to match essential-buttons-toolbar default behavior
  overrideTheme('auto');

  // Update preview after saving toolbar settings (simple, non-live version)
  function updatePreviewAfterSave() {
    const preview = document.getElementById('left-toolbar-preview');
    if (!preview) return;

    // Always keep preview hidden since we have the real toolbar injected directly
    preview.style.display = 'none';
  }

  // Icon theme switching functionality (like Essential)
  function showSVG(svgs, theme, additionalClass) {
    svgs.forEach((svg) => {
      if (
        svg.classList.contains(theme) &&
        (!additionalClass || svg.classList.contains(additionalClass))
      ) {
        svg.style.display = 'block';
      } else {
        svg.style.display = 'none';
      }
    });
  }

  function applyIconThemeToPreview() {
    try {
      const iconTheme = document.getElementById('icon-theme').value || 'heroIcons';
      const allSVGs = document.querySelectorAll('#left-toolbar-preview svg');
      showSVG(allSVGs, iconTheme);
    } catch (e) {
      console.error('[AFFO Options] Error applying icon theme to preview:', e);
    }
  }

  // Add click behaviors for preview buttons (like Essential)
  function addPreviewClickBehaviors() {
    const previewButtons = document.querySelectorAll('.preview-button');

    previewButtons.forEach((button, index) => {
      // Close Tab button is the 3rd button (index 2)
      if (index === 2) {
        button.style.cursor = 'pointer';
        button.title = 'Close options page';
        button.addEventListener('click', function() {
          // Essential-style behavior: show button info instead of closing
          alert('Close Tab Button\n\nThis button closes the current tab when used in the actual toolbar.\n\n(Preview only - not functional)');
        });
      } else {
        // Make other buttons show they're not clickable
        button.style.cursor = 'default';
        button.title = 'Preview only - not functional';
      }
    });
  }

  const DEFAULT_SERIF = ['PT Serif', 'mencken-std'];
  const DEFAULT_SANS = ['Apercu Pro'];
  const DEFAULT_PRESERVED = ['Font Awesome 5 Free', 'Font Awesome 5 Brands', 'Font Awesome 6 Free', 'Font Awesome 6 Brands', 'FontAwesome', 'Material Icons', 'Material Icons Outlined', 'Material Icons Round', 'Material Icons Sharp', 'Material Symbols Outlined', 'Material Symbols Rounded', 'Material Symbols Sharp', 'bootstrap-icons', 'remixicon', 'icomoon'];
  const DEFAULT_FFONLY = ['x.com'];
  const DEFAULT_INLINE = ['x.com'];
  const DEFAULT_AGGRESSIVE = [];

  // Tab functionality
  function initTabs() {
    const tabs = [
      { tab: document.getElementById('toolbarTab'), section: document.getElementById('toolbarSettings') },
      { tab: document.getElementById('customTab'), section: document.getElementById('customSettings') },
      { tab: document.getElementById('advancedTab'), section: document.getElementById('advancedSettings') },
    ];

    // Set initial active state - General tab is active by default
    tabs[0].tab.classList.add('active');

    const faceoffCircle = document.querySelector('#settingsTabs .faceoff-circle');

    tabs.forEach(({ tab, section }) => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.section.style.display = 'none';
          t.tab.classList.remove('active');
          t.tab.style.borderColor = 'var(--box-background)';
        });
        section.style.display = 'block';
        tab.classList.add('active');
        tab.style.borderColor = 'var(--primary-color)';

        // Darken faceoff circle when custom tab (center) is active
        if (faceoffCircle) {
          faceoffCircle.style.background = tab.id === 'customTab'
            ? 'rgba(0, 51, 160, 0.2)' : '#ffffff';
        }

        // Load custom CSS when switching to that tab
        if (tab.id === 'customTab') loadCustomCss();
      });
    });
  }

  // Custom CSS editor
  let customCssLoaded = false;

  async function loadCustomCss() {
    if (customCssLoaded) return;
    const editor = document.getElementById('custom-css-editor');
    const stored = await browser.storage.local.get('affoCustomFontsCss');
    let cssText = stored.affoCustomFontsCss;
    if (!cssText) {
      try {
        const response = await fetch(browser.runtime.getURL('custom-fonts-starter.css'));
        cssText = await response.text();
      } catch (_e) {
        cssText = '';
      }
    }
    editor.value = cssText;
    customCssLoaded = true;
  }

  async function saveCustomCss() {
    const editor = document.getElementById('custom-css-editor');
    const status = document.getElementById('css-status');
    const cssText = editor.value;
    await browser.storage.local.set({ affoCustomFontsCss: cssText });
    status.textContent = 'Saved!';
    setTimeout(() => { status.textContent = ''; }, 2000);
  }

  async function resetCustomCss() {
    if (!confirm('Reset custom CSS to the default starter content?')) return;
    const editor = document.getElementById('custom-css-editor');
    const status = document.getElementById('css-status');
    try {
      const response = await fetch(browser.runtime.getURL('custom-fonts-starter.css'));
      const cssText = await response.text();
      editor.value = cssText;
      await browser.storage.local.set({ affoCustomFontsCss: cssText });
      status.textContent = 'Reset to default!';
      setTimeout(() => { status.textContent = ''; }, 2000);
    } catch (e) {
      status.textContent = 'Failed to load default CSS.';
    }
  }

  function normalize(lines){
    return (lines || [])
      .map(s => String(s || '').trim())
      .filter(s => s.length > 0);
  }

  function toTextarea(list){
    return (list || []).join('\n');
  }

  function fromTextarea(text){
    return normalize(String(text || '').split(/\r?\n/));
  }

  // ─── Cloud Sync UI ───────────────────────────────────────────────────

  function updateGDriveFolderPreview() {
    const suffix = (document.getElementById('gdrive-folder-suffix').value || '').trim();
    const preview = document.getElementById('gdrive-folder-preview');
    if (preview) {
      preview.textContent = suffix
        ? `Folder: A Font Face-off ${suffix}`
        : 'Folder: A Font Face-off';
    }
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function showSyncSection(sectionId) {
    const sections = ['gdrive-config', 'webdav-config', 'sync-connected'];
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el) el.style.display = id === sectionId ? 'block' : 'none';
    }
  }

  async function updateSyncConnectionState() {
    const data = await browser.storage.local.get(['affoSyncBackend', 'affoGDriveTokens', 'affoWebDavConfig', 'affoSyncMeta']);
    const activeBackend = data.affoSyncBackend;
    const selectorEl = document.getElementById('sync-backend-selector');
    const selectEl = document.getElementById('sync-backend-select');
    const connectedLabelEl = document.getElementById('sync-connected-label');
    const lastSyncedEl = document.getElementById('sync-last-synced');

    let connected = false;
    if (activeBackend === 'gdrive') {
      const tokens = data.affoGDriveTokens;
      connected = !!(tokens && tokens.accessToken && tokens.refreshToken);
    } else if (activeBackend === 'webdav') {
      const config = data.affoWebDavConfig;
      connected = !!(config && config.serverUrl);
    }

    if (connected) {
      if (selectorEl) selectorEl.style.display = 'none';
      const backendLabel = activeBackend === 'gdrive' ? 'Google Drive' : 'WebDAV';
      if (connectedLabelEl) connectedLabelEl.textContent = `Connected (${backendLabel})`;
      showSyncSection('sync-connected');
      if (lastSyncedEl) {
        const meta = data.affoSyncMeta || {};
        lastSyncedEl.textContent = meta.lastSync
          ? `Last synced: ${formatTimeAgo(meta.lastSync)}`
          : 'Not yet synced';
      }
    } else {
      if (selectorEl) selectorEl.style.display = 'block';
      showSyncSection(null);
      // Show the config for whatever's selected in the dropdown
      if (selectEl) updateBackendSelector(selectEl.value);
    }
  }

  function updateBackendSelector(value) {
    const gdriveConfig = document.getElementById('gdrive-config');
    const webdavConfig = document.getElementById('webdav-config');
    if (gdriveConfig) gdriveConfig.style.display = value === 'gdrive' ? 'block' : 'none';
    if (webdavConfig) webdavConfig.style.display = value === 'webdav' ? 'block' : 'none';
    const connectedEl = document.getElementById('sync-connected');
    if (connectedEl) connectedEl.style.display = 'none';
  }

  async function connectGDrive() {
    const statusEl = document.getElementById('status-gdrive-connect');
    try {
      statusEl.textContent = 'Connecting...';
      const res = await browser.runtime.sendMessage({ type: 'affoGDriveAuth' });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Connection failed');
      statusEl.textContent = 'Connected';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
      await updateSyncConnectionState();
    } catch (e) {
      statusEl.textContent = 'Error: ' + (e.message || e);
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    }
  }

  async function connectWebDav() {
    const statusEl = document.getElementById('status-webdav-connect');
    try {
      const config = {
        serverUrl: (document.getElementById('webdav-server-url').value || '').trim(),
        username: (document.getElementById('webdav-username').value || '').trim(),
        password: document.getElementById('webdav-password').value || '',
        anonymous: document.getElementById('webdav-anonymous').checked
      };
      if (!config.serverUrl) throw new Error('Server URL is required');
      if (!config.anonymous && (!config.username || !config.password)) {
        throw new Error('Username and password required (or check Anonymous)');
      }
      statusEl.textContent = 'Connecting...';
      const res = await browser.runtime.sendMessage({ type: 'affoWebDavConnect', config });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Connection failed');
      statusEl.textContent = 'Connected';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
      await updateSyncConnectionState();
    } catch (e) {
      statusEl.textContent = 'Error: ' + (e.message || e);
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    }
  }

  async function testWebDav() {
    const statusEl = document.getElementById('status-webdav-connect');
    try {
      const config = {
        serverUrl: (document.getElementById('webdav-server-url').value || '').trim(),
        username: (document.getElementById('webdav-username').value || '').trim(),
        password: document.getElementById('webdav-password').value || '',
        anonymous: document.getElementById('webdav-anonymous').checked
      };
      if (!config.serverUrl) throw new Error('Server URL is required');
      statusEl.textContent = 'Testing...';
      const res = await browser.runtime.sendMessage({ type: 'affoWebDavTest', config });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Connection test failed');
      statusEl.textContent = 'Connection OK';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (e) {
      statusEl.textContent = 'Error: ' + (e.message || e);
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    }
  }

  async function disconnectSync() {
    const statusEl = document.getElementById('status-sync');
    try {
      statusEl.textContent = 'Disconnecting...';
      const data = await browser.storage.local.get('affoSyncBackend');
      const backend = data.affoSyncBackend;
      const msgType = backend === 'webdav' ? 'affoWebDavDisconnect' : 'affoGDriveDisconnect';
      const res = await browser.runtime.sendMessage({ type: msgType });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Disconnect failed');
      statusEl.textContent = 'Disconnected';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
      await updateSyncConnectionState();
    } catch (e) {
      statusEl.textContent = 'Error: ' + (e.message || e);
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    }
  }

  async function clearLocalSync() {
    const statusEl = document.getElementById('status-sync');
    try {
      statusEl.textContent = 'Clearing...';
      const res = await browser.runtime.sendMessage({ type: 'affoClearLocalSync' });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Clear failed');
      statusEl.textContent = 'Local sync data cleared';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
      await updateSyncConnectionState();
    } catch (e) {
      statusEl.textContent = 'Error: ' + (e.message || e);
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    }
  }

  async function syncNow() {
    const statusEl = document.getElementById('status-sync');
    try {
      statusEl.textContent = 'Syncing...';
      const res = await browser.runtime.sendMessage({ type: 'affoSyncNow' });
      if (!res) throw new Error('No response from background');
      if (res.skipped) {
        statusEl.textContent = res.reason === 'offline'
          ? 'You appear to be offline'
          : 'Sync not connected';
      } else if (!res.ok) {
        throw new Error(res.error || 'Sync failed');
      } else {
        statusEl.textContent = 'Synced';
      }
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
      await updateSyncConnectionState();
    } catch (e) {
      statusEl.textContent = 'Error: ' + (e.message || e);
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
      showSyncFailureModal(e.message || String(e), syncNow);
    }
  }

  async function saveGDriveFolderSuffix() {
    const suffix = (document.getElementById('gdrive-folder-suffix').value || '').trim();
    await browser.storage.local.set({ affoGDriveFolderSuffix: suffix });
  }

  // ─── Other settings (unchanged) ──────────────────────────────────────

  async function load(){
    try {
      const data = await browser.storage.local.get([
        'affoKnownSerif',
        'affoKnownSans',
        'affoPreservedFonts',
        'affoFontFaceOnlyDomains',
        'affoInlineApplyDomains',
        'affoAggressiveDomains',
        'affoToolbarEnabled',
        'affoToolbarWidth',
        'affoToolbarHeight',
        'affoToolbarPosition',
        'affoToolbarTransparency',
        'affoToolbarGap',
        'affoPageUpScrollOverlap',
        'affoPageUpLongpressOverlap',
        'affoIconTheme',
        'affoGDriveFolderSuffix'
      ]);
      const serif = Array.isArray(data.affoKnownSerif) ? data.affoKnownSerif : DEFAULT_SERIF.slice();
      const sans = Array.isArray(data.affoKnownSans) ? data.affoKnownSans : DEFAULT_SANS.slice();
      document.getElementById('known-serif').value = toTextarea(serif);
      document.getElementById('known-sans').value = toTextarea(sans);
      const preserved = Array.isArray(data.affoPreservedFonts) ? data.affoPreservedFonts : DEFAULT_PRESERVED.slice();
      document.getElementById('preserved-fonts').value = toTextarea(preserved);
      const ffonly = Array.isArray(data.affoFontFaceOnlyDomains) ? data.affoFontFaceOnlyDomains : DEFAULT_FFONLY.slice();
      document.getElementById('ff-only-domains').value = toTextarea(ffonly);
      const inline = Array.isArray(data.affoInlineApplyDomains) ? data.affoInlineApplyDomains : DEFAULT_INLINE.slice();
      document.getElementById('inline-domains').value = toTextarea(inline);
      const aggressive = Array.isArray(data.affoAggressiveDomains) ? data.affoAggressiveDomains : DEFAULT_AGGRESSIVE.slice();
      document.getElementById('aggressive-domains').value = toTextarea(aggressive);

      // Load toolbar settings with new defaults
      document.getElementById('toolbar-enabled').value = data.affoToolbarEnabled !== false ? 'true' : 'false'; // Default to true
      const width = data.affoToolbarWidth || 48;
      const height = data.affoToolbarHeight || 20;
      const position = data.affoToolbarPosition !== undefined ? data.affoToolbarPosition : 50;
      const transparency = data.affoToolbarTransparency !== undefined ? data.affoToolbarTransparency : 0.2;
      const gap = data.affoToolbarGap || 0;
      const pageUpScrollOverlap = data.affoPageUpScrollOverlap !== undefined ? data.affoPageUpScrollOverlap : 80;
      const pageUpLongpressOverlap = data.affoPageUpLongpressOverlap !== undefined ? data.affoPageUpLongpressOverlap : 60;
      const pageUpScrollType = data.affoPageUpScrollType || 'smooth';
      const iconTheme = data.affoIconTheme || 'heroIcons';

      document.getElementById('toolbar-width').value = width;
      document.getElementById('toolbar-height').value = height;
      document.getElementById('toolbar-position').value = position;
      document.getElementById('toolbar-transparency').value = transparency;
      document.getElementById('toolbar-gap').value = gap;
      document.getElementById('pageup-scroll-overlap').value = pageUpScrollOverlap;
      document.getElementById('pageup-longpress-overlap').value = pageUpLongpressOverlap;
      document.getElementById('pageup-scroll-type').value = pageUpScrollType;
      document.getElementById('icon-theme').value = iconTheme;

      document.getElementById('toolbar-width-value').textContent = width + 'px';
      document.getElementById('toolbar-height-value').textContent = height + '%';
      document.getElementById('toolbar-position-value').textContent = position + '%';
      document.getElementById('toolbar-transparency-value').textContent = transparency;
      document.getElementById('toolbar-gap-value').textContent = gap + 'px';
      document.getElementById('pageup-scroll-overlap-value').textContent = pageUpScrollOverlap + 'px';
      document.getElementById('pageup-longpress-overlap-value').textContent = pageUpLongpressOverlap + 'px';

      // Update preview after loading settings
      updatePreviewAfterSave();

      // Apply icon theme and add click behaviors
      applyIconThemeToPreview();
      addPreviewClickBehaviors();

      // Load sync settings
      document.getElementById('gdrive-folder-suffix').value = data.affoGDriveFolderSuffix || '';
      updateGDriveFolderPreview();
      await updateSyncConnectionState();
    } catch (e) {}
  }

  async function saveSerif(){
    try {
      const raw = document.getElementById('known-serif').value;
      const list = fromTextarea(raw);
      await browser.storage.local.set({ affoKnownSerif: list });
      const s = document.getElementById('status-serif'); s.textContent = 'Saved'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function saveSans(){
    try {
      const raw = document.getElementById('known-sans').value;
      const list = fromTextarea(raw);
      await browser.storage.local.set({ affoKnownSans: list });
      const s = document.getElementById('status-sans'); s.textContent = 'Saved'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function resetSerif(){
    try {
      await browser.storage.local.set({ affoKnownSerif: DEFAULT_SERIF.slice() });
      document.getElementById('known-serif').value = toTextarea(DEFAULT_SERIF);
      const s = document.getElementById('status-serif'); s.textContent = 'Reset'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function resetSans(){
    try {
      await browser.storage.local.set({ affoKnownSans: DEFAULT_SANS.slice() });
      document.getElementById('known-sans').value = toTextarea(DEFAULT_SANS);
      const s = document.getElementById('status-sans'); s.textContent = 'Reset'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function savePreserved(){
    try {
      const raw = document.getElementById('preserved-fonts').value;
      const list = fromTextarea(raw);
      await browser.storage.local.set({ affoPreservedFonts: list });
      const s = document.getElementById('status-preserved'); s.textContent = 'Saved'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function resetPreserved(){
    try {
      await browser.storage.local.set({ affoPreservedFonts: DEFAULT_PRESERVED.slice() });
      document.getElementById('preserved-fonts').value = toTextarea(DEFAULT_PRESERVED);
      const s = document.getElementById('status-preserved'); s.textContent = 'Reset'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function saveFFOnly(){
    try {
      const raw = document.getElementById('ff-only-domains').value;
      const list = fromTextarea(raw);
      await browser.storage.local.set({ affoFontFaceOnlyDomains: list });
      const s = document.getElementById('status-ffonly'); s.textContent = 'Saved'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function resetFFOnly(){
    try {
      await browser.storage.local.set({ affoFontFaceOnlyDomains: DEFAULT_FFONLY.slice() });
      document.getElementById('ff-only-domains').value = toTextarea(DEFAULT_FFONLY);
      const s = document.getElementById('status-ffonly'); s.textContent = 'Reset'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function saveInline(){
    try {
      const raw = document.getElementById('inline-domains').value;
      const list = fromTextarea(raw);
      await browser.storage.local.set({ affoInlineApplyDomains: list });
      const s = document.getElementById('status-inline'); s.textContent = 'Saved'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function resetInline(){
    try {
      await browser.storage.local.set({ affoInlineApplyDomains: DEFAULT_INLINE.slice() });
      document.getElementById('inline-domains').value = toTextarea(DEFAULT_INLINE);
      const s = document.getElementById('status-inline'); s.textContent = 'Reset'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function saveAggressive(){
    try {
      const raw = document.getElementById('aggressive-domains').value;
      const list = fromTextarea(raw);
      await browser.storage.local.set({ affoAggressiveDomains: list });
      const s = document.getElementById('status-aggressive'); s.textContent = 'Saved'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function resetAggressive(){
    try {
      await browser.storage.local.set({ affoAggressiveDomains: DEFAULT_AGGRESSIVE.slice() });
      document.getElementById('aggressive-domains').value = toTextarea(DEFAULT_AGGRESSIVE);
      const s = document.getElementById('status-aggressive'); s.textContent = 'Reset'; setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {}
  }

  async function clearFontCache(){
    try {
      const statusEl = document.getElementById('status-cache');
      statusEl.textContent = 'Clearing cache...';

      await browser.storage.local.remove('affoFontCache');

      statusEl.textContent = 'Font cache cleared';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);

    } catch (e) {
      const statusEl = document.getElementById('status-cache');
      statusEl.textContent = 'Error: ' + e.message;
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  }

  async function viewCacheInfo(){
    try {
      const statusEl = document.getElementById('status-cache');
      const data = await browser.storage.local.get('affoFontCache');
      const fontCache = data.affoFontCache || {};
      const entries = Object.entries(fontCache);

      if (entries.length === 0) {
        statusEl.textContent = 'Cache is empty';
        setTimeout(() => { statusEl.textContent = ''; }, 2000);
        return;
      }

      const totalSize = entries.reduce((sum, [_url, entry]) => sum + (entry.size || 0), 0);
      const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
      const oldestEntry = Math.min(...entries.map(([_url, entry]) => entry.timestamp));
      Math.max(...entries.map(([_url, entry]) => entry.timestamp));
      const ageHours = ((Date.now() - oldestEntry) / (1000 * 60 * 60)).toFixed(1);

      const info = `Cache: ${entries.length} fonts, ${totalSizeMB}MB, oldest: ${ageHours}h ago`;
      statusEl.textContent = info;
      setTimeout(() => { statusEl.textContent = ''; }, 5000);

    } catch (e) {
      const statusEl = document.getElementById('status-cache');
      statusEl.textContent = 'Error: ' + e.message;
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  }

  async function refreshGfMetadata(){
    const statusEl = document.getElementById('status-gf-metadata');
    try {
      statusEl.textContent = 'Refreshing...';
      const res = await fetch('https://fonts.google.com/metadata/fonts', { credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const json = text.replace(/^\)\]\}'\n?/, '');
      let metadata;
      try {
        metadata = JSON.parse(json);
      } catch (e) {
        throw new Error('Failed to parse metadata: ' + e.message);
      }
      await browser.storage.local.set({
        gfMetadataCache: metadata,
        gfMetadataTimestamp: Date.now()
      });
      statusEl.textContent = 'Refreshed';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    } catch (e) {
      statusEl.textContent = 'Error: ' + (e.message || e);
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  }

  async function saveToolbar(){
    try {
      const enabled = document.getElementById('toolbar-enabled').value === 'true';
      const width = parseInt(document.getElementById('toolbar-width').value);
      const height = parseInt(document.getElementById('toolbar-height').value);
      const position = parseInt(document.getElementById('toolbar-position').value);
      const transparency = parseFloat(document.getElementById('toolbar-transparency').value);
      const gap = parseInt(document.getElementById('toolbar-gap').value);
      const pageUpScrollOverlap = parseInt(document.getElementById('pageup-scroll-overlap').value);
      const pageUpLongpressOverlap = parseInt(document.getElementById('pageup-longpress-overlap').value);
      const pageUpScrollType = document.getElementById('pageup-scroll-type').value;
      const iconTheme = document.getElementById('icon-theme').value;

      await browser.storage.local.set({
        affoToolbarEnabled: enabled,
        affoToolbarWidth: width,
        affoToolbarHeight: height,
        affoToolbarPosition: position,
        affoToolbarTransparency: transparency,
        affoToolbarGap: gap,
        affoPageUpScrollOverlap: pageUpScrollOverlap,
        affoPageUpLongpressOverlap: pageUpLongpressOverlap,
        affoPageUpScrollType: pageUpScrollType,
        affoIconTheme: iconTheme
      });

      const s = document.getElementById('status-toolbar');
      s.textContent = 'Saved';
      setTimeout(() => { s.textContent = ''; }, 1500);
    } catch (e) {
      const s = document.getElementById('status-toolbar');
      s.textContent = 'Error: ' + e.message;
      setTimeout(() => { s.textContent = ''; }, 3000);
    }
  }

  function updateToolbarValues() {
    const width = document.getElementById('toolbar-width').value;
    const height = document.getElementById('toolbar-height').value;
    const position = document.getElementById('toolbar-position').value;
    const transparency = document.getElementById('toolbar-transparency').value;
    const gap = document.getElementById('toolbar-gap').value;
    const pageUpScrollOverlap = document.getElementById('pageup-scroll-overlap').value;
    const pageUpLongpressOverlap = document.getElementById('pageup-longpress-overlap').value;

    document.getElementById('toolbar-width-value').textContent = width + 'px';
    document.getElementById('toolbar-height-value').textContent = height + '%';
    document.getElementById('toolbar-position-value').textContent = position + '%';
    document.getElementById('toolbar-transparency-value').textContent = transparency;
    document.getElementById('toolbar-gap-value').textContent = gap + 'px';
    document.getElementById('pageup-scroll-overlap-value').textContent = pageUpScrollOverlap + 'px';
    document.getElementById('pageup-longpress-overlap-value').textContent = pageUpLongpressOverlap + 'px';

    // Don't update preview in real-time - only on save
  }

  async function resetAllSettings(){
    try {
      // Show confirmation dialog
      const confirmed = confirm(
        'Are you sure you want to reset all local settings?\n\n' +
        'This will clear:\n' +
        '• All applied fonts from websites\n' +
        '• All saved font configurations\n' +
        '• Known serif/sans family lists\n' +
        '• FontFace-only domains list\n' +
        '• Toolbar settings\n' +
        '• Google Drive connection\n' +
        '• Extension state and preferences\n\n' +
        'This action cannot be undone.'
      );

      if (!confirmed) return;

      const statusEl = document.getElementById('status-reset-all');
      statusEl.textContent = 'Clearing...';

      // Clear all extension storage
      await browser.storage.local.clear();

      // Reset all form values to defaults
      document.getElementById('known-serif').value = toTextarea(DEFAULT_SERIF);
      document.getElementById('known-sans').value = toTextarea(DEFAULT_SANS);
      document.getElementById('preserved-fonts').value = toTextarea(DEFAULT_PRESERVED);
      document.getElementById('ff-only-domains').value = toTextarea(DEFAULT_FFONLY);
      document.getElementById('inline-domains').value = toTextarea(DEFAULT_INLINE);
      document.getElementById('aggressive-domains').value = toTextarea(DEFAULT_AGGRESSIVE);

      // Reset toolbar settings to defaults
      document.getElementById('toolbar-enabled').value = 'true';
      document.getElementById('toolbar-width').value = 48;
      document.getElementById('toolbar-height').value = 20;
      document.getElementById('toolbar-position').value = 50;
      document.getElementById('toolbar-transparency').value = 0.2;
      document.getElementById('toolbar-gap').value = 0;
      document.getElementById('pageup-scroll-overlap').value = 80;
      document.getElementById('pageup-longpress-overlap').value = 60;
      document.getElementById('pageup-scroll-type').value = 'smooth';
      document.getElementById('icon-theme').value = 'heroIcons';
      updateToolbarValues();

      // Reset sync UI
      document.getElementById('gdrive-folder-suffix').value = '';
      updateGDriveFolderPreview();
      await updateSyncConnectionState();

      statusEl.textContent = 'All settings reset successfully';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);

    } catch (e) {
      const statusEl = document.getElementById('status-reset-all');
      statusEl.textContent = 'Error: ' + e.message;
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    initTabs();
    load();
    document.getElementById('save-css').addEventListener('click', saveCustomCss);
    document.getElementById('reset-css').addEventListener('click', resetCustomCss);
    document.getElementById('save-serif').addEventListener('click', saveSerif);
    document.getElementById('save-sans').addEventListener('click', saveSans);
    document.getElementById('reset-serif').addEventListener('click', resetSerif);
    document.getElementById('reset-sans').addEventListener('click', resetSans);
    document.getElementById('save-preserved').addEventListener('click', savePreserved);
    document.getElementById('reset-preserved').addEventListener('click', resetPreserved);
    document.getElementById('save-ffonly').addEventListener('click', saveFFOnly);
    document.getElementById('reset-ffonly').addEventListener('click', resetFFOnly);
    document.getElementById('save-inline').addEventListener('click', saveInline);
    document.getElementById('reset-inline').addEventListener('click', resetInline);
    document.getElementById('save-aggressive').addEventListener('click', saveAggressive);
    document.getElementById('reset-aggressive').addEventListener('click', resetAggressive);
    document.getElementById('save-toolbar').addEventListener('click', function() {
      saveToolbar();
      updatePreviewAfterSave();
      applyIconThemeToPreview();
    });
    document.getElementById('toolbar-width').addEventListener('input', updateToolbarValues);
    document.getElementById('toolbar-height').addEventListener('input', updateToolbarValues);
    document.getElementById('toolbar-position').addEventListener('input', updateToolbarValues);
    document.getElementById('toolbar-transparency').addEventListener('input', updateToolbarValues);
    document.getElementById('toolbar-gap').addEventListener('input', updateToolbarValues);
    document.getElementById('pageup-scroll-overlap').addEventListener('input', updateToolbarValues);
    document.getElementById('pageup-longpress-overlap').addEventListener('input', updateToolbarValues);
    document.getElementById('clear-font-cache').addEventListener('click', clearFontCache);
    document.getElementById('view-cache-info').addEventListener('click', viewCacheInfo);
    document.getElementById('refresh-gf-metadata').addEventListener('click', refreshGfMetadata);
    document.getElementById('reset-all-settings').addEventListener('click', resetAllSettings);

    // Cloud sync handlers
    document.getElementById('sync-backend-select').addEventListener('change', function() {
      updateBackendSelector(this.value);
    });
    document.getElementById('gdrive-connect').addEventListener('click', connectGDrive);
    document.getElementById('webdav-connect').addEventListener('click', connectWebDav);
    document.getElementById('webdav-test').addEventListener('click', testWebDav);
    document.getElementById('webdav-anonymous').addEventListener('change', function() {
      const disabled = this.checked;
      document.getElementById('webdav-username').disabled = disabled;
      document.getElementById('webdav-password').disabled = disabled;
    });
    document.getElementById('sync-disconnect').addEventListener('click', disconnectSync);
    document.getElementById('sync-clear').addEventListener('click', clearLocalSync);
    document.getElementById('sync-now').addEventListener('click', syncNow);
    document.getElementById('gdrive-folder-suffix').addEventListener('input', function() {
      updateGDriveFolderPreview();
      saveGDriveFolderSuffix();
    });
    document.getElementById('sync-failure-ignore').addEventListener('click', hideSyncFailureModal);
    document.getElementById('sync-failure-retry').addEventListener('click', runSyncModalRetry);

    browser.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'affoSyncFailed') return;

      const statusEl = document.getElementById('status-sync');
      if (statusEl) {
        statusEl.textContent = 'Auto sync failed';
        setTimeout(() => { statusEl.textContent = ''; }, 4000);
      }

      showSyncFailureModal(msg.error || 'Auto sync failed', async () => {
        const retryRes = await browser.runtime.sendMessage({ type: 'affoSyncRetry' });
        if (!retryRes || !retryRes.ok) {
          throw new Error(retryRes && retryRes.error ? retryRes.error : 'Retry failed');
        }
        const okStatusEl = document.getElementById('status-sync');
        if (okStatusEl) {
          okStatusEl.textContent = 'Sync retry succeeded';
          setTimeout(() => { okStatusEl.textContent = ''; }, 2500);
        }
        await updateSyncConnectionState();
      });
    });

    // Icon theme will only apply on save, not on change
  });
})();
