(function(root) {
  'use strict';

  if (root.AFFOSroulette) {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = root.AFFOSroulette;
    }
    return;
  }

  var POOL_LIST = ['serif', 'sans'];
  var TARGET_LIST = ['body', 'serif', 'sans'];
  var BODY_TARGET_LIST = ['body'];
  var TMI_TARGET_LIST = ['serif', 'sans'];
  var CSS_TARGET_LIST = ['serif', 'sans'];
  var POOL_STORAGE_KEYS = {
    serif: 'affoSubstackRouletteSerif',
    sans: 'affoSubstackRouletteSans'
  };

  function listIncludes(list, value) {
    return list.indexOf(value) !== -1;
  }

  function isPool(value) {
    return listIncludes(POOL_LIST, value);
  }

  function isTarget(value) {
    return listIncludes(TARGET_LIST, value);
  }

  function isCssTarget(value) {
    return listIncludes(CSS_TARGET_LIST, value);
  }

  function getPoolStorageKey(pool) {
    return POOL_STORAGE_KEYS[pool] || null;
  }

  function getPoolLabel(pool) {
    return pool === 'serif' ? 'Sroulette Serif' : 'Sroulette Sans';
  }

  function getIntent(entry, target) {
    if (!entry || !isTarget(target)) return null;
    var intent = entry.sroulette && entry.sroulette[target];
    if (!intent || !isPool(intent.pool)) return null;
    return intent;
  }

  function hasIntent(entry, targets) {
    var targetList = Array.isArray(targets) ? targets : TARGET_LIST;
    return targetList.some(function(target) {
      return !!getIntent(entry, target);
    });
  }

  function hasIntentForTarget(entry, target) {
    return !!getIntent(entry, target);
  }

  function hasIntentInMap(srouletteData, targets) {
    if (!srouletteData || typeof srouletteData !== 'object' || Array.isArray(srouletteData)) return false;
    var targetList = Array.isArray(targets) ? targets : TARGET_LIST;
    return targetList.some(function(target) {
      if (!isTarget(target)) return false;
      var intent = srouletteData[target];
      return !!(intent && isPool(intent.pool));
    });
  }

  function clearIntent(entry, target) {
    if (!entry || !isTarget(target)) return;
    if (!entry.sroulette || typeof entry.sroulette !== 'object' || Array.isArray(entry.sroulette)) return;
    delete entry.sroulette[target];
    if (!entry.sroulette.body && !entry.sroulette.serif && !entry.sroulette.sans) {
      delete entry.sroulette;
    }
  }

  function setIntent(entry, target, pool) {
    if (!entry || !isTarget(target) || !isPool(pool)) return false;
    if (!entry.sroulette || typeof entry.sroulette !== 'object' || Array.isArray(entry.sroulette)) {
      entry.sroulette = {};
    }
    entry.sroulette[target] = { pool: pool };
    delete entry[target];
    return true;
  }

  function createBatchIntent(pool) {
    return { kind: 'sroulette', pool: pool };
  }

  function isBatchIntent(config) {
    return !!(config && config.kind === 'sroulette' && isPool(config.pool));
  }

  function getValidPoolInfoFromData(data, pool) {
    var key = getPoolStorageKey(pool);
    if (!key) return { available: false, count: 0 };

    var names = Array.isArray(data && data[key]) ? data[key] : [];
    var favorites = (data && data.affoFavorites) || {};
    var validNames = names.filter(function(name) {
      var cfg = favorites[name];
      return !!(cfg && cfg.fontName);
    });

    return {
      available: !!(data && data.affoSubstackRoulette !== false && validNames.length > 0),
      count: validNames.length
    };
  }

  root.AFFOSroulette = {
    POOL_LIST: POOL_LIST.slice(),
    TARGET_LIST: TARGET_LIST.slice(),
    BODY_TARGET_LIST: BODY_TARGET_LIST.slice(),
    TMI_TARGET_LIST: TMI_TARGET_LIST.slice(),
    CSS_TARGET_LIST: CSS_TARGET_LIST.slice(),
    createBatchIntent: createBatchIntent,
    clearIntent: clearIntent,
    getIntent: getIntent,
    getPoolLabel: getPoolLabel,
    getPoolStorageKey: getPoolStorageKey,
    getValidPoolInfoFromData: getValidPoolInfoFromData,
    hasIntent: hasIntent,
    hasIntentForTarget: hasIntentForTarget,
    hasIntentInMap: hasIntentInMap,
    isBatchIntent: isBatchIntent,
    isCssTarget: isCssTarget,
    isPool: isPool,
    isTarget: isTarget,
    setIntent: setIntent
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.AFFOSroulette;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
