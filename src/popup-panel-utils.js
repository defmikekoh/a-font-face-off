(function(root) {
  'use strict';

  if (root.AFFOPopupPanelUtils) {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = root.AFFOPopupPanelUtils;
    }
    return;
  }

  var MODE_CONFIG = {
    'body-contact': { positions: ['body'], stateKeys: { body: 'bodyFont' }, useDomain: true },
    faceoff: { positions: ['top', 'bottom'], stateKeys: { top: 'topFont', bottom: 'bottomFont' }, useDomain: false },
    'third-man-in': { positions: ['serif', 'sans', 'mono'], stateKeys: { serif: 'serifFont', sans: 'sansFont', mono: 'monoFont' }, useDomain: true }
  };

  var PANEL_HEADINGS = {
    top: 'Top Font',
    bottom: 'Bottom Font',
    serif: 'Serif',
    sans: 'Sans',
    mono: 'Mono'
  };

  var TMI_POSITIONS = ['serif', 'sans', 'mono'];
  var SROULETTE_TARGET_LIST = AFFOSroulette.TARGET_LIST;
  var SROULETTE_TMI_TARGET_LIST = AFFOSroulette.TMI_TARGET_LIST;

  function noop() {}

  function getPanelLabel(position) {
    if (position === 'body') return 'Body';
    if (position === 'top') return 'Top';
    if (position === 'bottom') return 'Bottom';
    if (position === 'serif') return 'Serif';
    if (position === 'sans') return 'Sans';
    if (position === 'mono') return 'Mono';
    return position;
  }

  function isSroulettePool(value) {
    return AFFOSroulette.isPool(value);
  }

  function isSrouletteTarget(value) {
    return AFFOSroulette.isTarget(value);
  }

  function getSrouletteIntent(domainData, target) {
    return AFFOSroulette.getIntent(domainData, target);
  }

  function hasSrouletteIntent(domainData, positions) {
    return AFFOSroulette.hasIntent(domainData, Array.isArray(positions) ? positions : SROULETTE_TARGET_LIST);
  }

  function hasTmiSrouletteIntent(domainData) {
    return hasSrouletteIntent(domainData, SROULETTE_TMI_TARGET_LIST);
  }

  function hasBodySrouletteIntent(domainData) {
    return !!getSrouletteIntent(domainData, 'body');
  }

  function getSrouletteLabel(pool) {
    return AFFOSroulette.getPoolLabel(pool);
  }

  function createSrouletteBatchIntent(pool) {
    return AFFOSroulette.createBatchIntent(pool);
  }

  function isSrouletteBatchIntent(config) {
    return AFFOSroulette.isBatchIntent(config);
  }

  function clearSrouletteIntentFromEntry(entry, target) {
    AFFOSroulette.clearIntent(entry, target);
  }

  function setSrouletteIntentOnEntry(entry, target, pool) {
    return AFFOSroulette.setIntent(entry, target, pool);
  }

  function createFontBatchPayloadRequest(target, config) {
    return { kind: 'fontPayloadRequest', target: target, config: config };
  }

  function isFontBatchPayloadRequest(config) {
    return !!(config && config.kind === 'fontPayloadRequest' && config.target && config.config);
  }

  function hasMeaningfulPanelConfig(config) {
    return !!(config && (
      config.fontName ||
      config.fontSize ||
      config.fontSizeScale ||
      config.fontWeight ||
      config.fontStyle ||
      config.lineHeight ||
      config.letterSpacing != null ||
      config.fontColor
    ));
  }

  function buildAppliedComparisonConfig(appliedConfig) {
    if (!appliedConfig) return null;
    var comparisonConfig = {
      fontName: appliedConfig.fontName || null,
      variableAxes: appliedConfig.variableAxes || {}
    };

    if (appliedConfig.fontSizeScale != null) comparisonConfig.fontSizeScale = appliedConfig.fontSizeScale;
    else if (appliedConfig.fontSize) comparisonConfig.fontSize = appliedConfig.fontSize;
    if (appliedConfig.lineHeight) comparisonConfig.lineHeight = appliedConfig.lineHeight;
    if (appliedConfig.letterSpacing != null) comparisonConfig.letterSpacing = appliedConfig.letterSpacing;
    if (appliedConfig.fontWeight) comparisonConfig.fontWeight = appliedConfig.fontWeight;
    if (appliedConfig.fontStyle) comparisonConfig.fontStyle = appliedConfig.fontStyle;
    if (appliedConfig.fontColor) comparisonConfig.fontColor = appliedConfig.fontColor;
    if (appliedConfig.fontFaceRule) comparisonConfig.fontFaceRule = appliedConfig.fontFaceRule;

    return comparisonConfig;
  }

  function getActiveControlsFromConfig(config) {
    var active = new Set();
    if (config && (config.fontSize !== null && config.fontSize !== undefined || config.fontSizeScale !== null && config.fontSizeScale !== undefined)) active.add('font-size');
    if (config && config.lineHeight !== null && config.lineHeight !== undefined) active.add('line-height');
    if (config && config.letterSpacing != null) active.add('letter-spacing');
    if (config && config.fontWeight !== null && config.fontWeight !== undefined) active.add('weight');
    if (config && config.fontStyle === 'italic') active.add('style');
    if (config && config.fontColor && config.fontColor !== 'default') active.add('color');
    return active;
  }

  function getActiveAxesFromVariableAxes(variableAxes) {
    return new Set(Object.keys(variableAxes || {}));
  }

  function configsEqual(config1, config2) {
    config1 = normalizeConfig(config1);
    config2 = normalizeConfig(config2);

    if (!config1 && !config2) return true;
    if (!config1 || !config2) return false;

    var font1 = config1.fontName || null;
    var font2 = config2.fontName || null;
    if (font1 !== font2) return false;

    var activeControls1 = getActiveControlsFromConfig(config1);
    var activeControls2 = getActiveControlsFromConfig(config2);

    if (activeControls1.size !== activeControls2.size) return false;
    for (var control of activeControls1) {
      if (!activeControls2.has(control)) return false;
    }

    if (activeControls1.has('font-size')) {
      var config1UsesScale = config1.fontSizeScale !== null && config1.fontSizeScale !== undefined;
      var config2UsesScale = config2.fontSizeScale !== null && config2.fontSizeScale !== undefined;
      if (config1UsesScale !== config2UsesScale) return false;
      if (config1UsesScale) {
        if (Number(config1.fontSizeScale) !== Number(config2.fontSizeScale)) return false;
      } else if (Number(config1.fontSize) !== Number(config2.fontSize)) {
        return false;
      }
    }
    if (activeControls1.has('line-height') && Number(config1.lineHeight) !== Number(config2.lineHeight)) return false;
    if (activeControls1.has('letter-spacing') && Number(config1.letterSpacing) !== Number(config2.letterSpacing)) return false;
    if (activeControls1.has('weight') && Number(config1.fontWeight) !== Number(config2.fontWeight)) return false;
    if (activeControls1.has('style') && config1.fontStyle !== config2.fontStyle) return false;
    if (activeControls1.has('color') && config1.fontColor !== config2.fontColor) return false;

    var currentAxes = config1.variableAxes || {};
    var appliedAxes = config2.variableAxes || {};
    var currentActiveAxes = getActiveAxesFromVariableAxes(currentAxes);
    var appliedActiveAxes = getActiveAxesFromVariableAxes(appliedAxes);

    if (currentActiveAxes.size !== appliedActiveAxes.size) return false;
    for (var axis of currentActiveAxes) {
      if (!appliedActiveAxes.has(axis) || Number(currentAxes[axis]) !== Number(appliedAxes[axis])) return false;
    }

    return true;
  }

  function getPanelStateForType(type, options) {
    if (options && typeof options.getPanelState === 'function') return options.getPanelState(type);
    if (options && options.panelStates) return options.panelStates[type] || { kind: 'empty' };
    return { kind: 'empty' };
  }

  function buildThirdManInBatchChanges(types, domainData, options) {
    var batchConfigs = {};
    var cssJobs = [];
    var log = (options && typeof options.log === 'function') ? options.log : noop;
    var compareConfigs = (options && typeof options.configsEqual === 'function') ? options.configsEqual : configsEqual;
    var appliedData = domainData || {};

    types.forEach(function(type) {
      var panelState = getPanelStateForType(type, options);
      var sroulettePool = panelState.kind === 'sroulette' ? panelState.pool : null;
      var config = panelState.kind === 'font' ? panelState.config : null;
      var appliedConfig = appliedData[type];
      var appliedSrouletteIntent = getSrouletteIntent(appliedData, type);

      log('applyAllThirdManInFonts: Processing ' + type + ' - config:', config);
      log('applyAllThirdManInFonts: Processing ' + type + ' - appliedConfig:', appliedConfig);

      if (sroulettePool) {
        var srouletteDifferent = !!appliedConfig || !appliedSrouletteIntent || appliedSrouletteIntent.pool !== sroulettePool;
        if (srouletteDifferent) {
          log('applyAllThirdManInFonts: Will set ' + type + ' Sroulette intent:', sroulettePool);
          batchConfigs[type] = createSrouletteBatchIntent(sroulettePool);
        } else {
          log('applyAllThirdManInFonts: ' + type + ' Sroulette unchanged - no action needed');
        }
        return;
      }

      if (hasMeaningfulPanelConfig(config)) {
        var appliedForComparison = buildAppliedComparisonConfig(appliedConfig);
        var configDifferent = !compareConfigs(config, appliedForComparison);

        if (configDifferent) {
          log('applyAllThirdManInFonts: Will set ' + type + ' (has changes):', config);
          log('applyAllThirdManInFonts: ' + type + ' applied state:', appliedForComparison);
          batchConfigs[type] = createFontBatchPayloadRequest(type, config);
          cssJobs.push({
            type: type,
            fontName: config.fontName,
            config: config
          });
        } else {
          log('applyAllThirdManInFonts: ' + type + ' unchanged - no action needed');
        }
        return;
      }

      if (appliedConfig || appliedSrouletteIntent) {
        log('applyAllThirdManInFonts: Will unset ' + type + ' - no valid config');
        batchConfigs[type] = null;
      } else {
        log('applyAllThirdManInFonts: ' + type + ' already unset - no change needed');
      }
    });

    return { batchConfigs: batchConfigs, cssJobs: cssJobs };
  }

  function countThirdManInDifferences(types, domainData, options) {
    var appliedData = domainData || {};
    var compareConfigs = (options && typeof options.configsEqual === 'function') ? options.configsEqual : configsEqual;
    var changeCount = 0;
    var currentHasNonDefaults = false;
    var domainHasAppliedFonts = !!(
      appliedData.serif ||
      appliedData.sans ||
      appliedData.mono ||
      appliedData.body ||
      hasTmiSrouletteIntent(appliedData)
    );

    types.forEach(function(type) {
      var panelState = getPanelStateForType(type, options);
      var currentSroulettePool = panelState.kind === 'sroulette' ? panelState.pool : null;
      var current = panelState.kind === 'font' ? panelState.config : null;
      var applied = appliedData[type];
      var srouletteApplied = getSrouletteIntent(appliedData, type);
      var isDefaultFont = !hasMeaningfulPanelConfig(current);
      var isDifferent = false;

      if (currentSroulettePool) {
        isDifferent = !!applied || !srouletteApplied || srouletteApplied.pool !== currentSroulettePool;
        currentHasNonDefaults = true;
      } else if (isDefaultFont) {
        isDifferent = !!applied || !!srouletteApplied;
      } else {
        if (srouletteApplied) {
          isDifferent = true;
        } else if (!applied) {
          isDifferent = true;
        } else {
          isDifferent = !compareConfigs(current, buildAppliedComparisonConfig(applied));
        }
        currentHasNonDefaults = true;
      }

      if (isDifferent) changeCount++;
    });

    if (domainHasAppliedFonts && !currentHasNonDefaults) {
      changeCount = 1;
    }

    return changeCount;
  }

  root.AFFOPopupPanelUtils = {
    MODE_CONFIG: MODE_CONFIG,
    PANEL_HEADINGS: PANEL_HEADINGS,
    TMI_POSITIONS: TMI_POSITIONS.slice(),
    buildAppliedComparisonConfig: buildAppliedComparisonConfig,
    buildThirdManInBatchChanges: buildThirdManInBatchChanges,
    clearSrouletteIntentFromEntry: clearSrouletteIntentFromEntry,
    configsEqual: configsEqual,
    countThirdManInDifferences: countThirdManInDifferences,
    createFontBatchPayloadRequest: createFontBatchPayloadRequest,
    createSrouletteBatchIntent: createSrouletteBatchIntent,
    getActiveAxesFromVariableAxes: getActiveAxesFromVariableAxes,
    getActiveControlsFromConfig: getActiveControlsFromConfig,
    getPanelLabel: getPanelLabel,
    getSrouletteIntent: getSrouletteIntent,
    getSrouletteLabel: getSrouletteLabel,
    hasBodySrouletteIntent: hasBodySrouletteIntent,
    hasMeaningfulPanelConfig: hasMeaningfulPanelConfig,
    hasSrouletteIntent: hasSrouletteIntent,
    hasTmiSrouletteIntent: hasTmiSrouletteIntent,
    isFontBatchPayloadRequest: isFontBatchPayloadRequest,
    isSrouletteBatchIntent: isSrouletteBatchIntent,
    isSroulettePool: isSroulettePool,
    isSrouletteTarget: isSrouletteTarget,
    setSrouletteIntentOnEntry: setSrouletteIntentOnEntry
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.AFFOPopupPanelUtils;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
