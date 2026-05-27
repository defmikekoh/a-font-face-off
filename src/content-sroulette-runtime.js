(function(root) {
  'use strict';

  if (root.AFFOContentSroulette) {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = root.AFFOContentSroulette;
    }
    return;
  }

  var RESOLVED_TARGETS_KEY = '__affoSrouletteResolved';

  function debugLog() {
    if (root.AFFO_DEBUG === true) console.log.apply(console, arguments);
  }

  function getLogFromOptions(options) {
    return (options && typeof options.log === 'function') ? options.log : debugLog;
  }

  function hasMeaningfulFontConfig(fontConfig) {
    return !!(fontConfig && (
      fontConfig.fontName ||
      fontConfig.fontSize ||
      fontConfig.fontSizeScale ||
      fontConfig.fontWeight ||
      fontConfig.fontStyle ||
      fontConfig.lineHeight ||
      fontConfig.letterSpacing != null ||
      fontConfig.fontColor
    ));
  }

  function cloneFontConfig(config) {
    if (!config || typeof config !== 'object') return null;
    var cloned = {};
    Object.keys(config).forEach(function(key) {
      if (key === 'variableAxes' && config.variableAxes && typeof config.variableAxes === 'object') {
        cloned.variableAxes = Object.assign({}, config.variableAxes);
      } else {
        cloned[key] = config[key];
      }
    });
    return cloned;
  }

  function pickFontConfig(data, pool) {
    if (!data || data.affoSubstackRoulette === false || !AFFOSroulette.isPool(pool)) return null;
    var key = AFFOSroulette.getPoolStorageKey(pool);
    var names = Array.isArray(data[key]) ? data[key] : [];
    var favorites = data.affoFavorites || {};
    var validNames = names.filter(function(name) {
      var cfg = favorites[name];
      return !!(cfg && cfg.fontName);
    });
    if (!validNames.length) return null;
    var pickedName = validNames[Math.floor(Math.random() * validNames.length)];
    return cloneFontConfig(favorites[pickedName]);
  }

  function materializeEntry(entry, data, options) {
    if (!entry || !AFFOSroulette.hasIntent(entry)) return entry;
    var log = getLogFromOptions(options);
    var materialized = {};
    Object.keys(entry).forEach(function(key) {
      if (key !== 'sroulette' && key !== RESOLVED_TARGETS_KEY) materialized[key] = entry[key];
    });
    var resolvedTargets = {};
    AFFOSroulette.TARGET_LIST.forEach(function(target) {
      var intent = AFFOSroulette.getIntent(entry, target);
      if (!intent) return;
      var config = pickFontConfig(data, intent.pool);
      if (hasMeaningfulFontConfig(config)) {
        materialized[target] = config;
        resolvedTargets[target] = true;
        log('[AFFO Content] Sroulette materialized ' + target + ' from ' + intent.pool + ' pool:', config.fontName);
      } else {
        delete materialized[target];
        log('[AFFO Content] Sroulette has no valid ' + intent.pool + ' pool config for ' + target);
      }
    });
    if (resolvedTargets.serif || resolvedTargets.sans || resolvedTargets.mono) {
      materialized[RESOLVED_TARGETS_KEY] = resolvedTargets;
    }
    return materialized;
  }

  function isResolvedCssTarget(entry, target) {
    return !!(AFFOSroulette.isCssTarget(target) && entry && entry[RESOLVED_TARGETS_KEY] && entry[RESOLVED_TARGETS_KEY][target]);
  }

  function requestCssRemoval(targets) {
    try {
      var requestedTargets = Array.isArray(targets)
        ? targets.filter(AFFOSroulette.isCssTarget)
        : AFFOSroulette.CSS_TARGET_LIST.slice();
      if (!requestedTargets.length) return;
      browser.runtime.sendMessage({
        type: 'affoRemoveSrouletteCss',
        fontTypes: requestedTargets
      }).catch(function() {});
    } catch (_) {}
  }

  function requestCssInsert(target, css, options) {
    if (!AFFOSroulette.isCssTarget(target) || typeof css !== 'string' || !css.trim()) return;
    var log = getLogFromOptions(options);
    try {
      browser.runtime.sendMessage({
        type: 'affoInsertSrouletteCss',
        fontType: target,
        css: css
      }).catch(function(e) {
        log('[AFFO Content] Sroulette user-origin CSS injection failed:', e);
      });
    } catch (_) {}
  }

  function syncCssTrackingForEntry(entry) {
    var staleTargets = AFFOSroulette.CSS_TARGET_LIST.filter(function(target) {
      return !isResolvedCssTarget(entry, target);
    });
    if (staleTargets.length) requestCssRemoval(staleTargets);
  }

  function resolveEntry(entry, data, options) {
    if (!entry || !AFFOSroulette.hasIntent(entry)) return Promise.resolve(entry);
    if (data) return Promise.resolve(materializeEntry(entry, data, options));
    return browser.storage.local.get([
      'affoSubstackRoulette',
      'affoSubstackRouletteSerif',
      'affoSubstackRouletteSans',
      'affoFavorites'
    ]).then(function(stored) {
      return materializeEntry(entry, stored || {}, options);
    }).catch(function() {
      return materializeEntry(entry, {}, options);
    });
  }

  root.AFFOContentSroulette = {
    RESOLVED_TARGETS_KEY: RESOLVED_TARGETS_KEY,
    hasMeaningfulFontConfig: hasMeaningfulFontConfig,
    isResolvedCssTarget: isResolvedCssTarget,
    materializeEntry: materializeEntry,
    pickFontConfig: pickFontConfig,
    requestCssInsert: requestCssInsert,
    requestCssRemoval: requestCssRemoval,
    resolveEntry: resolveEntry,
    syncCssTrackingForEntry: syncCssTrackingForEntry
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.AFFOContentSroulette;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
