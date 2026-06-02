/* global AFFOMessaging, AFFOFontFaceUtils */
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
  var CONTENT_MESSAGING_UNAVAILABLE_MESSAGE = 'Extension messaging is unavailable. Reload the page and try again.';

  function debugLog() {
    if (AFFO_DEBUG) console.log.apply(console, arguments);
  }
  function debugWarn() {
    if (AFFO_DEBUG) console.warn.apply(console, arguments);
  }
  function elementLog() { debugLog.apply(null, arguments); }
  function getAffoNow() {
    try {
      if (typeof performance !== 'undefined' && performance.now) {
        return performance.now();
      }
    } catch (_) { }
    return Date.now();
  }
  function formatAffoMs(ms) {
    return Number(ms || 0).toFixed(1) + 'ms';
  }
  function createAffoTimer(label) {
    if (!AFFO_DEBUG) {
      return {
        mark: function () { },
        end: function () { },
        elapsed: function () { return 0; }
      };
    }
    var start = getAffoNow();
    var last = start;
    return {
      mark: function (step, extra) {
        if (!AFFO_DEBUG) return;
        var now = getAffoNow();
        debugLog('[AFFO Content] Timing ' + label + ' ' + step + ': +' +
          formatAffoMs(now - last) + ' (' + formatAffoMs(now - start) + ' total)' +
          (extra ? ' ' + extra : ''));
        last = now;
      },
      end: function (extra) {
        if (!AFFO_DEBUG) return;
        var now = getAffoNow();
        debugLog('[AFFO Content] Timing ' + label + ' done: ' +
          formatAffoMs(now - start) + (extra ? ' ' + extra : ''));
        last = now;
      },
      elapsed: function () {
        return getAffoNow() - start;
      }
    };
  }
  function sendBackgroundMessage(message, options) {
    return AFFOMessaging.sendRuntimeMessage(browser, message, Object.assign({
      retryMs: 1500,
      retryDelayMs: 100,
      noReceiverMessage: CONTENT_MESSAGING_UNAVAILABLE_MESSAGE
    }, options || {}));
  }

  // Shared inline-apply infrastructure — single observer + single polling timer for all font types
  var inlineConfigs = {}; // fontType → { cssPropsObject, inlineEffectiveWeight, expiresAt }
  var sharedInlineTimers = []; // shared timer IDs (monitoring interval, switch timer, etc.)
  var sharedInlineCleanupTimer = null; // final teardown timer for inline observer/config lifecycle
  var sharedInlineLastActivityAt = 0; // last apply or meaningful content addition
  var inlineObserverWanted = false; // true while the inline consumer wants the shared DOM observer (reset after the inline monitoring window ends)
  var observedTmiCssTypes = {}; // fontType → true for non-inline TMI types needing re-walk on DOM mutations
  var fontSizeScaleConfigs = {}; // fontType → font config with fontSizeScale
  // Unified DOM-mutation observer shared by all mutation-driven consumers
  // (inline apply, non-inline TMI CSS marking, font-size scaling). Replaces the
  // three independent full-document subtree observers that previously each
  // re-processed every mutation batch.
  var sharedDomObserver = null;
  var sharedDomDebounceTimer = null;
  var pendingMeaningfulRoots = [];
  var styleOrderChaserObserver = null; // keeps AFFO styles last in non-aggressive mode
  var styleOrderChaserMoving = false;
  var lastReappliedEntry = null; // resolved configs from the most recent page apply
  // Native Substack Roulette intentionally applies only its reading-text pair.
  var SUBSTACK_ROULETTE_CSS_TARGETS = ['serif', 'sans'];

  // Inline observer thresholds: only reapply on meaningful content additions
  var INLINE_REAPPLY_DEBOUNCE_MS = 250;
  var INLINE_POLLING_QUIET_STOP_MS = 45000;
  var INLINE_POLLING_TOTAL_MS = 180000;
  var INLINE_MEANINGFUL_MIN_TEXT = 10;
  var INLINE_MEANINGFUL_MIN_CHILDREN = 1;
  var INLINE_MEANINGFUL_IGNORE_TAGS = {
    SCRIPT: true,
    STYLE: true,
    LINK: true,
    META: true,
    NOSCRIPT: true,
    TEMPLATE: true
  };
  var INTERACTIVE_SUBTREE_ROOT_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';
  var DUPLICATE_ENTRY_REAPPLY_SUPPRESS_MS = 1000;
  var lastEntryReapplySignature = '';
  var lastEntryReapplyStartedAt = 0;

  function getEntryReapplySignature(entry) {
    try {
      return JSON.stringify(entry || {});
    } catch (_) {
      return '';
    }
  }

  function shouldSkipDuplicateEntryReapply(entry, source) {
    var signature = getEntryReapplySignature(entry);
    if (!signature) return false;

    var now = Date.now();
    if (signature === lastEntryReapplySignature &&
      now - lastEntryReapplyStartedAt < DUPLICATE_ENTRY_REAPPLY_SUPPRESS_MS) {
      debugLog(`[AFFO Content] Skipping duplicate ${source || 'entry'} reapply within ${DUPLICATE_ENTRY_REAPPLY_SUPPRESS_MS}ms`);
      return true;
    }

    lastEntryReapplySignature = signature;
    lastEntryReapplyStartedAt = now;
    return false;
  }

  function hasMeaningfulFontConfig(fontConfig) {
    return AFFOContentSroulette.hasMeaningfulFontConfig(fontConfig);
  }

  function hasSrouletteIntent(entry) {
    return AFFOSroulette.hasIntent(entry);
  }

  function materializeSrouletteEntry(entry, data) {
    return AFFOContentSroulette.materializeEntry(entry, data, {
      log: debugLog
    });
  }

  function isResolvedSrouletteCssTarget(entry, target) {
    return AFFOContentSroulette.isResolvedCssTarget(entry, target);
  }

  function requestSrouletteCssRemoval(targets) {
    AFFOContentSroulette.requestCssRemoval(targets);
  }

  function requestSrouletteCssInsert(target, css) {
    AFFOContentSroulette.requestCssInsert(target, css, { log: debugLog });
  }

  function syncSrouletteCssTrackingForEntry(entry) {
    AFFOContentSroulette.syncCssTrackingForEntry(entry);
  }

  function resolveSrouletteEntry(entry, data) {
    return AFFOContentSroulette.resolveEntry(entry, data, {
      log: debugLog
    });
  }

  function getObservedTmiCssTypes() {
    return ['serif', 'sans', 'mono'].filter(function (ft) { return !!observedTmiCssTypes[ft]; });
  }

  function clearObservedTmiCssTypes() {
    observedTmiCssTypes = {};
  }

  function refreshSharedTmiCssObserver() {
    if (getObservedTmiCssTypes().length > 0) {
      ensureSharedTmiCssObserver();
    } else {
      cleanupSharedTmiCssObserver();
    }
  }

  function syncObservedTmiCssTypesFromEntry(entry) {
    if (shouldUseInlineApply()) {
      clearObservedTmiCssTypes();
      refreshSharedTmiCssObserver();
      return;
    }
    ['serif', 'sans', 'mono'].forEach(function (ft) {
      if (entry && hasMeaningfulFontConfig(entry[ft])) {
        observedTmiCssTypes[ft] = true;
      } else {
        delete observedTmiCssTypes[ft];
      }
    });
    refreshSharedTmiCssObserver();
  }

  function resetWalkerForTypes(fontTypes) {
    fontTypes.forEach(function (ft) {
      elementWalkerCompleted[ft] = false;
      elementWalkerRechecksScheduled[ft] = false;
      delete elementWalkerInFlight[ft];
    });
  }

  function rewalkTmiTypes(fontTypes, afterWalk) {
    if (!fontTypes || fontTypes.length === 0) return;
    resetWalkerForTypes(fontTypes);
    runElementWalkerAll(fontTypes).then(function () {
      if (afterWalk) afterWalk();
    }).catch(function () {
      if (afterWalk) afterWalk();
    });
  }

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
        // Merge user-defined fonts with hardcoded defaults (don't replace)
        opt.affoKnownSerif.forEach(function (s) { knownSerifFonts.add(String(s || '').toLowerCase().trim()); });
      }
      if (Array.isArray(opt.affoKnownSans)) {
        opt.affoKnownSans.forEach(function (s) { knownSansFonts.add(String(s || '').toLowerCase().trim()); });
      }
      if (Array.isArray(opt.affoPreservedFonts)) {
        preservedFonts = new Set(opt.affoPreservedFonts.map(function (s) { return String(s || '').toLowerCase().trim(); }));
      }
      debugLog('[AFFO Content] Loaded known fonts - Serif:', knownSerifFonts, 'Sans:', knownSansFonts, 'Preserved:', preservedFonts);
    }).catch(function () { });
  } catch (_) { }

  // Load FontFace-only domains, inline apply domains, aggressive domains, wait-for-it
  // domains, and ignore-comments domains from storage.
  var aggressiveDomains = [];
  var waitForItDomains = [];
  var ignoreCommentsDomains = [];
  var substackRouletteBeigeDisabledDomains = [];
  var pendingSubstackRoulette = null;
  var substackRouletteActive = false;
  try {
    browser.storage.local.get(['affoFontFaceOnlyDomains', 'affoInlineApplyDomains', 'affoAggressiveDomains', 'affoWaitForItDomains', 'affoIgnoreCommentsDomains', 'affoSubstackRouletteBeigeDisabledDomains']).then(function (data) {
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
      if (Array.isArray(data.affoWaitForItDomains)) {
        waitForItDomains = data.affoWaitForItDomains;
        debugLog(`[AFFO Content] Wait For It domains:`, waitForItDomains);
      }
      if (Array.isArray(data.affoIgnoreCommentsDomains)) {
        ignoreCommentsDomains = data.affoIgnoreCommentsDomains;
        debugLog(`[AFFO Content] Ignore comments domains:`, ignoreCommentsDomains);
      }
      if (Array.isArray(data.affoSubstackRouletteBeigeDisabledDomains)) {
        substackRouletteBeigeDisabledDomains = data.affoSubstackRouletteBeigeDisabledDomains;
        debugLog(`[AFFO Content] Substack Roulette beige disabled domains:`, substackRouletteBeigeDisabledDomains);
      }
    }).catch(function () { });
  } catch (e) { }

  // Eagerly start loading custom font definitions. Google css2 URLs are
  // resolved on demand through the background runtime resolver.
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

  function shouldIgnoreComments() {
    return ignoreCommentsDomains.includes(currentOrigin);
  }

  function getCommentExcludeSelector() {
    return shouldIgnoreComments() ? ':not(.comments-page):not(.comments-page *)' : '';
  }

  function getPostHeaderExcludeSelector() {
    return ':not(.post-header):not(.post-header *)';
  }

  var ARTICLE_DECK_HINTS = ['summary', 'subtitle', 'dek', 'deck', 'standfirst', 'subheadline', 'excerpt'];
  var ARTICLE_DECK_ATTRS = ['id', 'class', 'data-testid', 'itemprop', 'name'];
  var ARTICLE_DECK_STRUCTURAL_SELECTORS = ['#fullBleedHeaderContent header p'];

  function getArticleDeckSelector() {
    var hintSelectors = [];
    ARTICLE_DECK_ATTRS.forEach(function (attr) {
      ARTICLE_DECK_HINTS.forEach(function (hint) {
        hintSelectors.push('[' + attr + '*="' + hint + '" i]');
      });
    });
    var hintedDeckSelector = 'article header :is(p, div):is(' + hintSelectors.join(', ') + ')';
    return ':is(' + [hintedDeckSelector].concat(ARTICLE_DECK_STRUCTURAL_SELECTORS).join(', ') + ')';
  }

  function getArticleDeckExcludeSelector() {
    var selector = getArticleDeckSelector();
    return ':not(' + selector + '):not(' + selector + ' *)';
  }

  var DROP_CAP_MATCH_SELECTOR = [
    '[style*="var(--drop-cap" i]',
    '[style*="initial-letter" i]',
    '[class*="drop-cap" i]',
    '[class*="dropcap" i]',
    '[class*="drop_cap" i]',
    '[data-drop-cap]',
    '[data-dropcap]',
    '[data-testid*="drop-cap" i]',
    '[data-testid*="dropcap" i]'
  ].join(', ');
  var DROP_CAP_SELECTOR = ':is(' + DROP_CAP_MATCH_SELECTOR + ')';
  var DROP_CAP_EXCLUDE = ':not(' + DROP_CAP_SELECTOR + '):not(' + DROP_CAP_SELECTOR + ' *)';
  var HEADING_SELECTOR = ':is(h1, h2, h3, h4, h5, h6)';
  var HEADING_TREE_EXCLUDE = ':not(' + HEADING_SELECTOR + '):not(' + HEADING_SELECTOR + ' *)';

  function appendDropCapExclude(selector) {
    return selector + DROP_CAP_EXCLUDE;
  }

  function joinDropCapExcludedSelectors(selectors) {
    return selectors.map(appendDropCapExclude).join(', ');
  }

  function appendTmiTextExclude(selector) {
    return selector + HEADING_TREE_EXCLUDE + getArticleDeckExcludeSelector() + DROP_CAP_EXCLUDE;
  }

  function joinTmiTextExcludedSelectors(selectors) {
    return selectors.map(appendTmiTextExclude).join(', ');
  }

  function isDropCapElement(element) {
    try {
      return !!(element && element.matches && element.matches(DROP_CAP_MATCH_SELECTOR));
    } catch (_) {
      return false;
    }
  }

  function isInsideDropCap(element) {
    try {
      return !!(element && element.closest && element.closest(DROP_CAP_MATCH_SELECTOR));
    } catch (_) {
      return false;
    }
  }

  function looksLikeArticleDeckNode(element) {
    if (!element || !element.tagName) return false;
    var tagName = element.tagName.toLowerCase();
    if (tagName !== 'p' && tagName !== 'div') return false;

    var haystack = ARTICLE_DECK_ATTRS.map(function (attr) {
      return element.getAttribute ? element.getAttribute(attr) : '';
    }).join(' ').toLowerCase();
    if (!haystack) return false;

    var hasDeckHint = ARTICLE_DECK_HINTS.some(function (hint) {
      return haystack.indexOf(hint) !== -1;
    });
    if (!hasDeckHint) return false;

    if (tagName === 'div') {
      var nestedBlocks = element.querySelectorAll ? element.querySelectorAll('p, li, blockquote, ul, ol').length : 0;
      if (nestedBlocks > 1) return false;
    }

    return true;
  }

  function isInsideArticleDeck(element) {
    if (!element || !element.closest) return false;
    try {
      if (element.closest(getArticleDeckSelector())) return true;
    } catch (_) { }

    var header = element.closest('article header');
    if (!header) return false;

    var current = element;
    while (current && current.nodeType === 1 && current !== header) {
      if (looksLikeArticleDeckNode(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  // --- Substack detection (lazy-cached) ---
  var _isSubstack = null;
  function getIsSubstack() {
    if (_isSubstack !== null) return _isSubstack;
    _isSubstack = false;
    try {
      _isSubstack = AFFOSiteDetection.isSubstackDocument(document, location, window);
    } catch (_) { }
    return _isSubstack;
  }

  var SUBSTACK_ROULETTE_TARGET_TEXT_BRIGHTNESS = 54.8; // #363737
  var SUBSTACK_ROULETTE_BEIGE_STYLE_ID = 'a-font-face-off-style-substack-roulette-beige';
  var SUBSTACK_ROULETTE_DIMMING_STYLE_ID = 'a-font-face-off-style-substack-roulette-dimming';

  function getSubstackRouletteDimmingCss() {
    return [
      '[data-affo-substack-dim] { filter: brightness(var(--affo-substack-dim-brightness)) !important; }',
      'p[data-affo-substack-dim], li[data-affo-substack-dim], blockquote[data-affo-substack-dim] { background: transparent !important; background-color: transparent !important; }',
      'html body article.post .body.markup [data-affo-substack-dim], html body .available-content .body.markup [data-affo-substack-dim] { background: transparent !important; background-color: transparent !important; }',
      'html body article.post .body.markup blockquote[data-affo-substack-dim], html body article.post .body.markup blockquote [data-affo-substack-dim], html body .available-content .body.markup blockquote[data-affo-substack-dim], html body .available-content .body.markup blockquote [data-affo-substack-dim] { background: transparent !important; background-color: transparent !important; }'
    ].join('\n');
  }

  function getSubstackRouletteBeigeCss() {
    return [
      ':root { color-scheme: light !important; --affo-substack-beige: #fff8dc !important; --affo-substack-beige-muted: #eee8cd !important; }',
      'html, body, .single-post-container, .topbar-content, .available-content, .available-content .body.markup, article.post, article.post .body.markup { background: var(--affo-substack-beige) !important; background-color: var(--affo-substack-beige) !important; }',
      '.available-content .body.markup p, .available-content .body.markup li, article.post .body.markup p, article.post .body.markup li { background: var(--affo-substack-beige) !important; background-color: var(--affo-substack-beige) !important; }',
      '.available-content .body.markup blockquote, .available-content .body.markup blockquote p, article.post .body.markup blockquote, article.post .body.markup blockquote p { background: var(--affo-substack-beige) !important; background-color: var(--affo-substack-beige) !important; }',
      '.available-content .body.markup pre, .available-content .body.markup code, article.post .body.markup pre, article.post .body.markup code { background: var(--affo-substack-beige-muted) !important; background-color: var(--affo-substack-beige-muted) !important; }'
    ].join('\n');
  }

  function isSubstackRouletteBeigeDisabled() {
    return substackRouletteBeigeDisabledDomains.indexOf(currentOrigin) !== -1;
  }

  function removeSubstackRouletteBeige() {
    try {
      var existing = document.getElementById(SUBSTACK_ROULETTE_BEIGE_STYLE_ID);
      if (existing) existing.remove();
    } catch (_) { }
    maybeStopNonAggressiveStyleOrderChaser();
  }

  function applySubstackRouletteBeige() {
    if (isSubstackRouletteBeigeDisabled()) {
      removeSubstackRouletteBeige();
      return;
    }
    if (!document.head) return;
    try {
      var existing = document.getElementById(SUBSTACK_ROULETTE_BEIGE_STYLE_ID);
      if (existing) existing.remove();
      var styleEl = document.createElement('style');
      styleEl.id = SUBSTACK_ROULETTE_BEIGE_STYLE_ID;
      styleEl.textContent = getSubstackRouletteBeigeCss();
      document.head.appendChild(styleEl);
      ensureNonAggressiveStyleOrderChaser();
    } catch (_) { }
  }

  function syncSubstackRouletteBeige() {
    if (isSubstackRouletteBeigeDisabled()) {
      removeSubstackRouletteBeige();
    } else {
      applySubstackRouletteBeige();
    }
  }

  function getRgbArray(colorStr) {
    var matches = String(colorStr || '').match(/\d\.\d+|\d+/g);
    if (!matches || matches.length < 3) return null;
    return matches.slice(0, 4).map(function (part) { return Number(part); });
  }

  function calcColorBrightness(rgba) {
    if (!rgba || rgba.length < 3) return null;
    return +(rgba[0] * 0.2126 + rgba[1] * 0.7152 + rgba[2] * 0.0722).toFixed(1);
  }

  function calcEffectiveColorBrightness(rgba, bgBrightness) {
    var fgBrightness = calcColorBrightness(rgba);
    if (fgBrightness === null) return null;
    var alpha = rgba && rgba.length > 3 && isFinite(rgba[3]) ? rgba[3] : 1;
    if (alpha <= 0) return null;
    if (alpha >= 1 || !isFinite(bgBrightness)) return fgBrightness;
    return +(fgBrightness * alpha + bgBrightness * (1 - alpha)).toFixed(1);
  }

  function calcColorfulness(rgba) {
    if (!rgba || rgba.length < 3) return 0;
    return Math.abs(rgba[0] - rgba[1]) + Math.abs(rgba[1] - rgba[2]);
  }

  function elementHasOwnText(node) {
    if (!node || !node.childNodes) return false;
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i];
      if (child && child.nodeType === 3 && /\S/.test(child.nodeValue || '')) return true;
    }
    return false;
  }

  function directTextHasMinNonWhitespace(node, minChars) {
    if (!node || !node.childNodes) return false;
    var needed = Math.max(1, minChars || 1);
    var count = 0;

    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i];
      if (!child || child.nodeType !== 3) continue;
      var text = child.nodeValue || '';
      for (var j = 0; j < text.length; j++) {
        if (/\S/.test(text.charAt(j))) {
          count++;
          if (count >= needed) return true;
        }
      }
    }

    return false;
  }

  function elementMatchesSelector(node, selector) {
    if (!node || node.nodeType !== 1 || !node.matches) return false;
    try {
      return node.matches(selector);
    } catch (_) {
      return false;
    }
  }

  function closestElementForNode(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  }

  function isInteractiveSubtreeRoot(node) {
    return elementMatchesSelector(node, INTERACTIVE_SUBTREE_ROOT_SELECTOR);
  }

  function isInsideInteractiveSubtree(node) {
    var element = closestElementForNode(node);
    if (!element || !element.closest) return false;
    try {
      return !!element.closest(INTERACTIVE_SUBTREE_ROOT_SELECTOR);
    } catch (_) {
      return false;
    }
  }

  var BLOCK_TEXT_CONTAINER_TAGS = {
    P: true,
    LI: true,
    BLOCKQUOTE: true
  };

  var SEMANTIC_CODE_TEXT_TAGS = {
    CODE: true,
    PRE: true,
    KBD: true,
    SAMP: true,
    TT: true
  };

  var SIMPLE_INLINE_TEXT_TAGS = {
    A: true,
    ABBR: true,
    B: true,
    BDI: true,
    BDO: true,
    BR: true,
    CITE: true,
    DEL: true,
    DFN: true,
    EM: true,
    I: true,
    INS: true,
    MARK: true,
    Q: true,
    RP: true,
    RT: true,
    RUBY: true,
    S: true,
    SMALL: true,
    SPAN: true,
    STRONG: true,
    SUB: true,
    SUP: true,
    TIME: true,
    U: true,
    VAR: true,
    WBR: true
  };

  function elementHasSimpleInlineTextDescendant(node) {
    if (!node || !node.childNodes) return false;

    var hasText = false;
    function scan(current) {
      if (!current || !current.childNodes) return true;

      for (var i = 0; i < current.childNodes.length; i++) {
        var child = current.childNodes[i];
        if (!child) continue;
        if (child.nodeType === 3) {
          if (/\S/.test(child.nodeValue || '')) hasText = true;
          continue;
        }
        if (child.nodeType !== 1) continue;

        var childTag = String(child.tagName || '').toUpperCase();
        if (!SIMPLE_INLINE_TEXT_TAGS[childTag]) return false;
        if (!scan(child)) return false;
      }

      return true;
    }

    return scan(node) && hasText;
  }

  function elementOwnsTmiText(node) {
    if (elementHasOwnText(node)) return true;
    if (!node || !BLOCK_TEXT_CONTAINER_TAGS[String(node.tagName || '').toUpperCase()]) return false;
    return elementHasSimpleInlineTextDescendant(node);
  }

  function elementMayOwnTmiText(node) {
    if (!node || node.nodeType !== 1 || !node.firstChild) return false;

    var tagName = String(node.tagName || '').toUpperCase();
    if (INLINE_MEANINGFUL_IGNORE_TAGS[tagName] || tagName === 'SVG' || tagName === 'CANVAS') return false;
    if (elementHasOwnText(node)) return true;
    if (BLOCK_TEXT_CONTAINER_TAGS[tagName]) return true;
    if (SEMANTIC_CODE_TEXT_TAGS[tagName]) return true;
    return false;
  }

  function elementHasClass(node, className) {
    return !!(node && node.classList && node.classList.contains(className));
  }

  function getDirectSubstackPrimaryButtonLink(wrapper) {
    if (!wrapper || String(wrapper.tagName || '').toUpperCase() !== 'P') return null;
    if (!elementHasClass(wrapper, 'button-wrapper')) return null;

    for (var i = 0; i < wrapper.children.length; i++) {
      var child = wrapper.children[i];
      if (String(child.tagName || '').toUpperCase() !== 'A') continue;
      if (elementHasClass(child, 'button') && elementHasClass(child, 'primary')) return child;
    }

    return null;
  }

  function linkHasDirectSpanChild(link) {
    if (!link || !link.children) return false;
    for (var i = 0; i < link.children.length; i++) {
      if (String(link.children[i].tagName || '').toUpperCase() === 'SPAN') return true;
    }
    return false;
  }

  function isInsideDirectSpanChild(element, parent) {
    var current = element;
    while (current && current !== parent) {
      if (current.parentElement === parent) {
        return String(current.tagName || '').toUpperCase() === 'SPAN';
      }
      current = current.parentElement;
    }
    return false;
  }

  function isSubstackPrimaryButtonWrapperText(element) {
    if (!getIsSubstack() || !element || !element.closest) return false;

    var tagName = String(element.tagName || '').toUpperCase();
    if (tagName === 'P') {
      var directLink = getDirectSubstackPrimaryButtonLink(element);
      return !!(directLink && linkHasDirectSpanChild(directLink));
    }

    var wrapper = element.closest('p.button-wrapper');
    var link = getDirectSubstackPrimaryButtonLink(wrapper);
    if (!link || !linkHasDirectSpanChild(link) || !link.contains(element)) return false;
    if (element === link) return true;
    return isInsideDirectSpanChild(element, link);
  }

  function getLowerClassTokens(className) {
    var raw = typeof className === 'string' ? className : String(className || '');
    return raw.split(/\s+/).map(function (token) {
      return token.toLowerCase();
    }).filter(function (token) {
      return !!token;
    });
  }

  function isFontFamilyClassToken(token) {
    return /(?:^|:)font[-_]/.test(token || '');
  }

  function hasNonFontClassTokenMatch(className, pattern) {
    var tokens = getLowerClassTokens(className);
    for (var i = 0; i < tokens.length; i++) {
      if (isFontFamilyClassToken(tokens[i])) continue;
      if (pattern.test(tokens[i])) return true;
    }
    return false;
  }

  function getTmiFontHintClassText(className) {
    return getLowerClassTokens(className).filter(function (token) {
      // Tailwind-style variant tokens such as "scene:font-noto-sans" are only
      // active under their variant condition. Computed font-family below is the
      // authoritative signal for those conditional utilities.
      return token.indexOf(':') === -1;
    }).join(' ');
  }

  function isLikelyArticleBodyText(node) {
    if (!node || node.nodeType !== 1) return false;
    var tagName = String(node.tagName || '').toUpperCase();
    if (['A', 'BUTTON', 'LABEL', 'INPUT', 'TEXTAREA', 'SELECT', 'NAV', 'ASIDE', 'HEADER', 'FOOTER'].indexOf(tagName) !== -1) return false;
    var ownText = '';
    if (node.childNodes) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var child = node.childNodes[i];
        if (child && child.nodeType === 3) ownText += child.nodeValue || '';
      }
    }
    ownText = ownText.replace(/\s+/g, ' ').trim();
    var totalText = (node.textContent || '').replace(/\s+/g, ' ').trim();
    var isTextBlockTag = ['P', 'LI', 'BLOCKQUOTE'].indexOf(tagName) !== -1;
    if (!isTextBlockTag && ownText.length < 40) return false;
    if (totalText.length < 40) return false;
    try {
      if (!node.closest('article, main, [role="main"], .body, .post, .post-content, .markup, .available-content')) return false;
      var style = getComputedStyle(node);
      var fontSize = parseFloat(style.getPropertyValue('font-size'));
      if (isFinite(fontSize) && fontSize < 14) return false;
      var lineHeight = parseFloat(style.getPropertyValue('line-height'));
      if (isFinite(lineHeight) && lineHeight < 18) return false;
    } catch (_) { }
    return true;
  }

  function getAncestorBackgroundBrightness(node) {
    var parent = node;
    var transparent = 'rgba(0, 0, 0, 0)';
    while (parent) {
      try {
        if (parent.nodeType === 1) {
          var bg = getComputedStyle(parent).getPropertyValue('background-color');
          if (bg && bg !== transparent) {
            var rgba = getRgbArray(bg);
            var brightness = calcColorBrightness(rgba);
            if (brightness !== null) return brightness;
          }
        }
      } catch (_) { }
      parent = parent.parentNode;
    }
    return 236;
  }

  function clearSubstackRouletteDimMarkers() {
    document.querySelectorAll('[data-affo-substack-dim]').forEach(function (node) {
      node.removeAttribute('data-affo-substack-dim');
      if (node.style) node.style.removeProperty('--affo-substack-dim-brightness');
    });
  }

  function removeSubstackRouletteDimming() {
    clearSubstackRouletteDimMarkers();
    try {
      var existing = document.getElementById(SUBSTACK_ROULETTE_DIMMING_STYLE_ID);
      if (existing) existing.remove();
    } catch (_) { }
  }

  function removeSubstackRouletteEnhancements() {
    substackRouletteActive = false;
    removeSubstackRouletteDimming();
    removeSubstackRouletteBeige();
  }

  function applySubstackRouletteDimming() {
    removeSubstackRouletteDimming();
    var candidates = document.querySelectorAll('[data-affo-font-type="serif"], [data-affo-font-type="sans"]');
    var markedCount = 0;
    candidates.forEach(function (node) {
      if (!node || node.nodeType !== 1) return;
      if (!elementHasOwnText(node)) return;
      if (node.closest('[data-affo-substack-dim]')) return;
      try {
        var style = getComputedStyle(node);
        var color = style.getPropertyValue('color');
        if (!color || color === 'rgba(0, 0, 0, 0)') return;
        var rgba = getRgbArray(color);
        if (!rgba) return;
        var bgBrightness = getAncestorBackgroundBrightness(node);
        var effectiveBrightness = calcEffectiveColorBrightness(rgba, bgBrightness);
        if (effectiveBrightness === null || effectiveBrightness <= SUBSTACK_ROULETTE_TARGET_TEXT_BRIGHTNESS || bgBrightness < 145) return;
        var contrast = Math.abs(bgBrightness - effectiveBrightness);
        var colorfulness = calcColorfulness(rgba);
        var isLink = String(node.tagName || '').toUpperCase() === 'A';
        var isArticleBodyText = isLikelyArticleBodyText(node);
        var minContrast = isLink ? 96 : 132;
        var maxColorfulness = isLink ? 32 : 40;
        if (!isArticleBodyText && contrast > minContrast && colorfulness > maxColorfulness) return;
        node.setAttribute('data-affo-substack-dim', '');
        node.style.setProperty('--affo-substack-dim-brightness', +((SUBSTACK_ROULETTE_TARGET_TEXT_BRIGHTNESS / effectiveBrightness) * 100).toFixed(1) + '%');
        markedCount += 1;
      } catch (_) { }
    });
    if (!markedCount || !document.head) return;
    var styleEl = document.createElement('style');
    styleEl.id = SUBSTACK_ROULETTE_DIMMING_STYLE_ID;
    styleEl.textContent = getSubstackRouletteDimmingCss();
    document.head.appendChild(styleEl);
    ensureNonAggressiveStyleOrderChaser();
  }

  function scheduleSubstackRouletteDimming() {
    setTimeout(function () {
      try { applySubstackRouletteDimming(); } catch (_) { }
    }, 250);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        try { applySubstackRouletteDimming(); } catch (_) { }
      }).catch(function () { });
    }
  }

  // --- Runtime css2 URL lookup ---
  var css2UrlMemo = {};
  var css2UrlPromises = {};

  function resolveCss2Url(fontName, options) {
    var opts = options || {};
    var key = String(fontName || '').trim();
    if (!key || key.toLowerCase() === 'default') return Promise.resolve('');
    var memoKey = key + '|' + (opts.fallbackWhenMissing ? 'fallback' : 'strict');
    if (Object.prototype.hasOwnProperty.call(css2UrlMemo, memoKey)) {
      return Promise.resolve(css2UrlMemo[memoKey]);
    }
    if (css2UrlPromises[memoKey]) return css2UrlPromises[memoKey];

    css2UrlPromises[memoKey] = sendBackgroundMessage({
      type: 'resolveCss2Url',
      fontName: key,
      fallbackWhenMissing: !!opts.fallbackWhenMissing
    }).then(function (response) {
      var css2Url = response && response.ok ? (response.css2Url || '') : '';
      css2UrlMemo[memoKey] = css2Url;
      delete css2UrlPromises[memoKey];
      if (css2Url) {
        debugLog(`[AFFO Content] Resolved css2Url for ${key}: ${css2Url}`);
      } else {
        debugLog(`[AFFO Content] No css2Url resolved for ${key}`);
      }
      return css2Url;
    }).catch(function (e) {
      delete css2UrlPromises[memoKey];
      debugLog(`[AFFO Content] Failed to resolve css2Url for ${key}:`, e);
      return '';
    });

    return css2UrlPromises[memoKey];
  }

  function resolveCss2UrlsForEntry(entry) {
    var names = {};
    ['body', 'serif', 'sans', 'mono'].forEach(function (fontType) {
      var cfg = entry && entry[fontType];
      if (cfg && cfg.fontName && !shouldTreatFontConfigAsLocal(cfg)) names[cfg.fontName] = true;
    });
    return Promise.all(Object.keys(names).map(resolveCss2Url)).then(function () { });
  }

  // --- Custom font definitions ---
  // Parse custom-fonts-starter.css (or user-customized version) to get @font-face rules on-demand
  var customFontDefinitions = {};
  var customFontsLoaded = false;
  var customFontsPromise = null;
  var localFontNames = [];

  function normalizeLocalFontsValue(value) {
    if (globalThis.AFFOLocalFontUtils && typeof AFFOLocalFontUtils.normalizeLocalFonts === 'function') {
      return AFFOLocalFontUtils.normalizeLocalFonts(value);
    }
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function isLocalFontConfig(fontConfig) {
    if (globalThis.AFFOLocalFontUtils && typeof AFFOLocalFontUtils.isLocalFontConfig === 'function') {
      return AFFOLocalFontUtils.isLocalFontConfig(fontConfig);
    }
    return !!(fontConfig && fontConfig.fontSource === 'local');
  }

  function isConfiguredLocalFontName(fontName) {
    return !!(fontName && localFontNames.indexOf(fontName) !== -1);
  }

  function shouldTreatFontConfigAsLocal(fontConfig) {
    return !!(fontConfig && fontConfig.fontName && (isLocalFontConfig(fontConfig) || isConfiguredLocalFontName(fontConfig.fontName)));
  }

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

        // Always load built-in SIL/OFL fonts
        promises.push(
          fetch(browser.runtime.getURL('sil-fonts.css'))
            .then(function (response) { return response.text(); })
            .then(function (text) {
              var parsed = parseCustomFontsFromCss(text);
              Object.assign(customFontDefinitions, parsed);
            })
            .catch(function (e) {
              debugLog('[AFFO Content] Failed to load sil-fonts.css:', e);
            })
        );

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
  function isHostOrSubdomain(host, root) {
    var normalizedHost = String(host || '').toLowerCase();
    var normalizedRoot = String(root || '').toLowerCase();
    return normalizedHost === normalizedRoot || normalizedHost.endsWith('.' + normalizedRoot);
  }

  var isXCom = isHostOrSubdomain(currentOrigin, 'x.com') || isHostOrSubdomain(currentOrigin, 'twitter.com');
  function getBodyExcludeSelector() {
    return ':not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo):not([data-affo-guard]):not([data-affo-guard] *)' + getPostHeaderExcludeSelector() + getCommentExcludeSelector() + getArticleDeckExcludeSelector() + DROP_CAP_EXCLUDE;
  }

  function getAffoSelector(ft) {
    if (ft === 'body') {
      return 'body ' + getBodyExcludeSelector();
    }
    return isXCom ? getHybridSelector(ft) : '[data-affo-font-type="' + ft + '"]' + getArticleDeckExcludeSelector();
  }

  function getBodyFontSizeScaleExtraSelector() {
    var guard = ':not(.no-affo):not([data-affo-guard]):not([data-affo-guard] *)' + getCommentExcludeSelector() + DROP_CAP_EXCLUDE;
    var nonChrome = ':not(nav *):not(footer *):not(aside *):not(button *):not(form *):not([role="navigation"] *):not([role="contentinfo"] *):not([role="complementary"] *):not([role="dialog"] *):not(.site-header *):not(.sidebar *):not(.toc *):not([class*="widget"]):not([class*="widget"] *)';
    var contentScope = ':is(main, article, [role="main"], .post, .post-content, .entry-content, .article, .story, .content, .markup, .available-content)';
    var headings = 'body ' + contentScope + ' :is(h1, h2, h3, h4, h5, h6)' + guard + nonChrome;
    var articleDeck = getArticleDeckSelector() + guard;
    var xAuthor = isXCom
      ? ', article [data-testid="User-Name"]' + guard + ', article [data-testid="User-Name"] :is(div, span, a, time)' + guard
      : '';
    return headings + ', ' + articleDeck + xAuthor;
  }

  function getThirdManInTextSelector(fontType) {
    return joinTmiTextExcludedSelectors([
      'html body div[data-affo-font-type="' + fontType + '"]',
      'html body blockquote[data-affo-font-type="' + fontType + '"]',
      'html body p[data-affo-font-type="' + fontType + '"]',
      'html body span[data-affo-font-type="' + fontType + '"]',
      'html body a[data-affo-font-type="' + fontType + '"]:not(.footnote-anchor)',
      'html body em[data-affo-font-type="' + fontType + '"]',
      'html body i[data-affo-font-type="' + fontType + '"]',
      'html body td[data-affo-font-type="' + fontType + '"]',
      'html body th[data-affo-font-type="' + fontType + '"]',
      'html body li[data-affo-font-type="' + fontType + '"]',
      'html body p[data-affo-font-type="' + fontType + '"] a:not(.footnote-anchor)',
      'html body span[data-affo-font-type="' + fontType + '"] a:not(.footnote-anchor)',
      'html body td[data-affo-font-type="' + fontType + '"] a:not(.footnote-anchor)',
      'html body th[data-affo-font-type="' + fontType + '"] a:not(.footnote-anchor)',
      'html body li[data-affo-font-type="' + fontType + '"] a:not(.footnote-anchor)',
      'html body div[data-affo-font-type="' + fontType + '"] a:not(.footnote-anchor)',
      'html body blockquote[data-affo-font-type="' + fontType + '"] a:not(.footnote-anchor)',
      'html body p[data-affo-font-type="' + fontType + '"] :where(em, i)',
      'html body span[data-affo-font-type="' + fontType + '"] :where(em, i)',
      'html body a[data-affo-font-type="' + fontType + '"] :where(em, i)',
      'html body td[data-affo-font-type="' + fontType + '"] :where(em, i)',
      'html body th[data-affo-font-type="' + fontType + '"] :where(em, i)',
      'html body li[data-affo-font-type="' + fontType + '"] :where(em, i)',
      'html body div[data-affo-font-type="' + fontType + '"] :where(em, i)',
      'html body blockquote[data-affo-font-type="' + fontType + '"] :where(em, i)'
    ]);
  }

  function hasFontSizeScale(fontConfig) {
    return !!(fontConfig && fontConfig.fontSizeScale != null && isFinite(Number(fontConfig.fontSizeScale)));
  }

  function getFontSizeScaleAttr(fontType, suffix) {
    return 'data-affo-' + suffix + '-font-size-' + fontType;
  }

  function getFontSizeScaleTargets(fontType) {
    if (fontType === 'body') {
      return document.querySelectorAll('body, ' + getAffoSelector('body') + ', ' + getBodyFontSizeScaleExtraSelector());
    }
    if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
      return document.querySelectorAll(isXCom ? getAffoSelector(fontType) : getThirdManInTextSelector(fontType));
    }
    return [];
  }

  function restoreScaledFontSizeElement(el, fontType) {
    if (!el || !el.style) return;
    var scaledAttr = getFontSizeScaleAttr(fontType, 'scaled');
    if (!el.hasAttribute(scaledAttr)) return;

    restoreScaledFontSizeElementStyle(el, fontType);
    el.removeAttribute(scaledAttr);
    el.removeAttribute(getFontSizeScaleAttr(fontType, 'original-computed'));
    el.removeAttribute(getFontSizeScaleAttr(fontType, 'original-inline'));
    el.removeAttribute(getFontSizeScaleAttr(fontType, 'original-inline-priority'));
  }

  function restoreScaledFontSizeElementStyle(el, fontType) {
    if (!el || !el.style) return;
    var inlineAttr = getFontSizeScaleAttr(fontType, 'original-inline');
    var priorityAttr = getFontSizeScaleAttr(fontType, 'original-inline-priority');
    var originalInline = el.getAttribute(inlineAttr);
    var originalPriority = el.getAttribute(priorityAttr) || '';

    if (originalInline && originalInline !== '__AFFO_EMPTY__') {
      el.style.setProperty('font-size', originalInline, originalPriority);
    } else {
      el.style.removeProperty('font-size');
    }
  }

  function clearFontSizeScale(fontType) {
    delete fontSizeScaleConfigs[fontType];
    try {
      document.querySelectorAll('[' + getFontSizeScaleAttr(fontType, 'scaled') + ']').forEach(function (el) {
        restoreScaledFontSizeElement(el, fontType);
      });
    } catch (_) { }
    refreshFontSizeScaleObserver();
  }

  function clearAllFontSizeScales() {
    ['body', 'serif', 'sans', 'mono'].forEach(clearFontSizeScale);
  }

  function applyFontSizeScale(fontConfig, fontType) {
    if (!hasFontSizeScale(fontConfig)) {
      clearFontSizeScale(fontType);
      return;
    }

    var scale = Number(fontConfig.fontSizeScale);
    fontSizeScaleConfigs[fontType] = fontConfig;

    var scaledAttr = getFontSizeScaleAttr(fontType, 'scaled');
    var computedAttr = getFontSizeScaleAttr(fontType, 'original-computed');
    var inlineAttr = getFontSizeScaleAttr(fontType, 'original-inline');
    var priorityAttr = getFontSizeScaleAttr(fontType, 'original-inline-priority');
    var priority = shouldUseAggressive() ? 'important' : '';
    var count = 0;

    try {
      var targets = Array.prototype.slice.call(getFontSizeScaleTargets(fontType));
      targets.forEach(function (el) {
        if (el && el.hasAttribute && el.hasAttribute(scaledAttr)) {
          restoreScaledFontSizeElementStyle(el, fontType);
        }
      });

      targets.forEach(function (el) {
        if (!el || !el.style) return;

        var originalSize = Number(el.getAttribute(computedAttr));
        if (!el.hasAttribute(scaledAttr) || !isFinite(originalSize) || originalSize <= 0) {
          var computed = window.getComputedStyle(el);
          originalSize = parseFloat(computed.getPropertyValue('font-size'));
          if (!isFinite(originalSize) || originalSize <= 0) return;

          var originalInline = el.style.getPropertyValue('font-size');
          var originalPriority = el.style.getPropertyPriority('font-size');
          el.setAttribute(computedAttr, String(originalSize));
          el.setAttribute(inlineAttr, originalInline || '__AFFO_EMPTY__');
          el.setAttribute(priorityAttr, originalPriority || '');
          el.setAttribute(scaledAttr, 'true');
        }
      });

      targets.forEach(function (el) {
        if (!el || !el.style || !el.hasAttribute(scaledAttr)) return;

        var originalSize = Number(el.getAttribute(computedAttr));
        if (!isFinite(originalSize) || originalSize <= 0) return;

        var scaledSize = +(originalSize * scale / 100).toFixed(3);
        el.style.setProperty('font-size', scaledSize + 'px', priority);
        count++;
      });
    } catch (e) {
      debugLog('[AFFO Content] Error applying font size scale for ' + fontType + ':', e);
    }

    refreshFontSizeScaleObserver();
    elementLog('[AFFO Content] Applied font size scale ' + scale + '% to ' + count + ' ' + fontType + ' elements');
  }

  function clearFontSizeScalesNotInEntry(entry) {
    ['body', 'serif', 'sans', 'mono'].forEach(function (fontType) {
      if (!hasFontSizeScale(entry && entry[fontType])) clearFontSizeScale(fontType);
    });
  }

  function getActiveFontSizeScaleTypes() {
    return ['body', 'serif', 'sans', 'mono'].filter(function (fontType) {
      return hasFontSizeScale(fontSizeScaleConfigs[fontType]);
    });
  }

  function reapplyActiveFontSizeScales(fontTypes) {
    var types = fontTypes && fontTypes.length ? fontTypes : getActiveFontSizeScaleTypes();
    types.forEach(function (fontType) {
      if (hasFontSizeScale(fontSizeScaleConfigs[fontType])) {
        applyFontSizeScale(fontSizeScaleConfigs[fontType], fontType);
      }
    });
  }

  function refreshFontSizeScaleObserver() {
    if (getActiveFontSizeScaleTypes().length > 0) {
      ensureFontSizeScaleObserver();
    } else {
      cleanupFontSizeScaleObserver();
    }
  }

  function reapplyFontSizeScalesAfterNavigation() {
    var activeTypes = getActiveFontSizeScaleTypes();
    if (activeTypes.length === 0) return;
    var tmiTypes = activeTypes.filter(function (ft) { return ft !== 'body'; });
    if (tmiTypes.length > 0) {
      rewalkTmiTypes(tmiTypes, function () { reapplyActiveFontSizeScales(activeTypes); });
    } else {
      reapplyActiveFontSizeScales(activeTypes);
    }
  }

  function reapplyFontSizeScalesOnFocus() {
    reapplyActiveFontSizeScales();
  }

  // ---- Unified DOM-mutation dispatcher -------------------------------------
  // One MutationObserver feeds every mutation-driven consumer. It computes the
  // meaningful added subtree roots ONCE per batch (instead of three observers
  // each scanning the same mutation records) and, after a single shared
  // debounce, dispatches scoped work to whichever consumers are active. Scoped
  // work only touches the newly added subtrees rather than re-walking and
  // re-applying across the whole document.
  function anyMutationConsumerActive() {
    return inlineObserverWanted ||
      getObservedTmiCssTypes().length > 0 ||
      getActiveFontSizeScaleTypes().length > 0;
  }

  function ensureSharedDomObserver() {
    if (sharedDomObserver) return;
    sharedDomObserver = new MutationObserver(function (muts) {
      if (!anyMutationConsumerActive()) return;

      // Single pass over the batch: collect meaningful added subtree roots.
      var newRoots = null;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (isInsideInteractiveSubtree(m.target)) continue;
        var added = m.addedNodes;
        if (!added || added.length === 0) continue;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          try {
            if (isMeaningfulInlineAddedNode(n)) {
              if (!newRoots) newRoots = [];
              newRoots.push(n);
            }
          } catch (_) { }
        }
      }
      if (!newRoots) return;

      // Inline-apply consumer also tracks activity and keeps polling alive.
      if (inlineObserverWanted && Object.keys(inlineConfigs).length > 0) {
        sharedInlineLastActivityAt = Date.now();
        if (sharedInlineTimers.length === 0) ensureSharedInlinePolling();
      }

      for (var k = 0; k < newRoots.length; k++) pendingMeaningfulRoots.push(newRoots[k]);

      if (sharedDomDebounceTimer) clearTimeout(sharedDomDebounceTimer);
      sharedDomDebounceTimer = setTimeout(function () {
        sharedDomDebounceTimer = null;
        var roots = pendingMeaningfulRoots;
        pendingMeaningfulRoots = [];
        dispatchMeaningfulMutations(roots);
      }, INLINE_REAPPLY_DEBOUNCE_MS);
    });
    sharedDomObserver.observe(document.documentElement || document, { childList: true, subtree: true });
    debugLog('[AFFO Content] Created unified DOM mutation observer');
  }

  function maybeCleanupSharedDomObserver() {
    if (anyMutationConsumerActive()) return;
    if (sharedDomObserver) {
      try { sharedDomObserver.disconnect(); } catch (_) { }
      sharedDomObserver = null;
      debugLog('[AFFO Content] Disconnected unified DOM mutation observer');
    }
    if (sharedDomDebounceTimer) {
      try { clearTimeout(sharedDomDebounceTimer); } catch (_) { }
      sharedDomDebounceTimer = null;
    }
    pendingMeaningfulRoots = [];
  }

  // Apply inline styles only within the given added subtree roots (instead of
  // re-querying and re-writing every marked element in the document).
  function applyInlineStylesInRoots(roots) {
    var types = Object.keys(inlineConfigs);
    if (types.length === 0) return;
    types.forEach(function (ft) {
      var cfg = inlineConfigs[ft];
      if (!cfg) return;
      var selector = getAffoSelector(ft);
      var applied = 0;
      roots.forEach(function (root) {
        if (!root || root.nodeType !== 1) return;
        var matches = [];
        try {
          if (root.matches && root.matches(selector)) matches.push(root);
          if (root.querySelectorAll) {
            var inner = root.querySelectorAll(selector);
            for (var i = 0; i < inner.length; i++) matches.push(inner[i]);
          }
        } catch (_) { return; }
        matches.forEach(function (el) {
          if (ft === 'body') {
            applyAffoProtection(el, cfg.cssPropsObject);
          } else {
            applyTmiProtection(el, cfg.cssPropsObject, cfg.inlineEffectiveWeight);
            resetHeadingTypographyInMarkedSubtree(el);
          }
          applied++;
        });
      });
      applyFontSizeScale(cfg.fontConfig || {}, ft);
      if (applied > 0) elementLog('Applied inline styles to ' + applied + ' newly added ' + ft + ' elements');
    });
  }

  // Dispatch debounced, scoped work to the active consumers for the meaningful
  // subtree roots that were added since the last dispatch.
  function dispatchMeaningfulMutations(roots) {
    if (!roots || roots.length === 0) return;
    // Drop roots that have since detached.
    var live = roots.filter(function (n) { return n && document.contains(n); });
    if (live.length === 0) return;
    // Drop roots nested inside another pending root to avoid double-walking.
    var topRoots = live.filter(function (r) {
      return !live.some(function (other) { return other !== r && other.contains && other.contains(r); });
    });

    // Inline consumer: mark inline TMI types in the new subtrees, then apply
    // inline styles within them.
    if (inlineObserverWanted && Object.keys(inlineConfigs).length > 0) {
      var tmiInline = ['serif', 'sans', 'mono'].filter(function (ft) { return !!inlineConfigs[ft]; });
      if (tmiInline.length > 0) markTypesInRoots(topRoots, tmiInline);
      applyInlineStylesInRoots(topRoots);
    }

    // Non-inline TMI CSS consumer: marking the new nodes is enough — the
    // injected attribute-selector CSS styles them automatically.
    var tmiCssTypes = getObservedTmiCssTypes();
    if (tmiCssTypes.length > 0) {
      debugLog('[AFFO Content] Marking newly added subtrees for non-inline TMI types:', tmiCssTypes);
      markTypesInRoots(topRoots, tmiCssTypes);
    }

    // Font-size scale consumer: mark new TMI subtrees, then reapply scales
    // (applyFontSizeScale skips already-scaled elements, so only the freshly
    // marked nodes incur work).
    var scaleTypes = getActiveFontSizeScaleTypes();
    if (scaleTypes.length > 0) {
      var tmiScale = scaleTypes.filter(function (ft) { return ft !== 'body'; });
      if (tmiScale.length > 0) markTypesInRoots(topRoots, tmiScale);
      reapplyActiveFontSizeScales(scaleTypes);
    }
  }

  function ensureFontSizeScaleObserver() {
    registerSpaHandler(reapplyFontSizeScalesAfterNavigation);
    registerFocusHandler(reapplyFontSizeScalesOnFocus);
    ensureSharedDomObserver();
  }

  function cleanupFontSizeScaleObserver() {
    maybeCleanupSharedDomObserver();
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

  function clearAffoProtection(el) {
    if (!el || !el.style) return;
    [
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
      'color',
      'font-stretch',
      'font-style',
      'font-variation-settings'
    ].forEach(function (prop) {
      el.style.removeProperty(prop);
      el.style.removeProperty('--affo-' + prop);
      if (el.removeAttribute) el.removeAttribute('data-affo-' + prop);
    });
    if (el.removeAttribute) {
      el.removeAttribute('data-affo-protected');
      el.removeAttribute('data-affo-font-name');
      el.removeAttribute('data-affo-font-type');
      el.removeAttribute('data-affo-original-font-type');
      el.removeAttribute('data-affo-was-bold');
    }
  }

  function isBoldFontWeightValue(weightValue) {
    if (weightValue == null) return false;
    var normalized = String(weightValue).trim().toLowerCase();
    if (normalized === 'bold' || normalized === 'bolder') return true;
    var numeric = Number(normalized);
    return isFinite(numeric) && numeric >= 700;
  }

  // TMI-aware wrapper: detects computed-bold elements before overwriting, preserves weight 700
  function applyTmiProtection(el, propsObj, effectiveWeight) {
    // Detect bold BEFORE applying — check prior-run marker or computed style.
    // Some publishers wrap non-bold text in <strong>, so tag semantics alone
    // are not a reliable signal for preserving a 700 weight.
    var isBold = false;
    try {
      if (el.getAttribute('data-affo-was-bold') === 'true') {
        isBold = true;
      } else {
        var cw = window.getComputedStyle(el).fontWeight;
        isBold = isBoldFontWeightValue(cw);
      }
    } catch (_) { }

    applyAffoProtection(el, propsObj);

    // Restore bold weight so it isn't flattened to the custom weight
    if (isBold && effectiveWeight !== null) {
      el.style.setProperty('font-weight', '700', 'important');
      el.style.setProperty('--affo-font-weight', '700', 'important');
      el.setAttribute('data-affo-font-weight', '700');
      el.setAttribute('data-affo-was-bold', 'true');
      var boldAxes = buildBoldAxisSettings({ variableAxes: extractVariationAxes(propsObj['font-variation-settings']) }, 700);
      if (boldAxes.length > 0) {
        el.style.setProperty('font-variation-settings', boldAxes.join(', '), 'important');
        el.style.setProperty('--affo-font-variation-settings', boldAxes.join(', '), 'important');
        el.setAttribute('data-affo-font-variation-settings', boldAxes.join(', '));
      } else {
        el.style.removeProperty('font-variation-settings');
        el.style.removeProperty('--affo-font-variation-settings');
        el.removeAttribute('data-affo-font-variation-settings');
      }
    }
  }

  function resetHeadingTypographyInMarkedSubtree(root) {
    if (!root || !root.querySelectorAll) return;
    try {
      root.querySelectorAll('h1, h2, h3, h4, h5, h6, h1 *, h2 *, h3 *, h4 *, h5 *, h6 *').forEach(function (heading) {
        heading.style.setProperty('font-family', 'revert', 'important');
        heading.style.setProperty('font-weight', 'revert', 'important');
        heading.style.setProperty('font-stretch', 'revert', 'important');
        heading.style.setProperty('font-style', 'revert', 'important');
        heading.style.setProperty('font-variation-settings', 'normal', 'important');
      });
    } catch (_) { }
  }

  function hasAffoStyleNodes() {
    try {
      return !!(document.head && (
        document.getElementById('a-font-face-off-style-body') ||
        document.getElementById('a-font-face-off-style-serif') ||
        document.getElementById('a-font-face-off-style-sans') ||
        document.getElementById('a-font-face-off-style-mono') ||
        document.getElementById(SUBSTACK_ROULETTE_BEIGE_STYLE_ID) ||
        document.getElementById(SUBSTACK_ROULETTE_DIMMING_STYLE_ID)
      ));
    } catch (_) {
      return false;
    }
  }

  function maybeStopNonAggressiveStyleOrderChaser() {
    if (!styleOrderChaserObserver) return;
    if (hasAffoStyleNodes()) return;
    try { styleOrderChaserObserver.disconnect(); } catch (_) { }
    styleOrderChaserObserver = null;
    styleOrderChaserMoving = false;
    debugLog('[AFFO Content] Stopped non-aggressive style-order chaser');
  }

  function moveAffoStylesToEnd() {
    if (shouldUseAggressive() || shouldUseInlineApply()) return;
    if (styleOrderChaserMoving) return;
    var head = document.head;
    if (!head) return;

    var nodes = [];
    try {
      nodes = [
        document.getElementById('a-font-face-off-style-body'),
        document.getElementById('a-font-face-off-style-serif'),
        document.getElementById('a-font-face-off-style-sans'),
        document.getElementById('a-font-face-off-style-mono'),
        document.getElementById(SUBSTACK_ROULETTE_BEIGE_STYLE_ID),
        document.getElementById(SUBSTACK_ROULETTE_DIMMING_STYLE_ID)
      ].filter(function (node) { return !!(node && node.tagName === 'STYLE' && node.parentNode === head); });
    } catch (_) { }

    if (nodes.length === 0) {
      maybeStopNonAggressiveStyleOrderChaser();
      return;
    }

    var lastAffo = nodes[nodes.length - 1];
    if (head.lastElementChild === lastAffo) return;

    styleOrderChaserMoving = true;
    try {
      nodes.forEach(function (node) {
        try { if (node.parentNode === head) head.appendChild(node); } catch (_) { }
      });
    } finally {
      setTimeout(function () { styleOrderChaserMoving = false; }, 50);
    }
  }

  function ensureNonAggressiveStyleOrderChaser() {
    if (shouldUseAggressive() || shouldUseInlineApply()) return;
    if (!document.head) return;
    if (styleOrderChaserObserver) {
      moveAffoStylesToEnd();
      return;
    }

    styleOrderChaserObserver = new MutationObserver(function (muts) {
      if (styleOrderChaserMoving) return;
      if (shouldUseAggressive() || shouldUseInlineApply()) return;

      var sawStyleOrLink = muts.some(function (m) {
        return Array.prototype.some.call(m.addedNodes || [], function (n) {
          return !!(n && n.nodeType === 1 && (n.nodeName === 'STYLE' || n.nodeName === 'LINK'));
        });
      });
      if (!sawStyleOrLink) return;
      moveAffoStylesToEnd();
    });
    styleOrderChaserObserver.observe(document.head, { childList: true });

    // Reassert ordering after SPA navigations/focus restores.
    registerSpaHandler(moveAffoStylesToEnd);
    registerFocusHandler(moveAffoStylesToEnd);

    debugLog('[AFFO Content] Started non-aggressive style-order chaser');
    moveAffoStylesToEnd();
  }

  function applyInlineStyles(fontConfig, fontType) {
    elementLog(`Applying inline styles for ${fontType}:`, fontConfig.fontName);
    var inlineTimer = createAffoTimer('Inline apply ' + fontType + ' ' + (fontConfig.fontName || ''));
    sharedInlineLastActivityAt = Date.now();

    // Remove this type from shared inline config registry (will be re-added below)
    delete inlineConfigs[fontType];
    // If no types remain, tear down shared observer and timers
    if (Object.keys(inlineConfigs).length === 0) {
      cleanupSharedInlineInfra();
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

    // Include absolute fontSize if present. Scaled sizes are computed per element below.
    if (!hasFontSizeScale(fontConfig) && fontConfig.fontSize) {
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
    if (fontConfig.letterSpacing != null) {
      cssPropsObject['letter-spacing'] = fontConfig.letterSpacing + 'em';
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
    var inlineBoldAxes = buildBoldAxisSettings(fontConfig, 700);
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
            if (inlineBoldAxes.length > 0) {
              el.style.setProperty('font-variation-settings', inlineBoldAxes.join(', '), 'important');
            } else {
              el.style.removeProperty('font-variation-settings');
            }
          });
        }
        elementLog(`Applied inline styles to ${bodyElements.length} body elements`);
      } else if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
        var tmiElements = document.querySelectorAll(getAffoSelector(fontType));
        tmiElements.forEach(function (el) {
          applyTmiProtection(el, cssPropsObject, inlineEffectiveWeight);
          resetHeadingTypographyInMarkedSubtree(el);
        });
        elementLog('Applied inline styles to ' + tmiElements.length + ' ' + fontType + ' elements');
      }
    } catch (e) {
      console.error(`[AFFO Content] Error applying inline styles for ${fontType}:`, e);
    }
    applyFontSizeScale(fontConfig, fontType);
    inlineTimer.mark('style-set', Object.keys(cssPropsObject).length + ' props');

    // Register this type into the shared inline config registry
    inlineConfigs[fontType] = {
      cssPropsObject: cssPropsObject,
      inlineEffectiveWeight: inlineEffectiveWeight,
      fontConfig: fontConfig,
      expiresAt: Date.now() + 180000 // 3 minutes
    };

    // Add SPA resilience for x.com and other dynamic sites
    try {
      // Ensure shared MutationObserver exists (created once, handles all types)
      ensureSharedInlineObserver();

      // Re-apply styles on SPA navigations (history API hooks)
      // Uses a single shared handler that iterates all active types
      registerSpaHandler(reapplyAllInlineStyles);

      // Ensure shared polling timers are running
      ensureSharedInlinePolling();

      // Re-apply styles when page becomes visible
      registerFocusHandler(reapplyAllInlineStyles);

      debugLog(`[AFFO Content] Added shared SPA resilience for ${fontType} fonts on ${currentOrigin} (${Object.keys(inlineConfigs).length} active types)`);

    } catch (e) {
      console.error(`[AFFO Content] Error setting up SPA resilience for ${fontType}:`, e);
    }
    inlineTimer.end();
  }

  // Re-apply inline styles for all active types (shared SPA/focus handler).
  // For TMI types, if no marked elements are found, re-run the element walker
  // to re-mark new DOM nodes (e.g. after SPA navigation or React re-renders)
  // then apply inline styles to the freshly marked elements.
  function reapplyAllInlineStyles() {
    var types = Object.keys(inlineConfigs);
    if (types.length === 0) return;
    var tmiTypesToRewalk = [];
    types.forEach(function (ft) {
      try {
        var cfg = inlineConfigs[ft];
        if (!cfg) return;
        var elements = document.querySelectorAll(getAffoSelector(ft));
        if (elements.length === 0 && ft !== 'body') {
          // No marked elements — DOM was likely replaced; queue a re-walk
          tmiTypesToRewalk.push(ft);
          return;
        }
        elements.forEach(function (el) {
          if (ft === 'body') {
            applyAffoProtection(el, cfg.cssPropsObject);
          } else {
            applyTmiProtection(el, cfg.cssPropsObject, cfg.inlineEffectiveWeight);
            resetHeadingTypographyInMarkedSubtree(el);
          }
        });
        applyFontSizeScale(cfg.fontConfig || {}, ft);
        elementLog('Re-applied inline styles to ' + elements.length + ' ' + ft + ' elements');
      } catch (e) {
        debugLog('[AFFO Content] Error re-applying inline styles for ' + ft + ':', e);
      }
    });
    // Re-walk any TMI types that lost their markers, then apply inline styles
    if (tmiTypesToRewalk.length > 0) {
      debugLog('[AFFO Content] Re-walking for inline types with 0 marked elements: ' + tmiTypesToRewalk.join(', '));
      tmiTypesToRewalk.forEach(function (ft) {
        elementWalkerCompleted[ft] = false;
        elementWalkerRechecksScheduled[ft] = false;
      });
      runElementWalkerAll(tmiTypesToRewalk).then(function () {
        tmiTypesToRewalk.forEach(function (ft) {
          try {
            var cfg = inlineConfigs[ft];
            if (!cfg) return;
            var elements = document.querySelectorAll(getAffoSelector(ft));
            elements.forEach(function (el) {
              applyTmiProtection(el, cfg.cssPropsObject, cfg.inlineEffectiveWeight);
              resetHeadingTypographyInMarkedSubtree(el);
            });
            applyFontSizeScale(cfg.fontConfig || {}, ft);
            elementLog('Re-applied inline styles to ' + elements.length + ' ' + ft + ' elements after re-walk');
          } catch (_) { }
        });
      });
    }
  }

  function isMeaningfulInlineAddedNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (INLINE_MEANINGFUL_IGNORE_TAGS[node.tagName]) return false;
    if (isInsideInteractiveSubtree(node)) return false;

    // Ignore pure SVG tree additions (icon swaps, etc.) to avoid noisy re-applies.
    if (node.namespaceURI === 'http://www.w3.org/2000/svg') return false;

    try {
      if (node.children && node.children.length >= INLINE_MEANINGFUL_MIN_CHILDREN) {
        return true;
      }
    } catch (_) { }

    try {
      if (directTextHasMinNonWhitespace(node, INLINE_MEANINGFUL_MIN_TEXT)) return true;
    } catch (_) { }

    return false;
  }

  function ensureSharedTmiCssObserver() {
    ensureSharedDomObserver();
  }

  function cleanupSharedTmiCssObserver() {
    maybeCleanupSharedDomObserver();
  }

  // Inline-type consumer now shares the unified DOM observer.
  function ensureSharedInlineObserver() {
    inlineObserverWanted = true;
    ensureSharedDomObserver();
  }

  function stopSharedInlinePolling(reason) {
    if (sharedInlineTimers.length === 0) return;
    sharedInlineTimers.forEach(function (timerId) {
      try { clearTimeout(timerId); clearInterval(timerId); } catch (_) { }
    });
    sharedInlineTimers = [];
    debugLog('[AFFO Content] Stopped shared inline polling' + (reason ? ' (' + reason + ')' : ''));
  }

  function maybeStopSharedInlinePollingForQuietPage() {
    if (Object.keys(inlineConfigs).length === 0) return true;
    if (!sharedInlineLastActivityAt) return false;
    var quietMs = Date.now() - sharedInlineLastActivityAt;
    if (quietMs < INLINE_POLLING_QUIET_STOP_MS) return false;
    stopSharedInlinePolling('quiet for ' + Math.round(quietMs / 1000) + 's');
    return true;
  }

  // Set up shared polling timers (frequency ramp: fast → slow → stop)
  function ensureSharedInlinePolling() {
    if (sharedInlineTimers.length > 0) return; // already running

    var isInline = shouldUseInlineApply();
    var initialFrequency = isInline ? 2000 : 5000;
    var laterFrequency = 10000;
    var initialDuration = isInline ? 30000 : 60000;
    var totalDuration = INLINE_POLLING_TOTAL_MS;

    debugLog('[AFFO Content] Starting shared inline monitoring - initial: ' + initialFrequency + 'ms, later: ' + laterFrequency + 'ms');

    var checkCount = 0;
    if (!sharedInlineLastActivityAt) sharedInlineLastActivityAt = Date.now();
    if (!sharedInlineCleanupTimer) {
      sharedInlineCleanupTimer = setTimeout(function () {
        debugLog('[AFFO Content] Stopped shared style monitoring after ' + (totalDuration / 1000) + ' seconds (' + checkCount + ' total checks)');
        cleanupSharedInlineInfra();
      }, totalDuration);
    }

    // Start monitoring after 1s delay (same as before)
    var monitoringTimer = setTimeout(function () {
      try {
        var initialInterval = setInterval(function () {
          try {
            // Check for expired types and remove them
            checkExpiredInlineTypes();
            if (Object.keys(inlineConfigs).length === 0) return;
            if (maybeStopSharedInlinePollingForQuietPage()) return;
            checkCount++;
            reapplyAllInlineStyles();
            if (checkCount % 10 === 0) {
              debugLog('[AFFO Content] Performed ' + checkCount + ' shared style checks (' + Object.keys(inlineConfigs).length + ' types)');
            }
          } catch (e) {
            debugLog('[AFFO Content] Error in shared frequent style check:', e);
          }
        }, initialFrequency);
        sharedInlineTimers.push(initialInterval);

        // Switch to less frequent monitoring after initial period
        var switchTimer = setTimeout(function () {
          clearInterval(initialInterval);
          debugLog('[AFFO Content] Switching to less frequent shared monitoring');

          var laterInterval = setInterval(function () {
            try {
              checkExpiredInlineTypes();
              if (Object.keys(inlineConfigs).length === 0) return;
              if (maybeStopSharedInlinePollingForQuietPage()) return;
              checkCount++;
              reapplyAllInlineStyles();

              // Additional protection on inline-apply domains
              if (isInline) {
                Object.keys(inlineConfigs).forEach(function (ft) {
                  var cfg = inlineConfigs[ft];
                  if (cfg) restoreManipulatedStyles(ft, cfg.cssPropsObject);
                });
              }
            } catch (e) {
              debugLog('[AFFO Content] Error in shared periodic style check:', e);
            }
          }, laterFrequency);
          sharedInlineTimers.push(laterInterval);

        }, initialDuration);
        sharedInlineTimers.push(switchTimer);

      } catch (e) {
        debugLog('[AFFO Content] Error setting up shared enhanced monitoring:', e);
      }
    }, 1000);
    sharedInlineTimers.push(monitoringTimer);
  }

  // Remove expired types from the inline config registry
  function checkExpiredInlineTypes() {
    var now = Date.now();
    Object.keys(inlineConfigs).forEach(function (ft) {
      if (inlineConfigs[ft] && inlineConfigs[ft].expiresAt <= now) {
        debugLog('[AFFO Content] Inline config expired for ' + ft);
        delete inlineConfigs[ft];
      }
    });
    if (Object.keys(inlineConfigs).length === 0) {
      cleanupSharedInlineInfra();
    }
  }

  // Tear down all shared inline infrastructure. The unified DOM observer is
  // only disconnected if no other consumer (TMI CSS / font-size scale) needs it.
  function cleanupSharedInlineInfra() {
    inlineObserverWanted = false;
    stopSharedInlinePolling();
    if (sharedInlineCleanupTimer) {
      try { clearTimeout(sharedInlineCleanupTimer); } catch (_) { }
      sharedInlineCleanupTimer = null;
    }
    maybeCleanupSharedDomObserver();
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
    if (config.fontStyle === 'italic') return 1;
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

  function buildBoldAxisSettings(config, weightOverride) {
    var axes = {};
    if (config && config.variableAxes) {
      Object.entries(config.variableAxes).forEach(function ([axis, value]) {
        if (isFinite(Number(value))) {
          axes[axis] = Number(value);
        }
      });
    }
    axes.wght = Number(weightOverride);
    return Object.entries(axes).map(function ([axis, value]) {
      return '"' + axis + '" ' + value;
    });
  }

  function extractVariationAxes(settingsText) {
    var axes = {};
    if (!settingsText) return axes;
    String(settingsText).replace(/"([^"]+)"\s+([^,]+)/g, function (_, axis, value) {
      axes[axis] = Number(value);
      return _;
    });
    return axes;
  }

  // Shared CSS generation for body and Third Man In modes.
  // Returns an array of CSS rule strings. Used by both reapplyStoredFontsFromEntry and reapplyStoredFonts.
  function generateCSSLines(fontConfig, fontType) {
    var lines = [];
    var imp = shouldUseAggressive() ? ' !important' : '';

    var customAxes = buildAllAxisSettings(fontConfig);
    var boldAxes = buildBoldAxisSettings(fontConfig, 700);
    var effectiveWeight = getEffectiveWeight(fontConfig);
    var effectiveWdth = getEffectiveWidth(fontConfig);
    var effectiveSlnt = getEffectiveSlant(fontConfig);
    var effectiveItal = getEffectiveItalic(fontConfig);

    if (fontType === 'body') {
      var bodyExclude = getBodyExcludeSelector();
      var generalSelector = 'body, body ' + bodyExclude + ':not([class*="__whatfont_"])';
      var weightSelector = 'body, body ' + bodyExclude + ':not(strong):not(b):not([class*="__whatfont_"])';

      var cssProps = [];
      if (fontConfig.fontName && fontConfig.fontName !== 'undefined') {
        cssProps.push('font-family: "' + fontConfig.fontName + '", serif' + imp);
      }
      if (!hasFontSizeScale(fontConfig) && fontConfig.fontSize) cssProps.push('font-size: ' + fontConfig.fontSize + 'px' + imp);
      if (fontConfig.lineHeight) cssProps.push('line-height: ' + fontConfig.lineHeight + imp);
      if (fontConfig.letterSpacing != null) cssProps.push('letter-spacing: ' + fontConfig.letterSpacing + 'em' + imp);
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
      if (cssProps.length > 0) {
        lines.push(generalSelector + ' { ' + cssProps.join('; ') + '; }');
      }

      if (effectiveWeight) {
        var weightRule = 'font-weight: ' + effectiveWeight + imp;
        if (customAxes.length > 0) {
          weightRule += '; font-variation-settings: ' + customAxes.join(', ') + imp;
        }
        lines.push(weightSelector + ' { ' + weightRule + '; }');
        // Bold override — font-weight only; stretch/style inherit from parent
        var boldRule = 'font-weight: 700' + imp;
        if (boldAxes.length > 0) {
          boldRule += '; font-variation-settings: ' + boldAxes.join(', ') + imp;
        }
        lines.push(joinDropCapExcludedSelectors(['body strong', 'body b']) + ' { ' + boldRule + '; }');
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
        lines.push(appendTmiTextExclude('[data-affo-font-type="' + fontType + '"]:not([data-affo-was-bold="true"])') + ' { ' + nonBoldProps.join('; ') + '; }');
      }

      // Bold rule — font-weight 700; stretch/style inherit from parent
      if ((fontConfig.fontName && fontConfig.fontName !== 'undefined') || effectiveWeight) {
        var boldProps = [];
        if (fontConfig.fontName && fontConfig.fontName !== 'undefined') {
          boldProps.push('font-family: "' + fontConfig.fontName + '", ' + generic + imp);
        }
        boldProps.push('font-weight: 700' + imp);
        if (boldAxes.length > 0) {
          boldProps.push('font-variation-settings: ' + boldAxes.join(', ') + imp);
        }
        var tmiBoldSelector = joinTmiTextExcludedSelectors([
          '[data-affo-font-type="' + fontType + '"][data-affo-was-bold="true"]'
        ]);
        lines.push(tmiBoldSelector + ' { ' + boldProps.join('; ') + '; }');
      }

      lines.push(HEADING_SELECTOR + '[data-affo-font-type="' + fontType + '"], ' + HEADING_SELECTOR + ' [data-affo-font-type="' + fontType + '"], [data-affo-font-type="' + fontType + '"] ' + HEADING_SELECTOR + ', [data-affo-font-type="' + fontType + '"] ' + HEADING_SELECTOR + ' * { font-family: revert' + imp + '; font-weight: revert' + imp + '; font-stretch: revert' + imp + '; font-style: revert' + imp + '; font-variation-settings: normal' + imp + '; }');

      // Other properties apply to body text elements
      var otherProps = [];
      if (!hasFontSizeScale(fontConfig) && fontConfig.fontSize) otherProps.push('font-size: ' + fontConfig.fontSize + 'px' + imp);
      if (fontConfig.lineHeight) otherProps.push('line-height: ' + fontConfig.lineHeight + imp);
      if (fontConfig.letterSpacing != null) otherProps.push('letter-spacing: ' + fontConfig.letterSpacing + 'em' + imp);
      if (fontConfig.fontColor) otherProps.push('color: ' + fontConfig.fontColor + imp);
      if (otherProps.length > 0) {
        lines.push(getThirdManInTextSelector(fontType) + ' { ' + otherProps.join('; ') + '; }');
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
    var loadingPromise = ensureCustomFontsLoaded().then(function () {
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
          return tryCustomFontFaceAPI(fontName, fontFaceRule, fontConfig);
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
      // User-managed local desktop fonts are already available to the browser.
      // Do not resolve/fetch Google CSS for these names.
      else if (shouldTreatFontConfigAsLocal(fontConfig)) {
        debugLog(`[AFFO Content] Using local desktop font ${fontName}`);
        return Promise.resolve();
      }
      // If Google font and not FontFace-only domain, load Google Fonts CSS
      else if (!shouldUseFontFaceOnly()) {
        return loadGoogleFontCSS(fontConfig);
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
      if (shouldTreatFontConfigAsLocal(fontConfig)) return Promise.resolve();
      var fontName = fontConfig.fontName;
      var linkId = 'a-font-face-off-style-' + fontName.replace(/\s+/g, '-').toLowerCase() + '-link';
      if (document.getElementById(linkId)) return Promise.resolve(); // Already loaded

      // Add preconnect hints before loading font
      ensureGoogleFontsPreconnect();

      return resolveCss2Url(fontName, { fallbackWhenMissing: true }).then(function (css2Url) {
        if (document.getElementById(linkId)) return; // Loaded while resolving
        if (!css2Url) {
          debugLog(`[AFFO Content] No css2Url for ${fontName} — skipping Google Fonts link`);
          return;
        }
        injectGoogleFontLink(linkId, fontName, css2Url);
      });
    } catch (e) {
      console.error(`[AFFO Content] Failed to load Google Font CSS ${fontConfig.fontName}:`, e);
      return Promise.resolve();
    }
  }

  function injectGoogleFontLink(linkId, fontName, href) {
    var link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    debugLog(`[AFFO Content] Loading Google Font CSS: ${fontName} - ${href}`);
  }

  function injectGoogleFontLinkForConfig(fontConfig) {
    try {
      var fontName = fontConfig && fontConfig.fontName;
      if (!fontName || shouldUseFontFaceOnly() || shouldTreatFontConfigAsLocal(fontConfig)) return Promise.resolve(false);
      var linkId = 'a-font-face-off-style-' + fontName.replace(/\s+/g, '-').toLowerCase() + '-link';
      if (document.getElementById(linkId)) return Promise.resolve(true);
      ensureGoogleFontsPreconnect();
      return resolveCss2Url(fontName).then(function (css2Url) {
        if (!css2Url) return false;
        if (document.getElementById(linkId)) return true;
        injectGoogleFontLink(linkId, fontName, css2Url);
        return true;
      }).catch(function () {
        return false;
      });
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function parseFontFaceWeightDescriptor(block) {
    var weightMatch = String(block || '').match(/font-weight:\s*([^;]+);/i);
    var rawWeight = weightMatch ? weightMatch[1].trim() : '400';
    var normalized = rawWeight.toLowerCase();

    if (normalized === 'normal') {
      return { descriptor: '400', min: 400, max: 400 };
    }
    if (normalized === 'bold') {
      return { descriptor: '700', min: 700, max: 700 };
    }

    var numericWeights = rawWeight.match(/\d+/g);
    if (!numericWeights || numericWeights.length === 0) {
      return { descriptor: '400', min: 400, max: 400 };
    }

    var minWeight = Number(numericWeights[0]);
    var maxWeight = Number(numericWeights[numericWeights.length > 1 ? 1 : 0]);
    if (!isFinite(minWeight) || !isFinite(maxWeight)) {
      return { descriptor: '400', min: 400, max: 400 };
    }

    if (maxWeight < minWeight) {
      var tmp = minWeight;
      minWeight = maxWeight;
      maxWeight = tmp;
    }

    return {
      descriptor: numericWeights.length > 1 ? (minWeight + ' ' + maxWeight) : String(minWeight),
      min: minWeight,
      max: maxWeight
    };
  }

  function parseFontFaceSimpleDescriptor(block, propertyName) {
    var re = new RegExp(propertyName + '\\s*:\\s*([^;]+);', 'i');
    var match = String(block || '').match(re);
    return match ? match[1].trim() : '';
  }

  function parseFontFaceStyleDescriptor(block) {
    var style = parseFontFaceSimpleDescriptor(block, 'font-style').toLowerCase();
    return style || 'normal';
  }

  function shouldLoadCustomFontFaceBlock(weightInfo, fontConfig) {
    if (!weightInfo || !fontConfig) return true;

    var wantedWeights = [];
    var effectiveWeight = getEffectiveWeight(fontConfig);
    wantedWeights.push(effectiveWeight != null ? effectiveWeight : 400);
    wantedWeights.push(700); // keep bold descendants fast and correct

    return wantedWeights.some(function (weight) {
      return weight >= weightInfo.min && weight <= weightInfo.max;
    });
  }

  function getWantedGoogleFontStyle(fontConfig) {
    var effectiveItalic = getEffectiveItalic(fontConfig || {});
    return effectiveItalic !== null && effectiveItalic >= 1 ? 'italic' : 'normal';
  }

  function shouldLoadGoogleFontFaceEntry(entry, fontConfig) {
    if (!entry) return false;
    if (!shouldLoadCustomFontFaceBlock(entry.weightInfo, fontConfig)) return false;

    var wantedStyle = getWantedGoogleFontStyle(fontConfig);
    var entryStyle = entry.style || 'normal';
    if (entryStyle === wantedStyle) return true;

    // Oblique descriptors are uncommon in Google Fonts CSS, but if present they
    // are the closest match for AFFO's slant control.
    return wantedStyle === 'italic' && entryStyle.indexOf('oblique') === 0;
  }

  function filterGoogleFontFaceEntriesForConfig(entries, fontConfig) {
    if (!entries || entries.length === 0) return [];

    var matchingStyleAndWeight = entries.filter(function (entry) {
      return shouldLoadGoogleFontFaceEntry(entry, fontConfig);
    });
    if (matchingStyleAndWeight.length > 0) return matchingStyleAndWeight;

    var matchingWeight = entries.filter(function (entry) {
      return shouldLoadCustomFontFaceBlock(entry.weightInfo, fontConfig);
    });
    return matchingWeight.length > 0 ? matchingWeight : entries;
  }

  function buildFontFaceDescriptors(entry) {
    var descriptors = {
      display: 'swap'
    };
    if (entry && entry.weightInfo && entry.weightInfo.descriptor) {
      descriptors.weight = entry.weightInfo.descriptor;
    }
    if (entry && entry.style) {
      descriptors.style = entry.style;
    }
    if (entry && entry.unicodeRange) {
      descriptors.unicodeRange = entry.unicodeRange;
    }
    if (entry && entry.stretch) {
      descriptors.stretch = entry.stretch;
    }
    return descriptors;
  }

  function buildDescriptorMapByUrl(entries) {
    var byUrl = {};
    (entries || []).forEach(function (entry) {
      if (entry && entry.url && !byUrl[entry.url]) {
        byUrl[entry.url] = buildFontFaceDescriptors(entry);
      }
    });
    return byUrl;
  }

  var loadedGoogleFontFaceKeys = {};
  var loadingGoogleFontFaceKeys = {};
  var queuedGoogleFontFaceKeys = {};
  var loadedCustomFontFaceKeys = {};
  var loadingCustomFontFaceKeys = {};
  var queuedCustomFontFaceKeys = {};
  var lazyGoogleSubsetObservers = {};

  function stopLazyGoogleSubsetObserver(fontName, reason) {
    var record = lazyGoogleSubsetObservers[fontName];
    if (!record) return;
    try {
      if (record.observer) record.observer.disconnect();
      if (record.timeoutId) clearTimeout(record.timeoutId);
      if (record.debounceId) clearTimeout(record.debounceId);
    } catch (_) { }
    delete lazyGoogleSubsetObservers[fontName];
    debugLog('[AFFO Content] Stopped lazy Google subset observer for ' + fontName + (reason ? ' (' + reason + ')' : ''));
  }

  function getGoogleFontFaceLoadKey(fontName, descriptors) {
    var desc = descriptors || {};
    return [
      String(fontName || ''),
      desc.weight || '400',
      desc.style || 'normal',
      desc.stretch || 'normal',
      desc.unicodeRange || 'U+0-10FFFF'
    ].join('|');
  }

  function getCustomFontFaceLoadKey(fontName, descriptors, index) {
    return getGoogleFontFaceLoadKey(fontName, descriptors) + '|' + index;
  }

  function getFontFaceSrcUrl(block) {
    return AFFOFontFaceUtils.extractFontFaceSrcUrl(block);
  }

  function buildCustomFontFaceDescriptors(block) {
    var unicodeRange = parseFontFaceSimpleDescriptor(block, 'unicode-range');
    return buildFontFaceDescriptors({
      weightInfo: parseFontFaceWeightDescriptor(block),
      style: parseFontFaceStyleDescriptor(block),
      unicodeRange: unicodeRange,
      stretch: parseFontFaceSimpleDescriptor(block, 'font-stretch')
    });
  }

  function getDataUrlFontFormat(fontUrl) {
    var header = String(fontUrl || '').split(',')[0].toLowerCase();
    if (header.indexOf('woff2') !== -1) return 'WOFF2';
    if (header.indexOf('woff') !== -1) return 'WOFF';
    if (header.indexOf('opentype') !== -1 || header.indexOf('otf') !== -1) return 'OTF';
    if (header.indexOf('truetype') !== -1 || header.indexOf('ttf') !== -1) return 'TTF';
    return 'font';
  }

  function decodeBase64DataUrl(fontUrl) {
    var value = String(fontUrl || '');
    var commaIndex = value.indexOf(',');
    if (commaIndex === -1) return null;
    var header = value.slice(0, commaIndex);
    if (!/;base64/i.test(header)) return null;
    var base64Data = value.slice(commaIndex + 1).replace(/\s+/g, '');
    if (!base64Data) return null;

    var binaryString = atob(base64Data);
    var bytes = new Uint8Array(binaryString.length);
    for (var i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function tryCustomFontFaceAPI(fontName, fontFaceRule, fontConfig) {
    if (!window.FontFace || !document.fonts) {
      debugLog(`[AFFO Content] FontFace API not supported for custom font ${fontName}`);
      return Promise.resolve();
    }

    try {
      var customTimer = createAffoTimer('Custom FontFace ' + fontName);
      debugLog(`[AFFO Content] Parsing custom @font-face rule for ${fontName}`);

      // Parse @font-face rule to extract WOFF2 URLs and font descriptors
      var fontFaceBlocks = fontFaceRule.split('@font-face')
        .filter(function (block) { return block.trim().length > 0; })
        .map(function (block) { return '@font-face' + block; });
      var selectedFontFaceBlocks = fontFaceBlocks.filter(function (block) {
        return shouldLoadCustomFontFaceBlock(parseFontFaceWeightDescriptor(block), fontConfig);
      });
      if (selectedFontFaceBlocks.length === 0) {
        selectedFontFaceBlocks = fontFaceBlocks;
      }

      debugLog(`[AFFO Content] Found ${fontFaceBlocks.length} @font-face blocks for ${fontName}, loading ${selectedFontFaceBlocks.length}`);
      customTimer.mark('parse', selectedFontFaceBlocks.length + '/' + fontFaceBlocks.length + ' blocks selected');

      var customFontFaceJobs = selectedFontFaceBlocks.map(function (block, index) {
        var fontUrl = getFontFaceSrcUrl(block);
        if (!fontUrl) {
          debugLog(`[AFFO Content] No URL found in @font-face block ${index + 1} for ${fontName}`);
          return null;
        }

        var descriptors = buildCustomFontFaceDescriptors(block);
        var loadKey = getCustomFontFaceLoadKey(fontName, descriptors, index);
        return {
          index: index,
          fontUrl: fontUrl,
          descriptors: descriptors,
          loadKey: loadKey
        };
      }).filter(Boolean);

      if (customFontFaceJobs.length === 0) {
        customTimer.end('(no font URLs)');
        return Promise.resolve();
      }

      function notifyCustomFontLoaded(successCount) {
        // For x.com with inline apply, trigger style re-application after font loading
        if (!shouldUseInlineApply() || successCount <= 0) return;
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

      function loadCustomFontFaceJob(job) {
        var index = job.index;
        var fontUrl = job.fontUrl;
        var descriptors = job.descriptors;
        var loadKey = job.loadKey;
        var variantLabel = (index + 1) + '/' + customFontFaceJobs.length;
        var variantTimer = createAffoTimer('Custom FontFace ' + fontName + ' variant ' + (index + 1));

        if (loadedCustomFontFaceKeys[loadKey]) {
          debugLog(`[AFFO Content] Custom FontFace already loaded for ${fontName} variant ${index + 1}, skipping`);
          variantTimer.end('(already loaded)');
          return Promise.resolve({ ok: true, byteLength: 0, skipped: true });
        }
        if (loadingCustomFontFaceKeys[loadKey]) {
          debugLog(`[AFFO Content] Custom FontFace already loading for ${fontName} variant ${index + 1}, skipping duplicate request`);
          variantTimer.end('(already loading)');
          return Promise.resolve({ ok: true, byteLength: 0, skipped: true });
        }
        delete queuedCustomFontFaceKeys[loadKey];
        loadingCustomFontFaceKeys[loadKey] = true;

        debugLog(`[AFFO Content] Font descriptors ${index + 1}:`, descriptors);

        // Handle data: URLs (for AP fonts and other base64-embedded fonts)
        if (/^data:/i.test(fontUrl)) {
          var fontFormat = getDataUrlFontFormat(fontUrl);
          debugLog(`[AFFO Content] Found ${fontFormat} data: URL ${index + 1} for ${fontName}`);

          try {
            var arrayBuffer = decodeBase64DataUrl(fontUrl);
            if (!arrayBuffer) {
              debugLog(`[AFFO Content] Invalid data: URL format for ${fontName} variant ${index + 1}`);
              variantTimer.end('(invalid data URL)');
              delete loadingCustomFontFaceKeys[loadKey];
              return Promise.resolve({ ok: false, byteLength: 0 });
            }

            debugLog(`[AFFO Content] Decoded data: URL for ${fontName} variant ${index + 1} (${arrayBuffer.byteLength} bytes)`);
            variantTimer.mark('decoded', arrayBuffer.byteLength + ' bytes');

            // Create FontFace with ArrayBuffer and descriptors
            var fontFace = new FontFace(fontName, arrayBuffer, descriptors);
            document.fonts.add(fontFace);

            return fontFace.load().then(function () {
              loadedCustomFontFaceKeys[loadKey] = true;
              debugLog(`[AFFO Content] Custom FontFace API successful for ${fontName} data: URL variant ${index + 1}`);
              variantTimer.end('(data URL loaded)');
              return { ok: true, byteLength: arrayBuffer.byteLength };
            }).catch(function (e) {
              debugLog(`[AFFO Content] Custom FontFace API failed for ${fontName} data: URL variant ${index + 1}:`, e);
              variantTimer.end('(data URL failed)');
              return { ok: false, byteLength: arrayBuffer.byteLength };
            }).then(function (result) {
              delete loadingCustomFontFaceKeys[loadKey];
              return result;
            });
          } catch (e) {
            debugLog(`[AFFO Content] Error decoding data: URL for ${fontName} variant ${index + 1}:`, e);
            variantTimer.end('(decode exception)');
            delete loadingCustomFontFaceKeys[loadKey];
            return Promise.resolve({ ok: false, byteLength: 0 });
          }
        }

        // Handle HTTP/HTTPS URLs - download via background script
        var httpFontFormat = fontUrl.toLowerCase().endsWith('.woff2') ? 'WOFF2' : 'WOFF';
        debugLog(`[AFFO Content] Found ${httpFontFormat} HTTP URL ${variantLabel}: ${fontUrl}`);

        return sendBackgroundMessage({
          type: 'affoFetch',
          url: fontUrl,
          binary: true
        }).then(function (response) {
          if (response && response.ok && response.binary && response.data) {
            var cacheStatus = response.cached ? 'cached' : 'downloaded';
            debugLog(`[AFFO Content] Custom font ${cacheStatus} ${index + 1} successful for ${fontName}`);

            var arrayBuffer = getArrayBufferFromBinaryResponseData(response.data);

            debugLog(`[AFFO Content] Created ArrayBuffer ${index + 1} for ${fontName} (${arrayBuffer.byteLength} bytes)`);
            variantTimer.mark('fetch', cacheStatus + ', ' + arrayBuffer.byteLength + ' bytes');

            // Create FontFace with ArrayBuffer and descriptors
            var fontFace = new FontFace(fontName, arrayBuffer, descriptors);
            document.fonts.add(fontFace);

            return fontFace.load().then(function () {
              loadedCustomFontFaceKeys[loadKey] = true;
              debugLog(`[AFFO Content] Custom FontFace API successful for ${fontName} variant ${index + 1}`);
              variantTimer.end('(loaded)');
              return { ok: true, byteLength: arrayBuffer.byteLength };
            }).catch(function (e) {
              debugLog(`[AFFO Content] Custom FontFace API failed for ${fontName} variant ${index + 1}:`, e);
              variantTimer.end('(load failed)');
              return { ok: false, byteLength: arrayBuffer.byteLength };
            });

          } else {
            debugLog(`[AFFO Content] Custom font download ${index + 1} failed for ${fontUrl}`);
            variantTimer.end('(download failed)');
            return { ok: false, byteLength: 0 };
          }
        }).catch(function (e) {
          debugLog(`[AFFO Content] Custom font download ${index + 1} exception:`, e);
          variantTimer.end('(download exception)');
          return { ok: false, byteLength: 0 };
        }).then(function (result) {
          delete loadingCustomFontFaceKeys[loadKey];
          return result;
        });
      }

      function loadInitialCustomFontFaceJobs(jobs) {
        var results = [];
        var loadedBytes = 0;
        var deferredByBudget = [];
        var orderedJobs = jobs || [];

        function loadNext(index) {
          if (index >= orderedJobs.length) {
            return Promise.resolve();
          }
          if (index > 0 && FONTFACE_INITIAL_BYTE_BUDGET && loadedBytes >= FONTFACE_INITIAL_BYTE_BUDGET) {
            deferredByBudget = orderedJobs.slice(index);
            debugLog(`[AFFO Content] Initial custom font byte budget reached for ${fontName}: ${(loadedBytes / (1024 * 1024)).toFixed(2)}MB loaded, deferring ${deferredByBudget.length} variants`);
            return Promise.resolve();
          }

          return loadCustomFontFaceJob(orderedJobs[index]).then(function (result) {
            results.push(result);
            loadedBytes += getFontLoadByteLength(result);
            return loadNext(index + 1);
          });
        }

        return loadNext(0).then(function () {
          return {
            results: results,
            loadedBytes: loadedBytes,
            deferredByBudget: deferredByBudget
          };
        });
      }

      function scheduleDeferredCustomFontFaceLoads(deferredJobs) {
        var queuedDeferredJobs = (deferredJobs || []).filter(function (job) {
          if (!job || !job.loadKey) return false;
          if (loadedCustomFontFaceKeys[job.loadKey] || loadingCustomFontFaceKeys[job.loadKey] || queuedCustomFontFaceKeys[job.loadKey]) {
            return false;
          }
          queuedCustomFontFaceKeys[job.loadKey] = true;
          return true;
        });
        if (queuedDeferredJobs.length === 0) return;

        debugLog(`[AFFO Content] Deferring ${queuedDeferredJobs.length} custom font variants for ${fontName} (idle, serial)`);
        scheduleFontFaceDeferredWork(function () {
          runWithConcurrency(queuedDeferredJobs, 1, loadCustomFontFaceJob).then(function (results) {
            var successCount = countFontLoadSuccesses(results);
            debugLog(`[AFFO Content] Deferred custom font load completed ${successCount}/${results.length} variants for ${fontName}`);
            notifyCustomFontLoaded(successCount);
          }).catch(function (e) {
            debugLog(`[AFFO Content] Deferred custom font load failed for ${fontName}:`, e);
          });
        });
      }

      return loadInitialCustomFontFaceJobs(customFontFaceJobs).then(function (initialResult) {
        var results = initialResult.results;
        var successCount = countFontLoadSuccesses(results);
        elementLog(`Loaded initial ${successCount}/${results.length} custom font variants for ${fontName} (${(initialResult.loadedBytes / (1024 * 1024)).toFixed(2)}MB)`);
        customTimer.end('(initial variants loaded)');
        notifyCustomFontLoaded(successCount);
        scheduleDeferredCustomFontFaceLoads(initialResult.deferredByBudget);
        return results;
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
        var unicodeRange = unicodeMatch ? unicodeMatch[1].trim() : '';
        entries.push({
          url: urlMatch[2],
          ranges: parseUnicodeRanges(unicodeRange),
          unicodeRange: unicodeRange,
          weightInfo: parseFontFaceWeightDescriptor(block),
          style: parseFontFaceStyleDescriptor(block),
          stretch: parseFontFaceSimpleDescriptor(block, 'font-stretch')
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
  var FONTFACE_VISIBLE_TEXT_NODE_LIMIT = 5000;
  var FONTFACE_MAX_SUBSET_DOWNLOADS = 16;
  var FONTFACE_INITIAL_BYTE_BUDGET = 1536 * 1024;
  var FONTFACE_DEFERRED_DOWNLOAD_DELAY_MS = 350;
  var FONTFACE_DEFERRED_IDLE_TIMEOUT_MS = 2500;
  var FONTFACE_PARSED_CSS_CACHE_LIMIT = 32;
  var FONTFACE_LAZY_SUBSET_OBSERVER_MS = 30000;
  var FONTFACE_LAZY_SUBSET_DEBOUNCE_MS = 600;
  var FONTFACE_FULL_SUBSET_FONTS = [
    'Charis SIL', 'Gentium Plus', 'Gentium Book Plus', 'Noto Sans Mono'
  ];
  var parsedFontFaceCssCache = {};
  var parsedFontFaceCssCacheOrder = [];

  function getParsedFontFaceCssCacheKey(cssText, cacheKey) {
    if (cacheKey) return String(cacheKey);
    var css = String(cssText || '');
    return 'inline:' + css.length + ':' + css.slice(0, 80) + ':' + css.slice(-80);
  }

  function rememberParsedFontFaceCssCacheKey(key) {
    parsedFontFaceCssCacheOrder = parsedFontFaceCssCacheOrder.filter(function (existingKey) {
      return existingKey !== key;
    });
    parsedFontFaceCssCacheOrder.push(key);
    while (parsedFontFaceCssCacheOrder.length > FONTFACE_PARSED_CSS_CACHE_LIMIT) {
      var oldestKey = parsedFontFaceCssCacheOrder.shift();
      delete parsedFontFaceCssCache[oldestKey];
    }
  }

  function getParsedFontFaceEntriesForCss(cssText, cacheKey) {
    var key = getParsedFontFaceCssCacheKey(cssText, cacheKey);
    if (parsedFontFaceCssCache[key]) {
      rememberParsedFontFaceCssCacheKey(key);
      debugLog('[AFFO Content] Parsed Google Fonts CSS cache hit: ' + key);
      return parsedFontFaceCssCache[key].entries;
    }

    var parseTimer = createAffoTimer('Parse Google Fonts CSS');
    var entries = extractFontFaceEntries(cssText);
    parsedFontFaceCssCache[key] = {
      entries: entries,
      timestamp: Date.now()
    };
    rememberParsedFontFaceCssCacheKey(key);
    parseTimer.end('(' + entries.length + ' @font-face entries)');
    return entries;
  }

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

  function buildEntriesByUrl(entries) {
    return (entries || []).reduce(function (map, entry) {
      if (!entry || !entry.url) return map;
      if (!map[entry.url]) map[entry.url] = [];
      map[entry.url].push(entry);
      return map;
    }, {});
  }

  function rangesOverlap(ranges, start, end) {
    if (!ranges || ranges.length === 0) return false;
    return ranges.some(function (range) {
      return range && range.length >= 2 && range[0] <= end && range[1] >= start;
    });
  }

  function entryOverlapsAnyRange(entries, targetRanges) {
    return (entries || []).some(function (entry) {
      return targetRanges.some(function (target) {
        return rangesOverlap(entry.ranges, target[0], target[1]);
      });
    });
  }

  function classifyFontFaceUrlsByUnicodeRange(urls, entries) {
    var entriesByUrl = buildEntriesByUrl(entries);
    var latinCoreRanges = [
      [0x0000, 0x00FF], // Basic Latin + Latin-1 Supplement
      [0x2000, 0x206F], // General punctuation
      [0x20A0, 0x20CF]  // Currency symbols
    ];
    var latinExtRanges = [
      [0x0100, 0x024F], // Latin Extended-A/B
      [0x1E00, 0x1EFF], // Latin Extended Additional
      [0x2100, 0x214F], // Letterlike symbols
      [0x2150, 0x218F], // Number forms
      [0xFB00, 0xFB06]  // Latin ligatures
    ];

    var latinUrls = [];
    var latinExtUrls = [];
    var otherUrls = [];

    (urls || []).forEach(function (url) {
      var urlEntries = entriesByUrl[url] || [];
      if (entryOverlapsAnyRange(urlEntries, latinCoreRanges) || (url.indexOf('latin') !== -1 && url.indexOf('latin-ext') === -1)) {
        latinUrls.push(url);
      } else if (entryOverlapsAnyRange(urlEntries, latinExtRanges) || url.indexOf('latin-ext') !== -1) {
        latinExtUrls.push(url);
      } else {
        otherUrls.push(url);
      }
    });

    return {
      latinUrls: latinUrls,
      latinExtUrls: latinExtUrls,
      otherUrls: otherUrls
    };
  }

  function isArrayBufferValue(value) {
    return value && Object.prototype.toString.call(value) === '[object ArrayBuffer]';
  }

  function getArrayBufferFromBinaryResponseData(data) {
    if (isArrayBufferValue(data)) return data;
    if (data && ArrayBuffer.isView(data)) {
      if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
        return data.buffer;
      }
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    var uint8Array = new Uint8Array(data || []);
    return uint8Array.buffer;
  }

  function hasHiddenAncestorForFontSubsetScan(element, visibilityCache) {
    if (visibilityCache && visibilityCache.has(element)) {
      return visibilityCache.get(element);
    }
    var el = element;
    var depth = 0;
    var hidden = false;
    while (el && el.nodeType === 1 && depth < 12) {
      var tagName = el.tagName;
      if (INLINE_MEANINGFUL_IGNORE_TAGS[tagName] || tagName === 'SVG' || tagName === 'CANVAS') {
        hidden = true;
        break;
      }
      if (el.hidden || el.getAttribute('aria-hidden') === 'true') {
        hidden = true;
        break;
      }

      try {
        var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          style.contentVisibility === 'hidden')) {
          hidden = true;
          break;
        }
      } catch (_) { }

      if (el === document.body) break;
      el = el.parentElement;
      depth++;
    }
    if (visibilityCache) visibilityCache.set(element, hidden);
    return hidden;
  }

  function addTextCodePoints(text, needed, stats) {
    if (!text) return false;
    var added = false;
    var limit = Math.min(text.length, Math.max(0, FONTFACE_SUBSET_SAMPLE_LIMIT - stats.sampledCodeUnits));
    var consumedCodeUnits = 0;
    for (var i = 0; i < limit; i++) {
      var codePoint = text.codePointAt(i);
      if (!Number.isFinite(codePoint)) continue;
      needed.add(codePoint);
      added = true;
      consumedCodeUnits++;
      if (codePoint > 0xFFFF) {
        i++;
        consumedCodeUnits++;
      }
      if (FONTFACE_MAX_UNIQUE_CODEPOINTS && needed.size >= FONTFACE_MAX_UNIQUE_CODEPOINTS) {
        break;
      }
    }
    stats.sampledCodeUnits += consumedCodeUnits;
    return added;
  }

  // Collect a snapshot of code points in the current document to choose subsets
  function collectNeededCodePoints() {
    var needed = new Set();
    var stats = {
      sampledCodeUnits: 0,
      scannedTextNodes: 0
    };
    try {
      if (document.body && document.createTreeWalker) {
        var filterAccept = window.NodeFilter ? window.NodeFilter.FILTER_ACCEPT : 1;
        var filterReject = window.NodeFilter ? window.NodeFilter.FILTER_REJECT : 2;
        var showText = window.NodeFilter ? window.NodeFilter.SHOW_TEXT : 4;
        var visibilityCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
        var walker = document.createTreeWalker(document.body, showText, {
          acceptNode: function (node) {
            var text = node && node.nodeValue ? node.nodeValue : '';
            if (!text || !text.trim()) return filterReject;
            if (!node.parentElement || hasHiddenAncestorForFontSubsetScan(node.parentElement, visibilityCache)) return filterReject;
            return filterAccept;
          }
        });
        var node;
        while ((node = walker.nextNode()) &&
          stats.sampledCodeUnits < FONTFACE_SUBSET_SAMPLE_LIMIT &&
          stats.scannedTextNodes < FONTFACE_VISIBLE_TEXT_NODE_LIMIT &&
          (!FONTFACE_MAX_UNIQUE_CODEPOINTS || needed.size < FONTFACE_MAX_UNIQUE_CODEPOINTS)) {
          stats.scannedTextNodes++;
          addTextCodePoints(node.nodeValue || '', needed, stats);
        }
      }

      if (needed.size === 0 && document.body && typeof document.body.textContent === 'string') {
        addTextCodePoints(document.body.textContent.slice(0, FONTFACE_SUBSET_SAMPLE_LIMIT), needed, stats);
      }

      // If nothing was captured (empty pages), bias toward basic Latin so pages still render
      if (needed.size === 0) {
        addTextCodePoints('Hello', needed, stats);
      }
      debugLog(`[AFFO Content] Collected ${needed.size} visible code points from ${stats.sampledCodeUnits} sampled code units across ${stats.scannedTextNodes} text nodes`);
    } catch (e) {
      debugLog('[AFFO Content] Failed to collect needed code points:', e);
    }
    return needed;
  }

  // Select only the font files whose unicode-range overlaps the page content
  function selectUrlsByUnicodeRange(urls, entries, neededCodePoints, options) {
    var opts = options || {};
    var maxUrls = opts.maxUrls;
    var fallbackWhenNoMatch = opts.fallbackWhenNoMatch !== false;

    var uniqueUrls = dedupeUrls(urls);
    if (uniqueUrls.length === 0) return [];
    if (!entries || entries.length === 0 || !neededCodePoints || neededCodePoints.size === 0) {
      if (!fallbackWhenNoMatch) return [];
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
      if (!fallbackWhenNoMatch) return [];
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

  function isFontLoadSuccess(result) {
    return result === true || !!(result && result.ok === true);
  }

  function getFontLoadByteLength(result) {
    return result && Number.isFinite(result.byteLength) ? result.byteLength : 0;
  }

  function countFontLoadSuccesses(results) {
    return (results || []).filter(isFontLoadSuccess).length;
  }

  function scheduleFontFaceDeferredWork(callback) {
    setTimeout(function () {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(callback, { timeout: FONTFACE_DEFERRED_IDLE_TIMEOUT_MS });
      } else {
        callback();
      }
    }, FONTFACE_DEFERRED_DOWNLOAD_DELAY_MS);
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
      var googleTimer = createAffoTimer('Google FontFace ' + fontName);
      var resolvedCssUrl = '';
      debugLog(`[AFFO Content] Downloading WOFF2 font data for ${fontName} via background script`);

      return resolveCss2Url(fontName, { fallbackWhenMissing: true }).then(function (cssUrl) {
        if (!cssUrl) {
          debugLog(`[AFFO Content] No css2Url for ${fontName} — skipping FontFace download`);
          googleTimer.end('(no css2Url)');
          return null;
        }
        resolvedCssUrl = cssUrl;
        googleTimer.mark('css2-url');
        debugLog(`[AFFO Content] Using runtime css2Url for ${fontName}`);
        return sendBackgroundMessage({
          type: 'affoFetch',
          url: cssUrl,
          binary: false
        });
      }).then(function (response) {
        if (!response) return;
        if (response && response.ok && !response.binary && response.data) {
          debugLog(`[AFFO Content] Got Google Fonts CSS for ${fontName}`);
          googleTimer.mark('css-fetch', response.cached ? '(cache hit)' : '(fetched)');

          // Parse CSS to extract WOFF2 URLs
          var css = response.data;
          var woff2Matches = css.match(/url\(([^)]+\.woff2[^)]*)\)/g);

          if (woff2Matches && woff2Matches.length > 0) {
            debugLog(`[AFFO Content] Found ${woff2Matches.length} WOFF2 URLs in CSS (different subsets/styles)`);

            // Extract all WOFF2 URLs first, then narrow to the configured style
            // and weight plus 700 for bold descendants.
            var fontFaceEntries = getParsedFontFaceEntriesForCss(css, resolvedCssUrl || fontName);
            var candidateEntries = filterGoogleFontFaceEntriesForConfig(fontFaceEntries, fontConfig);
            var woff2Urls = (candidateEntries.length > 0 ? candidateEntries.map(function (entry) {
              return entry.url;
            }) : woff2Matches.map(function (match) {
              return match.replace(/url\((['"]?)([^'"]+)\1\)/, '$2');
            }));
            var uniqueWoff2Urls = dedupeUrls(woff2Urls);
            var totalCssWoff2UrlCount = dedupeUrls(fontFaceEntries.map(function (entry) { return entry.url; })).length || uniqueWoff2Urls.length;
            var descriptorMap = buildDescriptorMapByUrl(candidateEntries.length > 0 ? candidateEntries : fontFaceEntries);
            debugLog(`[AFFO Content] Eligible WOFF2 URLs after style/weight filtering: ${uniqueWoff2Urls.length}/${totalCssWoff2UrlCount} for ${fontName}`);
            googleTimer.mark('css-parse', fontFaceEntries.length + ' entries, ' + uniqueWoff2Urls.length + ' eligible URLs');

            // Skip subset filtering for fonts with comprehensive IPA/Unicode coverage
            var skipSubsetFiltering = FONTFACE_FULL_SUBSET_FONTS.indexOf(fontName) !== -1;
            var fontFaceEntriesForSelection = candidateEntries.length > 0 ? candidateEntries : fontFaceEntries;
            var filteredUrls;
            var lazyUrls = [];
            if (skipSubsetFiltering) {
              filteredUrls = uniqueWoff2Urls;
              debugLog('[AFFO Content] Skipping subset filtering for IPA-complete font: ' + fontName);
            } else {
              // Build unicode-range map per URL so we can mimic browser subset selection
              var neededCodePoints = collectNeededCodePoints();
              filteredUrls = selectUrlsByUnicodeRange(uniqueWoff2Urls, fontFaceEntriesForSelection, neededCodePoints, {
                maxUrls: FONTFACE_MAX_SUBSET_DOWNLOADS
              });
              var filteredUrlSet = new Set(filteredUrls);
              lazyUrls = uniqueWoff2Urls.filter(function (url) {
                return !filteredUrlSet.has(url);
              });

              if (FONTFACE_MAX_SUBSET_DOWNLOADS && uniqueWoff2Urls.length > filteredUrls.length &&
                filteredUrls.length === FONTFACE_MAX_SUBSET_DOWNLOADS) {
                debugWarn(`[AFFO Content] Using ${filteredUrls.length}/${uniqueWoff2Urls.length} subsets for ${fontName} (cap ${FONTFACE_MAX_SUBSET_DOWNLOADS})`);
              }
            }
            googleTimer.mark('subset-select', filteredUrls.length + ' selected, ' + lazyUrls.length + ' lazy');

            // Prioritize Latin subsets for faster initial render. Google Fonts
            // WOFF2 URLs are opaque, so classify by parsed unicode-range.
            var urlGroups = classifyFontFaceUrlsByUnicodeRange(filteredUrls, fontFaceEntriesForSelection);
            var latinUrls = urlGroups.latinUrls;
            var latinExtUrls = urlGroups.latinExtUrls;
            var otherUrls = urlGroups.otherUrls;

            debugLog(`[AFFO Content] Prioritizing font loading after unicode filtering: ${latinUrls.length} Latin, ${latinExtUrls.length} Latin-ext, ${otherUrls.length} other subsets for ${fontName}`);

            // Load core Latin first, then defer broader coverage serially to
            // reduce first-apply memory spikes on FontFace-only domains.
            var prioritizedUrls = latinUrls.concat(latinExtUrls).concat(otherUrls);

            if (prioritizedUrls.length === 0) {
              debugLog(`[AFFO Content] No WOFF2 URLs selected after unicode filtering for ${fontName}`);
              googleTimer.end('(no selected WOFF2 URLs)');
              return Promise.resolve();
            }

            debugLog(`[AFFO Content] Selected ${prioritizedUrls.length}/${uniqueWoff2Urls.length} eligible WOFF2 URLs for ${fontName} after unicode filtering (${totalCssWoff2UrlCount} total CSS URLs; ${getWantedGoogleFontStyle(fontConfig)}, configured/bold weights)`);

            var urlOrder = {};
            prioritizedUrls.forEach(function (url, index) {
              urlOrder[url] = index;
            });
            var lazyUrlOrder = {};
            lazyUrls.forEach(function (url, index) {
              lazyUrlOrder[url] = index;
            });

            var initialUrls = latinUrls.slice();
            var deferredUrls = latinExtUrls.concat(otherUrls);
            if (initialUrls.length === 0) {
              initialUrls = prioritizedUrls.slice(0, 1);
              deferredUrls = prioritizedUrls.slice(1);
            }
            stopLazyGoogleSubsetObserver(fontName, 'new apply');

            function loadGoogleWoff2Url(woff2Url) {
              var displayLabel = Object.prototype.hasOwnProperty.call(urlOrder, woff2Url) ?
                ((urlOrder[woff2Url] + 1) + '/' + prioritizedUrls.length) :
                (Object.prototype.hasOwnProperty.call(lazyUrlOrder, woff2Url) ?
                  ('lazy ' + (lazyUrlOrder[woff2Url] + 1) + '/' + lazyUrls.length) :
                  ('?/' + prioritizedUrls.length));
              var subsetTimer = createAffoTimer('Google WOFF2 ' + fontName + ' ' + displayLabel);
              debugLog(`[AFFO Content] Requesting WOFF2 ${displayLabel}: ${woff2Url}`);

              var descriptors = descriptorMap[woff2Url] || { display: 'swap' };
              var loadKey = getGoogleFontFaceLoadKey(fontName, descriptors);
              delete queuedGoogleFontFaceKeys[loadKey];
              if (loadedGoogleFontFaceKeys[loadKey]) {
                debugLog(`[AFFO Content] FontFace already loaded for ${fontName} subset ${displayLabel}, skipping`);
                subsetTimer.end('(already loaded)');
                return Promise.resolve({ ok: true, byteLength: 0, skipped: true });
              }
              if (loadingGoogleFontFaceKeys[loadKey]) {
                debugLog(`[AFFO Content] FontFace already queued for ${fontName} subset ${displayLabel}, skipping duplicate request`);
                subsetTimer.end('(already loading)');
                return Promise.resolve({ ok: true, byteLength: 0, skipped: true });
              }
              loadingGoogleFontFaceKeys[loadKey] = true;

              return sendBackgroundMessage({
                type: 'affoFetch',
                url: woff2Url,
                binary: true
              }).then(function (woff2Response) {
                if (woff2Response && woff2Response.ok && woff2Response.binary && woff2Response.data) {
                  var cacheStatus = woff2Response.cached ? 'cache hit' : 'downloaded';
                  debugLog(`[AFFO Content] WOFF2 ${cacheStatus} ${displayLabel} successful for ${fontName}`);

                  var arrayBuffer = getArrayBufferFromBinaryResponseData(woff2Response.data);

                  debugLog(`[AFFO Content] Created ArrayBuffer ${displayLabel} for ${fontName} (${arrayBuffer.byteLength} bytes)`);
                  subsetTimer.mark('fetch', cacheStatus + ', ' + arrayBuffer.byteLength + ' bytes');

                  // Create FontFace with ArrayBuffer - load each subset
                  var fontFace = new FontFace(fontName, arrayBuffer, descriptors);
                  document.fonts.add(fontFace);

                  return fontFace.load().then(function () {
                    loadedGoogleFontFaceKeys[loadKey] = true;
                    debugLog(`[AFFO Content] FontFace API successful for ${fontName} subset ${displayLabel}`);
                    subsetTimer.end('(loaded)');
                    return { ok: true, byteLength: arrayBuffer.byteLength };
                  }).catch(function (e) {
                    debugLog(`[AFFO Content] FontFace API failed for ${fontName} subset ${displayLabel}:`, e);
                    subsetTimer.end('(load failed)');
                    return { ok: false, byteLength: arrayBuffer.byteLength };
                  });

                } else {
                  debugLog(`[AFFO Content] WOFF2 request ${displayLabel} failed for ${woff2Url}`);
                  subsetTimer.end('(request failed)');
                  return { ok: false, byteLength: 0 };
                }
              }).catch(function (e) {
                debugLog(`[AFFO Content] WOFF2 request ${displayLabel} exception:`, e);
                subsetTimer.end('(request exception)');
                return { ok: false, byteLength: 0 };
              }).then(function (result) {
                delete loadingGoogleFontFaceKeys[loadKey];
                return result;
              });
            }

            function reserveGoogleWoff2Urls(urls) {
              return (urls || []).filter(function (woff2Url) {
                var descriptors = descriptorMap[woff2Url] || { display: 'swap' };
                var loadKey = getGoogleFontFaceLoadKey(fontName, descriptors);
                if (loadedGoogleFontFaceKeys[loadKey] || loadingGoogleFontFaceKeys[loadKey] || queuedGoogleFontFaceKeys[loadKey]) {
                  return false;
                }
                queuedGoogleFontFaceKeys[loadKey] = true;
                return true;
              });
            }

            function loadInitialGoogleWoff2Urls(urls) {
              var results = [];
              var loadedBytes = 0;
              var deferredByBudget = [];
              var orderedUrls = urls || [];

              function loadNext(index) {
                if (index >= orderedUrls.length) {
                  return Promise.resolve();
                }
                if (index > 0 && FONTFACE_INITIAL_BYTE_BUDGET && loadedBytes >= FONTFACE_INITIAL_BYTE_BUDGET) {
                  deferredByBudget = orderedUrls.slice(index);
                  debugLog(`[AFFO Content] Initial WOFF2 byte budget reached for ${fontName}: ${(loadedBytes / (1024 * 1024)).toFixed(2)}MB loaded, deferring ${deferredByBudget.length} subsets`);
                  return Promise.resolve();
                }

                return loadGoogleWoff2Url(orderedUrls[index]).then(function (result) {
                  results.push(result);
                  loadedBytes += getFontLoadByteLength(result);
                  return loadNext(index + 1);
                });
              }

              return loadNext(0).then(function () {
                return {
                  results: results,
                  loadedBytes: loadedBytes,
                  deferredByBudget: deferredByBudget
                };
              });
            }

            function scheduleDeferredGoogleWoff2Loads() {
              var queuedDeferredUrls = reserveGoogleWoff2Urls(deferredUrls);
              if (queuedDeferredUrls.length === 0) return;
              debugLog(`[AFFO Content] Deferring ${queuedDeferredUrls.length} secondary WOFF2 subsets for ${fontName} (idle, serial)`);
              scheduleFontFaceDeferredWork(function () {
                runWithConcurrency(queuedDeferredUrls, 1, loadGoogleWoff2Url).then(function (results) {
                  var successCount = countFontLoadSuccesses(results);
                  debugLog(`[AFFO Content] Deferred WOFF2 load completed ${successCount}/${results.length} subsets for ${fontName}`);
                }).catch(function (e) {
                  debugLog(`[AFFO Content] Deferred WOFF2 load failed for ${fontName}:`, e);
                });
              });
            }

            function scheduleLazyGoogleWoff2Loads() {
              if (lazyUrls.length === 0) return;
              if (!window.MutationObserver || !document.body) {
                debugLog(`[AFFO Content] Lazy Google subset observer unavailable for ${fontName}; ${lazyUrls.length} subsets will stay unloaded until reapply`);
                return;
              }

              var remainingLazyUrls = lazyUrls.slice();
              var lazyUrlToRanges = buildUrlToRanges(fontFaceEntriesForSelection);
              var record = {
                observer: null,
                timeoutId: null,
                debounceId: null
              };
              lazyGoogleSubsetObservers[fontName] = record;

              function disconnect(reason) {
                stopLazyGoogleSubsetObserver(fontName, reason);
              }

              function removeQueuedFromRemaining(queuedUrls) {
                var queuedSet = new Set(queuedUrls);
                remainingLazyUrls = remainingLazyUrls.filter(function (url) {
                  return !queuedSet.has(url);
                });
              }

              function textMatchesRemainingLazyRanges(text, sampleLimit) {
                if (!text || remainingLazyUrls.length === 0) return false;
                var value = String(text);
                var limit = Math.min(value.length, sampleLimit || FONTFACE_SUBSET_SAMPLE_LIMIT);
                for (var i = 0; i < limit; i++) {
                  var codePoint = value.codePointAt(i);
                  if (!Number.isFinite(codePoint)) continue;
                  for (var j = 0; j < remainingLazyUrls.length; j++) {
                    if (rangesOverlap(lazyUrlToRanges[remainingLazyUrls[j]], codePoint, codePoint)) {
                      return true;
                    }
                  }
                  if (codePoint > 0xFFFF) i++;
                }
                return false;
              }

              function nodeMatchesRemainingLazyRanges(node) {
                if (!node) return false;
                if (node.nodeType === 3) return textMatchesRemainingLazyRanges(node.nodeValue || '');
                if (node.nodeType !== 1) return false;
                if (INLINE_MEANINGFUL_IGNORE_TAGS[node.tagName]) return false;

                var sampledChars = 0;
                function scan(current) {
                  if (!current || sampledChars >= FONTFACE_SUBSET_SAMPLE_LIMIT) return false;
                  if (current.nodeType === 3) {
                    var text = current.nodeValue || '';
                    var remaining = FONTFACE_SUBSET_SAMPLE_LIMIT - sampledChars;
                    if (textMatchesRemainingLazyRanges(text, remaining)) return true;
                    sampledChars += Math.min(text.length, remaining);
                    return false;
                  }
                  if (current.nodeType !== 1) return false;
                  if (INLINE_MEANINGFUL_IGNORE_TAGS[current.tagName]) return false;
                  for (var i = 0; i < current.childNodes.length; i++) {
                    if (scan(current.childNodes[i])) return true;
                    if (sampledChars >= FONTFACE_SUBSET_SAMPLE_LIMIT) return false;
                  }
                  return false;
                }

                return scan(node);
              }

              function runLazySubsetCheck(reason) {
                if (remainingLazyUrls.length === 0) {
                  disconnect('all lazy subsets considered');
                  return;
                }

                var neededCodePoints = collectNeededCodePoints();
                var matchedUrls = selectUrlsByUnicodeRange(remainingLazyUrls, fontFaceEntriesForSelection, neededCodePoints, {
                  maxUrls: FONTFACE_MAX_SUBSET_DOWNLOADS,
                  fallbackWhenNoMatch: false
                });
                var queuedLazyUrls = reserveGoogleWoff2Urls(matchedUrls);
                if (queuedLazyUrls.length === 0) return;

                removeQueuedFromRemaining(queuedLazyUrls);
                debugLog(`[AFFO Content] Lazy-loading ${queuedLazyUrls.length} newly needed WOFF2 subsets for ${fontName} (${reason}); ${remainingLazyUrls.length} still lazy`);
                scheduleFontFaceDeferredWork(function () {
                  var lazyTimer = createAffoTimer('Lazy Google WOFF2 ' + fontName);
                  runWithConcurrency(queuedLazyUrls, 1, loadGoogleWoff2Url).then(function (results) {
                    var successCount = countFontLoadSuccesses(results);
                    lazyTimer.end('(' + successCount + '/' + results.length + ' subsets loaded)');
                  }).catch(function (e) {
                    lazyTimer.end('(failed)');
                    debugLog(`[AFFO Content] Lazy WOFF2 load failed for ${fontName}:`, e);
                  });
                });

                if (remainingLazyUrls.length === 0) {
                  disconnect('all lazy subsets queued');
                }
              }

              function scheduleLazySubsetCheck(reason) {
                if (record.debounceId) clearTimeout(record.debounceId);
                record.debounceId = setTimeout(function () {
                  record.debounceId = null;
                  runLazySubsetCheck(reason);
                }, FONTFACE_LAZY_SUBSET_DEBOUNCE_MS);
              }

              record.observer = new MutationObserver(function (mutations) {
                var hasLazyRangeChange = mutations.some(function (mutation) {
                  if (mutation.type === 'characterData') {
                    return textMatchesRemainingLazyRanges(mutation.target && mutation.target.nodeValue);
                  }
                  return Array.prototype.some.call(mutation.addedNodes || [], nodeMatchesRemainingLazyRanges);
                });
                if (hasLazyRangeChange) scheduleLazySubsetCheck('new matching text');
              });
              record.observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
              });
              record.timeoutId = setTimeout(function () {
                disconnect('timeout');
              }, FONTFACE_LAZY_SUBSET_OBSERVER_MS);
              debugLog(`[AFFO Content] Watching for newly needed Google font subsets for ${fontName}: ${lazyUrls.length} lazy subsets for ${FONTFACE_LAZY_SUBSET_OBSERVER_MS}ms`);
            }

            return loadInitialGoogleWoff2Urls(initialUrls).then(function (initialResult) {
              var results = initialResult.results;
              if (initialResult.deferredByBudget.length) {
                deferredUrls = dedupeUrls(initialResult.deferredByBudget.concat(deferredUrls));
              }
              var successCount = countFontLoadSuccesses(results);
              debugLog(`[AFFO Content] Loaded initial WOFF2 subsets ${successCount}/${results.length} for ${fontName} (${(initialResult.loadedBytes / (1024 * 1024)).toFixed(2)}MB)`);
              googleTimer.mark('initial-load', successCount + '/' + results.length + ' subsets');
              scheduleDeferredGoogleWoff2Loads();
              scheduleLazyGoogleWoff2Loads();
              googleTimer.end('(initial pipeline complete)');
              return results;
            });

          } else {
            debugLog(`[AFFO Content] No WOFF2 URLs found in Google Fonts CSS for ${fontName}`);
            googleTimer.end('(no WOFF2 URLs)');
            return Promise.resolve();
          }
        } else {
          debugLog(`[AFFO Content] Failed to get Google Fonts CSS for ${fontName}:`, response ? response.error : 'No response');
          googleTimer.end('(CSS fetch failed)');
          return Promise.resolve();
        }
      }).catch(function (e) {
        debugLog(`[AFFO Content] Google Fonts CSS fetch exception for ${fontName}:`, e);
        googleTimer.end('(exception)');
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
  // In-flight promise cache — prevents concurrent walkers for the same types
  var elementWalkerInFlight = {}; // fontType → Promise

  // Apply/update AFFO type markers on a single element using a precomputed
  // style. Shared by the full-document walker and the scoped (mutation-driven)
  // walker so marking behavior stays identical between them.
  function markElementForTypes(element, cs, typeSet, markedCounts) {
    var detectedType = getElementFontType(element, cs);
    var currentMarker = element.getAttribute('data-affo-font-type');

    // Update marker: set if type detected and in requested set, remove if not
    if (detectedType && typeSet[detectedType]) {
      if (currentMarker !== detectedType) {
        element.setAttribute('data-affo-font-type', detectedType);
      }
      if (!element.getAttribute('data-affo-original-font-type')) {
        element.setAttribute('data-affo-original-font-type', detectedType);
      }
      if (isBoldFontWeightValue(cs.fontWeight)) {
        element.setAttribute('data-affo-was-bold', 'true');
      } else {
        element.removeAttribute('data-affo-was-bold');
      }
      if (markedCounts) markedCounts[detectedType]++;
      return detectedType;
    } else if (currentMarker && typeSet[currentMarker]) {
      // Element had a marker for one of the types we're walking, but shouldn't anymore
      element.removeAttribute('data-affo-font-type');
      element.removeAttribute('data-affo-original-font-type');
      element.removeAttribute('data-affo-was-bold');
    }
    return null;
  }

  // Scoped marker for mutation-driven updates: walks only the given added-node
  // subtree roots (not the whole document) and marks text-owning elements.
  // For non-inline TMI this is sufficient on its own — the injected attribute-
  // selector CSS styles the freshly marked nodes automatically. Mirrors the
  // full walker's acceptNode/visibility/interactive-subtree pruning so results
  // are identical to a full re-walk over just that subtree.
  function markTypesInRoots(roots, types) {
    if (!roots || roots.length === 0 || !types || types.length === 0) return;
    var typeSet = {};
    types.forEach(function (ft) { typeSet[ft] = true; });

    function markOne(el) {
      if (!el) return;
      var cs;
      try {
        cs = window.getComputedStyle(el);
        if (el.tagName !== 'BODY' && (cs.display === 'none' || cs.visibility === 'hidden')) return;
      } catch (_) { return; }
      markElementForTypes(el, cs, typeSet, null);
    }

    roots.forEach(function (root) {
      if (!root || root.nodeType !== 1) return;
      try {
        if (isInteractiveSubtreeRoot(root) || isInsideInteractiveSubtree(root)) return;
        if (isInsideDropCap(root)) return;
      } catch (_) { return; }

      if (elementMayOwnTmiText(root)) markOne(root);

      var walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: function (node) {
            if (isInteractiveSubtreeRoot(node)) return NodeFilter.FILTER_REJECT;
            if (isDropCapElement(node)) return NodeFilter.FILTER_REJECT;
            return elementMayOwnTmiText(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          }
        }
      );
      var node;
      while ((node = walker.nextNode())) {
        markOne(node);
      }
    });
  }

  // Element type detection logic (module-scope so both single and unified walker can use it)
  // computedStyle is passed from the walker to avoid a second getComputedStyle call
  function getElementFontType(element, computedStyle) {
    var tagName = element.tagName.toLowerCase();
    var className = element.className || '';
    var style = element.style.fontFamily || '';

    // Exclude headings, UI elements, and form controls
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'nav', 'header', 'footer', 'aside', 'figcaption', 'button', 'input', 'select', 'textarea', 'label'].indexOf(tagName) !== -1) return null;
    if (element.closest && element.closest('h1, h2, h3, h4, h5, h6')) return null;

    // Exclude descendants of non-body containers: figcaptions, buttons, guards,
    // post headers, top-bar chrome, and optionally Substack comments on
    // configured domains. Article decks/standfirsts inside article headers
    // are handled separately by isInsideArticleDeck(). Interactive subtrees
    // (dialogs/modals) are intentionally NOT listed here: both the full and
    // scoped walkers prune them via FILTER_REJECT / root guards before any
    // element inside one reaches this function, so a .closest() check for them
    // would be dead weight on every element.
    if (element.closest) {
      var closestSelector = 'figcaption, button, .no-affo, [data-affo-guard], .post-header, .main-menu, [class*="topBar"]';
      if (shouldIgnoreComments()) closestSelector += ', .comments-page';
      if (element.closest(closestSelector)) return null;
    }

    if (isInsideDropCap(element)) return null;

    if (isSubstackPrimaryButtonWrapperText(element)) return null;

    if (isInsideArticleDeck(element)) {
      clearAffoProtection(element);
      return null;
    }

    // Exclude ARIA landmark roles
    var role = element.getAttribute && element.getAttribute('role');
    if (role && ['navigation', 'banner', 'contentinfo', 'complementary'].indexOf(role) !== -1) return null;

    // Convert className safely for pattern matching
    var classText = (typeof className === 'string' ? className : className.toString()).toLowerCase();

    // Exclude navigation and UI class names
    if (classText && /\b(nav|menu|header|footer|sidebar|toolbar|breadcrumb|caption)\b/i.test(classText)) return null;

    // Semantic code containers should stay eligible even when syntax highlighters
    // move all visible text into nested token spans, leaving the wrapper with no
    // direct text nodes of its own.
    if (['code', 'pre', 'kbd', 'samp', 'tt'].indexOf(tagName) !== -1) return 'mono';

    // Exclude syntax highlighting and code blocks
    if (classText && /\b(hljs|token|prettyprint|prettyprinted|sourceCode|wp-block-code|wp-block-preformatted|terminal)\b/.test(classText)) return null;
    if (classText && /\blanguage-/.test(classText)) return null;

    // Exclude small-caps classes
    if (classText && /\b(small-caps|smallcaps|smcp)\b/.test(classText)) return null;
    if (classText && /(?:^|\s)sc(?:\s|$)/.test(classText)) return null;

    // Exclude metadata and byline patterns, but do not mistake font family
    // utility classes such as "font-meta-serif-pro" for page metadata.
    if (hasNonFontClassTokenMatch(className, /(?:^|[-_])(byline|author|date|meta)(?:[-_]|$)/)) return null;

    // Exclude widget, ad, and UI chrome patterns
    if (classText && /\b(widget|dropdown|modal|tooltip|advertisement)\b/.test(classText)) return null;

    // Exclude WhatFont overlay elements
    if (classText && /whatfont/.test(classText)) return null;
    var elId = element.id || '';
    if (elId && /whatfont/.test(elId)) return null;

    // Mark direct-text nodes, plus semantic text containers whose content is
    // split across simple inline wrappers (e.g. Substack paragraphs made of
    // span/br/span). Larger structural wrappers still stay unmarked.
    if (!elementOwnsTmiText(element)) return null;

    // Once AFFO has marked an element, its computed font-family may reflect the
    // replacement font rather than the page's original serif/sans/mono role.
    // Preserve the original role so font-load rechecks do not remove markers
    // when applying a serif font to sans content or vice versa.
    var currentAffoType = element.getAttribute && element.getAttribute('data-affo-font-type');
    var originalAffoType = element.getAttribute && element.getAttribute('data-affo-original-font-type');
    if (currentAffoType && (originalAffoType === 'serif' || originalAffoType === 'sans' || originalAffoType === 'mono')) {
      return originalAffoType;
    }

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
    var fontHintClassText = getTmiFontHintClassText(className);

    // Check for monospace keywords
    if (/\b(monospace|mono|code)\b/.test(fontHintClassText) ||
      /\b(monospace|mono)\b/.test(styleText)) return 'mono';

    // Check computed font names before class/inline serif/sans hints so
    // inactive utility tokens cannot override the font actually being rendered.
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

    // Family-suffix fallback for names like "Stack Sans" / "Stack Serif".
    // Treat "... Sans Serif" as sans (same intent as generic sans-serif).
    for (var si = 0; si < computedParts.length; si++) {
      var family = computedParts[si];
      if (!family) continue;
      if (/\bsans(?:-|\s)+serif$/.test(family)) return 'sans';
      if (/\bsans$/.test(family)) return 'sans';
      if (/\bserif$/.test(family)) return 'serif';
    }

    // Fall back to generic keywords in computed font-family
    if (/\b(ui-monospace|monospace)\b/.test(computedText)) {
      return 'mono';
    }

    if (/\bsans-serif\b/.test(computedText)) {
      return 'sans';
    }

    if (/\bserif\b/.test(computedText.replace('sans-serif', ''))) {
      return 'serif';
    }

    // Check inline style and active-looking class hints only after computed
    // font-family has had a chance to classify the rendered typeface.
    if (/\bsans-serif\b/.test(styleText)) return 'sans';
    if (/\bsans\b(?!-serif)/.test(styleText)) return 'sans';
    if (/\bsans-serif\b/.test(fontHintClassText)) return 'sans';
    if (/\bsans\b(?!-serif)/.test(fontHintClassText)) return 'sans';

    // Check for serif (but not sans-serif) in class names and inline styles
    if (/\bserif\b/.test(fontHintClassText.replace('sans-serif', '')) ||
      /\bserif\b/.test(styleText.replace('sans-serif', ''))) {
      return 'serif';
    }

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
  // Returns a Promise that resolves with markedCounts when the walk finishes
  function runElementWalkerAll(fontTypes) {
    // Filter to types not already completed
    var typesToWalk = fontTypes.filter(function (ft) {
      return !elementWalkerCompleted[ft];
    });
    if (typesToWalk.length === 0) {
      debugLog('[AFFO Content] All requested font types already walked, skipping');
      return Promise.resolve({});
    }

    // In-flight coalescing: if all requested types already have an in-flight promise, return it
    var allInFlight = typesToWalk.every(function (ft) { return elementWalkerInFlight[ft]; });
    if (allInFlight) {
      debugLog('[AFFO Content] All requested types already in-flight, coalescing');
      return elementWalkerInFlight[typesToWalk[0]];
    }

    var promise = new Promise(function (resolve) {
      try {
        var typeSet = {};
        typesToWalk.forEach(function (ft) { typeSet[ft] = true; });

        debugLog('[AFFO Content] Starting unified element walker for: ' + typesToWalk.join(', '));
        var startTime = performance.now();

        // Don't clear markers upfront — update them incrementally during the walk.
        // This prevents the "revert flash" where markers are cleared synchronously
        // but re-applied chunk-by-chunk with setTimeout(0) delays in between.

        // Walk elements that can actually own TMI text. Avoid node.textContent
        // here; reading full subtrees in TreeWalker.acceptNode is expensive on
        // large pages because it happens for every element.
        var walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: function (node) {
              if (isInteractiveSubtreeRoot(node)) return NodeFilter.FILTER_REJECT;
              if (isDropCapElement(node)) return NodeFilter.FILTER_REJECT;
              return elementMayOwnTmiText(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
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
            markElementForTypes(element, cs, typeSet, markedCounts);
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
          debugLog('[AFFO Content] Unified walker completed in ' + duration + 'ms: ' + totalElements + ' elements, marked ' + summary);

          // Mark all walked types as completed and clear in-flight cache
          typesToWalk.forEach(function (ft) {
            elementWalkerCompleted[ft] = true;
            delete elementWalkerInFlight[ft];
          });

          // Schedule delayed rechecks for lazy-loaded content
          scheduleElementWalkerRechecks(typesToWalk);
          reapplyActiveFontSizeScales(typesToWalk);
          resolve(markedCounts);
        }

        processChunk();
      } catch (e) {
        console.error('[AFFO Content] Unified element walker failed:', e);
        // Clear in-flight cache on error
        typesToWalk.forEach(function (ft) { delete elementWalkerInFlight[ft]; });
        resolve({});
      }
    });

    // Store the same promise under each type key for in-flight coalescing
    typesToWalk.forEach(function (ft) { elementWalkerInFlight[ft] = promise; });

    return promise;
  }

  // Single-type wrapper (for runtime messages and individual type calls)
  function runElementWalker(fontType) {
    return runElementWalkerAll([fontType]);
  }

  function resetWalkerStateForEntry(entry) {
    ['serif', 'sans', 'mono'].forEach(function (ft) {
      if (!entry || !entry[ft]) return;
      elementWalkerCompleted[ft] = false;
      elementWalkerRechecksScheduled[ft] = false;
      delete elementWalkerInFlight[ft];
    });
  }

  function getActiveTmiFontTypes(entry) {
    return ['serif', 'sans', 'mono'].filter(function (ft) {
      return hasMeaningfulFontConfig(entry && entry[ft]);
    });
  }

  function createTmiWalkerPromiseForEntry(entry) {
    var activeTmiTypes = getActiveTmiFontTypes(entry);
    return activeTmiTypes.length > 0 ? runElementWalkerAll(activeTmiTypes) : null;
  }

  // Helper function to reapply fonts from a given entry (used by storage listener and page load)
  function reapplyStoredFontsFromEntry(entry, options) {
    try {
      if (!(options && options.skipDuplicateCheck) && shouldSkipDuplicateEntryReapply(entry, 'stored-font entry')) return;
      lastReappliedEntry = entry || null;
      syncSrouletteCssTrackingForEntry(entry);
      syncObservedTmiCssTypesFromEntry(entry);
      clearFontSizeScalesNotInEntry(entry);
      var tmiWalkerPromise = createTmiWalkerPromiseForEntry(entry);
      ['body', 'serif', 'sans', 'mono'].forEach(function (fontType) {
        var fontConfig = entry[fontType];
        if (hasMeaningfulFontConfig(fontConfig)) {
          debugLog(`[AFFO Content] Reapplying ${fontType} font from storage change:`, fontConfig.fontName);

          // Run element walker for Third Man In mode
          var isTmi = fontType === 'serif' || fontType === 'sans' || fontType === 'mono';
          var walkerPromise = isTmi ? tmiWalkerPromise : null;

          // Inject CSS immediately (before font loads) to prevent flash of original font
          var lines = [];
          if (fontConfig.fontFaceRule) {
            lines.push(fontConfig.fontFaceRule);
          }
          lines = lines.concat(generateCSSLines(fontConfig, fontType));
          var css = lines.join('\n');

          if (css) {
            if (shouldUseInlineApply()) {
              // For TMI types, wait for walker to mark elements before applying inline styles
              if (isTmi && walkerPromise) {
                walkerPromise.then(function () { applyInlineStyles(fontConfig, fontType); });
              } else {
                applyInlineStyles(fontConfig, fontType);
              }
            } else if (isResolvedSrouletteCssTarget(entry, fontType)) {
              if (isTmi && walkerPromise) {
                walkerPromise.then(function () {
                  requestSrouletteCssInsert(fontType, css);
                  applyFontSizeScale(fontConfig, fontType);
                });
              } else {
                requestSrouletteCssInsert(fontType, css);
                applyFontSizeScale(fontConfig, fontType);
              }
            } else {
              var styleId = 'a-font-face-off-style-' + fontType;
              var existingStyle = document.getElementById(styleId);
              if (existingStyle) existingStyle.remove();

              var styleEl = document.createElement('style');
              styleEl.id = styleId;
              styleEl.textContent = css;
              document.head.appendChild(styleEl);
              ensureNonAggressiveStyleOrderChaser();
              if (isTmi && walkerPromise) {
                walkerPromise.then(function () { applyFontSizeScale(fontConfig, fontType); });
              } else {
                applyFontSizeScale(fontConfig, fontType);
              }
              debugLog(`[AFFO Content] Applied CSS for ${fontType} from storage change:`, css);
            }
          } else {
            if (isTmi && walkerPromise) {
              walkerPromise.then(function () { applyFontSizeScale(fontConfig, fontType); });
            } else {
              applyFontSizeScale(fontConfig, fontType);
            }
          }

          // Resolve and inject Google Fonts <link> without waiting for loadFont's async chain.
          if (fontConfig.fontName && !fontConfig.fontFaceRule && !shouldUseFontFaceOnly() && !shouldTreatFontConfigAsLocal(fontConfig)) {
            injectGoogleFontLinkForConfig(fontConfig);
          }

          // Load font file (handles custom fonts, FontFace-only domains, etc.)
          loadFont(fontConfig, fontType).catch(function (e) {
            debugWarn(`[AFFO Content] Error loading font after storage change:`, e);
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

      function reapplyCustomFontEntry(entry) {
        if (!entry) return;
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

      if (lastReappliedEntry) {
        reapplyCustomFontEntry(lastReappliedEntry);
        return;
      }

      // Fallback for pages that applied a concrete stored font before this listener cached it.
      browser.storage.local.get('affoApplyMap').then(function (data) {
        var map = data && data.affoApplyMap ? data.affoApplyMap : {};
        var entry = map[currentOrigin];
        reapplyCustomFontEntry(entry);
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

    browser.storage.local.get(['affoApplyMap', 'affoSubstackRoulette', 'affoSubstackRouletteSerif', 'affoSubstackRouletteSans', 'affoSubstackRouletteBeigeDisabledDomains', 'affoFavorites', 'affoFontFaceOnlyDomains', 'affoInlineApplyDomains', 'affoAggressiveDomains', 'affoWaitForItDomains', 'affoIgnoreCommentsDomains', 'affoLocalFonts']).then(function (data) {
      // Ensure domain lists are populated before any reapply logic runs
      // (the earlier fire-and-forget load at script top may not have resolved yet)
      if (Array.isArray(data.affoFontFaceOnlyDomains)) {
        fontFaceOnlyDomains = data.affoFontFaceOnlyDomains;
      }
      if (Array.isArray(data.affoInlineApplyDomains)) {
        inlineApplyDomains = data.affoInlineApplyDomains;
      }
      if (Array.isArray(data.affoAggressiveDomains)) {
        aggressiveDomains = data.affoAggressiveDomains;
      }
      if (Array.isArray(data.affoWaitForItDomains)) {
        waitForItDomains = data.affoWaitForItDomains;
      }
      if (Array.isArray(data.affoIgnoreCommentsDomains)) {
        ignoreCommentsDomains = data.affoIgnoreCommentsDomains;
      }
      if (Array.isArray(data.affoSubstackRouletteBeigeDisabledDomains)) {
        substackRouletteBeigeDisabledDomains = data.affoSubstackRouletteBeigeDisabledDomains;
      }
      localFontNames = normalizeLocalFontsValue(data.affoLocalFonts || []);
      var map = data && data.affoApplyMap ? data.affoApplyMap : {};
      var entry = map[origin];
      if (!entry) {
        lastReappliedEntry = null;
        requestSrouletteCssRemoval();
        clearObservedTmiCssTypes();
        refreshSharedTmiCssObserver();
        clearAllFontSizeScales();
        // Clean up all stale styles if no entry exists
        ['a-font-face-off-style-body', 'a-font-face-off-style-serif', 'a-font-face-off-style-sans', 'a-font-face-off-style-mono'].forEach(function (id) { try { var n = document.getElementById(id); if (n) n.remove(); } catch (e) { } });
        removeSubstackRouletteEnhancements();
        maybeStopNonAggressiveStyleOrderChaser();

        // --- Substack Roulette ---
        // Only meaningful on Substack documents; skip all setup (closure,
        // DOMContentLoaded listener, timer) on the vast majority of pages that
        // aren't Substack. getIsSubstack() is cheap and memoized.
        var rouletteEnabled = data.affoSubstackRoulette !== false; // default true
        var rouletteSerif = Array.isArray(data.affoSubstackRouletteSerif) ? data.affoSubstackRouletteSerif : [];
        var rouletteSans = Array.isArray(data.affoSubstackRouletteSans) ? data.affoSubstackRouletteSans : [];
        var favorites = data.affoFavorites || {};

        if (getIsSubstack() && rouletteEnabled && rouletteSerif.length >= 1 && rouletteSans.length >= 1) {
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

            // Resolve css2 URLs before applying so first paint gets the metadata-derived URL.
            resolveCss2UrlsForEntry({ serif: serifConfig, sans: sansConfig }).then(function () {
              substackRouletteActive = true;
              syncSubstackRouletteBeige();
              // Apply via existing TMI path
              reapplyStoredFontsFromEntry({ serif: serifConfig, sans: sansConfig });
              scheduleSubstackRouletteDimming();

              // Set up SPA navigation hooks for roulette TMI fonts
              if (!shouldUseInlineApply()) {
                function reapplyRouletteAfterNavigation() {
                  try {
                    SUBSTACK_ROULETTE_CSS_TARGETS.forEach(function (ft) {
                      elementWalkerCompleted[ft] = false;
                      elementWalkerRechecksScheduled[ft] = false;
                    });
                    runElementWalkerAll(SUBSTACK_ROULETTE_CSS_TARGETS);
                    scheduleSubstackRouletteDimming();
                  } catch (_) { }
                }
                registerSpaHandler(reapplyRouletteAfterNavigation);
              }
            });
          }

          // Store for Wait For It manual trigger
          pendingSubstackRoulette = trySubstackRoulette;

          // Wait For It domains skip auto-roulette; applied on demand via toolbar long-press.
          if (!waitForItDomains.includes(currentOrigin)) {
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', trySubstackRoulette);
            } else {
              setTimeout(trySubstackRoulette, 100);
            }
          }
        }

        return;
      }

      var effectiveEntry = materializeSrouletteEntry(entry, data);

      // Content script handles cleanup AND reapplies stored fonts on page load
      debugLog(`[AFFO Content] Reapplying stored fonts for origin: ${origin}`, effectiveEntry);
      removeSubstackRouletteEnhancements();

      // Remove style elements for fonts that are not applied
      if (!effectiveEntry.body) {
        try { var s3 = document.getElementById('a-font-face-off-style-body'); if (s3) s3.remove(); } catch (e) { }
      }
      if (!effectiveEntry.serif) {
        try { var s = document.getElementById('a-font-face-off-style-serif'); if (s) s.remove(); } catch (e) { }
      }
      if (!effectiveEntry.sans) {
        try { var s2 = document.getElementById('a-font-face-off-style-sans'); if (s2) s2.remove(); } catch (e) { }
      }
      if (!effectiveEntry.mono) {
        try { var s4 = document.getElementById('a-font-face-off-style-mono'); if (s4) s4.remove(); } catch (e) { }
      }

      // Reapply stored fonts on page load - wait for DOM to be ready
      function reapplyStoredFonts() {
        try {
          if (shouldSkipDuplicateEntryReapply(effectiveEntry, 'page-init entry')) return;
          lastReappliedEntry = effectiveEntry || null;
          syncSrouletteCssTrackingForEntry(effectiveEntry);
          syncObservedTmiCssTypesFromEntry(effectiveEntry);
          clearFontSizeScalesNotInEntry(effectiveEntry);
          var tmiWalkerPromise = createTmiWalkerPromiseForEntry(effectiveEntry);
          ['body', 'serif', 'sans', 'mono'].forEach(function (fontType) {
            var fontConfig = effectiveEntry[fontType];
            if (hasMeaningfulFontConfig(fontConfig)) {
              debugLog(`[AFFO Content] Reapplying ${fontType} font:`, fontConfig.fontName);

              // Run element walker for Third Man In mode
              var isTmi = fontType === 'serif' || fontType === 'sans' || fontType === 'mono';
              var walkerPromise = isTmi ? tmiWalkerPromise : null;

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
                  // For TMI types, wait for walker to mark elements before applying inline styles
                  if (isTmi && walkerPromise) {
                    walkerPromise.then(function () { applyInlineStyles(fontConfig, fontType); });
                  } else {
                    applyInlineStyles(fontConfig, fontType);
                  }
                } else if (isResolvedSrouletteCssTarget(effectiveEntry, fontType)) {
                  if (isTmi && walkerPromise) {
                    walkerPromise.then(function () {
                      requestSrouletteCssInsert(fontType, css);
                      applyFontSizeScale(fontConfig, fontType);
                    });
                  } else {
                    requestSrouletteCssInsert(fontType, css);
                    applyFontSizeScale(fontConfig, fontType);
                  }
                } else {
                  var styleId = 'a-font-face-off-style-' + fontType;
                  var existingStyle = document.getElementById(styleId);
                  if (existingStyle) existingStyle.remove();

                  var styleEl = document.createElement('style');
                  styleEl.id = styleId;
                  styleEl.textContent = css;
                  document.head.appendChild(styleEl);
                  ensureNonAggressiveStyleOrderChaser();
                  if (isTmi && walkerPromise) {
                    walkerPromise.then(function () { applyFontSizeScale(fontConfig, fontType); });
                  } else {
                    applyFontSizeScale(fontConfig, fontType);
                  }
                  elementLog(`Applied CSS for ${fontType}:`, css);
                }
              } else {
                if (isTmi && walkerPromise) {
                  walkerPromise.then(function () { applyFontSizeScale(fontConfig, fontType); });
                } else {
                  applyFontSizeScale(fontConfig, fontType);
                }
              }

              // Resolve and inject Google Fonts <link> without waiting for loadFont's async chain.
              if (fontConfig.fontName && !fontConfig.fontFaceRule && !shouldUseFontFaceOnly() && !shouldTreatFontConfigAsLocal(fontConfig)) {
                injectGoogleFontLinkForConfig(fontConfig);
              }

              // Load font file (handles custom fonts, FontFace-only domains, etc.)
              loadFont(fontConfig, fontType).catch(function (e) {
                debugWarn(`[AFFO Content] Error loading font on page init:`, e);
              });
            }
          });
        } catch (e) {
          console.error('[AFFO Content] Error reapplying fonts:', e);
        }
      }

      // Reapply immediately — content script runs at document_end so DOM is already parsed.
      // No delay needed; earlier injection reduces flash of original fonts.
      // Wait For It domains skip auto-reapply; fonts applied on demand via toolbar long-press.
      if (!waitForItDomains.includes(currentOrigin)) {
        reapplyStoredFonts();
      }

      // Set up SPA navigation hooks for normal TMI mode (non-inline-apply domains)
      // On SPA nav, reset walker completion flags so TMI elements get re-marked
      var hasTmiEntries = effectiveEntry.serif || effectiveEntry.sans || effectiveEntry.mono;
      if (hasTmiEntries && !shouldUseInlineApply()) {
        function reapplyTmiAfterNavigation() {
          try {
            var activeTmiTypes = ['serif', 'sans', 'mono'].filter(function (ft) { return !!effectiveEntry[ft]; });
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
      if (area !== 'local') return;
      try {
        var origin = location.hostname;
        if (changes.affoLocalFonts) {
          localFontNames = normalizeLocalFontsValue(changes.affoLocalFonts.newValue || []);
        }
        var ignoreCommentsMembershipChanged = false;
        if (changes.affoIgnoreCommentsDomains) {
          var oldIgnoreList = Array.isArray(changes.affoIgnoreCommentsDomains.oldValue) ? changes.affoIgnoreCommentsDomains.oldValue : [];
          var newIgnoreList = Array.isArray(changes.affoIgnoreCommentsDomains.newValue) ? changes.affoIgnoreCommentsDomains.newValue : [];
          ignoreCommentsDomains = newIgnoreList;
          ignoreCommentsMembershipChanged = oldIgnoreList.includes(origin) !== newIgnoreList.includes(origin);
        }
        var substackBeigeMembershipChanged = false;
        if (changes.affoSubstackRouletteBeigeDisabledDomains) {
          var oldBeigeDisabledList = Array.isArray(changes.affoSubstackRouletteBeigeDisabledDomains.oldValue) ? changes.affoSubstackRouletteBeigeDisabledDomains.oldValue : [];
          var newBeigeDisabledList = Array.isArray(changes.affoSubstackRouletteBeigeDisabledDomains.newValue) ? changes.affoSubstackRouletteBeigeDisabledDomains.newValue : [];
          substackRouletteBeigeDisabledDomains = newBeigeDisabledList;
          substackBeigeMembershipChanged = oldBeigeDisabledList.includes(origin) !== newBeigeDisabledList.includes(origin);
        }
        var rouletteKeysChanged = !!(
          changes.affoSubstackRoulette ||
          changes.affoSubstackRouletteSerif ||
          changes.affoSubstackRouletteSans ||
          changes.affoFavorites
        );
        if (!changes.affoApplyMap) {
          if (substackBeigeMembershipChanged && !rouletteKeysChanged) {
            if (getIsSubstack() && substackRouletteActive) {
              syncSubstackRouletteBeige();
            }
            return;
          }
          if (ignoreCommentsMembershipChanged) {
            browser.storage.local.get(['affoApplyMap']).then(function (data) {
              try {
                var map = data && data.affoApplyMap ? data.affoApplyMap : {};
                var entry = map[origin];

                ['a-font-face-off-style-body', 'a-font-face-off-style-serif', 'a-font-face-off-style-sans', 'a-font-face-off-style-mono'].forEach(function (id) {
                  try {
                    var node = document.getElementById(id);
                    if (node) node.remove();
                  } catch (_) { }
                });
                removeSubstackRouletteEnhancements();

                if (!entry) {
                  lastReappliedEntry = null;
                  requestSrouletteCssRemoval();
                  clearAllFontSizeScales();
                  if (getIsSubstack() && pendingSubstackRoulette) {
                    resetWalkerStateForEntry({ serif: true, sans: true });
                    pendingSubstackRoulette();
                  } else {
                    maybeStopNonAggressiveStyleOrderChaser();
                  }
                  return;
                }

                resolveSrouletteEntry(entry).then(function (effectiveEntry) {
                  resetWalkerStateForEntry(effectiveEntry);
                  reapplyStoredFontsFromEntry(effectiveEntry);
                });
              } catch (_) { }
            }).catch(function () { });
            return;
          }
          if (!rouletteKeysChanged) return;
          browser.storage.local.get(['affoApplyMap', 'affoSubstackRoulette', 'affoSubstackRouletteSerif', 'affoSubstackRouletteSans', 'affoSubstackRouletteBeigeDisabledDomains', 'affoFavorites']).then(function (data) {
            try {
              var map = data && data.affoApplyMap ? data.affoApplyMap : {};
              var entry = map[origin];
              if (entry && hasSrouletteIntent(entry)) {
                ['a-font-face-off-style-serif', 'a-font-face-off-style-sans', 'a-font-face-off-style-mono'].forEach(function (id) {
                  try {
                    var node = document.getElementById(id);
                    if (node) node.remove();
                  } catch (_) { }
                });
                removeSubstackRouletteEnhancements();

                var effectiveEntry = materializeSrouletteEntry(entry, data);
                resetWalkerStateForEntry(effectiveEntry);
                reapplyStoredFontsFromEntry(effectiveEntry);
                return;
              }
              if (!getIsSubstack() || entry) return;
              substackRouletteBeigeDisabledDomains = Array.isArray(data.affoSubstackRouletteBeigeDisabledDomains) ? data.affoSubstackRouletteBeigeDisabledDomains : [];
              var rouletteEnabled = data.affoSubstackRoulette !== false;
              var rouletteSerif = Array.isArray(data.affoSubstackRouletteSerif) ? data.affoSubstackRouletteSerif : [];
              var rouletteSans = Array.isArray(data.affoSubstackRouletteSans) ? data.affoSubstackRouletteSans : [];
              var favorites = data.affoFavorites || {};
              if (!rouletteEnabled || rouletteSerif.length < 1 || rouletteSans.length < 1) {
                removeSubstackRouletteEnhancements();
                return;
              }
              var serifName = rouletteSerif[Math.floor(Math.random() * rouletteSerif.length)];
              var sansName = rouletteSans[Math.floor(Math.random() * rouletteSans.length)];
              var serifConfig = favorites[serifName];
              var sansConfig = favorites[sansName];
              if (!serifConfig || !serifConfig.fontName || !sansConfig || !sansConfig.fontName) {
                removeSubstackRouletteEnhancements();
                return;
              }
              substackRouletteActive = true;
              syncSubstackRouletteBeige();
              reapplyStoredFontsFromEntry({ serif: serifConfig, sans: sansConfig });
              scheduleSubstackRouletteDimming();
            } catch (_) { }
          }).catch(function () { });
          return;
        }
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

        function removeExistingAffoStylesForStorageChange() {
          ['a-font-face-off-style-body', 'a-font-face-off-style-serif', 'a-font-face-off-style-sans', 'a-font-face-off-style-mono'].forEach(function (id) {
            try {
              var n = document.getElementById(id);
              if (n) {
                debugLog(`[AFFO Content] Removing existing style element:`, id);
                n.remove();
              }
            } catch (e) { }
          });
          removeSubstackRouletteEnhancements();
        }

        // Apply fonts when storage changes (both immediate apply and reload persistence).
        // For duplicate apply/page-init races, do the duplicate check before
        // removing style elements so a coalesced no-op cannot leave the page unstyled.
        if (entry) {
          debugLog(`[AFFO Content] Entry found - reapplying fonts:`, entry);
          resolveSrouletteEntry(entry).then(function (effectiveEntry) {
            if (shouldSkipDuplicateEntryReapply(effectiveEntry, 'storage-change entry')) return;
            removeExistingAffoStylesForStorageChange();
            reapplyStoredFontsFromEntry(effectiveEntry, { skipDuplicateCheck: true });
          });
        } else {
          removeExistingAffoStylesForStorageChange();
          lastReappliedEntry = null;
          requestSrouletteCssRemoval();
          clearObservedTmiCssTypes();
          refreshSharedTmiCssObserver();
          clearAllFontSizeScales();
          debugLog(`[AFFO Content] No entry found - all fonts should be removed`);
          maybeStopNonAggressiveStyleOrderChaser();
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
      if (message.type === 'affoGetPageInfo') {
        sendResponse({
          ok: true,
          success: true,
          hostname: location.hostname,
          origin: location.hostname,
          href: location.href,
          isSubstack: getIsSubstack()
        });
      } else if (message.type === 'affoFilterFontSubsets') {
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
        var ft = message.fontType;
        if (ft === 'serif' || ft === 'sans' || ft === 'mono') {
          elementWalkerCompleted[ft] = false;
          runElementWalker(ft).then(function (markedCounts) {
            sendResponse({ success: true, markedCount: (markedCounts && markedCounts[ft]) || 0 });
          }).catch(function (e) {
            sendResponse({ success: false, error: e.message });
          });
          return true; // signal async sendResponse to Firefox
        } else {
          sendResponse({ success: false, error: 'Invalid fontType: ' + ft });
        }
      } else if (message.action === 'restoreOriginal') {
        try {
          lastReappliedEntry = null;
          requestSrouletteCssRemoval();
          // Clean up shared inline-apply infrastructure
          inlineConfigs = {};
          cleanupSharedInlineInfra();
          clearObservedTmiCssTypes();
          cleanupSharedTmiCssObserver();
          clearAllFontSizeScales();

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

          maybeStopNonAggressiveStyleOrderChaser();

          // Remove any Third Man In data attributes
          try {
            document.querySelectorAll('[data-affo-font-type], [data-affo-original-font-type], [data-affo-was-bold]').forEach(function (el) {
              el.removeAttribute('data-affo-font-type');
              el.removeAttribute('data-affo-original-font-type');
              el.removeAttribute('data-affo-was-bold');
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

  // Element walker trigger from popup.js via executeScript → custom event bridge
  // (browser.tabs.sendMessage is unreliable from popup context in Firefox)
  window.__affoWalkerDone = {};
  document.addEventListener('affo-run-walker', function (evt) {
    var ft = evt.detail && evt.detail.fontType;
    if (ft === 'serif' || ft === 'sans' || ft === 'mono') {
      window.__affoWalkerDone[ft] = false;
      elementWalkerCompleted[ft] = false;
      runElementWalker(ft).then(function (markedCounts) {
        window.__affoWalkerDone[ft] = { done: true, count: (markedCounts && markedCounts[ft]) || 0 };
      }).catch(function () {
        window.__affoWalkerDone[ft] = { done: true, count: 0 };
      });
    }
  });

  // Wait For It: listen for custom event from left-toolbar.js to manually apply fonts
  document.addEventListener('affo-wait-for-it-apply', function () {
    browser.storage.local.get('affoApplyMap').then(function (data) {
      var map = data && data.affoApplyMap ? data.affoApplyMap : {};
      var entry = map[location.hostname];
      if (entry) {
        debugLog('[AFFO Content] Wait For It: manually applying fonts for', location.hostname);
        resolveSrouletteEntry(entry).then(function (effectiveEntry) {
          reapplyStoredFontsFromEntry(effectiveEntry);
        });
      } else if (pendingSubstackRoulette) {
        debugLog('[AFFO Content] Wait For It: manually triggering Substack Roulette for', location.hostname);
        pendingSubstackRoulette();
      }
    }).catch(function () { });
  });

})();
