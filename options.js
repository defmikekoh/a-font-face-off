/* Options page logic: manage known serif/sans lists */
(function(){
  const DEFAULT_SERIF = ['PT Serif'];
  const DEFAULT_SANS = [];
  const DEFAULT_FFONLY = ['x.com'];

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
      const data = await browser.storage.local.get(['affoKnownSerif', 'affoKnownSans', 'affoFontFaceOnlyDomains']);
      const serif = Array.isArray(data.affoKnownSerif) ? data.affoKnownSerif : DEFAULT_SERIF.slice();
      const sans = Array.isArray(data.affoKnownSans) ? data.affoKnownSans : DEFAULT_SANS.slice();
      document.getElementById('known-serif').value = toTextarea(serif);
      document.getElementById('known-sans').value = toTextarea(sans);
      const ffonly = Array.isArray(data.affoFontFaceOnlyDomains) ? data.affoFontFaceOnlyDomains : DEFAULT_FFONLY.slice();
      document.getElementById('ff-only-domains').value = toTextarea(ffonly);
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

  document.addEventListener('DOMContentLoaded', function(){
    load();
    document.getElementById('save-serif').addEventListener('click', saveSerif);
    document.getElementById('save-sans').addEventListener('click', saveSans);
    document.getElementById('reset-serif').addEventListener('click', resetSerif);
    document.getElementById('reset-sans').addEventListener('click', resetSans);
    document.getElementById('save-ffonly').addEventListener('click', saveFFOnly);
    document.getElementById('reset-ffonly').addEventListener('click', resetFFOnly);
  });
})();
