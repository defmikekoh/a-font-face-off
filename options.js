/* Options page logic: manage known serif/sans lists */
(function(){
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
    
    const enabled = document.getElementById('toolbar-enabled').value === 'true';
    const width = parseInt(document.getElementById('toolbar-width').value);
    const height = parseInt(document.getElementById('toolbar-height').value);
    const position = parseInt(document.getElementById('toolbar-position').value);
    const transparency = parseFloat(document.getElementById('toolbar-transparency').value);
    const gap = parseInt(document.getElementById('toolbar-gap').value);
    
    if (enabled) {
      preview.style.display = 'flex';
      preview.style.width = width + 'px';
      preview.style.height = height + 'vh';
      preview.style.opacity = transparency;
      preview.style.left = gap + 'px';
      
      if (height < 100) {
        preview.style.top = position + '%';
        preview.style.transform = 'translateY(-50%)';
      } else {
        preview.style.top = '0';
        preview.style.transform = 'none';
      }
    } else {
      preview.style.display = 'none';
    }
  }

  const DEFAULT_SERIF = ['PT Serif'];
  const DEFAULT_SANS = [];
  const DEFAULT_FFONLY = ['x.com'];
  const DEFAULT_INLINE = ['x.com'];
  
  // Tab functionality
  function initTabs() {
    const generalTab = document.getElementById('generalTab');
    const excludeTab = document.getElementById('excludeTab');
    const generalSettings = document.getElementById('generalSettings');
    const excludeSettings = document.getElementById('excludeSettings');
    
    // Set initial active state - General tab is active by default
    generalTab.classList.add('active');
    
    generalTab.addEventListener('click', () => {
      // Show general, hide exclude
      generalSettings.style.display = 'block';
      excludeSettings.style.display = 'none';
      
      // Update tab appearance - hockey theme uses active class
      generalTab.classList.add('active');
      excludeTab.classList.remove('active');
      generalTab.style.borderColor = 'var(--primary-color)';
      excludeTab.style.borderColor = 'var(--box-background)';
    });
    
    excludeTab.addEventListener('click', () => {
      // Show exclude, hide general  
      generalSettings.style.display = 'none';
      excludeSettings.style.display = 'block';
      
      // Update tab appearance - hockey theme uses active class
      excludeTab.classList.add('active');
      generalTab.classList.remove('active');
      generalTab.style.borderColor = 'var(--box-background)';
      excludeTab.style.borderColor = 'var(--primary-color)';
    });
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

  async function load(){
    try {
      const data = await browser.storage.local.get([
        'affoKnownSerif', 
        'affoKnownSans', 
        'affoFontFaceOnlyDomains', 
        'affoInlineApplyDomains',
        'affoToolbarEnabled',
        'affoToolbarWidth',
        'affoToolbarHeight',
        'affoToolbarPosition',
        'affoToolbarTransparency',
        'affoToolbarGap',
        'affoPageUpScrollOverlap',
        'affoPageUpLongpressOverlap',
        'affoIconTheme'
      ]);
      const serif = Array.isArray(data.affoKnownSerif) ? data.affoKnownSerif : DEFAULT_SERIF.slice();
      const sans = Array.isArray(data.affoKnownSans) ? data.affoKnownSans : DEFAULT_SANS.slice();
      document.getElementById('known-serif').value = toTextarea(serif);
      document.getElementById('known-sans').value = toTextarea(sans);
      const ffonly = Array.isArray(data.affoFontFaceOnlyDomains) ? data.affoFontFaceOnlyDomains : DEFAULT_FFONLY.slice();
      document.getElementById('ff-only-domains').value = toTextarea(ffonly);
      const inline = Array.isArray(data.affoInlineApplyDomains) ? data.affoInlineApplyDomains : DEFAULT_INLINE.slice();
      document.getElementById('inline-domains').value = toTextarea(inline);
      
      // Load toolbar settings with new defaults
      document.getElementById('toolbar-enabled').value = data.affoToolbarEnabled !== false ? 'true' : 'false'; // Default to true
      const width = data.affoToolbarWidth || 48;
      const height = data.affoToolbarHeight || 20;
      const position = data.affoToolbarPosition !== undefined ? data.affoToolbarPosition : 50;
      const transparency = data.affoToolbarTransparency !== undefined ? data.affoToolbarTransparency : 0.2;
      const gap = data.affoToolbarGap || 0;
      const pageUpScrollOverlap = data.affoPageUpScrollOverlap !== undefined ? data.affoPageUpScrollOverlap : 80;
      const pageUpLongpressOverlap = data.affoPageUpLongpressOverlap !== undefined ? data.affoPageUpLongpressOverlap : 60;
      const iconTheme = data.affoIconTheme || 'heroIcons';
      
      document.getElementById('toolbar-width').value = width;
      document.getElementById('toolbar-height').value = height;
      document.getElementById('toolbar-position').value = position;
      document.getElementById('toolbar-transparency').value = transparency;
      document.getElementById('toolbar-gap').value = gap;
      document.getElementById('pageup-scroll-overlap').value = pageUpScrollOverlap;
      document.getElementById('pageup-longpress-overlap').value = pageUpLongpressOverlap;
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
      
      const totalSize = entries.reduce((sum, [url, entry]) => sum + (entry.size || 0), 0);
      const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
      const oldestEntry = Math.min(...entries.map(([url, entry]) => entry.timestamp));
      const newestEntry = Math.max(...entries.map(([url, entry]) => entry.timestamp));
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
      document.getElementById('ff-only-domains').value = toTextarea(DEFAULT_FFONLY);
      document.getElementById('inline-domains').value = toTextarea(DEFAULT_INLINE);
      
      // Reset toolbar settings to defaults
      document.getElementById('toolbar-enabled').value = 'true';
      document.getElementById('toolbar-width').value = 48;
      document.getElementById('toolbar-height').value = 20;
      document.getElementById('toolbar-position').value = 50;
      document.getElementById('toolbar-transparency').value = 0.2;
      document.getElementById('toolbar-gap').value = 0;
      document.getElementById('pageup-scroll-overlap').value = 80;
      document.getElementById('pageup-longpress-overlap').value = 60;
      document.getElementById('icon-theme').value = 'heroIcons';
      updateToolbarValues();
      
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
    document.getElementById('save-serif').addEventListener('click', saveSerif);
    document.getElementById('save-sans').addEventListener('click', saveSans);
    document.getElementById('reset-serif').addEventListener('click', resetSerif);
    document.getElementById('reset-sans').addEventListener('click', resetSans);
    document.getElementById('save-ffonly').addEventListener('click', saveFFOnly);
    document.getElementById('reset-ffonly').addEventListener('click', resetFFOnly);
    document.getElementById('save-inline').addEventListener('click', saveInline);
    document.getElementById('reset-inline').addEventListener('click', resetInline);
    document.getElementById('save-toolbar').addEventListener('click', function() {
      saveToolbar();
      updatePreviewAfterSave();
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
    document.getElementById('reset-all-settings').addEventListener('click', resetAllSettings);
  });
})();
