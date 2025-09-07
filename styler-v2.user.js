// ==UserScript==
// @name         Fontonic - Android Styler v2
// @namespace    urn:userscripts:defmikekoh:fontonic-android-styler
// @version      0.2.4
// @description  [v2] Applies custom web fonts using a performant, robust CSS injection strategy with base-font detection.
// @author       Mike
// @match        *://*/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_deleteValue
// @grant        GM_listValues
// ==/UserScript==

/* ===============================================================
   Fontonic-Android-Styler v2.4 ─ Key Changes
   ---------------------------------------------------------------
   This version adds a hardcoded whitelist for sites that are
   known to be serif-based, bypassing the detection logic for
   guaranteed results on problematic sites.

   ◼ Styling Strategy (Hybrid)
     • On `window.load`, a script checks the `<body>` computed style
       to classify the page as primarily "serif" or "sans-serif".
     • A `data-fontonic-base` attribute is added to the `<body>`.
     • The injected stylesheet uses this attribute to conditionally
       apply the user's chosen serif font to serif pages, and the
       user's chosen sans-serif font to sans-serif pages.
   =============================================================== */

/* ------------------------------------------------------------------ */
/* – Domain gating (Substack & whitelist)                            */
/* ------------------------------------------------------------------ */
const WHITELIST = new Set([
  'marginalrevolution.com',
  'www.marginalrevolution.com',
  'arrow.proteinpower.com',
  'www.arrow.proteinpower.com'
]);

// Whitelist for sites that should always be treated as serif-based.
const SERIF_WHITELIST = new Set([
  'marginalrevolution.com',
  'www.marginalrevolution.com',
  'arrow.proteinpower.com',
  'www.arrow.proteinpower.com'
]);

function isSubstackHost(hostname){
  return hostname.endsWith('.substack.com');
}

function isSubstackPage(){
  if (isSubstackHost(location.hostname)) return true;
  const meta = document.querySelector('meta[name="generator" i]');
  if (meta && /substack/i.test(meta.content)) return true;
  if (typeof window.__SUBSTACK_PUB_ID__ === 'string') return true;
  if (document.querySelector('link[rel="canonical"][href*=".substack.com"]')) return true;
  if (document.querySelector('link[href*="substackcdn"],script[src*="substack"]')) return true;
  const jsonLds = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLds) {
    try {
      const data = JSON.parse(script.textContent);
      if (data && (JSON.stringify(data).includes('substack') || JSON.stringify(data).includes('Substack'))) return true;
    } catch (e) {}
  }
  return false;
}

const IS_SUBSTACK = isSubstackPage();
function hostAllowed(){ return WHITELIST.has(location.hostname) || IS_SUBSTACK; }
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const IS_TOP = (window.top === window.self);

/* ------------------------------------------------------------------ */
/* 0 · Preferences                                                    */
/* ------------------------------------------------------------------ */
const PREF_KEY = 'fontonic-android-styler-prefs';
const STYLE_ID = 'fontonic-v2-stylesheet';
const DEFAULT_PREFS = {
  enabled: true,
  serifArray: [
    { font: 'FK Roman Standard Trial', px: 16.5, url: null },
    { font: 'BBC Reith Serif', px: 16.75, url: null },
    { font: 'Merriweather', px: 16, axes: { wdth: 103 }, url: 'https://fonts.googleapis.com/css2?family=Merriweather:ital,wdth,wght@0,87..112,300..900;1,87..112,300..900&display=swap' },
    { font: 'Lora', px: 17, axes: { wght: 450 }, url: 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&display=swap' },
    // { font: 'Roboto Slab', px: 17, url: 'https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@100..900&display=swap' }
  ],
  sansArray: [
    { font: 'Noto Sans', px: 17, url: 'https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wdth,wght@0,62.5..100,100..900;1,62.5..100,100..900&display=swap' },
    { font: 'Rubik', px: 17, url: 'https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..900;1,300..900&display=swap' },
    { font: 'ABC Ginto Normal Unlicensed Trial', px: 17, url: 'https://fonts.cdnfonts.com/css/abc-ginto-nord-unlicensed-trial' }
  ],
  monoArray: [
    { font: 'Roboto Mono', url: null }
  ],
  aggressive: true,
  selectedSerif: '',
  selectedSans: '',
  selectedMono: ''
};

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function loadPrefs(retries=3){
  for (let i=0;i<retries;i++){
    try{
      const stored = await GM_getValue(PREF_KEY,null);
      return stored ? {...DEFAULT_PREFS,...stored}:{...DEFAULT_PREFS};
    }catch(e){ if(i<retries-1) await sleep(100*(i+1)); }
  }
  return {...DEFAULT_PREFS};
}
async function savePrefs(prefs,retries=3){
  for(let i=0;i<retries;i++){
    try{
      await GM_setValue(PREF_KEY,prefs);
      return true;
    }catch(e){ if(i<retries-1) await sleep(100*(i+1));}
  }
  return false;
}
async function cleanupOldCounters(){
  const lastCleanupKey='fontonic-last-cleanup';
  const now=Date.now();
  if(now - await GM_getValue(lastCleanupKey,0) > 24*60*60*1000){
    try{
      if(typeof GM_listValues === 'function'){
        for(const key of await GM_listValues()){
          if(key.startsWith('fontonic-counter-')) await GM_deleteValue(key);
        }
      }
    }catch(e){}
    await GM_setValue(lastCleanupKey,now);
  }
}
async function getNextIndex(type,maxLength){
  const key=`fontonic-counter-${location.hostname}-${type}`;
  let counter=await GM_getValue(key,0);
  counter=(counter+1)%maxLength;
  await GM_setValue(key,counter);
  return counter;
}
async function pickFontConfig(p, key, arrKey){
    if(p[key]){ const f=p[arrKey].find(x=>x.font===p[key]); if(f)return f; }
    const idx=await getNextIndex(key, p[arrKey].length);
    return p[arrKey][idx];
}

/* ------------------------------------------------------------------ */
/* 1 · Font loader & Detector                                         */
/* ------------------------------------------------------------------ */
// Readable inline CSS for BBC Reith Serif fallback (no external URL)
const BBC_REITH_SERIF_CSS = `
@font-face {
  font-family: "BBC Reith Serif";
  src: url("https://static.files.bbci.co.uk/fonts/reith/2.512/BBCReithSerif_W_Rg.woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "BBC Reith Serif";
  src: url("https://static.files.bbci.co.uk/fonts/reith/2.512/BBCReithSerif_W_Bd.woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "BBC Reith Serif";
  src: url("https://static.files.bbci.co.uk/fonts/reith/2.512/BBCReithSerif_W_It.woff2");
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "BBC Reith Serif";
  src: url("https://static.files.bbci.co.uk/fonts/reith/2.512/BBCReithSerif_W_BdIt.woff2");
  font-weight: 700;
  font-style: italic;
  font-display: swap;
}
`;

// standard: https://db.onlinewebfonts.com/t/a2a38c80cf0357178a43afdc8e95e869.woff2
// medium: https://db.onlinewebfonts.com/t/beb784012d429b8921e66081b20406b8.woff2
const FK_ROMAN_STANDARD_CSS = `
@font-face {
  font-family: "FK Roman Standard Trial";
  src: url("https://db.onlinewebfonts.com/t/a2a38c80cf0357178a43afdc8e95e869.woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "FK Roman Standard Trial";
  src: url("https://db.onlinewebfonts.com/t/5b2e01844093ec2a8881f8caec25ea5e.woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "FK Roman Standard Trial";
  src: url("https://db.onlinewebfonts.com/t/b4a6d90ef7316c4bf2f7f0c2ff8ff26e.woff2");
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "FK Roman Standard Trial";
  src: url("https://db.onlinewebfonts.com/t/834183e3bc6e87253115df38c19ca08a.woff2");
  font-weight: 700;
  font-style: italic;
  font-display: swap;
}
`;

function injectFontCSS(cfg){
  if(!cfg) return;

  // Helper to ensure we don't add duplicate link tags
  function ensureLink(rel, href, attrs={}){
    const selHref = href ? `[href="${href}"]` : '';
    const existing = document.head.querySelector(`link[rel="${rel}"]${selHref}`);
    if (existing) return existing;
    const l = document.createElement('link');
    l.rel = rel;
    if (href) l.href = href;
    for (const [k,v] of Object.entries(attrs)){
      if (v === true) l.setAttribute(k, '');
      else if (v !== false && v != null) l.setAttribute(k, String(v));
    }
    document.head.appendChild(l);
    return l;
  }

  function ensurePreconnect(origin){
    try{ ensureLink('preconnect', origin, origin.includes('gstatic.com') ? { crossorigin: '' } : {}); }catch(e){}
  }

  if(cfg.font === 'BBC Reith Serif' && !cfg.url) {
    const style = document.createElement('style');
    style.textContent = BBC_REITH_SERIF_CSS;
    document.head.appendChild(style);
    return;
  }
    if(cfg.font === 'FK Roman Standard Trial' && !cfg.url) {
    const style = document.createElement('style');
    style.textContent = FK_ROMAN_STANDARD_CSS;
    document.head.appendChild(style);
    return;
  }
  if(!cfg.url) return;

  try{
    const url = new URL(cfg.url, location.href);
    const origin = `${url.protocol}//${url.host}`;
    ensurePreconnect(origin);
    if (origin.includes('fonts.googleapis.com')) ensurePreconnect('https://fonts.gstatic.com');
  }catch(e){}

  // Preload the stylesheet itself for faster apply
  ensureLink('preload', cfg.url, { as: 'style', crossorigin: 'anonymous' });

  // Print-then-all pattern to avoid render blocking
  const existingSheet = document.head.querySelector(`link[rel="stylesheet"][href="${cfg.url}"]`);
  if (!existingSheet){
    const sheet=document.createElement('link');
    sheet.rel='stylesheet';
    sheet.href=cfg.url;
    sheet.media='print';
    sheet.crossOrigin='anonymous';
    sheet.onload=()=>{sheet.media='all';};
    document.head.appendChild(sheet);
  }
}

function detectBaseFontFamily() {
    try {
        const fam = getComputedStyle(document.body || document.documentElement).fontFamily || '';
        const parts = fam.replace(/["']/g, '').split(',').map(s => s.trim().toLowerCase());

        const serifNames = ['spectral', 'lora', 'georgia', 'times', 'times new roman', 'merriweather', 'roboto slab'];

        if (serifNames.includes(parts[0])) return 'serif';
        if (parts.some(p => serifNames.includes(p))) return 'serif';
        if (parts.includes('sans-serif')) return 'sans-serif';
        if (parts.includes('serif')) return 'serif';

    } catch(e) {
        console.error('[Fontonic] Base font detection failed:', e);
    }
    return 'sans-serif';
}

/* ------------------------------------------------------------------ */
/* 2 · Core Styling Logic (CSS Injection)                             */
/* ------------------------------------------------------------------ */

function buildStyleSheet(prefs, cfgSerif, cfgSans, cfgMono) {
    const imp = prefs.aggressive ? '!important' : '';

    const guardNeg = ':not(:where(.fontonic-guard, [data-fontonic-guard]))';
    const excludedList = 'h1, h2, h3, h4, h5, h6, pre, code, kbd, samp, tt, button, input, select, textarea, header, nav, footer, aside, label, time, span, a, strong, b, em, i, small, sup, sub, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], [role="button"], [role="link"], [role="heading"], [class*="nav"], [class*="menu"], [class*="header"], [class*="footer"], [class*="sidebar"], [class*="widget"], [class*="byline"], [class*="author"], [class*="date"], [class*="time"], [class*="meta"], [class*="tag"], [class*="category"], [class*="share"], [class*="social"], [class*="comment"], [class*="related"], [class*="recommend"], [class*="ad"], [class*="promo"], [class*="newsletter"], [class*="subscribe"], [class*="caption"], [class*="credit"], [class*="quote"], [class*="pull"], [class*="highlight"], [class*="callout"], [class*="alert"], [class*="banner"], [class*="sticky"], [class*="fixed"], [class*="overlay"], [class*="modal"], [class*="popup"], [class*="dropdown"], [class*="tooltip"], [class*="breadcrumb"], [class*="pagination"], [class*="toolbar"], [class*="controls"], [id*="nav"], [id*="menu"], [id*="header"], [id*="footer"], [id*="sidebar"], [id*="widget"], [id*="ad"], [id*="comment"], [id*="social"], [id*="share"], .code, .hljs, .token, .monospace, .mono, .terminal, [class^="language-"], [class*=" language-"], .prettyprint, .prettyprinted, .sourceCode, .wp-block-code, .wp-block-preformatted, .small-caps, .smallcaps, .smcp, .sc, .site-header, .sidebar, .toc';
    const baseSel = `:not(:where(${excludedList}))`;
    const bodyTextSelector = `:where(p)${baseSel}, :where(li)${baseSel}, :where(div)${guardNeg}${baseSel}`;

    const monoSelector = ':where(code, pre, kbd, samp, .monospace, .mono, .terminal, [class^="language-"], [class*=" language-"])';

    let css = '';

    const serifDecl = [];
    if (cfgSerif.font) serifDecl.push(`font-family: '${cfgSerif.font}', serif ${imp}`);
    if (IS_ANDROID && cfgSerif.px) serifDecl.push(`font-size: ${cfgSerif.px}px ${imp}`);
    if (cfgSerif.axes) {
        const axes = Object.entries(cfgSerif.axes).map(([k, v]) => `'${k}' ${v}`).join(', ');
        serifDecl.push(`font-variation-settings: ${axes} ${imp}`);
    }

    const sansDecl = [];
    if (cfgSans.font) sansDecl.push(`font-family: '${cfgSans.font}', sans-serif ${imp}`);
    if (IS_ANDROID && cfgSans.px) sansDecl.push(`font-size: ${cfgSans.px}px ${imp}`);
    if (cfgSans.axes) {
        const axes = Object.entries(cfgSans.axes).map(([k, v]) => `'${k}' ${v}`).join(', ');
        sansDecl.push(`font-variation-settings: ${axes} ${imp}`);
    }

    if (serifDecl.length > 0) {
        css += `body[data-fontonic-base="serif"] ${bodyTextSelector} { ${serifDecl.join('; ')} }\n`;
    }
    if (sansDecl.length > 0) {
        css += `body[data-fontonic-base="sans-serif"] ${bodyTextSelector} { ${sansDecl.join('; ')} }\n`;
    }

    const monoDecl = [];
    if (cfgMono.font) monoDecl.push(`font-family: '${cfgMono.font}', monospace ${imp}`);
    if (cfgMono.axes) {
        const axes = Object.entries(cfgMono.axes).map(([k, v]) => `'${k}' ${v}`).join(', ');
        monoDecl.push(`font-variation-settings: ${axes} ${imp}`);
    }
    if (monoDecl.length > 0) {
        css += `${monoSelector} { ${monoDecl.join('; ')} }\n`;
    }

    css += `body strong, body b { font-family: initial !important; font-weight: bold !important; font-variation-settings: initial !important; }`;

    return css;
}

function injectStyleSheet(css) {
    let styleEl = document.getElementById(STYLE_ID);
    if (styleEl) {
        styleEl.textContent = css;
    } else {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
    }
    return styleEl;
}

function maintainStyleSheet() {
    let moving = false;
    function moveStyleToEnd() {
        if (moving) return;
        moving = true;
        try {
            const n = document.getElementById(STYLE_ID);
            if (n && n.parentNode && n.parentNode.lastElementChild !== n) {
                n.parentNode.appendChild(n);
            }
        } catch(e) {}
        setTimeout(() => { moving = false; }, 50);
    }

    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                const added = Array.from(m.addedNodes || []);
                if (added.some(n => n.nodeType === 1 && (n.nodeName === 'STYLE' || n.nodeName === 'LINK'))) {
                    moveStyleToEnd();
                    break;
                }
            }
        }
    });
    if (document.head) observer.observe(document.head, { childList: true });

    try {
        const _ps = history.pushState;
        history.pushState = function() { _ps.apply(this, arguments); moveStyleToEnd(); return arguments[0]; };
        const _rs = history.replaceState;
        history.replaceState = function() { _rs.apply(this, arguments); moveStyleToEnd(); return arguments[0]; };
        window.addEventListener('popstate', moveStyleToEnd, true);
    } catch(e) {}
}


/* ------------------------------------------------------------------ */
/* 3 · Main bootstrap                                                 */
/* ------------------------------------------------------------------ */

async function main() {
    try{
        await cleanupOldCounters();
        const SCRIPT_PREFS = await loadPrefs();
        if(IS_TOP) await registerMenuCommands(SCRIPT_PREFS);
        if(!SCRIPT_PREFS.enabled || !hostAllowed()) return;
        if(!IS_ANDROID && !IS_SUBSTACK) return;

        console.log(`[Fontonic v2.4] Script enabled on ${location.hostname}`);

        let baseFont;
        if (SERIF_WHITELIST.has(location.hostname)) {
            baseFont = 'serif';
            console.log(`[Fontonic v2.4] Hostname is on serif-whitelist. Forcing base font: serif`);
        } else {
            baseFont = detectBaseFontFamily();
            console.log(`[Fontonic v2.4] Detected base font: ${baseFont}`);
        }
        document.body.dataset.fontonicBase = baseFont;

        const serifCfg = await pickFontConfig(SCRIPT_PREFS, 'selectedSerif', 'serifArray');
        const sansCfg  = await pickFontConfig(SCRIPT_PREFS, 'selectedSans', 'sansArray');
        const monoCfg  = await pickFontConfig(SCRIPT_PREFS, 'selectedMono', 'monoArray');

        injectFontCSS(serifCfg);
        injectFontCSS(sansCfg);
        injectFontCSS(monoCfg);

        const css = buildStyleSheet(SCRIPT_PREFS, serifCfg, sansCfg, monoCfg);
        injectStyleSheet(css);

        // Only chase last-position if not using !important
        if (!SCRIPT_PREFS.aggressive) maintainStyleSheet();

        if(IS_ANDROID && IS_SUBSTACK){
          const s=document.createElement('style');
          s.textContent='html,body{margin-right:7px !important;}';
          document.head.appendChild(s);
        }

    }catch(e){
        console.error('[Fontonic v2.4] Critical init error:',e);
    }
}

async function registerMenuCommands(prefs){
  if(!IS_TOP) return;
  GM_registerMenuCommand(
    prefs.enabled?'Disable Fontonic-Styler-v2':'Enable Fontonic-Styler-v2',
    async()=>{prefs.enabled=!prefs.enabled; if(await savePrefs(prefs)) location.reload();}
  );
}

// Prefer early start; recheck base on full load
if (document.readyState !== 'loading') {
  main();
} else {
  document.addEventListener('DOMContentLoaded', main, { once: true });
}
// On load, re-detect base font to handle late swaps
window.addEventListener('load', () => {
  try {
    const base = SERIF_WHITELIST.has(location.hostname) ? 'serif' : detectBaseFontFamily();
    if (document.body) document.body.dataset.fontonicBase = base;
  } catch(e) {}
}, { once: true });
