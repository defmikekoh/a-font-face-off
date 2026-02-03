// Content script: cleanup and storage monitoring only
// All font injection is now handled by popup.js using insertCSS

(function(){
  // Classify page base font (serif vs sans) once per doc — used for diagnostics/heuristics
  try {
    if (!document.documentElement.hasAttribute('data-affo-base')) {
      var fam = '';
      try { fam = String(getComputedStyle(document.body || document.documentElement).fontFamily || ''); } catch(_) {}
      var parts = fam.replace(/["']'/g,'').split(',').map(function(s){ return s.trim().toLowerCase(); }).filter(Boolean);
      var hasSansGen = parts.indexOf('sans-serif') !== -1;
      var hasSerifGen = parts.indexOf('serif') !== -1;
      // Prefer explicit generic if present; treat "Merriweather, sans-serif" as sans
      var base;
      if (hasSansGen) base = 'sans';
      else if (hasSerifGen) base = 'serif';
      else {
        // Fall back to name hints
        var serifNames = ['pt serif','georgia','times','times new roman','merriweather','garamond','charter','spectral','lora','abril'];
        var isSerifName = parts.some(function(p){ return serifNames.indexOf(p) !== -1; });
        base = isSerifName ? 'serif' : 'sans';
      }
      document.documentElement.setAttribute('data-affo-base', base);
      // Asynchronously refine using user-provided lists
      try {
        browser.storage.local.get(['affoKnownSerif','affoKnownSans']).then(function(opt){
          try {
            var ks = Array.isArray(opt.affoKnownSerif) ? opt.affoKnownSerif.map(function(s){return String(s||'').toLowerCase().trim();}) : [];
            var kn = Array.isArray(opt.affoKnownSans) ? opt.affoKnownSans.map(function(s){return String(s||'').toLowerCase().trim();}) : [];
            var nameHitSerif = parts.some(function(p){ return ks.indexOf(p) !== -1; });
            var nameHitSans = parts.some(function(p){ return kn.indexOf(p) !== -1; });
            if (nameHitSans && !hasSansGen) document.documentElement.setAttribute('data-affo-base', 'sans');
            else if (nameHitSerif && !hasSerifGen) document.documentElement.setAttribute('data-affo-base', 'serif');
          } catch(_){ }
        }).catch(function(){});
      } catch(_){ }
    }
  } catch(_){}

  // Helper functions for font loading
  var fontFaceOnlyDomains = ['x.com']; // Will be loaded from storage
  var inlineApplyDomains = ['x.com']; // Will be loaded from storage
  var currentOrigin = location.hostname;

  // Debug control - set to false to reduce logging
  var DEBUG_VERBOSE = false;
  var DEBUG_ELEMENTS = true; // Keep element application debugging

  // Global cleanup tracking to prevent flipping between settings
  var activeObservers = {}; // Track MutationObservers by fontType
  var activeTimers = {}; // Track timeout/interval IDs by fontType

  // Known serif/sans font families for element walker classification
  var knownSerifFonts = ['pt serif', 'mencken-std', 'georgia', 'times', 'times new roman', 'merriweather', 'garamond', 'charter', 'spectral', 'lora', 'abril'];
  var knownSansFonts = [];

  // Load user-defined serif/sans lists from storage
  try {
    browser.storage.local.get(['affoKnownSerif', 'affoKnownSans']).then(function(opt) {
      if (Array.isArray(opt.affoKnownSerif)) {
        knownSerifFonts = opt.affoKnownSerif.map(function(s) { return String(s || '').toLowerCase().trim(); });
      }
      if (Array.isArray(opt.affoKnownSans)) {
        knownSansFonts = opt.affoKnownSans.map(function(s) { return String(s || '').toLowerCase().trim(); });
      }
      debugLog('[AFFO Content] Loaded known fonts - Serif:', knownSerifFonts, 'Sans:', knownSansFonts);
    }).catch(function() {});
  } catch(_) {}
  
  function debugLog(message, ...args) {
    if (DEBUG_VERBOSE) debugLog(message, ...args);
  }
  
  function elementLog(message, ...args) {
    if (DEBUG_ELEMENTS) debugLog(`🎯 ${message}`, ...args);
  }
  
  // Load FontFace-only domains from storage
  try {
    browser.storage.local.get(['affoFontFaceOnlyDomains', 'affoInlineApplyDomains']).then(function(data) {
      if (Array.isArray(data.affoFontFaceOnlyDomains)) {
        fontFaceOnlyDomains = data.affoFontFaceOnlyDomains;
        debugLog(`[AFFO Content] FontFace-only domains:`, fontFaceOnlyDomains);
      }
      if (Array.isArray(data.affoInlineApplyDomains)) {
        inlineApplyDomains = data.affoInlineApplyDomains;
        debugLog(`[AFFO Content] Inline apply domains:`, inlineApplyDomains);
      }
    }).catch(function() {});
  } catch (e) {}
  
  function shouldUseFontFaceOnly() {
    return fontFaceOnlyDomains.includes(currentOrigin);
  }
  
  function shouldUseInlineApply() {
    return inlineApplyDomains.includes(currentOrigin);
  }
  
  function applyInlineStyles(fontConfig, fontType) {
    elementLog(`Applying inline styles for ${fontType}:`, fontConfig.fontName);

    // Cleanup previous observers and timers for this fontType to prevent flipping
    if (activeObservers[fontType]) {
      try {
        activeObservers[fontType].disconnect();
        debugLog(`[AFFO Content] Cleaned up MutationObserver for ${fontType}`);
      } catch(e) {}
      delete activeObservers[fontType];
    }
    if (activeTimers[fontType]) {
      activeTimers[fontType].forEach(function(timerId) {
        try {
          clearTimeout(timerId);
          clearInterval(timerId);
        } catch(e) {}
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
    
    // Include other font properties if present
    if (fontConfig.fontWeight) {
      cssPropsObject['font-weight'] = fontConfig.fontWeight;
    }
    if (fontConfig.lineHeight) {
      cssPropsObject['line-height'] = fontConfig.lineHeight;
    }
    if (fontConfig.fontColor) {
      cssPropsObject['color'] = fontConfig.fontColor;
    }
    
    // Handle font axes (slant, italic, width)
    if (fontConfig.slntVal && fontConfig.slntVal !== 0) {
      cssPropsObject['font-style'] = `oblique ${fontConfig.slntVal}deg`;
    }
    if (fontConfig.italVal && fontConfig.italVal >= 1) {
      cssPropsObject['font-style'] = 'italic';
    }
    
    // Build font-variation-settings from all axes
    var variationSettings = [];
    
    // Include weight axis if present
    if (fontConfig.fontWeight) {
      variationSettings.push(`"wght" ${fontConfig.fontWeight}`);
    }
    
    // Include width axis if present
    if (fontConfig.wdthVal && isFinite(fontConfig.wdthVal)) {
      variationSettings.push(`"wdth" ${fontConfig.wdthVal}`);
    }
    
    // Include slant axis if present
    if (fontConfig.slntVal && isFinite(fontConfig.slntVal)) {
      variationSettings.push(`"slnt" ${fontConfig.slntVal}`);
    }
    
    // Include italic axis if present
    if (fontConfig.italVal && isFinite(fontConfig.italVal)) {
      variationSettings.push(`"ital" ${fontConfig.italVal}`);
    }
    
    // Include any other variable axes
    if (fontConfig.variableAxes) {
      Object.entries(fontConfig.variableAxes).forEach(function([axis, value]) {
        if (isFinite(Number(value))) {
          variationSettings.push(`"${axis}" ${value}`);
        }
      });
    }
    
    // Apply font-variation-settings if any axes are present
    if (variationSettings.length > 0) {
      cssPropsObject['font-variation-settings'] = variationSettings.join(', ');
    }
    
    // Apply styles to elements based on font type
    try {
      if (fontType === 'body') {
        // Apply to body and most descendants (excluding headers for Third Man In mode)
        var bodyElements = document.querySelectorAll('body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo)');
        bodyElements.forEach(function(el) {
          Object.entries(cssPropsObject).forEach(function([prop, value]) {
            el.style.setProperty(prop, value, 'important');
          });
        });
        // Override bold elements to preserve visual boldness in the custom font
        if (fontConfig.fontWeight) {
          var boldElements = document.querySelectorAll('body strong, body b');
          boldElements.forEach(function(el) {
            el.style.setProperty('font-weight', '700', 'important');
            el.style.setProperty('font-variation-settings', '"wght" 700', 'important');
          });
        }
        elementLog(`Applied inline styles to ${bodyElements.length} body elements`);
      } else if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
        // For Third Man In mode, use hybrid approach for x.com
        var isXCom = currentOrigin.includes('x.com') || currentOrigin.includes('twitter.com');
        
        if (isXCom) {
          // On x.com, apply to broad selector like body mode for better coverage
          var hybridSelector = getHybridSelector(fontType);
          var hybridElements = document.querySelectorAll(hybridSelector);
          hybridElements.forEach(function(el) {
            Object.entries(cssPropsObject).forEach(function([prop, value]) {
              // Apply the style with !important
              el.style.setProperty(prop, value, 'important');
              
              // Also set as a CSS custom property for additional resilience
              el.style.setProperty(`--affo-${prop}`, value, 'important');
              
              // Set a data attribute as backup
              el.setAttribute(`data-affo-${prop}`, value);
            });
            
            // Mark element as protected
            el.setAttribute('data-affo-protected', 'true');
            el.setAttribute('data-affo-font-name', cssPropsObject['font-family']);
          });
          elementLog(`Applied hybrid inline styles to ${hybridElements.length} ${fontType} elements`);
        } else {
          // On other sites, use normal Third Man In mode with marked elements
          var targetElements = document.querySelectorAll(`[data-affo-font-type="${fontType}"]`);
          targetElements.forEach(function(el) {
            Object.entries(cssPropsObject).forEach(function([prop, value]) {
              // Apply the style with !important
              el.style.setProperty(prop, value, 'important');
              
              // Also set as a CSS custom property for additional resilience
              el.style.setProperty(`--affo-${prop}`, value, 'important');
              
              // Set a data attribute as backup
              el.setAttribute(`data-affo-${prop}`, value);
            });
            
            // Mark element as protected
            el.setAttribute('data-affo-protected', 'true');
            el.setAttribute('data-affo-font-name', cssPropsObject['font-family']);
          });
          elementLog(`Applied enhanced inline styles to ${targetElements.length} ${fontType} elements`);
        }
      }
    } catch (e) {
      console.error(`[AFFO Content] Error applying inline styles for ${fontType}:`, e);
    }
    
    // Add SPA resilience for x.com and other dynamic sites
    try {
      var fontFamily = cssPropsObject['font-family'];
      
      // MutationObserver to re-apply styles to newly added elements
      var mo = new MutationObserver(function(muts) {
        muts.forEach(function(m) {
          (m.addedNodes || []).forEach(function(n) {
            try {
              if (n && n.nodeType === 1) {
                var newElements = [];
                
                // Check if the node itself matches our selector
                if (fontType === 'body') {
                  var bodySelector = 'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo)';
                  try {
                    if (n.matches && n.matches(bodySelector)) newElements.push(n);
                  } catch(_) {}
                  try {
                    if (n.querySelectorAll) {
                      newElements = newElements.concat(Array.from(n.querySelectorAll(bodySelector)));
                    }
                  } catch(_) {}
                } else {
                  // For Third Man In mode, use hybrid selector on x.com
                  var isXCom = currentOrigin.includes('x.com') || currentOrigin.includes('twitter.com');
                  var thirdManSelector = isXCom ? getHybridSelector(fontType) : `[data-affo-font-type="${fontType}"]`;
                  try {
                    if (n.matches && n.matches(thirdManSelector)) newElements.push(n);
                  } catch(_) {}
                  try {
                    if (n.querySelectorAll) {
                      newElements = newElements.concat(Array.from(n.querySelectorAll(thirdManSelector)));
                    }
                  } catch(_) {}
                }
                
                // Apply enhanced protection to new elements
                newElements.forEach(function(el) {
                  try {
                    Object.entries(cssPropsObject).forEach(function([prop, value]) {
                      // Apply the style with !important
                      el.style.setProperty(prop, value, 'important');
                      
                      // Also set as a CSS custom property for additional resilience
                      el.style.setProperty(`--affo-${prop}`, value, 'important');
                      
                      // Set a data attribute as backup
                      el.setAttribute(`data-affo-${prop}`, value);
                    });
                    
                    // Mark element as protected
                    el.setAttribute('data-affo-protected', 'true');
                    el.setAttribute('data-affo-font-name', cssPropsObject['font-family']);
                  } catch(_) {}
                });
                
                if (newElements.length > 0) {
                  elementLog(`Applied inline styles to ${newElements.length} new ${fontType} elements`);
                }
              }
            } catch(_) {}
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
      var disconnectTimer = setTimeout(function() {
        try { mo.disconnect(); } catch(_) {}
      }, 180000); // 3 minutes (was 10 minutes)
      activeTimers[fontType].push(disconnectTimer);
      
      // Re-apply styles on SPA navigations (history API hooks)
      function reapplyInlineStyles() {
        try {
          if (fontType === 'body') {
            var elements = document.querySelectorAll('body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo)');
          } else {
            // Use hybrid selector on x.com for better coverage
            var isXCom = currentOrigin.includes('x.com') || currentOrigin.includes('twitter.com');
            var selector = isXCom ? getHybridSelector(fontType) : `[data-affo-font-type="${fontType}"]`;
            var elements = document.querySelectorAll(selector);
          }
          
          elements.forEach(function(el) {
            Object.entries(cssPropsObject).forEach(function([prop, value]) {
              // Apply the style with !important
              el.style.setProperty(prop, value, 'important');
              
              // Also set as a CSS custom property for additional resilience
              el.style.setProperty(`--affo-${prop}`, value, 'important');
              
              // Set a data attribute as backup
              el.setAttribute(`data-affo-${prop}`, value);
            });
            
            // Mark element as protected
            el.setAttribute('data-affo-protected', 'true');
            el.setAttribute('data-affo-font-name', cssPropsObject['font-family']);
          });
          
          elementLog(`Re-applied inline styles to ${elements.length} ${fontType} elements after SPA navigation`);
        } catch(e) {
          debugLog(`[AFFO Content] Error re-applying inline styles after SPA navigation:`, e);
        }
      }
      
      try {
        var _ps = history.pushState;
        history.pushState = function() { 
          var r = _ps.apply(this, arguments); 
          try { setTimeout(reapplyInlineStyles, 100); } catch(_) {} 
          return r; 
        };
      } catch(_) {}
      
      try {
        var _rs = history.replaceState;
        history.replaceState = function() { 
          var r = _rs.apply(this, arguments); 
          try { setTimeout(reapplyInlineStyles, 100); } catch(_) {} 
          return r; 
        };
      } catch(_) {}
      
      try {
        window.addEventListener('popstate', function() { 
          try { setTimeout(reapplyInlineStyles, 100); } catch(_) {} 
        }, true);
      } catch(_) {}
      
      // Enhanced monitoring with reduced frequency now that fonts load instantly from cache
      var monitoringTimer = setTimeout(function() {
        try {
          // On x.com, monitor every 2 seconds for the first 30 seconds, then every 10 seconds for 2.5 more minutes
          // With fast caching, fonts apply almost instantly, so we don't need aggressive polling
          var isXCom = currentOrigin.includes('x.com') || currentOrigin.includes('twitter.com');
          var initialFrequency = isXCom ? 2000 : 5000; // 2 seconds for x.com (was 1s), 5 seconds for others
          var laterFrequency = 10000; // 10 seconds (was 5s)
          var initialDuration = isXCom ? 30000 : 60000; // 30 seconds for x.com (was 2 min), 1 minute for others
          var totalDuration = 180000; // 3 minutes total (was 10 min)
          
          debugLog(`[AFFO Content] Starting enhanced monitoring for ${fontType} - initial: ${initialFrequency}ms, later: ${laterFrequency}ms`);
          
          var checkCount = 0;
          
          // Frequent monitoring initially
          var initialInterval = setInterval(function() {
            try {
              checkCount++;
              reapplyInlineStyles();
              if (checkCount % 10 === 0) {
                debugLog(`[AFFO Content] Performed ${checkCount} style checks for ${fontType}`);
              }
            } catch(e) {
              debugLog(`[AFFO Content] Error in frequent style check:`, e);
            }
          }, initialFrequency);

          // Track the interval timer for cleanup
          if (!activeTimers[fontType]) activeTimers[fontType] = [];
          activeTimers[fontType].push(initialInterval);

          // Switch to less frequent monitoring after initial period
          var switchTimer = setTimeout(function() {
            clearInterval(initialInterval);
            debugLog(`[AFFO Content] Switching to less frequent monitoring for ${fontType}`);
            
            var laterInterval = setInterval(function() {
              try {
                checkCount++;
                reapplyInlineStyles();
                
                // Additional protection: Check for and restore any cleared styles
                if (isXCom) {
                  restoreManipulatedStyles(fontType, cssPropsObject);
                }
              } catch(e) {
                debugLog(`[AFFO Content] Error in periodic style check:`, e);
              }
            }, laterFrequency);

            // Track the later interval for cleanup
            activeTimers[fontType].push(laterInterval);

            // Stop monitoring after total duration
            var stopTimer = setTimeout(function() {
              clearInterval(laterInterval);
              debugLog(`[AFFO Content] Stopped style monitoring for ${fontType} after ${totalDuration/1000} seconds (${checkCount} total checks)`);
            }, totalDuration - initialDuration);
            
          }, initialDuration);

          // Track the switch and stop timers for cleanup
          activeTimers[fontType].push(switchTimer);
          activeTimers[fontType].push(stopTimer);
          
        } catch(e) {
          debugLog(`[AFFO Content] Error setting up enhanced monitoring for ${fontType}:`, e);
        }
      }, 1000);
      activeTimers[fontType].push(monitoringTimer);
      
      // Add focus/visibility event listeners to re-apply styles when page becomes visible
      try {
        var reapplyOnFocus = function() {
          setTimeout(reapplyInlineStyles, 100);
          debugLog(`[AFFO Content] Re-applied ${fontType} styles on focus/visibility change`);
        };
        
        window.addEventListener('focus', reapplyOnFocus, true);
        document.addEventListener('visibilitychange', function() {
          if (!document.hidden) {
            reapplyOnFocus();
          }
        }, true);
      } catch(e) {
        debugLog(`[AFFO Content] Error setting up focus/visibility listeners:`, e);
      }
      
      debugLog(`[AFFO Content] Added enhanced SPA resilience for ${fontType} fonts on ${currentOrigin}`);
      
    } catch (e) {
      console.error(`[AFFO Content] Error setting up SPA resilience for ${fontType}:`, e);
    }
  }
  
  // Shared CSS generation for body and Third Man In modes.
  // Returns an array of CSS rule strings. Used by both reapplyStoredFontsFromEntry and reapplyStoredFonts.
  function generateCSSLines(fontConfig, fontType) {
    var lines = [];

    // Build non-weight variation settings (shared by body and TMI modes)
    var nonWeightVarSettings = [];
    if (fontConfig.wdthVal && isFinite(fontConfig.wdthVal)) nonWeightVarSettings.push(`"wdth" ${fontConfig.wdthVal}`);
    if (fontConfig.slntVal && isFinite(fontConfig.slntVal)) nonWeightVarSettings.push(`"slnt" ${fontConfig.slntVal}`);
    if (fontConfig.italVal && isFinite(fontConfig.italVal)) nonWeightVarSettings.push(`"ital" ${fontConfig.italVal}`);
    if (fontConfig.variableAxes) {
      Object.entries(fontConfig.variableAxes).forEach(function([axis, value]) {
        if (axis !== 'wght' && isFinite(Number(value))) {
          nonWeightVarSettings.push(`"${axis}" ${value}`);
        }
      });
    }

    // Effective weight: fontWeight takes priority, fall back to variableAxes.wght
    var effectiveWeight = fontConfig.fontWeight || (fontConfig.variableAxes && fontConfig.variableAxes.wght && isFinite(Number(fontConfig.variableAxes.wght)) ? Number(fontConfig.variableAxes.wght) : null);

    if (fontType === 'body') {
      var generalSelector = 'body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo):not([class*="__whatfont_"])';
      var weightSelector = 'body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(strong):not(b):not(.no-affo):not([class*="__whatfont_"])';

      var cssProps = [];
      if (fontConfig.fontName && fontConfig.fontName !== 'undefined') {
        cssProps.push(`font-family: "${fontConfig.fontName}", serif !important`);
      }
      if (fontConfig.fontSize) cssProps.push(`font-size: ${fontConfig.fontSize}px !important`);
      if (fontConfig.lineHeight) cssProps.push(`line-height: ${fontConfig.lineHeight} !important`);
      if (fontConfig.fontColor) cssProps.push(`color: ${fontConfig.fontColor} !important`);
      if (fontConfig.slntVal && fontConfig.slntVal !== 0) cssProps.push(`font-style: oblique ${fontConfig.slntVal}deg !important`);
      if (fontConfig.italVal && fontConfig.italVal >= 1) cssProps.push(`font-style: italic !important`);
      if (nonWeightVarSettings.length > 0) {
        cssProps.push(`font-variation-settings: ${nonWeightVarSettings.join(', ')} !important`);
      }
      lines.push(`${generalSelector} { ${cssProps.join('; ')}; }`);

      if (effectiveWeight) {
        var weightVarSettings = nonWeightVarSettings.concat([`"wght" ${effectiveWeight}`]);
        lines.push(`${weightSelector} { font-weight: ${effectiveWeight} !important; font-variation-settings: ${weightVarSettings.join(', ')} !important; }`);
        var boldVarSettings = nonWeightVarSettings.concat(['"wght" 700']);
        lines.push(`body strong, body b { font-weight: 700 !important; font-variation-settings: ${boldVarSettings.join(', ')} !important; }`);
      }
    } else if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
      var generic = fontType === 'serif' ? 'serif' : fontType === 'mono' ? 'monospace' : 'sans-serif';

      // Comprehensive rule for non-bold marked elements
      var nonBoldProps = [];
      if (fontConfig.fontName && fontConfig.fontName !== 'undefined') {
        nonBoldProps.push(`font-family: "${fontConfig.fontName}", ${generic} !important`);
      }
      if (effectiveWeight) {
        nonBoldProps.push(`font-weight: ${effectiveWeight} !important`);
        var allAxesStr = nonWeightVarSettings.concat([`"wght" ${effectiveWeight}`]).join(', ');
        nonBoldProps.push(`font-variation-settings: ${allAxesStr} !important`);
      } else if (nonWeightVarSettings.length > 0) {
        nonBoldProps.push(`font-variation-settings: ${nonWeightVarSettings.join(', ')} !important`);
      }
      if (nonBoldProps.length > 0) {
        lines.push(`[data-affo-font-type="${fontType}"]:not(strong):not(b) { ${nonBoldProps.join('; ')}; }`);
      }

      // Comprehensive rule for bold elements — same font, weight 700
      if ((fontConfig.fontName && fontConfig.fontName !== 'undefined') || effectiveWeight) {
        var boldProps = [];
        if (fontConfig.fontName && fontConfig.fontName !== 'undefined') {
          boldProps.push(`font-family: "${fontConfig.fontName}", ${generic} !important`);
        }
        boldProps.push('font-weight: 700 !important');
        var boldAxesStr = nonWeightVarSettings.concat(['"wght" 700']).join(', ');
        boldProps.push(`font-variation-settings: ${boldAxesStr} !important`);
        lines.push(`strong[data-affo-font-type="${fontType}"], b[data-affo-font-type="${fontType}"], [data-affo-font-type="${fontType}"] strong, [data-affo-font-type="${fontType}"] b { ${boldProps.join('; ')}; }`);
      }

      // Other properties apply to body text elements
      var otherProps = [];
      if (fontConfig.fontSize) otherProps.push(`font-size: ${fontConfig.fontSize}px !important`);
      if (fontConfig.lineHeight) otherProps.push(`line-height: ${fontConfig.lineHeight} !important`);
      if (fontConfig.fontColor) otherProps.push(`color: ${fontConfig.fontColor} !important`);
      if (fontConfig.slntVal && fontConfig.slntVal !== 0) otherProps.push(`font-style: oblique ${fontConfig.slntVal}deg !important`);
      if (fontConfig.italVal && fontConfig.italVal >= 1) otherProps.push(`font-style: italic !important`);
      if (otherProps.length > 0) {
        lines.push(`html body p[data-affo-font-type="${fontType}"], html body span[data-affo-font-type="${fontType}"], html body td[data-affo-font-type="${fontType}"], html body th[data-affo-font-type="${fontType}"], html body li[data-affo-font-type="${fontType}"] { ${otherProps.join('; ')}; }`);
      }
    }

    return lines;
  }

  function getHybridSelector(fontType) {
    // For x.com, create selectors that capture the semantic intent but with broad coverage
    if (fontType === 'sans') {
      // Most x.com text is sans-serif, so target most text elements
      return 'div[data-testid], span[data-testid], a[data-testid], button[data-testid], div[role], span[role], a[role], button[role], p, div:not([class*="icon"]):not([class*="svg"]), span:not([class*="icon"]):not([class*="svg"])';
    } else if (fontType === 'serif') {
      // For serif, target longer text content areas
      return 'div[data-testid*="tweet"] span, div[data-testid*="text"] span, article span, p, blockquote, div[role="article"] span';
    } else if (fontType === 'mono') {
      // For mono, target code-like elements
      return 'code, pre, span[style*="font-family"][style*="mono"], div[style*="font-family"][style*="mono"]';
    }
    
    // Fallback to marked elements
    return `[data-affo-font-type="${fontType}"]`;
  }
  
  function restoreManipulatedStyles(fontType, cssPropsObject) {
    try {
      // Find elements that should have our font but don't
      var selector;
      if (fontType === 'body') {
        selector = 'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo)';
      } else {
        // Use hybrid selector on x.com for better coverage
        var isXCom = currentOrigin.includes('x.com') || currentOrigin.includes('twitter.com');
        selector = isXCom ? getHybridSelector(fontType) : `[data-affo-font-type="${fontType}"]`;
      }
      var elements = document.querySelectorAll(selector);
      var restoredCount = 0;
      
      elements.forEach(function(el) {
        var currentFontFamily = window.getComputedStyle(el).fontFamily;
        var expectedFontFamily = cssPropsObject['font-family'];
        
        // If the font doesn't match what we expect, restore it
        if (!currentFontFamily.includes(cssPropsObject['font-family'].split(',')[0].replace(/"/g, ''))) {
          Object.entries(cssPropsObject).forEach(function([prop, value]) {
            el.style.setProperty(prop, value, 'important');
            el.style.setProperty(`--affo-${prop}`, value, 'important');
            el.setAttribute(`data-affo-${prop}`, value);
          });
          
          el.setAttribute('data-affo-protected', 'true');
          el.setAttribute('data-affo-font-name', expectedFontFamily);
          restoredCount++;
        }
      });
      
      if (restoredCount > 0) {
        elementLog(`Restored manipulated styles on ${restoredCount} ${fontType} elements`);
      }
    } catch(e) {
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
    debugLog(`[AFFO Content] Font config for ${fontName}:`, {
      fontName: fontConfig.fontName,
      hasFontFaceRule: !!fontConfig.fontFaceRule,
      fontFaceRuleLength: fontConfig.fontFaceRule ? fontConfig.fontFaceRule.length : 0,
      otherKeys: Object.keys(fontConfig).filter(k => k !== 'fontName' && k !== 'fontFaceRule')
    });

    // Create the loading promise and track it
    var loadingPromise;

    // If font has custom @font-face rule (non-Google font), handle it
    if (fontConfig.fontFaceRule) {
      debugLog(`[AFFO Content] Handling custom font ${fontName}`);

      if (shouldUseFontFaceOnly()) {
        // On FontFace-only domains, download and load custom fonts via FontFace API
        debugLog(`[AFFO Content] Loading custom font ${fontName} via FontFace API for CSP bypass`);
        loadingPromise = tryCustomFontFaceAPI(fontName, fontConfig.fontFaceRule);
      } else {
        // On standard domains, inject @font-face CSS
        debugLog(`[AFFO Content] Injecting custom @font-face for ${fontName}`);
        var fontFaceStyleId = 'affo-fontface-' + fontName.replace(/\s+/g, '-').toLowerCase();
        if (!document.getElementById(fontFaceStyleId)) {
          var fontFaceStyle = document.createElement('style');
          fontFaceStyle.id = fontFaceStyleId;
          fontFaceStyle.textContent = fontConfig.fontFaceRule;
          document.head.appendChild(fontFaceStyle);
        }
        loadingPromise = Promise.resolve();
      }
    }
    // If Google font and not FontFace-only domain, load Google Fonts CSS
    else if (!fontConfig.fontFaceRule && !shouldUseFontFaceOnly()) {
      loadGoogleFontCSS(fontConfig);
      loadingPromise = Promise.resolve();
    }
    // If Google font and FontFace-only domain, use FontFace API only
    else if (!fontConfig.fontFaceRule && shouldUseFontFaceOnly()) {
      loadingPromise = tryFontFaceAPI(fontConfig);
    } else {
      loadingPromise = Promise.resolve();
    }

    // Store the promise and clean up when done
    fontsCurrentlyLoading[fontName] = loadingPromise;
    loadingPromise.then(function() {
      delete fontsCurrentlyLoading[fontName];
      debugLog(`[AFFO Content] Font ${fontName} loading completed, removed from tracking`);
    }).catch(function(e) {
      delete fontsCurrentlyLoading[fontName];
      debugLog(`[AFFO Content] Font ${fontName} loading failed, removed from tracking:`, e);
    });

    return loadingPromise;
  }
  
  function loadGoogleFontCSS(fontConfig) {
    try {
      var fontName = fontConfig.fontName;
      var linkId = 'a-font-face-off-style-' + fontName.replace(/\s+/g, '-').toLowerCase() + '-link';
      if (document.getElementById(linkId)) return; // Already loaded

      // Use pre-computed css2Url from popup.js if available, otherwise build it
      var href = fontConfig.css2Url || buildGoogleFontUrl(fontConfig);

      var link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
      debugLog(`[AFFO Content] Loading Google Font CSS: ${fontName} - ${href}`);
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
        document.fonts.forEach(function(fontFace) {
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
      
      var loadPromises = fontFaceBlocks.map(function(block, index) {
        // Extract src URL - handle both WOFF and WOFF2 formats
        var srcMatch = block.match(/src:\s*url\(["']?([^"'\)]+\.(?:woff2?))["']?\)/i);
        if (!srcMatch) {
          debugLog(`[AFFO Content] No WOFF/WOFF2 URL found in @font-face block ${index + 1} for ${fontName}`);
          return Promise.resolve(false);
        }
        
        var fontUrl = srcMatch[1];
        var fontFormat = fontUrl.toLowerCase().endsWith('.woff2') ? 'WOFF2' : 'WOFF';
        debugLog(`[AFFO Content] Found ${fontFormat} URL ${index + 1}: ${fontUrl}`);
        
        // Extract font descriptors
        var weightMatch = block.match(/font-weight:\s*(\d+)/i);
        var styleMatch = block.match(/font-style:\s*(normal|italic)/i);
        
        var descriptors = {
          weight: weightMatch ? weightMatch[1] : '400',
          style: styleMatch ? styleMatch[1] : 'normal',
          display: 'swap'
        };
        
        debugLog(`[AFFO Content] Font descriptors ${index + 1}:`, descriptors);
        
        // Download font file via background script
        return browser.runtime.sendMessage({
          type: 'affoFetch',
          url: fontUrl,
          binary: true
        }).then(function(response) {
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
            
            return fontFace.load().then(function() {
              debugLog(`[AFFO Content] Custom FontFace API successful for ${fontName} variant ${index + 1}`);
              return true;
            }).catch(function(e) {
              debugLog(`[AFFO Content] Custom FontFace API failed for ${fontName} variant ${index + 1}:`, e);
              return false;
            });
            
          } else {
            debugLog(`[AFFO Content] Custom font download ${index + 1} failed for ${fontUrl}`);
            return false;
          }
        }).catch(function(e) {
          debugLog(`[AFFO Content] Custom font download ${index + 1} exception:`, e);
          return false;
        });
      });
      
      // Wait for all font variants to load
      return Promise.all(loadPromises).then(function(results) {
        var successCount = results.filter(Boolean).length;
        elementLog(`Loaded ${successCount}/${results.length} custom font variants for ${fontName}`);
        
        // For x.com with inline apply, trigger style re-application after font loading
        if (shouldUseInlineApply() && successCount > 0) {
          debugLog(`[AFFO Content] Custom font ${fontName} loaded (${successCount} variants), triggering style re-application for x.com`);
          
          // Check if fonts are actually available in document.fonts
          try {
            document.fonts.ready.then(function() {
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
              setTimeout(function() {
                try {
                  // Re-trigger inline styles application for the loaded custom font
                  document.dispatchEvent(new CustomEvent('affo-custom-font-loaded', { 
                    detail: { fontName: fontName } 
                  }));
                } catch(e) {
                  debugLog(`[AFFO Content] Error dispatching custom font loaded event:`, e);
                }
              }, 200);
            });
          } catch(e) {
            debugLog(`[AFFO Content] Error with document.fonts.ready:`, e);
            // Fallback to simple timeout
            setTimeout(function() {
              try {
                document.dispatchEvent(new CustomEvent('affo-custom-font-loaded', { 
                  detail: { fontName: fontName } 
                }));
              } catch(e) {
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
      .map(function(part) { return part.trim(); })
      .filter(Boolean)
      .map(function(part) {
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
      .filter(function(pair) { return isFinite(pair[0]) && isFinite(pair[1]); });
  }

  var FONTFACE_SUBSET_SAMPLE_LIMIT = 20000;
  var FONTFACE_MAX_UNIQUE_CODEPOINTS = 2000;
  var FONTFACE_MAX_SUBSET_DOWNLOADS = 16;
  var FONTFACE_MAX_PARALLEL_DOWNLOADS = 4;

  function dedupeUrls(urls) {
    if (!urls || urls.length === 0) return [];
    var seen = new Set();
    var unique = [];
    urls.forEach(function(url) {
      if (!seen.has(url)) {
        seen.add(url);
        unique.push(url);
      }
    });
    return unique;
  }

  function buildUrlToRanges(entries) {
    return entries.reduce(function(map, entry) {
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
        'Hello'.split('').forEach(function(ch) { needed.add(ch.charCodeAt(0)); });
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

    uniqueUrls.forEach(function(url, index) {
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
      var latinFallback = uniqueUrls.filter(function(url) { return url.includes('latin'); });
      var fallbackUrls = latinFallback.length > 0 ? latinFallback : uniqueUrls;
      if (maxUrls && fallbackUrls.length > maxUrls) return fallbackUrls.slice(0, maxUrls);
      return fallbackUrls;
    }

    scored.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

    var selectedUrls = scored.map(function(entry) { return entry.url; });
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

    return new Promise(function(resolve) {
      function launchNext() {
        if (nextIndex >= items.length && inFlight === 0) {
          resolve(results);
          return;
        }
        while (inFlight < maxParallel && nextIndex < items.length) {
          (function(index) {
            inFlight++;
            Promise.resolve(handler(items[index], index))
              .then(function(result) { results[index] = result; })
              .catch(function() { results[index] = false; })
              .then(function() {
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
        document.fonts.forEach(function(fontFace) {
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

      // Use pre-computed css2Url from popup.js if available, otherwise build it
      var cssUrl = fontConfig.css2Url || buildGoogleFontUrl(fontConfig);
      
      return browser.runtime.sendMessage({
        type: 'affoFetch',
        url: cssUrl,
        binary: false
      }).then(function(response) {
        if (response && response.ok && !response.binary && response.data) {
          debugLog(`[AFFO Content] Got Google Fonts CSS for ${fontName}`);
          
          // Parse CSS to extract WOFF2 URLs
          var css = response.data;
          var woff2Matches = css.match(/url\(([^)]+\.woff2[^)]*)\)/g);
          
          if (woff2Matches && woff2Matches.length > 0) {
            debugLog(`[AFFO Content] Found ${woff2Matches.length} WOFF2 URLs in CSS (different subsets/styles)`);

            // Extract all WOFF2 URLs first
            var woff2Urls = woff2Matches.map(function(match) {
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
            var latinUrls = filteredUrls.filter(function(url) {
              return url.includes('latin') && !url.includes('ext');
            });
            var latinExtUrls = filteredUrls.filter(function(url) {
              return url.includes('latin-ext');
            });
            var otherUrls = filteredUrls.filter(function(url) {
              return !url.includes('latin');
            });

            debugLog(`[AFFO Content] Prioritizing font loading after unicode filtering: ${latinUrls.length} Latin, ${latinExtUrls.length} Latin-ext, ${otherUrls.length} other subsets for ${fontName}`);

            // Load Latin first (most critical), then others in parallel
            var prioritizedUrls = latinUrls.concat(latinExtUrls).concat(otherUrls);

            if (prioritizedUrls.length === 0) {
              debugLog(`[AFFO Content] No WOFF2 URLs selected after unicode filtering for ${fontName}`);
              return Promise.resolve();
            }

            return runWithConcurrency(prioritizedUrls, FONTFACE_MAX_PARALLEL_DOWNLOADS, function(woff2Url, index) {
              debugLog(`[AFFO Content] Downloading WOFF2 ${index + 1}/${prioritizedUrls.length}: ${woff2Url}`);

              return browser.runtime.sendMessage({
                type: 'affoFetch',
                url: woff2Url,
                binary: true
              }).then(function(woff2Response) {
                if (woff2Response && woff2Response.ok && woff2Response.binary && woff2Response.data) {
                  debugLog(`[AFFO Content] WOFF2 download ${index + 1} successful for ${fontName}`);
                  
                  // Convert binary data to ArrayBuffer
                  var uint8Array = new Uint8Array(woff2Response.data);
                  var arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
                  
                  debugLog(`[AFFO Content] Created ArrayBuffer ${index + 1} for ${fontName} (${arrayBuffer.byteLength} bytes)`);
                  
                  // Create FontFace with ArrayBuffer - load each subset
                  var fontFace = new FontFace(fontName, arrayBuffer);
                  document.fonts.add(fontFace);
                  
                  return fontFace.load().then(function() {
                    debugLog(`[AFFO Content] FontFace API successful for ${fontName} subset ${index + 1}`);
                    return true;
                  }).catch(function(e) {
                    debugLog(`[AFFO Content] FontFace API failed for ${fontName} subset ${index + 1}:`, e);
                    return false;
                  });
                  
                } else {
                  debugLog(`[AFFO Content] WOFF2 download ${index + 1} failed for ${woff2Url}`);
                  return false;
                }
              }).catch(function(e) {
                debugLog(`[AFFO Content] WOFF2 download ${index + 1} exception:`, e);
                return false;
              });
            }).then(function(results) {
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
      }).catch(function(e) {
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

  // Element walker function for Third Man In mode
  function runElementWalker(fontType) {
    try {
      // Skip if walker already completed for this font type on this page
      if (elementWalkerCompleted[fontType]) {
        console.log(`[AFFO Content] Element walker already completed for ${fontType}, skipping redundant scan`);
        return;
      }

      console.log(`[AFFO Content] Starting element walker for ${fontType}`);

      var startTime = performance.now();
      elementLog(`Running element walker for ${fontType}`);

      // Clear only existing markers for this specific font type
      var existingMarked = document.querySelectorAll(`[data-affo-font-type="${fontType}"]`);
      elementLog(`Clearing ${existingMarked.length} existing ${fontType} markers`);
      existingMarked.forEach(function(el) {
        el.removeAttribute('data-affo-font-type');
      });

      // Element type detection logic
      function getElementFontType(element) {
        var tagName = element.tagName.toLowerCase();
        var className = element.className || '';
        var style = element.style.fontFamily || '';

        // Exclude pure UI elements (but not headings)
        if (['nav', 'header', 'footer', 'aside', 'figcaption'].indexOf(tagName) !== -1) return null;

        // Exclude children of figcaption (captions contain multiple spans/elements)
        if (element.closest && element.closest('figcaption')) return null;

        // Exclude navigation and UI class names
        if (className && /\b(nav|menu|header|footer|sidebar|toolbar|breadcrumb|caption)\b/i.test(className)) return null;

        // Get computed font-family (what WhatFont sees)
        var computedStyle = window.getComputedStyle(element);
        var computedFontFamily = computedStyle.fontFamily || '';

        // Check for complete words/phrases in class names and styles
        // Convert className to string safely (it might be a DOMTokenList)
        var classText = (typeof className === 'string' ? className : className.toString()).toLowerCase();
        var styleText = style.toLowerCase();
        var computedText = computedFontFamily.toLowerCase();

        // Check for monospace keywords
        if (/\b(monospace|mono|code)\b/.test(classText) ||
            /\b(monospace|mono)\b/.test(styleText)) return 'mono';

        // Check for sans-serif as complete phrase first
        if (/\bsans-serif\b/.test(classText) || /\bsans-serif\b/.test(styleText)) return 'sans';

        // Check for standalone sans (but not sans-serif)
        if (/\bsans\b(?!-serif)/.test(classText) || /\bsans\b(?!-serif)/.test(styleText)) return 'sans';

        // Check for sans-serif in computed font-family (what WhatFont sees)
        if (/\bsans-serif\b/.test(computedText)) {
            console.log('SANS FOUND (computed):', element.tagName, 'computedFont:', computedFontFamily);
            return 'sans';
        }

        // Check for serif in computed font-family (what WhatFont sees)
        if (/\bserif\b/.test(computedText.replace('sans-serif', ''))) {
            console.log('SERIF FOUND (computed):', element.tagName, 'computedFont:', computedFontFamily);
            return 'serif';
        }

        // Check if computed font matches known serif fonts
        var computedParts = computedFontFamily.split(',').map(function(s) { return s.trim().toLowerCase().replace(/['"]/g, ''); });
        for (var i = 0; i < computedParts.length; i++) {
          if (knownSerifFonts.indexOf(computedParts[i]) !== -1) {
            console.log('SERIF FOUND (known font):', element.tagName, 'computedFont:', computedFontFamily, 'matched:', computedParts[i]);
            return 'serif';
          }
          if (knownSansFonts.indexOf(computedParts[i]) !== -1) {
            console.log('SANS FOUND (known font):', element.tagName, 'computedFont:', computedFontFamily, 'matched:', computedParts[i]);
            return 'sans';
          }
        }

        // Check for serif (but not sans-serif) in class names and inline styles
        if (/\bserif\b/.test(classText.replace('sans-serif', '')) ||
            /\bserif\b/.test(styleText.replace('sans-serif', ''))) {
            console.log('SERIF FOUND (class/style):', element.tagName, 'className:', classText, 'style:', styleText);
            return 'serif';
        }

        // Tag-based detection for monospace
        if (['code', 'pre', 'kbd', 'samp', 'tt'].indexOf(tagName) !== -1) return 'mono';

        // Third Man In mode only finds explicit markers - no assumptions

        // No explicit indicators found - don't mark this element
        return null;
      }

      // Walk all text-containing elements
      var walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: function(node) {
            // Skip elements that are hidden or have no text content
            if (node.offsetParent === null && node.tagName !== 'BODY') return NodeFilter.FILTER_SKIP;
            if (!node.textContent || node.textContent.trim().length === 0) return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      var totalElements = 0;
      var markedElements = 0;
      var element;

      console.log(`[AFFO Content] Starting element scan for ${fontType}`);

      while (element = walker.nextNode()) {
        totalElements++;
        var detectedType = getElementFontType(element);
        if (detectedType === fontType) {
          element.setAttribute('data-affo-font-type', fontType);
          markedElements++;
        }

        // Log progress every 500 elements to detect hangs
        if (totalElements % 500 === 0) {
          console.log(`[AFFO Content] Element walker progress: ${totalElements} elements scanned, ${markedElements} marked as ${fontType}`);
        }
      }

      console.log(`[AFFO Content] Element scan loop finished for ${fontType}`);

      var endTime = performance.now();
      var duration = (endTime - startTime).toFixed(2);
      console.log(`[AFFO Content] ✅ Element walker completed in ${duration}ms: processed ${totalElements} elements, marked ${markedElements} as ${fontType}`);

      // Mark this font type as completed to prevent redundant scans
      elementWalkerCompleted[fontType] = true;
      console.log(`[AFFO Content] Marked ${fontType} walker as completed`);
    } catch (e) {
      console.error(`[AFFO Content] Element walker failed for ${fontType}:`, e);
    }
  }

  // Helper function to reapply fonts from a given entry (used by storage listener and page load)
  function reapplyStoredFontsFromEntry(entry) {
    try {
      ['body', 'serif', 'sans', 'mono'].forEach(function(fontType) {
        var fontConfig = entry[fontType];
        if (fontConfig && (fontConfig.fontName || fontConfig.fontSize || fontConfig.fontWeight || fontConfig.lineHeight || fontConfig.fontColor)) {
          debugLog(`[AFFO Content] Reapplying ${fontType} font from storage change:`, fontConfig.fontName);
          
          // Load font (handles Google Fonts, custom fonts, and FontFace-only domains)
          loadFont(fontConfig, fontType).then(function() {
            debugLog(`[AFFO Content] Font ${fontConfig.fontName} loaded successfully, applying styles`);
            
            // Generate CSS for this font type after font loads
          var css = '';
          var lines = [];
          
          // Add custom @font-face rule if present
          if (fontConfig.fontFaceRule) {
            lines.push(fontConfig.fontFaceRule);
          }
          
          // Run element walker for Third Man In mode
          if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
            runElementWalker(fontType);
          }
          // Generate CSS rules using shared helper
          lines = lines.concat(generateCSSLines(fontConfig, fontType));
          
          css = lines.join('\n');
          
          if (css) {
            // Check if we should use inline apply for this domain
            if (shouldUseInlineApply()) {
              // For Third Man In mode, run element walker first if needed
              if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
                runElementWalker(fontType);
              }
              // Apply styles inline directly to elements
              applyInlineStyles(fontConfig, fontType);
            } else {
              // Apply CSS by creating style element (default behavior)
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
        }).catch(function(e) {
          console.warn(`[AFFO Content] Error applying styles after font load:`, e);
        });
        }
      });
    } catch (e) {
      console.error('[AFFO Content] Error reapplying fonts from storage change:', e);
    }
  }

  // Listen for custom font loaded events to re-apply styles on x.com
  try {
    document.addEventListener('affo-custom-font-loaded', function(event) {
      debugLog(`[AFFO Content] Custom font loaded event received:`, event.detail.fontName);
      
      // Re-apply styles for all active font types after custom font loads
      browser.storage.local.get('affoApplyMap').then(function(data) {
        var map = data && data.affoApplyMap ? data.affoApplyMap : {};
        var entry = map[currentOrigin];
        if (entry) {
          ['body', 'serif', 'sans', 'mono'].forEach(function(fontType) {
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
      }).catch(function(e) {
        debugLog(`[AFFO Content] Error re-applying styles after custom font load:`, e);
      });
    });
  } catch(e) {
    debugLog(`[AFFO Content] Error setting up custom font loaded listener:`, e);
  }

  // Initialize: Load consolidated storage and reapply stored fonts
  try {
    if (!window || !window.location || !/^https?:/.test(location.protocol)) return;
    var origin = location.hostname;
    
    browser.storage.local.get('affoApplyMap').then(function(data){
      var map = data && data.affoApplyMap ? data.affoApplyMap : {};
      var entry = map[origin];
      if (!entry) {
        // Clean up all stale styles if no entry exists
        ['a-font-face-off-style-body','a-font-face-off-style-serif','a-font-face-off-style-sans','a-font-face-off-style-mono'].forEach(function(id){ try { var n=document.getElementById(id); if(n) n.remove(); } catch(e){} });
        return;
      }
      
      // Content script handles cleanup AND reapplies stored fonts on page load
      debugLog(`[AFFO Content] Reapplying stored fonts for origin: ${origin}`, entry);
      
      // Remove style elements for fonts that are not applied
      if (!entry.body) {
        try{ var s3=document.getElementById('a-font-face-off-style-body'); if(s3) s3.remove(); }catch(e){}
      }
      if (!entry.serif) {
        try{ var s=document.getElementById('a-font-face-off-style-serif'); if(s) s.remove(); }catch(e){}
      }
      if (!entry.sans) {
        try{ var s2=document.getElementById('a-font-face-off-style-sans'); if(s2) s2.remove(); }catch(e){}
      }
      if (!entry.mono) {
        try{ var s4=document.getElementById('a-font-face-off-style-mono'); if(s4) s4.remove(); }catch(e){}
      }
      
      // Reapply stored fonts on page load - wait for DOM to be ready
      function reapplyStoredFonts() {
        try {
          ['body', 'serif', 'sans', 'mono'].forEach(function(fontType) {
            var fontConfig = entry[fontType];
            if (fontConfig && (fontConfig.fontName || fontConfig.fontSize || fontConfig.fontWeight || fontConfig.lineHeight || fontConfig.fontColor)) {
              debugLog(`[AFFO Content] Reapplying ${fontType} font:`, fontConfig.fontName);
              
              // Load font (handles Google Fonts, custom fonts, and FontFace-only domains)
              loadFont(fontConfig, fontType).then(function() {
                debugLog(`[AFFO Content] Font ${fontConfig.fontName} loaded successfully on page load, applying styles`);
                
                // Generate CSS for this font type after font loads
              var css = '';
              var lines = [];
              
              // Add custom @font-face rule if present
              if (fontConfig.fontFaceRule) {
                lines.push(fontConfig.fontFaceRule);
              }
              
              // Run element walker for Third Man In mode
              if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
                runElementWalker(fontType);
              }
              // Generate CSS rules using shared helper
              lines = lines.concat(generateCSSLines(fontConfig, fontType));
              
              css = lines.join('\n');
              
              if (css) {
                // Check if we should use inline apply for this domain
                if (shouldUseInlineApply()) {
                  // For Third Man In mode, run element walker first if needed
                  if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
                    runElementWalker(fontType);
                  }
                  // Apply styles inline directly to elements
                  applyInlineStyles(fontConfig, fontType);
                } else {
                  // Apply CSS by creating style element (default behavior)
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
              }).catch(function(e) {
                console.warn(`[AFFO Content] Error applying styles after font load on page init:`, e);
              });
            }
          });
        } catch (e) {
          console.error('[AFFO Content] Error reapplying fonts:', e);
        }
      }
      
      // Wait for DOM to be ready before reapplying fonts
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reapplyStoredFonts);
      } else {
        // DOM is already ready
        setTimeout(reapplyStoredFonts, 100); // Small delay to ensure elements are rendered
      }
    }).catch(function(){});
  } catch (e) {}

  // Storage change listener - only handles cleanup
  try {
    browser.storage.onChanged.addListener(function(changes, area){
      if (area !== 'local' || !changes.affoApplyMap) return;
      try {
        var origin = location.hostname;
        debugLog(`[AFFO Content] Storage changed for origin ${origin}:`, changes.affoApplyMap);
        var newMap = changes.affoApplyMap.newValue || {};
        var entry = newMap[origin];
        debugLog(`[AFFO Content] New map:`, newMap);
        debugLog(`[AFFO Content] New entry for ${origin}:`, entry);
        
        // Remove all existing styles
        ['a-font-face-off-style-body','a-font-face-off-style-serif','a-font-face-off-style-sans','a-font-face-off-style-mono'].forEach(function(id){ 
          try { 
            var n=document.getElementById(id); 
            if(n) {
              debugLog(`[AFFO Content] Removing existing style element:`, id);
              n.remove(); 
            }
          } catch(e){} 
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
    browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message.type === 'affoFilterFontSubsets') {
        try {
          var cssText = typeof message.cssText === 'string' ? message.cssText : '';
          var urls = Array.isArray(message.urls) ? message.urls.filter(function(url) { return typeof url === 'string'; }) : [];
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
        sendResponse({success: true});
      } else if (message.type === 'resetFonts') {
        try {
          // Remove the font style element for this panel
          const styleId = 'a-font-face-off-style-' + message.panelId;
          const styleElement = document.getElementById(styleId);
          if (styleElement) {
            styleElement.remove();
            debugLog('Removed font styling for panel:', message.panelId);
          }
          sendResponse({success: true});
        } catch (error) {
          console.error('Error resetting fonts:', error);
          sendResponse({success: false, error: error.message});
        }
      } else if (message.action === 'restoreOriginal') {
        try {
          // Remove all A Font Face-off CSS style elements
          ['a-font-face-off-style-body','a-font-face-off-style-serif','a-font-face-off-style-sans','a-font-face-off-style-mono'].forEach(function(id) {
            try {
              var element = document.getElementById(id);
              if (element) element.remove();
            } catch(e) {}
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
          } catch(e) {}

          // Remove custom font @font-face style elements efficiently
          try {
            var allStyles = document.getElementsByTagName('style');
            for (var j = allStyles.length - 1; j >= 0; j--) {
              var style = allStyles[j];
              if (style.id && style.id.indexOf('affo-') === 0 && style.id.indexOf('-font') > 0) {
                style.remove();
              }
            }
          } catch(e) {}

          // Remove any Third Man In data attributes
          try {
            document.querySelectorAll('[data-affo-font-type]').forEach(function(el) {
              el.removeAttribute('data-affo-font-type');
            });
          } catch(e) {}
          
          debugLog('Restored original page fonts');
          sendResponse({success: true});
        } catch (error) {
          console.error('Error restoring original:', error);
          sendResponse({success: false, error: error.message});
        }
      }
    });
  } catch (e) {
    console.error(`[AFFO Content] Error setting up message listener:`, e);
  }

})();
