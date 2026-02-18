// Content script: cleanup and storage monitoring only
// All font injection is now handled by popup.js using insertCSS

(function () {
  // Classify page base font (serif vs sans) once per doc — used for diagnostics/heuristics
  try {
    if (!document.documentElement.hasAttribute('data-affo-base')) {
      var fam = '';
      try { fam = String(getComputedStyle(document.body || document.documentElement).fontFamily || ''); } catch (_) { }
      var parts = fam.replace(/["']'/g, '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      var hasSansGen = parts.indexOf('sans-serif') !== -1;
      var hasSerifGen = parts.indexOf('serif') !== -1;
      // Prefer explicit generic if present; treat "Merriweather, sans-serif" as sans
      var base;
      if (hasSansGen) base = 'sans';
      else if (hasSerifGen) base = 'serif';
      else {
        // Fall back to name hints
        var serifNames = ['pt serif', 'georgia', 'times', 'times new roman', 'merriweather', 'garamond', 'charter', 'spectral', 'lora', 'abril'];
        var isSerifName = parts.some(function (p) { return serifNames.indexOf(p) !== -1; });
        base = isSerifName ? 'serif' : 'sans';
      }
      document.documentElement.setAttribute('data-affo-base', base);
      // Asynchronously refine using user-provided lists
      try {
        browser.storage.local.get(['affoKnownSerif', 'affoKnownSans']).then(function (opt) {
          try {
            var ks = Array.isArray(opt.affoKnownSerif) ? opt.affoKnownSerif.map(function (s) { return String(s || '').toLowerCase().trim(); }) : [];
            var kn = Array.isArray(opt.affoKnownSans) ? opt.affoKnownSans.map(function (s) { return String(s || '').toLowerCase().trim(); }) : [];
            var nameHitSerif = parts.some(function (p) { return ks.indexOf(p) !== -1; });
            var nameHitSans = parts.some(function (p) { return kn.indexOf(p) !== -1; });
            if (nameHitSans && !hasSansGen) document.documentElement.setAttribute('data-affo-base', 'sans');
            else if (nameHitSerif && !hasSerifGen) document.documentElement.setAttribute('data-affo-base', 'serif');
          } catch (_) { }
        }).catch(function () { });
      } catch (_) { }
    }
  } catch (_) { }

  // Helper functions for font loading
  var fontFaceOnlyDomains = ['x.com']; // Will be loaded from storage
  var inlineApplyDomains = ['x.com']; // Will be loaded from storage
  var currentOrigin = location.hostname;

  // Dev-mode logging: build step sets AFFO_DEBUG = false for production
  var AFFO_DEBUG = true;
  if (!AFFO_DEBUG) {
    console.log = function () { };
    console.warn = function () { };
  }

  function debugLog() { console.log.apply(console, arguments); }
  function elementLog() { console.log.apply(console, arguments); }

  // Global cleanup tracking to prevent flipping between settings
  var activeObservers = {}; // Track MutationObservers by fontType
  var activeTimers = {}; // Track timeout/interval IDs by fontType

  // Idempotent SPA hook infrastructure — installed once, routes to registered handlers
  var spaHooksInstalled = false;
  var spaNavigationHandlers = [];
  var focusHooksInstalled = false;
  var focusHandlers = [];

  function registerSpaHandler(fn) {
    installSpaHooks();
    if (spaNavigationHandlers.indexOf(fn) === -1) {
      spaNavigationHandlers.push(fn);
    }
  }

  function installSpaHooks() {
    if (spaHooksInstalled) return;
    spaHooksInstalled = true;

    function onSpaNavigation() {
      spaNavigationHandlers.forEach(function (fn) {
        try { fn(); } catch (_) { }
      });
    }

    try {
      var _origPush = history.pushState;
      history.pushState = function () {
        var r = _origPush.apply(this, arguments);
        try { setTimeout(onSpaNavigation, 100); } catch (_) { }
        return r;
      };
    } catch (_) { }

    try {
      var _origReplace = history.replaceState;
      history.replaceState = function () {
        var r = _origReplace.apply(this, arguments);
        try { setTimeout(onSpaNavigation, 100); } catch (_) { }
        return r;
      };
    } catch (_) { }

    try {
      window.addEventListener('popstate', function () {
        try { setTimeout(onSpaNavigation, 100); } catch (_) { }
      }, true);
    } catch (_) { }
  }

  function registerFocusHandler(fn) {
    if (focusHandlers.indexOf(fn) === -1) {
      focusHandlers.push(fn);
    }
    if (focusHooksInstalled) return;
    focusHooksInstalled = true;

    try {
      window.addEventListener('focus', function () {
        focusHandlers.forEach(function (h) { try { h(); } catch (_) { } });
      }, true);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          focusHandlers.forEach(function (h) { try { h(); } catch (_) { } });
        }
      }, true);
    } catch (_) { }
  }

  // Known serif/sans font families for element walker classification
  var knownSerifFonts = new Set(['pt serif', 'mencken-std', 'georgia', 'times', 'times new roman', 'merriweather', 'garamond', 'charter', 'spectral', 'lora', 'abril']);
  var knownSansFonts = new Set([
    'arial',
    'helvetica',
    'helvetica neue',
    'inter',
    'roboto',
    'open sans',
    'lato',
    'noto sans',
    'source sans pro',
    'system-ui',
    '-apple-system',
    'segoe ui',
    'ui-sans-serif'
  ]);

  // Load user-defined serif/sans/preserved lists from storage
  var preservedFonts = new Set();
  try {
    browser.storage.local.get(['affoKnownSerif', 'affoKnownSans', 'affoPreservedFonts']).then(function (opt) {
      if (Array.isArray(opt.affoKnownSerif)) {
        knownSerifFonts = new Set(opt.affoKnownSerif.map(function (s) { return String(s || '').toLowerCase().trim(); }));
      }
      if (Array.isArray(opt.affoKnownSans)) {
        knownSansFonts = new Set(opt.affoKnownSans.map(function (s) { return String(s || '').toLowerCase().trim(); }));
      }
      if (Array.isArray(opt.affoPreservedFonts)) {
        preservedFonts = new Set(opt.affoPreservedFonts.map(function (s) { return String(s || '').toLowerCase().trim(); }));
      }
      debugLog('[AFFO Content] Loaded known fonts - Serif:', knownSerifFonts, 'Sans:', knownSansFonts, 'Preserved:', preservedFonts);
    }).catch(function () { });
  } catch (_) { }

  // Load FontFace-only domains, inline apply domains, and aggressive domains from storage
  var aggressiveDomains = [];
  try {
    browser.storage.local.get(['affoFontFaceOnlyDomains', 'affoInlineApplyDomains', 'affoAggressiveDomains']).then(function (data) {
      if (Array.isArray(data.affoFontFaceOnlyDomains)) {
        fontFaceOnlyDomains = data.affoFontFaceOnlyDomains;
        debugLog(`[AFFO Content] FontFace-only domains:`, fontFaceOnlyDomains);
      }
      if (Array.isArray(data.affoInlineApplyDomains)) {
        inlineApplyDomains = data.affoInlineApplyDomains;
        debugLog(`[AFFO Content] Inline apply domains:`, inlineApplyDomains);
      }
      if (Array.isArray(data.affoAggressiveDomains)) {
        aggressiveDomains = data.affoAggressiveDomains;
        debugLog(`[AFFO Content] Aggressive override domains:`, aggressiveDomains);
      }
    }).catch(function () { });
  } catch (e) { }

  // Eagerly start loading custom font definitions and css2Url cache.
  // These are storage reads that loadFont() needs — starting them now
  // eliminates sequential async waits from the critical reapply path.
  try { ensureCss2UrlCache(); } catch (_) { }
  try { ensureCustomFontsLoaded(); } catch (_) { }

  function shouldUseFontFaceOnly() {
    return fontFaceOnlyDomains.includes(currentOrigin);
  }

  function shouldUseInlineApply() {
    return inlineApplyDomains.includes(currentOrigin);
  }

  function shouldUseAggressive() {
    return aggressiveDomains.includes(currentOrigin);
  }

  // --- Substack detection (lazy-cached) ---
  var _isSubstack = null;
  function getIsSubstack() {
    if (_isSubstack !== null) return _isSubstack;
    _isSubstack = false;
    try {
      // Signal 1: hostname
      if (location.hostname.endsWith('.substack.com')) {
        _isSubstack = true; return true;
      }
      // Signal 2: global variable
      if (typeof window.__SUBSTACK_PUB_ID__ === 'string') {
        _isSubstack = true; return true;
      }
      // Signal 3: meta generator
      var gen = document.querySelector('meta[name="generator"]');
      if (gen && /substack/i.test(gen.getAttribute('content') || '')) {
        _isSubstack = true; return true;
      }
      // Signal 4: canonical link
      var canon = document.querySelector('link[rel="canonical"]');
      if (canon && /\.substack\.com/i.test(canon.getAttribute('href') || '')) {
        _isSubstack = true; return true;
      }
      // Signal 5: CDN links or scripts
      if (document.querySelector('link[href*="substackcdn"], script[src*="substack"]')) {
        _isSubstack = true; return true;
      }
      // Signal 6: JSON-LD structured data
      var ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var i = 0; i < ldScripts.length; i++) {
        try {
          if (/substack/i.test(ldScripts[i].textContent || '')) {
            _isSubstack = true; return true;
          }
        } catch (_) { }
      }
    } catch (_) { }
    return false;
  }

  // --- css2Url cache lookup ---
  // Global cache of fontName -> css2Url (populated by popup.js, eliminates per-domain duplication)
  var css2UrlCache = null;
  var css2UrlCachePromise = null;

  function ensureCss2UrlCache() {
    if (css2UrlCache !== null) return Promise.resolve(css2UrlCache);
    if (!css2UrlCachePromise) {
      css2UrlCachePromise = browser.storage.local.get('affoCss2UrlCache').then(function (result) {
        css2UrlCache = result.affoCss2UrlCache || {};
        debugLog('[AFFO Content] Loaded css2Url cache:', Object.keys(css2UrlCache).length, 'entries');
        return css2UrlCache;
      }).catch(function (e) {
        debugLog('[AFFO Content] Failed to load css2Url cache:', e);
        css2UrlCache = {};
        return css2UrlCache;
      });
    }
    return css2UrlCachePromise;
  }

  function getCss2Url(fontName) {
    if (css2UrlCache && css2UrlCache[fontName]) {
      return css2UrlCache[fontName];
    }
    return null;
  }

  // --- Custom font definitions ---
  // Parse custom-fonts-starter.css (or user-customized version) to get @font-face rules on-demand
  var customFontDefinitions = {};
  var customFontsLoaded = false;
  var customFontsPromise = null;

  function parseCustomFontsFromCss(cssText) {
    var blocks = String(cssText || '').match(/@font-face\s*{[\s\S]*?}/gi) || [];
    var byName = {};

    blocks.forEach(function (block) {
      var match = block.match(/font-family\s*:\s*(['"]?)([^;'"]+)\1\s*;/i);
      if (!match) return;
      var name = match[2].trim();
      if (!name) return;
      if (!byName[name]) {
        byName[name] = [];
      }
      byName[name].push(block);
    });

    var defs = {};
    Object.keys(byName).forEach(function (name) {
      defs[name] = { fontFaceRule: byName[name].join('\n') };
    });

    return defs;
  }

  function ensureCustomFontsLoaded() {
    if (customFontsLoaded) return Promise.resolve();
    if (!customFontsPromise) {
      customFontsPromise = browser.storage.local.get('affoCustomFontsCss').then(function (stored) {
        var cssText = stored.affoCustomFontsCss;
        var promises = [];

        // Load packaged custom-fonts-starter.css if user hasn't customized
        if (!cssText) {
          promises.push(
            fetch(browser.runtime.getURL('custom-fonts-starter.css'))
              .then(function (response) { return response.text(); })
              .then(function (text) {
                var parsed = parseCustomFontsFromCss(text);
                Object.assign(customFontDefinitions, parsed);
              })
              .catch(function (e) {
                debugLog('[AFFO Content] Failed to load custom-fonts-starter.css:', e);
              })
          );
        } else {
          var parsed = parseCustomFontsFromCss(cssText);
          Object.assign(customFontDefinitions, parsed);
        }

        return Promise.all(promises).then(function () {
          customFontsLoaded = true;
          debugLog('[AFFO Content] Loaded custom font definitions:', Object.keys(customFontDefinitions));
        });
      }).catch(function (e) {
        debugLog('[AFFO Content] Failed to load custom fonts:', e);
      });
    }
    return customFontsPromise;
  }

  function getFontFaceRule(fontName) {
    return customFontDefinitions[fontName] ? customFontDefinitions[fontName].fontFaceRule : null;
  }

  // --- Module-level selector & inline-apply helpers ---
  var isXCom = currentOrigin.includes('x.com') || currentOrigin.includes('twitter.com');
  var BODY_EXCLUDE = ':not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo):not([data-affo-guard]):not([data-affo-guard] *)';

  function getAffoSelector(ft) {
    if (ft === 'body') {
      return 'body ' + BODY_EXCLUDE;
    }
    return isXCom ? getHybridSelector(ft) : '[data-affo-font-type="' + ft + '"]';
  }

  function applyAffoProtection(el, propsObj) {
    Object.entries(propsObj).forEach(function ([prop, value]) {
      el.style.setProperty(prop, value, 'important');
      el.style.setProperty('--affo-' + prop, value, 'important');
      el.setAttribute('data-affo-' + prop, value);
    });
    el.setAttribute('data-affo-protected', 'true');
    el.setAttribute('data-affo-font-name', propsObj['font-family']);
  }

  // TMI-aware wrapper: detects bold elements before overwriting, preserves weight 700
  function applyTmiProtection(el, propsObj, effectiveWeight) {
    // Detect bold BEFORE applying — check tag, prior-run marker, or computed style
    var isBold = false;
    try {
      var tag = el.tagName && el.tagName.toLowerCase();
      if (tag === 'strong' || tag === 'b') {
        isBold = true;
      } else if (el.getAttribute('data-affo-was-bold') === 'true') {
        isBold = true;
      } else {
        var cw = window.getComputedStyle(el).fontWeight;
        isBold = cw && Number(cw) >= 700;
      }
    } catch (_) { }

    applyAffoProtection(el, propsObj);

    // Restore bold weight so it isn't flattened to the custom weight
    if (isBold && effectiveWeight !== null) {
      el.style.setProperty('font-weight', '700', 'important');
      el.style.setProperty('--affo-font-weight', '700', 'important');
      el.setAttribute('data-affo-font-weight', '700');
      el.setAttribute('data-affo-was-bold', 'true');
    }
  }

  function applyInlineStyles(fontConfig, fontType) {
    elementLog(`Applying inline styles for ${fontType}:`, fontConfig.fontName);

    // Cleanup previous observers and timers for this fontType to prevent flipping
    if (activeObservers[fontType]) {
      try {
        activeObservers[fontType].disconnect();
        debugLog(`[AFFO Content] Cleaned up MutationObserver for ${fontType}`);
      } catch (e) { }
      delete activeObservers[fontType];
    }
    if (activeTimers[fontType]) {
      activeTimers[fontType].forEach(function (timerId) {
        try {
          clearTimeout(timerId);
          clearInterval(timerId);
        } catch (e) { }
      });
      debugLog(`[AFFO Content] Cleaned up ${activeTimers[fontType].length} timers for ${fontType}`);
      delete activeTimers[fontType];
    }

    // For domains with restrictive CSP (like x.com), provide fallback fonts
    var fallbackChain = fontType === 'serif' ? 'serif' : fontType === 'mono' ? 'monospace' : 'sans-serif';

    // Add common system fonts as fallbacks for better compatibility
    if (fontType === 'serif') {
      fallbackChain = 'Georgia, "Times New Roman", Times, serif';
    } else if (fontType === 'mono') {
      fallbackChain = '"Courier New", Courier, monospace';
    } else {
      fallbackChain = 'Arial, Helvetica, sans-serif';
    }

    var cssPropsObject = {};

    // Only include font-family if fontName is actually set
    if (fontConfig.fontName && fontConfig.fontName !== 'undefined') {
      cssPropsObject['font-family'] = `"${fontConfig.fontName}", ${fallbackChain}`;
    }

    // Include fontSize if present
    if (fontConfig.fontSize) {
      cssPropsObject['font-size'] = `${fontConfig.fontSize}px`;
    }

    // Registered axes → high-level CSS properties
    var inlineEffectiveWeight = getEffectiveWeight(fontConfig);
    if (inlineEffectiveWeight !== null) {
      cssPropsObject['font-weight'] = inlineEffectiveWeight;
    }
    if (fontConfig.lineHeight) {
      cssPropsObject['line-height'] = fontConfig.lineHeight;
    }
    if (fontConfig.fontColor) {
      cssPropsObject['color'] = fontConfig.fontColor;
    }
    var inlineEffectiveWdth = getEffectiveWidth(fontConfig);
    if (inlineEffectiveWdth !== null) {
      cssPropsObject['font-stretch'] = inlineEffectiveWdth + '%';
    }
    var inlineEffectiveItal = getEffectiveItalic(fontConfig);
    var inlineEffectiveSlnt = getEffectiveSlant(fontConfig);
    if (inlineEffectiveItal !== null && inlineEffectiveItal >= 1) {
      cssPropsObject['font-style'] = 'italic';
    } else if (inlineEffectiveSlnt !== null && inlineEffectiveSlnt !== 0) {
      cssPropsObject['font-style'] = 'oblique ' + inlineEffectiveSlnt + 'deg';
    }

    // All axes in font-variation-settings (bypasses @font-face descriptor clamping)
    var inlineCustomAxes = buildAllAxisSettings(fontConfig);
    if (inlineCustomAxes.length > 0) {
      cssPropsObject['font-variation-settings'] = inlineCustomAxes.join(', ');
    }

    // Apply styles to elements based on font type
    try {
      if (fontType === 'body') {
        // Apply to body and most descendants (excluding headers for Third Man In mode)
        var bodyElements = document.querySelectorAll('body, ' + getAffoSelector('body'));
        bodyElements.forEach(function (el) {
          Object.entries(cssPropsObject).forEach(function ([prop, value]) {
            el.style.setProperty(prop, value, 'important');
          });
        });
        // Override bold elements to preserve visual boldness in the custom font
        if (inlineEffectiveWeight !== null) {
          var boldElements = document.querySelectorAll('body strong, body b');
          boldElements.forEach(function (el) {
            el.style.setProperty('font-weight', '700', 'important');
            if (inlineCustomAxes.length > 0) {
              el.style.setProperty('font-variation-settings', inlineCustomAxes.join(', '), 'important');
            }
          });
        }
        elementLog(`Applied inline styles to ${bodyElements.length} body elements`);
      } else if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
        var tmiElements = document.querySelectorAll(getAffoSelector(fontType));
        tmiElements.forEach(function (el) {
          applyTmiProtection(el, cssPropsObject, inlineEffectiveWeight);
        });
        elementLog('Applied inline styles to ' + tmiElements.length + ' ' + fontType + ' elements');
      }
    } catch (e) {
      console.error(`[AFFO Content] Error applying inline styles for ${fontType}:`, e);
    }

    // Add SPA resilience for x.com and other dynamic sites
    try {
      var _fontFamily = cssPropsObject['font-family'];

      // MutationObserver to re-apply styles to newly added elements
      var mo = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          (m.addedNodes || []).forEach(function (n) {
            try {
              if (n && n.nodeType === 1) {
                var newElements = [];
                var sel = getAffoSelector(fontType);

                try {
                  if (n.matches && n.matches(sel)) newElements.push(n);
                } catch (_) { }
                try {
                  if (n.querySelectorAll) {
                    newElements = newElements.concat(Array.from(n.querySelectorAll(sel)));
                  }
                } catch (_) { }

                // Apply enhanced protection to new elements
                newElements.forEach(function (el) {
                  try {
                    if (fontType === 'body') {
                      applyAffoProtection(el, cssPropsObject);
                    } else {
                      applyTmiProtection(el, cssPropsObject, inlineEffectiveWeight);
                    }
                  } catch (_) { }
                });

                if (newElements.length > 0) {
                  elementLog(`Applied inline styles to ${newElements.length} new ${fontType} elements`);
                }
              }
            } catch (_) { }
          });
        });
      });

      mo.observe(document.documentElement || document, { childList: true, subtree: true });

      // Track the observer for cleanup
      activeObservers[fontType] = mo;

      // Initialize timers array for this fontType
      if (!activeTimers[fontType]) activeTimers[fontType] = [];

      // Reduced resiliency window for inline domains (3 minutes)
      // With fast caching, fonts apply almost instantly, so shorter window is sufficient
      var disconnectTimer = setTimeout(function () {
        try { mo.disconnect(); } catch (_) { }
      }, 180000); // 3 minutes (was 10 minutes)
      activeTimers[fontType].push(disconnectTimer);

      // Re-apply styles on SPA navigations (history API hooks)
      function reapplyInlineStyles() {
        try {
          var elements = document.querySelectorAll(getAffoSelector(fontType));
          elements.forEach(function (el) {
            if (fontType === 'body') {
              applyAffoProtection(el, cssPropsObject);
            } else {
              applyTmiProtection(el, cssPropsObject, inlineEffectiveWeight);
            }
          });
          elementLog(`Re-applied inline styles to ${elements.length} ${fontType} elements after SPA navigation`);
        } catch (e) {
          debugLog(`[AFFO Content] Error re-applying inline styles after SPA navigation:`, e);
        }
      }

      registerSpaHandler(reapplyInlineStyles);

      // Enhanced monitoring with reduced frequency now that fonts load instantly from cache
      var monitoringTimer = setTimeout(function () {
        try {
          // Inline-apply domains (aggressive SPAs) get faster polling since they fight style changes
          var isInline = shouldUseInlineApply();
          var initialFrequency = isInline ? 2000 : 5000;
          var laterFrequency = 10000;
          var initialDuration = isInline ? 30000 : 60000;
          var totalDuration = 180000; // 3 minutes total (was 10 min)

          debugLog(`[AFFO Content] Starting enhanced monitoring for ${fontType} - initial: ${initialFrequency}ms, later: ${laterFrequency}ms`);

          var checkCount = 0;

          // Frequent monitoring initially
          var initialInterval = setInterval(function () {
            try {
              checkCount++;
              reapplyInlineStyles();
              if (checkCount % 10 === 0) {
                debugLog(`[AFFO Content] Performed ${checkCount} style checks for ${fontType}`);
              }
            } catch (e) {
              debugLog(`[AFFO Content] Error in frequent style check:`, e);
            }
          }, initialFrequency);

          // Track the interval timer for cleanup
          if (!activeTimers[fontType]) activeTimers[fontType] = [];
          activeTimers[fontType].push(initialInterval);

          // Switch to less frequent monitoring after initial period
          var switchTimer = setTimeout(function () {
            clearInterval(initialInterval);
            debugLog(`[AFFO Content] Switching to less frequent monitoring for ${fontType}`);

            var laterInterval = setInterval(function () {
              try {
                checkCount++;
                reapplyInlineStyles();

                // Additional protection: Check for and restore any cleared styles
                if (isInline) {
                  restoreManipulatedStyles(fontType, cssPropsObject);
                }
              } catch (e) {
                debugLog(`[AFFO Content] Error in periodic style check:`, e);
              }
            }, laterFrequency);

            // Track the later interval for cleanup
            activeTimers[fontType].push(laterInterval);

            // Stop monitoring after total duration
            var stopTimer = setTimeout(function () {
              clearInterval(laterInterval);
              debugLog(`[AFFO Content] Stopped style monitoring for ${fontType} after ${totalDuration / 1000} seconds (${checkCount} total checks)`);
            }, totalDuration - initialDuration);

            // Track the stop timer for cleanup (must be inside switchTimer callback where stopTimer is scoped)
            activeTimers[fontType].push(stopTimer);

          }, initialDuration);

          // Track the switch timer for cleanup
          activeTimers[fontType].push(switchTimer);

        } catch (e) {
          debugLog(`[AFFO Content] Error setting up enhanced monitoring for ${fontType}:`, e);
        }
      }, 1000);
      activeTimers[fontType].push(monitoringTimer);

      // Re-apply styles when page becomes visible
      registerFocusHandler(reapplyInlineStyles);

      debugLog(`[AFFO Content] Added enhanced SPA resilience for ${fontType} fonts on ${currentOrigin}`);

    } catch (e) {
      console.error(`[AFFO Content] Error setting up SPA resilience for ${fontType}:`, e);
    }
  }

  // Shared CSS helpers for weight/axis handling.
  // Registered axes use high-level CSS properties (font-weight, font-stretch, font-style)
  // AND are included in font-variation-settings to bypass @font-face descriptor clamping.

  function getEffectiveWeight(config) {
    if (config.fontWeight != null && isFinite(Number(config.fontWeight))) return Number(config.fontWeight);
    if (config.variableAxes && config.variableAxes.wght != null && isFinite(Number(config.variableAxes.wght))) return Number(config.variableAxes.wght);
    return null;
  }

  function getEffectiveWidth(config) {
    if (config.wdthVal != null && isFinite(Number(config.wdthVal))) return Number(config.wdthVal);
    if (config.variableAxes && config.variableAxes.wdth != null && isFinite(Number(config.variableAxes.wdth))) return Number(config.variableAxes.wdth);
    return null;
  }

  function getEffectiveSlant(config) {
    if (config.slntVal != null && isFinite(Number(config.slntVal))) return Number(config.slntVal);
    if (config.variableAxes && config.variableAxes.slnt != null && isFinite(Number(config.variableAxes.slnt))) return Number(config.variableAxes.slnt);
    return null;
  }

  function getEffectiveItalic(config) {
    if (config.italVal != null && isFinite(Number(config.italVal))) return Number(config.italVal);
    if (config.variableAxes && config.variableAxes.ital != null && isFinite(Number(config.variableAxes.ital))) return Number(config.variableAxes.ital);
    return null;
  }

  // Returns array of '"axis" value' strings for ALL axes (registered + custom).
  // Bypasses @font-face descriptor clamping for registered axes.
  function buildAllAxisSettings(config) {
    var settings = [];
    if (config.variableAxes) {
      Object.entries(config.variableAxes).forEach(function ([axis, value]) {
        if (isFinite(Number(value))) {
          settings.push('"' + axis + '" ' + value);
        }
      });
    }
    return settings;
  }

  // Shared CSS generation for body and Third Man In modes.
  // Returns an array of CSS rule strings. Used by both reapplyStoredFontsFromEntry and reapplyStoredFonts.
  function generateCSSLines(fontConfig, fontType) {
    var lines = [];
    var imp = shouldUseAggressive() ? ' !important' : '';

    var customAxes = buildAllAxisSettings(fontConfig);
    var effectiveWeight = getEffectiveWeight(fontConfig);
    var effectiveWdth = getEffectiveWidth(fontConfig);
    var effectiveSlnt = getEffectiveSlant(fontConfig);
    var effectiveItal = getEffectiveItalic(fontConfig);

    if (fontType === 'body') {
      var generalSelector = 'body, body ' + BODY_EXCLUDE + ':not([class*="__whatfont_"])';
      var weightSelector = 'body, body ' + BODY_EXCLUDE + ':not(strong):not(b):not([class*="__whatfont_"])';

      var cssProps = [];
      if (fontConfig.fontName && fontConfig.fontName !== 'undefined') {
        cssProps.push('font-family: "' + fontConfig.fontName + '", serif' + imp);
      }
      if (fontConfig.fontSize) cssProps.push('font-size: ' + fontConfig.fontSize + 'px' + imp);
      if (fontConfig.lineHeight) cssProps.push('line-height: ' + fontConfig.lineHeight + imp);
      if (fontConfig.fontColor) cssProps.push('color: ' + fontConfig.fontColor + imp);
      // Registered axes → high-level CSS properties
      if (effectiveWdth !== null) cssProps.push('font-stretch: ' + effectiveWdth + '%' + imp);
      if (effectiveItal !== null && effectiveItal >= 1) {
        cssProps.push('font-style: italic' + imp);
      } else if (effectiveSlnt !== null && effectiveSlnt !== 0) {
        cssProps.push('font-style: oblique ' + effectiveSlnt + 'deg' + imp);
      }
      // All axes in font-variation-settings (bypasses @font-face descriptor clamping)
      if (customAxes.length > 0) {
        cssProps.push('font-variation-settings: ' + customAxes.join(', ') + imp);
      }
      lines.push(generalSelector + ' { ' + cssProps.join('; ') + '; }');

      if (effectiveWeight) {
        var weightRule = 'font-weight: ' + effectiveWeight + imp;
        if (customAxes.length > 0) {
          weightRule += '; font-variation-settings: ' + customAxes.join(', ') + imp;
        }
        lines.push(weightSelector + ' { ' + weightRule + '; }');
        // Bold override — font-weight only; stretch/style inherit from parent
        var boldRule = 'font-weight: 700' + imp;
        if (customAxes.length > 0) {
          boldRule += '; font-variation-settings: ' + customAxes.join(', ') + imp;
        }
        lines.push('body strong, body b { ' + boldRule + '; }');
      }
    } else if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
      var generic = fontType === 'serif' ? 'serif' : fontType === 'mono' ? 'monospace' : 'sans-serif';

      // Comprehensive rule for non-bold marked elements
      var nonBoldProps = [];
      if (fontConfig.fontName && fontConfig.fontName !== 'undefined') {
        nonBoldProps.push('font-family: "' + fontConfig.fontName + '", ' + generic + imp);
      }
      if (effectiveWeight) {
        nonBoldProps.push('font-weight: ' + effectiveWeight + imp);
      }
      // Registered axes → high-level CSS properties
      if (effectiveWdth !== null) nonBoldProps.push('font-stretch: ' + effectiveWdth + '%' + imp);
      if (effectiveItal !== null && effectiveItal >= 1) {
        nonBoldProps.push('font-style: italic' + imp);
      } else if (effectiveSlnt !== null && effectiveSlnt !== 0) {
        nonBoldProps.push('font-style: oblique ' + effectiveSlnt + 'deg' + imp);
      }
      // All axes in font-variation-settings (bypasses @font-face descriptor clamping)
      if (customAxes.length > 0) {
        nonBoldProps.push('font-variation-settings: ' + customAxes.join(', ') + imp);
      }
      if (nonBoldProps.length > 0) {
        lines.push('[data-affo-font-type="' + fontType + '"]:not(strong):not(b) { ' + nonBoldProps.join('; ') + '; }');
      }

      // Bold rule — font-weight 700; stretch/style inherit from parent
      if ((fontConfig.fontName && fontConfig.fontName !== 'undefined') || effectiveWeight) {
        var boldProps = [];
        if (fontConfig.fontName && fontConfig.fontName !== 'undefined') {
          boldProps.push('font-family: "' + fontConfig.fontName + '", ' + generic + imp);
        }
        boldProps.push('font-weight: 700' + imp);
        if (customAxes.length > 0) {
          boldProps.push('font-variation-settings: ' + customAxes.join(', ') + imp);
        }
        lines.push('strong[data-affo-font-type="' + fontType + '"], b[data-affo-font-type="' + fontType + '"], [data-affo-font-type="' + fontType + '"] strong, [data-affo-font-type="' + fontType + '"] b { ' + boldProps.join('; ') + '; }');
      }

      // Other properties apply to body text elements
      var otherProps = [];
      if (fontConfig.fontSize) otherProps.push('font-size: ' + fontConfig.fontSize + 'px' + imp);
      if (fontConfig.lineHeight) otherProps.push('line-height: ' + fontConfig.lineHeight + imp);
      if (fontConfig.fontColor) otherProps.push('color: ' + fontConfig.fontColor + imp);
      if (otherProps.length > 0) {
        lines.push('html body p[data-affo-font-type="' + fontType + '"], html body span[data-affo-font-type="' + fontType + '"], html body td[data-affo-font-type="' + fontType + '"], html body th[data-affo-font-type="' + fontType + '"], html body li[data-affo-font-type="' + fontType + '"] { ' + otherProps.join('; ') + '; }');
      }
    }

    return lines;
  }

  var HYBRID_GUARD = ':not([data-affo-guard]):not([data-affo-guard] *)';

  function addHybridGuard(sel) {
    return sel.split(',').map(function (s) { return s.trim() + HYBRID_GUARD; }).join(', ');
  }

  function getHybridSelector(fontType) {
    // For x.com, create selectors that capture the semantic intent but with broad coverage
    if (fontType === 'sans') {
      // Most x.com text is sans-serif, so target most text elements
      return addHybridGuard('div[data-testid], span[data-testid], a[data-testid], button[data-testid], div[role], span[role], a[role], button[role], p, div:not([class*="icon"]):not([class*="svg"]), span:not([class*="icon"]):not([class*="svg"])');
    } else if (fontType === 'serif') {
      // For serif, target longer text content areas
      return addHybridGuard('div[data-testid*="tweet"] span, div[data-testid*="text"] span, article span, p, blockquote, div[role="article"] span');
    } else if (fontType === 'mono') {
      // For mono, target code-like elements
      return addHybridGuard('code, pre, span[style*="font-family"][style*="mono"], div[style*="font-family"][style*="mono"]');
    }

    // Fallback to marked elements
    return `[data-affo-font-type="${fontType}"]`;
  }

  function restoreManipulatedStyles(fontType, cssPropsObject) {
    try {
      var elements = document.querySelectorAll(getAffoSelector(fontType));
      var restoredCount = 0;

      elements.forEach(function (el) {
        var currentFontFamily = window.getComputedStyle(el).fontFamily;

        // If the font doesn't match what we expect, restore it
        if (!currentFontFamily.includes(cssPropsObject['font-family'].split(',')[0].replace(/"/g, ''))) {
          applyAffoProtection(el, cssPropsObject);

          // Preserve bold weight for elements marked as bold by applyTmiProtection
          if (el.getAttribute('data-affo-was-bold') === 'true') {
            el.style.setProperty('font-weight', '700', 'important');
            el.style.setProperty('--affo-font-weight', '700', 'important');
            el.setAttribute('data-affo-font-weight', '700');
          }

          restoredCount++;
        }
      });

      if (restoredCount > 0) {
        elementLog(`Restored manipulated styles on ${restoredCount} ${fontType} elements`);
      }
    } catch (e) {
      debugLog(`[AFFO Content] Error restoring manipulated styles:`, e);
    }
  }

  // Track fonts currently being loaded to prevent duplicate concurrent loads
  var fontsCurrentlyLoading = {};

  function loadFont(fontConfig, fontType) {
    var fontName = fontConfig.fontName;
    if (!fontName) return Promise.resolve();

    // Prevent concurrent loads of the same font
    if (fontsCurrentlyLoading[fontName]) {
      debugLog(`[AFFO Content] Font ${fontName} is already loading, returning existing promise`);
      return fontsCurrentlyLoading[fontName];
    }

    debugLog(`[AFFO Content] Loading font ${fontName} for ${fontType}, FontFace-only:`, shouldUseFontFaceOnly());

    // Create the loading promise and track it
    // Load both custom fonts and css2Url cache in parallel
    var loadingPromise = Promise.all([ensureCustomFontsLoaded(), ensureCss2UrlCache()]).then(function () {
      // Look up fontFaceRule from parsed custom font definitions
      var fontFaceRule = getFontFaceRule(fontName);

      debugLog(`[AFFO Content] Font config for ${fontName}:`, {
        fontName: fontConfig.fontName,
        isCustomFont: !!fontFaceRule,
        fontFaceRuleLength: fontFaceRule ? fontFaceRule.length : 0,
        otherKeys: Object.keys(fontConfig).filter(function (k) { return k !== 'fontName'; })
      });

      // If font has custom @font-face rule (non-Google font), handle it
      if (fontFaceRule) {
        debugLog(`[AFFO Content] Handling custom font ${fontName}`);

        if (shouldUseFontFaceOnly()) {
          // On FontFace-only domains, download and load custom fonts via FontFace API
          debugLog(`[AFFO Content] Loading custom font ${fontName} via FontFace API for CSP bypass`);
          return tryCustomFontFaceAPI(fontName, fontFaceRule);
        } else {
          // On standard domains, inject @font-face CSS
          debugLog(`[AFFO Content] Injecting custom @font-face for ${fontName}`);
          var fontFaceStyleId = 'affo-fontface-' + fontName.replace(/\s+/g, '-').toLowerCase();
          if (!document.getElementById(fontFaceStyleId)) {
            var fontFaceStyle = document.createElement('style');
            fontFaceStyle.id = fontFaceStyleId;
            fontFaceStyle.textContent = fontFaceRule;
            document.head.appendChild(fontFaceStyle);
          }
          return Promise.resolve();
        }
      }
      // If Google font and not FontFace-only domain, load Google Fonts CSS
      else if (!shouldUseFontFaceOnly()) {
        loadGoogleFontCSS(fontConfig);
        return Promise.resolve();
      }
      // If Google font and FontFace-only domain, use FontFace API only
      else {
        return tryFontFaceAPI(fontConfig);
      }
    }).catch(function (e) {
      debugLog(`[AFFO Content] Error loading font ${fontName}:`, e);
      return Promise.resolve();
    });

    // Fallback for immediate path (shouldn't happen but defensive)
    if (!loadingPromise) {
      loadingPromise = Promise.resolve();
    }

    // Store the promise and clean up when done
    fontsCurrentlyLoading[fontName] = loadingPromise;
    loadingPromise.then(function () {
      delete fontsCurrentlyLoading[fontName];
      debugLog(`[AFFO Content] Font ${fontName} loading completed, removed from tracking`);
    }).catch(function (e) {
      delete fontsCurrentlyLoading[fontName];
      debugLog(`[AFFO Content] Font ${fontName} loading failed, removed from tracking:`, e);
    });

    return loadingPromise;
  }

  // Ensure preconnect hints for Google Fonts are present in the page
  var preconnectsInjected = false;
  function ensureGoogleFontsPreconnect() {
    if (preconnectsInjected) return;
    preconnectsInjected = true;
    try {
      if (!document.querySelector('link[rel="preconnect"][href="https://fonts.googleapis.com"]')) {
        var pc1 = document.createElement('link');
        pc1.rel = 'preconnect';
        pc1.href = 'https://fonts.googleapis.com';
        document.head.appendChild(pc1);
      }
      if (!document.querySelector('link[rel="preconnect"][href="https://fonts.gstatic.com"]')) {
        var pc2 = document.createElement('link');
        pc2.rel = 'preconnect';
        pc2.href = 'https://fonts.gstatic.com';
        pc2.crossOrigin = '';
        document.head.appendChild(pc2);
      }
    } catch (_) { }
  }

  function loadGoogleFontCSS(fontConfig) {
    try {
      var fontName = fontConfig.fontName;
      var linkId = 'a-font-face-off-style-' + fontName.replace(/\s+/g, '-').toLowerCase() + '-link';
      if (document.getElementById(linkId)) return; // Already loaded

      // Add preconnect hints before loading font
      ensureGoogleFontsPreconnect();

      // Lookup css2Url from global cache (populated by popup.js)
      var cachedUrl = getCss2Url(fontName);
      var href = cachedUrl || buildGoogleFontUrl(fontConfig);

      var link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
      debugLog(`[AFFO Content] Loading Google Font CSS: ${fontName} - ${href}${cachedUrl ? ' (from cache)' : ' (fallback)'}`);
    } catch (e) {
      console.error(`[AFFO Content] Failed to load Google Font CSS ${fontConfig.fontName}:`, e);
    }
  }

  function buildGoogleFontUrl(fontConfig) {
    var fontName = fontConfig.fontName;
    var familyParam = encodeURIComponent(fontName).replace(/%20/g, '+');

    // FALLBACK: This should rarely be used - popup.js should always compute css2Url
    // Use simple URL without variable axes to avoid MIME type errors
    // If user needs variable axes, they should be getting css2Url from popup.js
    var url = 'https://fonts.googleapis.com/css2?family=' + familyParam + '&display=swap';

    debugLog(`[AFFO Content] Using fallback Google Font URL for ${fontName} (css2Url not available): ${url}`);
    return url;
  }


  function tryCustomFontFaceAPI(fontName, fontFaceRule) {
    if (!window.FontFace || !document.fonts) {
      debugLog(`[AFFO Content] FontFace API not supported for custom font ${fontName}`);
      return Promise.resolve();
    }

    try {
      // Check if font is already loaded in document.fonts
      var fontAlreadyLoaded = false;
      try {
        document.fonts.forEach(function (fontFace) {
          if (fontFace.family === fontName && fontFace.status === 'loaded') {
            fontAlreadyLoaded = true;
          }
        });
      } catch (e) {
        debugLog(`[AFFO Content] Error checking document.fonts for custom font ${fontName}:`, e);
      }

      if (fontAlreadyLoaded) {
        debugLog(`[AFFO Content] Custom font ${fontName} already loaded in document.fonts, skipping download`);
        return Promise.resolve();
      }

      debugLog(`[AFFO Content] Parsing custom @font-face rule for ${fontName}`);

      // Parse @font-face rule to extract WOFF2 URLs and font descriptors
      var fontFaceBlocks = fontFaceRule.split('@font-face').filter(block => block.trim().length > 0);

      debugLog(`[AFFO Content] Found ${fontFaceBlocks.length} @font-face blocks for ${fontName}`);

      var loadPromises = fontFaceBlocks.map(function (block, index) {
        // Extract src URL - handle HTTP URLs, data: URLs, and WOFF/WOFF2 formats
        var srcMatch = block.match(/src:\s*url\(["']?([^"'\)]+)["']?\)/i);
        if (!srcMatch) {
          debugLog(`[AFFO Content] No URL found in @font-face block ${index + 1} for ${fontName}`);
          return Promise.resolve(false);
        }

        var fontUrl = srcMatch[1];

        // Extract font descriptors
        var weightMatch = block.match(/font-weight:\s*(\d+)/i);
        var styleMatch = block.match(/font-style:\s*(normal|italic)/i);

        var descriptors = {
          weight: weightMatch ? weightMatch[1] : '400',
          style: styleMatch ? styleMatch[1] : 'normal',
          display: 'swap'
        };

        debugLog(`[AFFO Content] Font descriptors ${index + 1}:`, descriptors);

        // Handle data: URLs (for AP fonts and other base64-embedded fonts)
        if (fontUrl.startsWith('data:font/woff2;base64,') || fontUrl.startsWith('data:font/woff;base64,')) {
          var fontFormat = fontUrl.startsWith('data:font/woff2') ? 'WOFF2' : 'WOFF';
          debugLog(`[AFFO Content] Found ${fontFormat} data: URL ${index + 1} for ${fontName}`);

          try {
            // Extract base64 data after the comma
            var base64Data = fontUrl.split(',')[1];
            if (!base64Data) {
              debugLog(`[AFFO Content] Invalid data: URL format for ${fontName} variant ${index + 1}`);
              return Promise.resolve(false);
            }

            // Decode base64 to binary string
            var binaryString = atob(base64Data);
            var bytes = new Uint8Array(binaryString.length);
            for (var i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            var arrayBuffer = bytes.buffer;

            debugLog(`[AFFO Content] Decoded data: URL for ${fontName} variant ${index + 1} (${arrayBuffer.byteLength} bytes)`);

            // Create FontFace with ArrayBuffer and descriptors
            var fontFace = new FontFace(fontName, arrayBuffer, descriptors);
            document.fonts.add(fontFace);

            return fontFace.load().then(function () {
              debugLog(`[AFFO Content] Custom FontFace API successful for ${fontName} data: URL variant ${index + 1}`);
              return true;
            }).catch(function (e) {
              debugLog(`[AFFO Content] Custom FontFace API failed for ${fontName} data: URL variant ${index + 1}:`, e);
              return false;
            });
          } catch (e) {
            debugLog(`[AFFO Content] Error decoding data: URL for ${fontName} variant ${index + 1}:`, e);
            return Promise.resolve(false);
          }
        }

        // Handle HTTP/HTTPS URLs - download via background script
        var httpFontFormat = fontUrl.toLowerCase().endsWith('.woff2') ? 'WOFF2' : 'WOFF';
        debugLog(`[AFFO Content] Found ${httpFontFormat} HTTP URL ${index + 1}: ${fontUrl}`);

        return browser.runtime.sendMessage({
          type: 'affoFetch',
          url: fontUrl,
          binary: true
        }).then(function (response) {
          if (response && response.ok && response.binary && response.data) {
            var cacheStatus = response.cached ? 'cached' : 'downloaded';
            debugLog(`[AFFO Content] Custom font ${cacheStatus} ${index + 1} successful for ${fontName}`);

            // Convert binary data to ArrayBuffer
            var uint8Array = new Uint8Array(response.data);
            var arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);

            debugLog(`[AFFO Content] Created ArrayBuffer ${index + 1} for ${fontName} (${arrayBuffer.byteLength} bytes)`);

            // Create FontFace with ArrayBuffer and descriptors
            var fontFace = new FontFace(fontName, arrayBuffer, descriptors);
            document.fonts.add(fontFace);

            return fontFace.load().then(function () {
              debugLog(`[AFFO Content] Custom FontFace API successful for ${fontName} variant ${index + 1}`);
              return true;
            }).catch(function (e) {
              debugLog(`[AFFO Content] Custom FontFace API failed for ${fontName} variant ${index + 1}:`, e);
              return false;
            });

          } else {
            debugLog(`[AFFO Content] Custom font download ${index + 1} failed for ${fontUrl}`);
            return false;
          }
        }).catch(function (e) {
          debugLog(`[AFFO Content] Custom font download ${index + 1} exception:`, e);
          return false;
        });
      });

      // Wait for all font variants to load
      return Promise.all(loadPromises).then(function (results) {
        var successCount = results.filter(Boolean).length;
        elementLog(`Loaded ${successCount}/${results.length} custom font variants for ${fontName}`);

        // For x.com with inline apply, trigger style re-application after font loading
        if (shouldUseInlineApply() && successCount > 0) {
          debugLog(`[AFFO Content] Custom font ${fontName} loaded (${successCount} variants), triggering style re-application for x.com`);

          // Check if fonts are actually available in document.fonts
          try {
            document.fonts.ready.then(function () {
              debugLog(`[AFFO Content] document.fonts.ready confirmed for ${fontName}`);

              // Additional check to see if font is loaded
              var testElement = document.createElement('span');
              testElement.style.fontFamily = `"${fontName}", monospace`;
              testElement.style.position = 'absolute';
              testElement.style.left = '-9999px';
              testElement.textContent = 'test';
              document.body.appendChild(testElement);

              var computedFont = window.getComputedStyle(testElement).fontFamily;
              document.body.removeChild(testElement);

              debugLog(`[AFFO Content] Font availability test for ${fontName}: computed font =`, computedFont);

              // Delay to ensure fonts are fully available
              setTimeout(function () {
                try {
                  // Re-trigger inline styles application for the loaded custom font
                  document.dispatchEvent(new CustomEvent('affo-custom-font-loaded', {
                    detail: { fontName: fontName }
                  }));
                } catch (e) {
                  debugLog(`[AFFO Content] Error dispatching custom font loaded event:`, e);
                }
              }, 200);
            });
          } catch (e) {
            debugLog(`[AFFO Content] Error with document.fonts.ready:`, e);
            // Fallback to simple timeout
            setTimeout(function () {
              try {
                document.dispatchEvent(new CustomEvent('affo-custom-font-loaded', {
                  detail: { fontName: fontName }
                }));
              } catch (e) {
                debugLog(`[AFFO Content] Error dispatching custom font loaded event:`, e);
              }
            }, 300);
          }
        }
      });

    } catch (e) {
      debugLog(`[AFFO Content] Custom FontFace API exception for ${fontName}:`, e);
      return Promise.resolve();
    }
  }

  // Parse @font-face blocks in a CSS sheet to map WOFF2 URLs to their unicode ranges
  function extractFontFaceEntries(cssText) {
    var entries = [];
    try {
      var faceRegex = /@font-face\s*{[^}]*}/gi;
      var match;
      while ((match = faceRegex.exec(cssText)) !== null) {
        var block = match[0];
        var urlMatch = block.match(/url\((['"]?)([^'")]+\.woff2[^'")]*)\1\)/i);
        if (!urlMatch) continue;
        var unicodeMatch = block.match(/unicode-range\s*:\s*([^;]+);/i);
        entries.push({
          url: urlMatch[2],
          ranges: parseUnicodeRanges(unicodeMatch ? unicodeMatch[1] : '')
        });
      }
    } catch (e) {
      debugLog('[AFFO Content] Failed to parse font-face entries for unicode ranges:', e);
    }
    return entries;
  }

  // Turn a unicode-range string into numeric ranges
  function parseUnicodeRanges(rangeStr) {
    if (!rangeStr) return [];
    return rangeStr.split(',')
      .map(function (part) { return part.trim(); })
      .filter(Boolean)
      .map(function (part) {
        var cleaned = part.replace(/u\+/i, '');
        if (cleaned.indexOf('?') !== -1 && cleaned.indexOf('-') === -1) {
          var startWildcard = cleaned.replace(/\?/g, '0');
          var endWildcard = cleaned.replace(/\?/g, 'F');
          return [parseInt(startWildcard, 16), parseInt(endWildcard, 16)];
        }
        if (cleaned.indexOf('-') !== -1) {
          var pieces = cleaned.split('-');
          return [parseInt(pieces[0], 16), parseInt(pieces[1], 16)];
        }
        var val = parseInt(cleaned, 16);
        return [val, val];
      })
      .filter(function (pair) { return isFinite(pair[0]) && isFinite(pair[1]); });
  }

  var FONTFACE_SUBSET_SAMPLE_LIMIT = 20000;
  var FONTFACE_MAX_UNIQUE_CODEPOINTS = 2000;
  var FONTFACE_MAX_SUBSET_DOWNLOADS = 16;
  var FONTFACE_MAX_PARALLEL_DOWNLOADS = 4;

  function dedupeUrls(urls) {
    if (!urls || urls.length === 0) return [];
    var seen = new Set();
    var unique = [];
    urls.forEach(function (url) {
      if (!seen.has(url)) {
        seen.add(url);
        unique.push(url);
      }
    });
    return unique;
  }

  function buildUrlToRanges(entries) {
    return entries.reduce(function (map, entry) {
      if (!entry || !entry.url) return map;
      if (!map[entry.url]) map[entry.url] = [];
      if (entry.ranges && entry.ranges.length) {
        map[entry.url] = map[entry.url].concat(entry.ranges);
      }
      return map;
    }, {});
  }

  // Collect a snapshot of code points in the current document to choose subsets
  function collectNeededCodePoints() {
    var needed = new Set();
    try {
      var text = '';
      if (document.body && typeof document.body.innerText === 'string') {
        text = document.body.innerText || '';
      }
      var sample = text.slice(0, FONTFACE_SUBSET_SAMPLE_LIMIT); // avoid huge scans
      for (var i = 0; i < sample.length; i++) {
        needed.add(sample.charCodeAt(i));
        if (FONTFACE_MAX_UNIQUE_CODEPOINTS && needed.size >= FONTFACE_MAX_UNIQUE_CODEPOINTS) {
          break;
        }
      }
      // If nothing was captured (empty pages), bias toward basic Latin so pages still render
      if (needed.size === 0) {
        'Hello'.split('').forEach(function (ch) { needed.add(ch.charCodeAt(0)); });
      }
    } catch (e) {
      debugLog('[AFFO Content] Failed to collect needed code points:', e);
    }
    return needed;
  }

  // Select only the font files whose unicode-range overlaps the page content
  function selectUrlsByUnicodeRange(urls, entries, neededCodePoints, options) {
    var opts = options || {};
    var maxUrls = opts.maxUrls;

    var uniqueUrls = dedupeUrls(urls);
    if (uniqueUrls.length === 0) return [];
    if (!entries || entries.length === 0 || !neededCodePoints || neededCodePoints.size === 0) {
      if (maxUrls && uniqueUrls.length > maxUrls) return uniqueUrls.slice(0, maxUrls);
      return uniqueUrls;
    }

    var urlToRanges = buildUrlToRanges(entries);
    var neededList = Array.from(neededCodePoints);

    var scored = [];

    uniqueUrls.forEach(function (url, index) {
      var ranges = urlToRanges[url];
      if (!ranges || ranges.length === 0) return;

      var score = 0;
      for (var i = 0; i < neededList.length; i++) {
        var cp = neededList[i];
        for (var j = 0; j < ranges.length; j++) {
          var r = ranges[j];
          if (cp >= r[0] && cp <= r[1]) {
            score++;
            break;
          }
        }
      }

      if (score > 0) {
        scored.push({ url: url, score: score, index: index });
      }
    });

    if (scored.length === 0) {
      var latinFallback = uniqueUrls.filter(function (url) { return url.includes('latin'); });
      var fallbackUrls = latinFallback.length > 0 ? latinFallback : uniqueUrls;
      if (maxUrls && fallbackUrls.length > maxUrls) return fallbackUrls.slice(0, maxUrls);
      return fallbackUrls;
    }

    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

    var selectedUrls = scored.map(function (entry) { return entry.url; });
    if (maxUrls && selectedUrls.length > maxUrls) {
      selectedUrls = selectedUrls.slice(0, maxUrls);
    }
    return selectedUrls;
  }

  function runWithConcurrency(items, limit, handler) {
    if (!Array.isArray(items) || items.length === 0) return Promise.resolve([]);
    var results = new Array(items.length);
    var nextIndex = 0;
    var inFlight = 0;
    var maxParallel = Math.max(1, limit || 1);

    return new Promise(function (resolve) {
      function launchNext() {
        if (nextIndex >= items.length && inFlight === 0) {
          resolve(results);
          return;
        }
        while (inFlight < maxParallel && nextIndex < items.length) {
          (function (index) {
            inFlight++;
            Promise.resolve(handler(items[index], index))
              .then(function (result) { results[index] = result; })
              .catch(function () { results[index] = false; })
              .then(function () {
                inFlight--;
                launchNext();
              });
          })(nextIndex++);
        }
      }
      launchNext();
    });
  }

  function tryFontFaceAPI(fontConfig) {
    var fontName = fontConfig.fontName;
    if (!window.FontFace || !document.fonts) {
      debugLog(`[AFFO Content] FontFace API not supported for ${fontName}`);
      return Promise.resolve();
    }

    try {
      // Check if font is already loaded in document.fonts
      var fontAlreadyLoaded = false;
      try {
        document.fonts.forEach(function (fontFace) {
          if (fontFace.family === fontName && fontFace.status === 'loaded') {
            fontAlreadyLoaded = true;
          }
        });
      } catch (e) {
        debugLog(`[AFFO Content] Error checking document.fonts for ${fontName}:`, e);
      }

      if (fontAlreadyLoaded) {
        debugLog(`[AFFO Content] Font ${fontName} already loaded in document.fonts, skipping download`);
        return Promise.resolve();
      }

      debugLog(`[AFFO Content] Downloading WOFF2 font data for ${fontName} via background script`);

      // Lookup css2Url from global cache (populated by popup.js)
      var cachedUrl = getCss2Url(fontName);
      var cssUrl = cachedUrl || buildGoogleFontUrl(fontConfig);
      if (cachedUrl) {
        debugLog(`[AFFO Content] Using cached css2Url for ${fontName}`);
      }

      return browser.runtime.sendMessage({
        type: 'affoFetch',
        url: cssUrl,
        binary: false
      }).then(function (response) {
        if (response && response.ok && !response.binary && response.data) {
          debugLog(`[AFFO Content] Got Google Fonts CSS for ${fontName}`);

          // Parse CSS to extract WOFF2 URLs
          var css = response.data;
          var woff2Matches = css.match(/url\(([^)]+\.woff2[^)]*)\)/g);

          if (woff2Matches && woff2Matches.length > 0) {
            debugLog(`[AFFO Content] Found ${woff2Matches.length} WOFF2 URLs in CSS (different subsets/styles)`);

            // Extract all WOFF2 URLs first
            var woff2Urls = woff2Matches.map(function (match) {
              return match.replace(/url\((['"]?)([^'"]+)\1\)/, '$2');
            });
            var uniqueWoff2Urls = dedupeUrls(woff2Urls);

            // Build unicode-range map per URL so we can mimic browser subset selection
            var fontFaceEntries = extractFontFaceEntries(css);
            var neededCodePoints = collectNeededCodePoints();
            var filteredUrls = selectUrlsByUnicodeRange(uniqueWoff2Urls, fontFaceEntries, neededCodePoints, {
              maxUrls: FONTFACE_MAX_SUBSET_DOWNLOADS
            });

            if (FONTFACE_MAX_SUBSET_DOWNLOADS && uniqueWoff2Urls.length > filteredUrls.length &&
              filteredUrls.length === FONTFACE_MAX_SUBSET_DOWNLOADS) {
              console.warn(`[AFFO Content] Using ${filteredUrls.length}/${uniqueWoff2Urls.length} subsets for ${fontName} (cap ${FONTFACE_MAX_SUBSET_DOWNLOADS})`);
            }

            // Prioritize Latin subsets for faster initial render
            var latinUrls = filteredUrls.filter(function (url) {
              return url.includes('latin') && !url.includes('ext');
            });
            var latinExtUrls = filteredUrls.filter(function (url) {
              return url.includes('latin-ext');
            });
            var otherUrls = filteredUrls.filter(function (url) {
              return !url.includes('latin');
            });

            debugLog(`[AFFO Content] Prioritizing font loading after unicode filtering: ${latinUrls.length} Latin, ${latinExtUrls.length} Latin-ext, ${otherUrls.length} other subsets for ${fontName}`);

            // Load Latin first (most critical), then others in parallel
            var prioritizedUrls = latinUrls.concat(latinExtUrls).concat(otherUrls);

            if (prioritizedUrls.length === 0) {
              debugLog(`[AFFO Content] No WOFF2 URLs selected after unicode filtering for ${fontName}`);
              return Promise.resolve();
            }

            return runWithConcurrency(prioritizedUrls, FONTFACE_MAX_PARALLEL_DOWNLOADS, function (woff2Url, index) {
              debugLog(`[AFFO Content] Downloading WOFF2 ${index + 1}/${prioritizedUrls.length}: ${woff2Url}`);

              return browser.runtime.sendMessage({
                type: 'affoFetch',
                url: woff2Url,
                binary: true
              }).then(function (woff2Response) {
                if (woff2Response && woff2Response.ok && woff2Response.binary && woff2Response.data) {
                  debugLog(`[AFFO Content] WOFF2 download ${index + 1} successful for ${fontName}`);

                  // Convert binary data to ArrayBuffer
                  var uint8Array = new Uint8Array(woff2Response.data);
                  var arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);

                  debugLog(`[AFFO Content] Created ArrayBuffer ${index + 1} for ${fontName} (${arrayBuffer.byteLength} bytes)`);

                  // Create FontFace with ArrayBuffer - load each subset
                  var fontFace = new FontFace(fontName, arrayBuffer);
                  document.fonts.add(fontFace);

                  return fontFace.load().then(function () {
                    debugLog(`[AFFO Content] FontFace API successful for ${fontName} subset ${index + 1}`);
                    return true;
                  }).catch(function (e) {
                    debugLog(`[AFFO Content] FontFace API failed for ${fontName} subset ${index + 1}:`, e);
                    return false;
                  });

                } else {
                  debugLog(`[AFFO Content] WOFF2 download ${index + 1} failed for ${woff2Url}`);
                  return false;
                }
              }).catch(function (e) {
                debugLog(`[AFFO Content] WOFF2 download ${index + 1} exception:`, e);
                return false;
              });
            }).then(function (results) {
              var successCount = results.filter(Boolean).length;
              debugLog(`[AFFO Content] Loaded ${successCount}/${results.length} font subsets for ${fontName}`);
              return results;
            });

          } else {
            debugLog(`[AFFO Content] No WOFF2 URLs found in Google Fonts CSS for ${fontName}`);
            return Promise.resolve();
          }
        } else {
          debugLog(`[AFFO Content] Failed to get Google Fonts CSS for ${fontName}:`, response ? response.error : 'No response');
          return Promise.resolve();
        }
      }).catch(function (e) {
        debugLog(`[AFFO Content] Google Fonts CSS fetch exception for ${fontName}:`, e);
        return Promise.resolve();
      });

    } catch (e) {
      debugLog(`[AFFO Content] FontFace API data URL exception for ${fontName}:`, e);
      return Promise.resolve();
    }
  }

  // Track which font types have been walked on this page to avoid redundant scans
  var elementWalkerCompleted = {};
  var elementWalkerRechecksScheduled = {};

  // Element type detection logic (module-scope so both single and unified walker can use it)
  // computedStyle is passed from the walker to avoid a second getComputedStyle call
  function getElementFontType(element, computedStyle) {
    var tagName = element.tagName.toLowerCase();
    var className = element.className || '';
    var style = element.style.fontFamily || '';

    // Exclude UI elements and form controls
    if (['nav', 'header', 'footer', 'aside', 'figcaption', 'button', 'input', 'select', 'textarea', 'label'].indexOf(tagName) !== -1) return null;

    // Exclude descendants of non-body containers: figcaptions, buttons, guards, article headers, dialogs, Substack comments
    if (element.closest && element.closest('figcaption, button, .no-affo, [data-affo-guard], .post-header, [role="dialog"], .comments-page')) return null;

    // Exclude ARIA landmark roles
    var role = element.getAttribute && element.getAttribute('role');
    if (role && ['navigation', 'banner', 'contentinfo', 'complementary'].indexOf(role) !== -1) return null;

    // Convert className safely for pattern matching
    var classText = (typeof className === 'string' ? className : className.toString()).toLowerCase();

    // Exclude navigation and UI class names
    if (classText && /\b(nav|menu|header|footer|sidebar|toolbar|breadcrumb|caption)\b/i.test(classText)) return null;

    // Exclude syntax highlighting and code blocks
    if (classText && /\b(hljs|token|prettyprint|prettyprinted|sourceCode|wp-block-code|wp-block-preformatted|terminal)\b/.test(classText)) return null;
    if (classText && /\blanguage-/.test(classText)) return null;

    // Exclude small-caps classes
    if (classText && /\b(small-caps|smallcaps|smcp|sc)\b/.test(classText)) return null;

    // Exclude metadata and byline patterns
    if (classText && /\b(byline|author|date|meta)\b/.test(classText)) return null;

    // Exclude widget, ad, and UI chrome patterns
    if (classText && /\b(widget|dropdown|modal|tooltip|advertisement)\b/.test(classText)) return null;

    // Exclude WhatFont overlay elements
    if (classText && /whatfont/.test(classText)) return null;
    var elId = element.id || '';
    if (elId && /whatfont/.test(elId)) return null;

    // Use computed font-family from the style already obtained by the walker
    var computedFontFamily = computedStyle.fontFamily || '';

    // Skip elements using preserved fonts (icon fonts, etc.)
    var computedParts = null;
    if (preservedFonts.size > 0 && computedFontFamily) {
      computedParts = computedFontFamily.split(',').map(function (s) { return s.trim().toLowerCase().replace(/['"]/g, ''); });
      for (var pi = 0; pi < computedParts.length; pi++) {
        if (preservedFonts.has(computedParts[pi])) return null;
      }
    }

    var styleText = style.toLowerCase();
    var computedText = computedFontFamily.toLowerCase();

    // Check for monospace keywords
    if (/\b(monospace|mono|code)\b/.test(classText) ||
      /\b(monospace|mono)\b/.test(styleText)) return 'mono';

    // Check for sans-serif as complete phrase first
    if (/\bsans-serif\b/.test(classText) || /\bsans-serif\b/.test(styleText)) return 'sans';

    // Check for standalone sans (but not sans-serif)
    if (/\bsans\b(?!-serif)/.test(classText) || /\bsans\b(?!-serif)/.test(styleText)) return 'sans';

    // Check known font names FIRST (before generic keywords) so specific fonts take priority
    // e.g. "Spectral", serif, ..., sans-serif → Spectral is known serif, don't misclassify as sans
    // Reuse computedParts if already parsed for preserved fonts check, otherwise parse now
    if (!computedParts) computedParts = computedFontFamily.split(',').map(function (s) { return s.trim().toLowerCase().replace(/['"]/g, ''); });
    for (var i = 0; i < computedParts.length; i++) {
      if (knownSerifFonts.has(computedParts[i])) {
        return 'serif';
      }
      if (knownSansFonts.has(computedParts[i])) {
        return 'sans';
      }
    }

    // Fall back to generic keywords in computed font-family
    if (/\bsans-serif\b/.test(computedText)) {
      return 'sans';
    }

    if (/\bserif\b/.test(computedText.replace('sans-serif', ''))) {
      return 'serif';
    }

    // Check for serif (but not sans-serif) in class names and inline styles
    if (/\bserif\b/.test(classText.replace('sans-serif', '')) ||
      /\bserif\b/.test(styleText.replace('sans-serif', ''))) {
      return 'serif';
    }

    // Tag-based detection for monospace
    if (['code', 'pre', 'kbd', 'samp', 'tt'].indexOf(tagName) !== -1) return 'mono';

    // No explicit indicators found - don't mark this element
    return null;
  }

  // Track last walk element count (used to cap rechecks on large pages)
  var lastWalkElementCount = 0;
  // Threshold above which we skip timed rechecks (only keep document.fonts.ready)
  var LARGE_PAGE_ELEMENT_THRESHOLD = 5000;
  // Elements to process per chunk before yielding to main thread
  // Increased from 500 to 4000 for faster completion on heavy pages like Forbes
  var WALKER_CHUNK_SIZE = 4000;

  // Schedule delayed rechecks after initial walker completes
  // Catches lazy-loaded content and elements that appear after fonts finish loading
  function scheduleElementWalkerRechecks(fontTypes) {
    // Filter to types not already scheduled
    var toSchedule = fontTypes.filter(function (ft) {
      return !elementWalkerRechecksScheduled[ft];
    });
    if (toSchedule.length === 0) return;
    toSchedule.forEach(function (ft) { elementWalkerRechecksScheduled[ft] = true; });

    function recheck() {
      toSchedule.forEach(function (ft) { elementWalkerCompleted[ft] = false; });
      runElementWalkerAll(toSchedule);
    }

    // On large pages, skip timed rechecks — only recheck after fonts finish loading
    if (lastWalkElementCount < LARGE_PAGE_ELEMENT_THRESHOLD) {
      setTimeout(recheck, 700);
      setTimeout(recheck, 1600);
    } else {
      debugLog('[AFFO Content] Large page (' + lastWalkElementCount + ' elements), skipping timed rechecks');
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(recheck).catch(function () { });
    }
  }

  // Unified element walker — classifies all requested font types in a single DOM pass
  // Uses chunked processing to avoid blocking the main thread on large pages
  function runElementWalkerAll(fontTypes) {
    try {
      // Filter to types not already completed
      var typesToWalk = fontTypes.filter(function (ft) {
        return !elementWalkerCompleted[ft];
      });
      if (typesToWalk.length === 0) {
        debugLog('[AFFO Content] All requested font types already walked, skipping');
        return;
      }

      var typeSet = {};
      typesToWalk.forEach(function (ft) { typeSet[ft] = true; });

      console.log('[AFFO Content] Starting unified element walker for: ' + typesToWalk.join(', '));
      var startTime = performance.now();

      // Don't clear markers upfront — update them incrementally during the walk.
      // This prevents the "revert flash" where markers are cleared synchronously
      // but re-applied chunk-by-chunk with setTimeout(0) delays in between.

      // Walk all text-containing elements
      // Visibility checks moved to main loop (merged with getElementFontType's getComputedStyle)
      var walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: function (node) {
            if (!node.textContent || node.textContent.trim().length === 0) return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      var totalElements = 0;
      var markedCounts = {};
      typesToWalk.forEach(function (ft) { markedCounts[ft] = 0; });

      function processChunk() {
        var chunkCount = 0;
        var element;

        while ((element = walker.nextNode()) && chunkCount < WALKER_CHUNK_SIZE) {
          // Single getComputedStyle call per element — used for both visibility check and font type detection
          var cs;
          if (element.tagName !== 'BODY') {
            try {
              cs = window.getComputedStyle(element);
              if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            } catch (_) { continue; }
          } else {
            try { cs = window.getComputedStyle(element); } catch (_) { continue; }
          }

          totalElements++;
          chunkCount++;
          var detectedType = getElementFontType(element, cs);
          var currentMarker = element.getAttribute('data-affo-font-type');

          // Update marker: set if type detected and in requested set, remove if not
          if (detectedType && typeSet[detectedType]) {
            if (currentMarker !== detectedType) {
              element.setAttribute('data-affo-font-type', detectedType);
            }
            markedCounts[detectedType]++;
          } else if (currentMarker && typeSet[currentMarker]) {
            // Element had a marker for one of the types we're walking, but shouldn't anymore
            element.removeAttribute('data-affo-font-type');
          }
        }

        if (element) {
          // More elements to process — yield to main thread then continue
          setTimeout(processChunk, 0);
        } else {
          // Walker finished
          finishWalk();
        }
      }

      function finishWalk() {
        lastWalkElementCount = totalElements;
        var endTime = performance.now();
        var duration = (endTime - startTime).toFixed(2);
        var summary = typesToWalk.map(function (ft) { return ft + ':' + markedCounts[ft]; }).join(', ');
        console.log('[AFFO Content] Unified walker completed in ' + duration + 'ms: ' + totalElements + ' elements, marked ' + summary);

        // Mark all walked types as completed
        typesToWalk.forEach(function (ft) {
          elementWalkerCompleted[ft] = true;
        });

        // Schedule delayed rechecks for lazy-loaded content
        scheduleElementWalkerRechecks(typesToWalk);
      }

      processChunk();
    } catch (e) {
      console.error('[AFFO Content] Unified element walker failed:', e);
    }
  }

  // Single-type wrapper (for runtime messages and individual type calls)
  function runElementWalker(fontType) {
    runElementWalkerAll([fontType]);
  }

  // Helper function to reapply fonts from a given entry (used by storage listener and page load)
  function reapplyStoredFontsFromEntry(entry) {
    try {
      ['body', 'serif', 'sans', 'mono'].forEach(function (fontType) {
        var fontConfig = entry[fontType];
        if (fontConfig && (fontConfig.fontName || fontConfig.fontSize || fontConfig.fontWeight || fontConfig.lineHeight || fontConfig.fontColor)) {
          debugLog(`[AFFO Content] Reapplying ${fontType} font from storage change:`, fontConfig.fontName);

          // Run element walker for Third Man In mode
          if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
            runElementWalker(fontType);
          }

          // Inject CSS immediately (before font loads) to prevent flash of original font
          var lines = [];
          if (fontConfig.fontFaceRule) {
            lines.push(fontConfig.fontFaceRule);
          }
          lines = lines.concat(generateCSSLines(fontConfig, fontType));
          var css = lines.join('\n');

          if (css) {
            if (shouldUseInlineApply()) {
              applyInlineStyles(fontConfig, fontType);
            } else {
              var styleId = 'a-font-face-off-style-' + fontType;
              var existingStyle = document.getElementById(styleId);
              if (existingStyle) existingStyle.remove();

              var styleEl = document.createElement('style');
              styleEl.id = styleId;
              styleEl.textContent = css;
              document.head.appendChild(styleEl);
              debugLog(`[AFFO Content] Applied CSS for ${fontType} from storage change:`, css);
            }
          }

          // Eagerly inject Google Fonts <link> without waiting for loadFont's async chain
          if (fontConfig.fontName && !fontConfig.fontFaceRule && !shouldUseFontFaceOnly()) {
            try {
              var linkId = 'a-font-face-off-style-' + fontConfig.fontName.replace(/\s+/g, '-').toLowerCase() + '-link';
              if (!document.getElementById(linkId)) {
                ensureGoogleFontsPreconnect();
                var cachedUrl = getCss2Url(fontConfig.fontName);
                var href = cachedUrl || buildGoogleFontUrl(fontConfig);
                var link = document.createElement('link');
                link.id = linkId;
                link.rel = 'stylesheet';
                link.href = href;
                document.head.appendChild(link);
                debugLog(`[AFFO Content] Early Google Font link for ${fontConfig.fontName}: ${href}`);
              }
            } catch (_) { }
          }

          // Load font file (handles custom fonts, FontFace-only domains, etc.)
          loadFont(fontConfig, fontType).catch(function (e) {
            console.warn(`[AFFO Content] Error loading font after storage change:`, e);
          });
        }
      });
    } catch (e) {
      console.error('[AFFO Content] Error reapplying fonts from storage change:', e);
    }
  }

  // Listen for custom font loaded events to re-apply styles on x.com
  try {
    document.addEventListener('affo-custom-font-loaded', function (event) {
      debugLog(`[AFFO Content] Custom font loaded event received:`, event.detail.fontName);

      // Re-apply styles for all active font types after custom font loads
      browser.storage.local.get('affoApplyMap').then(function (data) {
        var map = data && data.affoApplyMap ? data.affoApplyMap : {};
        var entry = map[currentOrigin];
        if (entry) {
          ['body', 'serif', 'sans', 'mono'].forEach(function (fontType) {
            var fontConfig = entry[fontType];
            if (fontConfig && fontConfig.fontName === event.detail.fontName) {
              elementLog(`Re-applying ${fontType} styles after custom font ${event.detail.fontName} loaded`);

              if (shouldUseInlineApply()) {
                // For Third Man In mode, run element walker first if needed
                if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
                  runElementWalker(fontType);
                }
                applyInlineStyles(fontConfig, fontType);
              }
            }
          });
        }
      }).catch(function (e) {
        debugLog(`[AFFO Content] Error re-applying styles after custom font load:`, e);
      });
    });
  } catch (e) {
    debugLog(`[AFFO Content] Error setting up custom font loaded listener:`, e);
  }

  // Initialize: Load consolidated storage and reapply stored fonts
  try {
    if (!window || !window.location || !/^https?:/.test(location.protocol)) return;
    var origin = location.hostname;

    browser.storage.local.get(['affoApplyMap', 'affoSubstackRoulette', 'affoSubstackRouletteSerif', 'affoSubstackRouletteSans', 'affoFavorites', 'affoAggressiveDomains']).then(function (data) {
      // Ensure aggressiveDomains is populated before any reapply logic runs
      // (the earlier fire-and-forget load at script top may not have resolved yet)
      if (Array.isArray(data.affoAggressiveDomains)) {
        aggressiveDomains = data.affoAggressiveDomains;
      }
      var map = data && data.affoApplyMap ? data.affoApplyMap : {};
      var entry = map[origin];
      if (!entry) {
        // Clean up all stale styles if no entry exists
        ['a-font-face-off-style-body', 'a-font-face-off-style-serif', 'a-font-face-off-style-sans', 'a-font-face-off-style-mono'].forEach(function (id) { try { var n = document.getElementById(id); if (n) n.remove(); } catch (e) { } });

        // --- Substack Roulette ---
        var rouletteEnabled = data.affoSubstackRoulette !== false; // default true
        var rouletteSerif = Array.isArray(data.affoSubstackRouletteSerif) ? data.affoSubstackRouletteSerif : [];
        var rouletteSans = Array.isArray(data.affoSubstackRouletteSans) ? data.affoSubstackRouletteSans : [];
        var favorites = data.affoFavorites || {};

        if (rouletteEnabled && rouletteSerif.length >= 1 && rouletteSans.length >= 1) {
          function trySubstackRoulette() {
            if (!getIsSubstack()) return;

            // Pick random serif and sans from checked favorites
            var serifName = rouletteSerif[Math.floor(Math.random() * rouletteSerif.length)];
            var sansName = rouletteSans[Math.floor(Math.random() * rouletteSans.length)];
            var serifConfig = favorites[serifName];
            var sansConfig = favorites[sansName];

            if (!serifConfig || !serifConfig.fontName) return;
            if (!sansConfig || !sansConfig.fontName) return;

            debugLog('[AFFO Content] Substack Roulette: applying serif=' + serifConfig.fontName + ', sans=' + sansConfig.fontName);

            // Apply via existing TMI path
            reapplyStoredFontsFromEntry({ serif: serifConfig, sans: sansConfig });

            // Set up SPA navigation hooks for roulette TMI fonts
            if (!shouldUseInlineApply()) {
              function reapplyRouletteAfterNavigation() {
                try {
                  ['serif', 'sans'].forEach(function (ft) {
                    elementWalkerCompleted[ft] = false;
                    elementWalkerRechecksScheduled[ft] = false;
                  });
                  runElementWalkerAll(['serif', 'sans']);
                } catch (_) { }
              }
              registerSpaHandler(reapplyRouletteAfterNavigation);
            }
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', trySubstackRoulette);
          } else {
            setTimeout(trySubstackRoulette, 100);
          }
        }

        return;
      }

      // Content script handles cleanup AND reapplies stored fonts on page load
      debugLog(`[AFFO Content] Reapplying stored fonts for origin: ${origin}`, entry);

      // Remove style elements for fonts that are not applied
      if (!entry.body) {
        try { var s3 = document.getElementById('a-font-face-off-style-body'); if (s3) s3.remove(); } catch (e) { }
      }
      if (!entry.serif) {
        try { var s = document.getElementById('a-font-face-off-style-serif'); if (s) s.remove(); } catch (e) { }
      }
      if (!entry.sans) {
        try { var s2 = document.getElementById('a-font-face-off-style-sans'); if (s2) s2.remove(); } catch (e) { }
      }
      if (!entry.mono) {
        try { var s4 = document.getElementById('a-font-face-off-style-mono'); if (s4) s4.remove(); } catch (e) { }
      }

      // Reapply stored fonts on page load - wait for DOM to be ready
      function reapplyStoredFonts() {
        try {
          ['body', 'serif', 'sans', 'mono'].forEach(function (fontType) {
            var fontConfig = entry[fontType];
            if (fontConfig && (fontConfig.fontName || fontConfig.fontSize || fontConfig.fontWeight || fontConfig.lineHeight || fontConfig.fontColor)) {
              debugLog(`[AFFO Content] Reapplying ${fontType} font:`, fontConfig.fontName);

              // Run element walker for Third Man In mode
              if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
                runElementWalker(fontType);
              }

              // Inject CSS immediately (before font loads) to prevent flash of original font.
              // The browser will show a fallback until the font file loads, then swap in.
              var lines = [];
              if (fontConfig.fontFaceRule) {
                lines.push(fontConfig.fontFaceRule);
              }
              lines = lines.concat(generateCSSLines(fontConfig, fontType));
              var css = lines.join('\n');

              if (css) {
                if (shouldUseInlineApply()) {
                  applyInlineStyles(fontConfig, fontType);
                } else {
                  var styleId = 'a-font-face-off-style-' + fontType;
                  var existingStyle = document.getElementById(styleId);
                  if (existingStyle) existingStyle.remove();

                  var styleEl = document.createElement('style');
                  styleEl.id = styleId;
                  styleEl.textContent = css;
                  document.head.appendChild(styleEl);
                  elementLog(`Applied CSS for ${fontType}:`, css);
                }
              }

              // Eagerly inject Google Fonts <link> without waiting for loadFont's async chain.
              // Domain-stored configs never have fontFaceRule, so if fontName is set it's
              // likely a Google font. loadGoogleFontCSS checks for existing link and skips.
              if (fontConfig.fontName && !fontConfig.fontFaceRule && !shouldUseFontFaceOnly()) {
                try {
                  var linkId = 'a-font-face-off-style-' + fontConfig.fontName.replace(/\s+/g, '-').toLowerCase() + '-link';
                  if (!document.getElementById(linkId)) {
                    ensureGoogleFontsPreconnect();
                    var cachedUrl = getCss2Url(fontConfig.fontName);
                    var href = cachedUrl || buildGoogleFontUrl(fontConfig);
                    var link = document.createElement('link');
                    link.id = linkId;
                    link.rel = 'stylesheet';
                    link.href = href;
                    document.head.appendChild(link);
                    debugLog(`[AFFO Content] Early Google Font link for ${fontConfig.fontName}: ${href}`);
                  }
                } catch (_) { }
              }

              // Load font file (handles custom fonts, FontFace-only domains, etc.)
              loadFont(fontConfig, fontType).catch(function (e) {
                console.warn(`[AFFO Content] Error loading font on page init:`, e);
              });
            }
          });
        } catch (e) {
          console.error('[AFFO Content] Error reapplying fonts:', e);
        }
      }

      // Reapply immediately — content script runs at document_end so DOM is already parsed.
      // No delay needed; earlier injection reduces flash of original fonts.
      reapplyStoredFonts();

      // Set up SPA navigation hooks for normal TMI mode (non-inline-apply domains)
      // On SPA nav, reset walker completion flags so TMI elements get re-marked
      var hasTmiEntries = entry.serif || entry.sans || entry.mono;
      if (hasTmiEntries && !shouldUseInlineApply()) {
        function reapplyTmiAfterNavigation() {
          try {
            var activeTmiTypes = ['serif', 'sans', 'mono'].filter(function (ft) { return !!entry[ft]; });
            activeTmiTypes.forEach(function (ft) {
              elementWalkerCompleted[ft] = false;
              elementWalkerRechecksScheduled[ft] = false;
            });
            runElementWalkerAll(activeTmiTypes);
          } catch (_) { }
        }
        registerSpaHandler(reapplyTmiAfterNavigation);
      }
    }).catch(function () { });
  } catch (e) { }

  // Storage change listener - only handles cleanup
  try {
    browser.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes.affoApplyMap) return;
      try {
        var origin = location.hostname;
        var oldMap = changes.affoApplyMap.oldValue || {};
        var newMap = changes.affoApplyMap.newValue || {};
        var oldEntry = oldMap[origin];
        var entry = newMap[origin];

        // Skip if this origin's config didn't actually change
        if (JSON.stringify(oldEntry) === JSON.stringify(entry)) {
          debugLog(`[AFFO Content] Storage changed but origin ${origin} config unchanged, skipping`);
          return;
        }

        debugLog(`[AFFO Content] Storage changed for origin ${origin}`);

        // Remove all existing styles
        ['a-font-face-off-style-body', 'a-font-face-off-style-serif', 'a-font-face-off-style-sans', 'a-font-face-off-style-mono'].forEach(function (id) {
          try {
            var n = document.getElementById(id);
            if (n) {
              debugLog(`[AFFO Content] Removing existing style element:`, id);
              n.remove();
            }
          } catch (e) { }
        });

        // Apply fonts when storage changes (both immediate apply and reload persistence)
        if (entry) {
          debugLog(`[AFFO Content] Entry found - reapplying fonts:`, entry);
          reapplyStoredFontsFromEntry(entry);
        } else {
          debugLog(`[AFFO Content] No entry found - all fonts should be removed`);
        }
      } catch (e) {
        console.error(`[AFFO Content] Error in storage change handler:`, e);
      }
    });
  } catch (e) {
    console.error(`[AFFO Content] Error setting up storage listener:`, e);
  }

  // Message listener - handles cleanup, fonts applied by popup insertCSS
  try {
    browser.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (message.type === 'affoFilterFontSubsets') {
        try {
          var cssText = typeof message.cssText === 'string' ? message.cssText : '';
          var urls = Array.isArray(message.urls) ? message.urls.filter(function (url) { return typeof url === 'string'; }) : [];
          var entries = extractFontFaceEntries(cssText);
          var neededCodePoints = collectNeededCodePoints();
          var maxUrls = (typeof message.maxUrls === 'number') ? message.maxUrls : undefined;
          var filteredUrls = selectUrlsByUnicodeRange(urls, entries, neededCodePoints, { maxUrls: maxUrls });
          sendResponse({ ok: true, urls: filteredUrls, total: urls.length });
        } catch (error) {
          console.error('[AFFO Content] Error filtering font subsets:', error);
          sendResponse({ ok: false, error: error.message });
        }
      } else if (message.type === 'applyFonts') {
        // All font application is now handled by popup insertCSS
        debugLog('Content script received applyFonts message - fonts applied by popup insertCSS');
        sendResponse({ success: true });
      } else if (message.type === 'resetFonts') {
        try {
          // Remove the font style element for this panel
          const styleId = 'a-font-face-off-style-' + message.panelId;
          const styleElement = document.getElementById(styleId);
          if (styleElement) {
            styleElement.remove();
            debugLog('Removed font styling for panel:', message.panelId);
          }
          sendResponse({ success: true });
        } catch (error) {
          console.error('Error resetting fonts:', error);
          sendResponse({ success: false, error: error.message });
        }
      } else if (message.type === 'runElementWalker') {
        try {
          var ft = message.fontType;
          if (ft === 'serif' || ft === 'sans' || ft === 'mono') {
            elementWalkerCompleted[ft] = false;
            runElementWalker(ft);
            var marked = document.querySelectorAll('[data-affo-font-type="' + ft + '"]');
            sendResponse({ success: true, markedCount: marked.length });
          } else {
            sendResponse({ success: false, error: 'Invalid fontType: ' + ft });
          }
        } catch (error) {
          console.error('[AFFO Content] Error running element walker:', error);
          sendResponse({ success: false, error: error.message });
        }
      } else if (message.action === 'restoreOriginal') {
        try {
          // Remove all A Font Face-off CSS style elements
          ['a-font-face-off-style-body', 'a-font-face-off-style-serif', 'a-font-face-off-style-sans', 'a-font-face-off-style-mono'].forEach(function (id) {
            try {
              var element = document.getElementById(id);
              if (element) element.remove();
            } catch (e) { }
          });

          // Remove Google Fonts links efficiently - check for known patterns first
          try {
            var allLinks = document.getElementsByTagName('link');
            for (var i = allLinks.length - 1; i >= 0; i--) {
              var link = allLinks[i];
              if (link.id && link.id.indexOf('a-font-face-off-style-') === 0 && link.id.indexOf('-link') > 0) {
                link.remove();
              }
            }
          } catch (e) { }

          // Remove custom font @font-face style elements efficiently
          try {
            var allStyles = document.getElementsByTagName('style');
            for (var j = allStyles.length - 1; j >= 0; j--) {
              var style = allStyles[j];
              if (style.id && style.id.indexOf('affo-') === 0 && style.id.indexOf('-font') > 0) {
                style.remove();
              }
            }
          } catch (e) { }

          // Remove any Third Man In data attributes
          try {
            document.querySelectorAll('[data-affo-font-type]').forEach(function (el) {
              el.removeAttribute('data-affo-font-type');
            });
          } catch (e) { }

          debugLog('Restored original page fonts');
          sendResponse({ success: true });
        } catch (error) {
          console.error('Error restoring original:', error);
          sendResponse({ success: false, error: error.message });
        }
      }
    });
  } catch (e) {
    console.error(`[AFFO Content] Error setting up message listener:`, e);
  }

})();
