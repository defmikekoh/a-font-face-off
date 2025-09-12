/* Options page logic: manage known serif/sans lists */
(function(){
  const DEFAULT_SERIF = ['PT Serif'];
  const DEFAULT_SANS = [];
  const DEFAULT_FFONLY = ['x.com'];
  const DEFAULT_INLINE = ['x.com'];
  
  // Tab functionality
  function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;
        
        // Remove active class from all buttons and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        document.getElementById(targetTab + '-tab').classList.add('active');
      });
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
        'affoToolbarTransparency',
        'affoToolbarGap'
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
      document.getElementById('toolbar-enabled').checked = data.affoToolbarEnabled !== false; // Default to true
      const width = data.affoToolbarWidth || 36;
      const height = data.affoToolbarHeight || 20;
      const transparency = data.affoToolbarTransparency !== undefined ? data.affoToolbarTransparency : 0.2;
      const gap = data.affoToolbarGap || 0;
      
      document.getElementById('toolbar-width').value = width;
      document.getElementById('toolbar-height').value = height;
      document.getElementById('toolbar-transparency').value = transparency;
      document.getElementById('toolbar-gap').value = gap;
      
      document.getElementById('toolbar-width-value').textContent = width + 'px';
      document.getElementById('toolbar-height-value').textContent = height + '%';
      document.getElementById('toolbar-transparency-value').textContent = transparency;
      document.getElementById('toolbar-gap-value').textContent = gap + 'px';
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
      const enabled = document.getElementById('toolbar-enabled').checked;
      const width = parseInt(document.getElementById('toolbar-width').value);
      const height = parseInt(document.getElementById('toolbar-height').value);
      const transparency = parseFloat(document.getElementById('toolbar-transparency').value);
      const gap = parseInt(document.getElementById('toolbar-gap').value);
      
      await browser.storage.local.set({ 
        affoToolbarEnabled: enabled,
        affoToolbarWidth: width,
        affoToolbarHeight: height,
        affoToolbarTransparency: transparency,
        affoToolbarGap: gap
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
    const transparency = document.getElementById('toolbar-transparency').value;
    const gap = document.getElementById('toolbar-gap').value;
    
    document.getElementById('toolbar-width-value').textContent = width + 'px';
    document.getElementById('toolbar-height-value').textContent = height + '%';
    document.getElementById('toolbar-transparency-value').textContent = transparency;
    document.getElementById('toolbar-gap-value').textContent = gap + 'px';
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
      document.getElementById('toolbar-enabled').checked = true;
      document.getElementById('toolbar-width').value = 36;
      document.getElementById('toolbar-height').value = 20;
      document.getElementById('toolbar-transparency').value = 0.2;
      document.getElementById('toolbar-gap').value = 0;
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
    document.getElementById('save-toolbar').addEventListener('click', saveToolbar);
    document.getElementById('toolbar-width').addEventListener('input', updateToolbarValues);
    document.getElementById('toolbar-height').addEventListener('input', updateToolbarValues);
    document.getElementById('toolbar-transparency').addEventListener('input', updateToolbarValues);
    document.getElementById('toolbar-gap').addEventListener('input', updateToolbarValues);
    document.getElementById('clear-font-cache').addEventListener('click', clearFontCache);
    document.getElementById('view-cache-info').addEventListener('click', viewCacheInfo);
    document.getElementById('reset-all-settings').addEventListener('click', resetAllSettings);
  });
})();
