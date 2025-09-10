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
  
  // Load FontFace-only domains from storage
  try {
    browser.storage.local.get(['affoFontFaceOnlyDomains', 'affoInlineApplyDomains']).then(function(data) {
      if (Array.isArray(data.affoFontFaceOnlyDomains)) {
        fontFaceOnlyDomains = data.affoFontFaceOnlyDomains;
        console.log(`[AFFO Content] FontFace-only domains:`, fontFaceOnlyDomains);
      }
      if (Array.isArray(data.affoInlineApplyDomains)) {
        inlineApplyDomains = data.affoInlineApplyDomains;
        console.log(`[AFFO Content] Inline apply domains:`, inlineApplyDomains);
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
    console.log(`[AFFO Content] Applying inline styles for ${fontType}:`, fontConfig.fontName);
    
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
    
    var cssPropsObject = {
      'font-family': `"${fontConfig.fontName}", ${fallbackChain}`
    };
    
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
        console.log(`[AFFO Content] Applied inline styles to ${bodyElements.length} body elements`);
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
          console.log(`[AFFO Content] Applied hybrid inline styles to ${hybridElements.length} ${fontType} elements on x.com`);
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
          console.log(`[AFFO Content] Applied enhanced inline styles to ${targetElements.length} ${fontType} elements`);
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
                  console.log(`[AFFO Content] Applied inline styles to ${newElements.length} new ${fontType} elements`);
                }
              }
            } catch(_) {}
          });
        });
      });
      
      mo.observe(document.documentElement || document, { childList: true, subtree: true });
      
      // Extended resiliency window for inline domains (10 minutes)
      setTimeout(function() { 
        try { mo.disconnect(); } catch(_) {} 
      }, 600000);
      
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
          
          console.log(`[AFFO Content] Re-applied inline styles to ${elements.length} ${fontType} elements after SPA navigation`);
        } catch(e) {
          console.log(`[AFFO Content] Error re-applying inline styles after SPA navigation:`, e);
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
      
      // Enhanced monitoring with much more frequent checks for x.com
      setTimeout(function() {
        try {
          // On x.com, monitor every 1 second for the first 2 minutes, then every 5 seconds for 8 more minutes
          var isXCom = currentOrigin.includes('x.com') || currentOrigin.includes('twitter.com');
          var initialFrequency = isXCom ? 1000 : 5000; // 1 second for x.com, 5 seconds for others
          var laterFrequency = 5000; // 5 seconds
          var initialDuration = isXCom ? 120000 : 60000; // 2 minutes for x.com, 1 minute for others
          var totalDuration = 600000; // 10 minutes total
          
          console.log(`[AFFO Content] Starting enhanced monitoring for ${fontType} - initial: ${initialFrequency}ms, later: ${laterFrequency}ms`);
          
          var checkCount = 0;
          
          // Frequent monitoring initially
          var initialInterval = setInterval(function() {
            try {
              checkCount++;
              reapplyInlineStyles();
              if (checkCount % 10 === 0) {
                console.log(`[AFFO Content] Performed ${checkCount} style checks for ${fontType}`);
              }
            } catch(e) {
              console.log(`[AFFO Content] Error in frequent style check:`, e);
            }
          }, initialFrequency);
          
          // Switch to less frequent monitoring after initial period
          setTimeout(function() {
            clearInterval(initialInterval);
            console.log(`[AFFO Content] Switching to less frequent monitoring for ${fontType}`);
            
            var laterInterval = setInterval(function() {
              try {
                checkCount++;
                reapplyInlineStyles();
                
                // Additional protection: Check for and restore any cleared styles
                if (isXCom) {
                  restoreManipulatedStyles(fontType, cssPropsObject);
                }
              } catch(e) {
                console.log(`[AFFO Content] Error in periodic style check:`, e);
              }
            }, laterFrequency);
            
            // Stop monitoring after total duration
            setTimeout(function() {
              clearInterval(laterInterval);
              console.log(`[AFFO Content] Stopped style monitoring for ${fontType} after ${totalDuration/1000} seconds (${checkCount} total checks)`);
            }, totalDuration - initialDuration);
            
          }, initialDuration);
          
        } catch(e) {
          console.log(`[AFFO Content] Error setting up enhanced monitoring for ${fontType}:`, e);
        }
      }, 1000);
      
      // Add focus/visibility event listeners to re-apply styles when page becomes visible
      try {
        var reapplyOnFocus = function() {
          setTimeout(reapplyInlineStyles, 100);
          console.log(`[AFFO Content] Re-applied ${fontType} styles on focus/visibility change`);
        };
        
        window.addEventListener('focus', reapplyOnFocus, true);
        document.addEventListener('visibilitychange', function() {
          if (!document.hidden) {
            reapplyOnFocus();
          }
        }, true);
      } catch(e) {
        console.log(`[AFFO Content] Error setting up focus/visibility listeners:`, e);
      }
      
      console.log(`[AFFO Content] Added enhanced SPA resilience for ${fontType} fonts on ${currentOrigin}`);
      
    } catch (e) {
      console.error(`[AFFO Content] Error setting up SPA resilience for ${fontType}:`, e);
    }
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
        console.log(`[AFFO Content] Restored manipulated styles on ${restoredCount} ${fontType} elements`);
      }
    } catch(e) {
      console.log(`[AFFO Content] Error restoring manipulated styles:`, e);
    }
  }
  
  function loadFont(fontConfig, fontType) {
    var fontName = fontConfig.fontName;
    if (!fontName) return Promise.resolve();
    
    console.log(`[AFFO Content] Loading font ${fontName} for ${fontType}, FontFace-only:`, shouldUseFontFaceOnly());
    console.log(`[AFFO Content] Font config for ${fontName}:`, {
      fontName: fontConfig.fontName,
      hasFontFaceRule: !!fontConfig.fontFaceRule,
      fontFaceRuleLength: fontConfig.fontFaceRule ? fontConfig.fontFaceRule.length : 0,
      otherKeys: Object.keys(fontConfig).filter(k => k !== 'fontName' && k !== 'fontFaceRule')
    });
    
    // If font has custom @font-face rule (non-Google font), handle it
    if (fontConfig.fontFaceRule) {
      console.log(`[AFFO Content] Handling custom font ${fontName}`);
      
      if (shouldUseFontFaceOnly()) {
        // On FontFace-only domains, download and load custom fonts via FontFace API
        console.log(`[AFFO Content] Loading custom font ${fontName} via FontFace API for CSP bypass`);
        return tryCustomFontFaceAPI(fontName, fontConfig.fontFaceRule);
      } else {
        // On standard domains, inject @font-face CSS
        console.log(`[AFFO Content] Injecting custom @font-face for ${fontName}`);
        var fontFaceStyleId = 'affo-fontface-' + fontName.replace(/\s+/g, '-').toLowerCase();
        if (!document.getElementById(fontFaceStyleId)) {
          var fontFaceStyle = document.createElement('style');
          fontFaceStyle.id = fontFaceStyleId;
          fontFaceStyle.textContent = fontConfig.fontFaceRule;
          document.head.appendChild(fontFaceStyle);
        }
        return Promise.resolve();
      }
    }
    // If Google font and not FontFace-only domain, load Google Fonts CSS
    else if (!fontConfig.fontFaceRule && !shouldUseFontFaceOnly()) {
      loadGoogleFontCSS(fontName);
      return Promise.resolve();
    }
    // If Google font and FontFace-only domain, use FontFace API only
    else if (!fontConfig.fontFaceRule && shouldUseFontFaceOnly()) {
      return tryFontFaceAPI(fontName);
    }
    
    return Promise.resolve();
  }
  
  function loadGoogleFontCSS(fontName) {
    try {
      var linkId = 'a-font-face-off-style-' + fontName.replace(/\s+/g, '-').toLowerCase() + '-link';
      if (document.getElementById(linkId)) return; // Already loaded
      
      // Use proper URL encoding for Google Fonts
      var familyParam = encodeURIComponent(fontName);
      var href = 'https://fonts.googleapis.com/css2?family=' + familyParam + '&display=swap';
      
      var link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
      console.log(`[AFFO Content] Loading Google Font CSS: ${fontName} - ${href}`);
    } catch (e) {
      console.error(`[AFFO Content] Failed to load Google Font CSS ${fontName}:`, e);
    }
  }
  
  
  function tryCustomFontFaceAPI(fontName, fontFaceRule) {
    if (!window.FontFace || !document.fonts) {
      console.log(`[AFFO Content] FontFace API not supported for custom font ${fontName}`);
      return Promise.resolve();
    }
    
    try {
      console.log(`[AFFO Content] Parsing custom @font-face rule for ${fontName}`);
      
      // Parse @font-face rule to extract WOFF2 URLs and font descriptors
      var fontFaceBlocks = fontFaceRule.split('@font-face').filter(block => block.trim().length > 0);
      
      console.log(`[AFFO Content] Found ${fontFaceBlocks.length} @font-face blocks for ${fontName}`);
      
      var loadPromises = fontFaceBlocks.map(function(block, index) {
        // Extract src URL - handle both WOFF and WOFF2 formats
        var srcMatch = block.match(/src:\s*url\(["']?([^"'\)]+\.(?:woff2?))["']?\)/i);
        if (!srcMatch) {
          console.log(`[AFFO Content] No WOFF/WOFF2 URL found in @font-face block ${index + 1} for ${fontName}`);
          return Promise.resolve(false);
        }
        
        var fontUrl = srcMatch[1];
        var fontFormat = fontUrl.toLowerCase().endsWith('.woff2') ? 'WOFF2' : 'WOFF';
        console.log(`[AFFO Content] Found ${fontFormat} URL ${index + 1}: ${fontUrl}`);
        
        // Extract font descriptors
        var weightMatch = block.match(/font-weight:\s*(\d+)/i);
        var styleMatch = block.match(/font-style:\s*(normal|italic)/i);
        
        var descriptors = {
          weight: weightMatch ? weightMatch[1] : '400',
          style: styleMatch ? styleMatch[1] : 'normal',
          display: 'swap'
        };
        
        console.log(`[AFFO Content] Font descriptors ${index + 1}:`, descriptors);
        
        // Download font file via background script
        return browser.runtime.sendMessage({
          type: 'affoFetch',
          url: fontUrl,
          binary: true
        }).then(function(response) {
          if (response && response.ok && response.binary && response.data) {
            var cacheStatus = response.cached ? 'cached' : 'downloaded';
            console.log(`[AFFO Content] Custom font ${cacheStatus} ${index + 1} successful for ${fontName}`);
            
            // Convert binary data to ArrayBuffer
            var uint8Array = new Uint8Array(response.data);
            var arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
            
            console.log(`[AFFO Content] Created ArrayBuffer ${index + 1} for ${fontName} (${arrayBuffer.byteLength} bytes)`);
            
            // Create FontFace with ArrayBuffer and descriptors
            var fontFace = new FontFace(fontName, arrayBuffer, descriptors);
            document.fonts.add(fontFace);
            
            return fontFace.load().then(function() {
              console.log(`[AFFO Content] Custom FontFace API successful for ${fontName} variant ${index + 1}`);
              return true;
            }).catch(function(e) {
              console.log(`[AFFO Content] Custom FontFace API failed for ${fontName} variant ${index + 1}:`, e);
              return false;
            });
            
          } else {
            console.log(`[AFFO Content] Custom font download ${index + 1} failed for ${fontUrl}`);
            return false;
          }
        }).catch(function(e) {
          console.log(`[AFFO Content] Custom font download ${index + 1} exception:`, e);
          return false;
        });
      });
      
      // Wait for all font variants to load
      return Promise.all(loadPromises).then(function(results) {
        var successCount = results.filter(Boolean).length;
        console.log(`[AFFO Content] Loaded ${successCount}/${results.length} custom font variants for ${fontName}`);
        
        // For x.com with inline apply, trigger style re-application after font loading
        if (shouldUseInlineApply() && successCount > 0) {
          console.log(`[AFFO Content] Custom font ${fontName} loaded (${successCount} variants), triggering style re-application for x.com`);
          
          // Check if fonts are actually available in document.fonts
          try {
            document.fonts.ready.then(function() {
              console.log(`[AFFO Content] document.fonts.ready confirmed for ${fontName}`);
              
              // Additional check to see if font is loaded
              var testElement = document.createElement('span');
              testElement.style.fontFamily = `"${fontName}", monospace`;
              testElement.style.position = 'absolute';
              testElement.style.left = '-9999px';
              testElement.textContent = 'test';
              document.body.appendChild(testElement);
              
              var computedFont = window.getComputedStyle(testElement).fontFamily;
              document.body.removeChild(testElement);
              
              console.log(`[AFFO Content] Font availability test for ${fontName}: computed font =`, computedFont);
              
              // Delay to ensure fonts are fully available
              setTimeout(function() {
                try {
                  // Re-trigger inline styles application for the loaded custom font
                  document.dispatchEvent(new CustomEvent('affo-custom-font-loaded', { 
                    detail: { fontName: fontName } 
                  }));
                } catch(e) {
                  console.log(`[AFFO Content] Error dispatching custom font loaded event:`, e);
                }
              }, 200);
            });
          } catch(e) {
            console.log(`[AFFO Content] Error with document.fonts.ready:`, e);
            // Fallback to simple timeout
            setTimeout(function() {
              try {
                document.dispatchEvent(new CustomEvent('affo-custom-font-loaded', { 
                  detail: { fontName: fontName } 
                }));
              } catch(e) {
                console.log(`[AFFO Content] Error dispatching custom font loaded event:`, e);
              }
            }, 300);
          }
        }
      });
      
    } catch (e) {
      console.log(`[AFFO Content] Custom FontFace API exception for ${fontName}:`, e);
      return Promise.resolve();
    }
  }

  function tryFontFaceAPI(fontName) {
    if (!window.FontFace || !document.fonts) {
      console.log(`[AFFO Content] FontFace API not supported for ${fontName}`);
      return Promise.resolve();
    }
    
    try {
      console.log(`[AFFO Content] Downloading WOFF2 font data for ${fontName} via background script`);
      
      // Get Google Fonts CSS to extract the correct WOFF2 URL
      // Include common subsets to ensure we get Latin characters
      var fontParam = encodeURIComponent(fontName);
      var cssUrl = `https://fonts.googleapis.com/css2?family=${fontParam}&subset=latin,latin-ext&display=swap`;
      
      return browser.runtime.sendMessage({
        type: 'affoFetch',
        url: cssUrl,
        binary: false
      }).then(function(response) {
        if (response && response.ok && !response.binary && response.data) {
          console.log(`[AFFO Content] Got Google Fonts CSS for ${fontName}`);
          
          // Parse CSS to extract WOFF2 URLs
          var css = response.data;
          var woff2Matches = css.match(/url\(([^)]+\.woff2[^)]*)\)/g);
          
          if (woff2Matches && woff2Matches.length > 0) {
            console.log(`[AFFO Content] Found ${woff2Matches.length} WOFF2 URLs in CSS (different subsets/styles)`);
            
            // Load all WOFF2 files to get all subsets (latin, latin-ext, etc.)
            var loadPromises = woff2Matches.map(function(match, index) {
              var woff2Url = match.replace(/url\((['"]?)([^'"]+)\1\)/, '$2');
              console.log(`[AFFO Content] Found WOFF2 URL ${index + 1}: ${woff2Url}`);
              
              return browser.runtime.sendMessage({
                type: 'affoFetch',
                url: woff2Url,
                binary: true
              }).then(function(woff2Response) {
                if (woff2Response && woff2Response.ok && woff2Response.binary && woff2Response.data) {
                  console.log(`[AFFO Content] WOFF2 download ${index + 1} successful for ${fontName}`);
                  
                  // Convert binary data to ArrayBuffer
                  var uint8Array = new Uint8Array(woff2Response.data);
                  var arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
                  
                  console.log(`[AFFO Content] Created ArrayBuffer ${index + 1} for ${fontName} (${arrayBuffer.byteLength} bytes)`);
                  
                  // Create FontFace with ArrayBuffer - load each subset
                  var fontFace = new FontFace(fontName, arrayBuffer);
                  document.fonts.add(fontFace);
                  
                  return fontFace.load().then(function() {
                    console.log(`[AFFO Content] FontFace API successful for ${fontName} subset ${index + 1}`);
                    return true;
                  }).catch(function(e) {
                    console.log(`[AFFO Content] FontFace API failed for ${fontName} subset ${index + 1}:`, e);
                    return false;
                  });
                  
                } else {
                  console.log(`[AFFO Content] WOFF2 download ${index + 1} failed for ${woff2Url}`);
                  return false;
                }
              }).catch(function(e) {
                console.log(`[AFFO Content] WOFF2 download ${index + 1} exception:`, e);
                return false;
              });
            });
            
            // Wait for all subsets to load
            return Promise.all(loadPromises).then(function(results) {
              var successCount = results.filter(Boolean).length;
              console.log(`[AFFO Content] Loaded ${successCount}/${results.length} font subsets for ${fontName}`);
              return results;
            });
            
          } else {
            console.log(`[AFFO Content] No WOFF2 URLs found in Google Fonts CSS for ${fontName}`);
            return Promise.resolve();
          }
        } else {
          console.log(`[AFFO Content] Failed to get Google Fonts CSS for ${fontName}:`, response ? response.error : 'No response');
          return Promise.resolve();
        }
      }).catch(function(e) {
        console.log(`[AFFO Content] Google Fonts CSS fetch exception for ${fontName}:`, e);
        return Promise.resolve();
      });
      
    } catch (e) {
      console.log(`[AFFO Content] FontFace API data URL exception for ${fontName}:`, e);
      return Promise.resolve();
    }
  }

  // Element walker function for Third Man In mode
  function runElementWalker(fontType) {
    try {
      console.log(`[AFFO Content] Running element walker for ${fontType}`);
      
      // Clear only existing markers for this specific font type
      var existingMarked = document.querySelectorAll(`[data-affo-font-type="${fontType}"]`);
      console.log(`[AFFO Content] Clearing ${existingMarked.length} existing ${fontType} markers`);
      existingMarked.forEach(function(el) {
        el.removeAttribute('data-affo-font-type');
      });

      // Element type detection logic  
      function getElementFontType(element) {
        var tagName = element.tagName.toLowerCase();
        var className = element.className || '';
        var style = element.style.fontFamily || '';

        // Explicit class/style overrides - use word boundaries and exact matches
        var classWords = className.toLowerCase().split(/[\s\-_]+/);
        var styleWords = style.toLowerCase().split(/[\s\-_,'"]+/);
        
        // Check for monospace keywords
        if (classWords.some(function(word) { return ['monospace', 'mono', 'code'].indexOf(word) !== -1; }) ||
            styleWords.some(function(word) { return ['monospace', 'mono'].indexOf(word) !== -1; })) return 'mono';
        
        // Check for serif keywords (but not sans-serif)
        if (classWords.some(function(word) { return word === 'serif'; }) ||
            styleWords.some(function(word) { return word === 'serif' && styleWords.indexOf('sans') === -1; })) return 'serif';
        
        // Check for sans keywords
        if (classWords.some(function(word) { return ['sans', 'sansserif'].indexOf(word) !== -1; }) ||
            styleWords.some(function(word) { return ['sans', 'sans-serif'].indexOf(word) !== -1; })) return 'sans';

        // Tag-based detection
        if (['code', 'pre', 'kbd', 'samp', 'tt'].indexOf(tagName) !== -1) return 'mono';

        // For generic containers like div, only rely on explicit class/style indicators
        // Don't use computed styles for generic containers to avoid marking wrapper elements
        if (['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav'].indexOf(tagName) !== -1) {
            return null; // Generic containers should only be marked if they have explicit indicators
        }
        
        // Check computed styles as fallback (only for specific elements like p, h1, etc.)
        var computed = window.getComputedStyle(element);
        var computedFamily = computed.fontFamily.toLowerCase();
        if (computedFamily.indexOf('serif') !== -1 && computedFamily.indexOf('sans') === -1) return 'serif';
        if (computedFamily.indexOf('mono') !== -1) return 'mono';
        if (computedFamily.indexOf('sans-serif') !== -1) return 'sans';

        return null; // No clear match - don't mark this element
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
      
      while (element = walker.nextNode()) {
        totalElements++;
        var detectedType = getElementFontType(element);
        if (detectedType === fontType) {
          element.setAttribute('data-affo-font-type', fontType);
          markedElements++;
        }
      }

      console.log(`[AFFO Content] Element walker completed: processed ${totalElements} elements, marked ${markedElements} as ${fontType}`);
    } catch (e) {
      console.error(`[AFFO Content] Element walker failed for ${fontType}:`, e);
    }
  }

  // Helper function to reapply fonts from a given entry (used by storage listener and page load)
  function reapplyStoredFontsFromEntry(entry) {
    try {
      ['body', 'serif', 'sans', 'mono'].forEach(function(fontType) {
        var fontConfig = entry[fontType];
        if (fontConfig && fontConfig.fontName) {
          console.log(`[AFFO Content] Reapplying ${fontType} font from storage change:`, fontConfig.fontName);
          
          // Load font (handles Google Fonts, custom fonts, and FontFace-only domains)
          loadFont(fontConfig, fontType).then(function() {
            console.log(`[AFFO Content] Font ${fontConfig.fontName} loaded successfully, applying styles`);
            
            // Generate CSS for this font type after font loads
          var css = '';
          var lines = [];
          
          // Add custom @font-face rule if present
          if (fontConfig.fontFaceRule) {
            lines.push(fontConfig.fontFaceRule);
          }
          
          if (fontType === 'body') {
            // Use the same CSS selector as popup.js for consistency
            var cssProps = [`font-family: "${fontConfig.fontName}", serif !important`];
            
            // Include fontSize if present
            if (fontConfig.fontSize) {
              cssProps.push(`font-size: ${fontConfig.fontSize}px !important`);
            }
            
            // Include other font properties if present
            if (fontConfig.fontWeight) {
              cssProps.push(`font-weight: ${fontConfig.fontWeight} !important`);
            }
            if (fontConfig.lineHeight) {
              cssProps.push(`line-height: ${fontConfig.lineHeight} !important`);
            }
            if (fontConfig.fontColor) {
              cssProps.push(`color: ${fontConfig.fontColor} !important`);
            }
            
            // Handle font axes (slant, italic, width)
            if (fontConfig.slntVal && fontConfig.slntVal !== 0) {
              cssProps.push(`font-style: oblique ${fontConfig.slntVal}deg !important`);
            }
            if (fontConfig.italVal && fontConfig.italVal >= 1) {
              cssProps.push(`font-style: italic !important`);
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
              cssProps.push(`font-variation-settings: ${variationSettings.join(', ')} !important`);
            }
            
            lines.push(`body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo) { ${cssProps.join('; ')}; }`);
          } else {
            // Third Man In mode - need to run element walker and apply CSS
            if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
              // Run element walker for this font type
              runElementWalker(fontType);
              
              // Generate CSS targeting marked elements with full property support
              var generic = fontType === 'serif' ? 'serif' : fontType === 'mono' ? 'monospace' : 'sans-serif';
              var cssProps = [`font-family: "${fontConfig.fontName}", ${generic} !important`];
              
              // Include fontSize if present
              if (fontConfig.fontSize) {
                cssProps.push(`font-size: ${fontConfig.fontSize}px !important`);
              }
              
              // Include other font properties if present
              if (fontConfig.fontWeight) {
                cssProps.push(`font-weight: ${fontConfig.fontWeight} !important`);
              }
              if (fontConfig.lineHeight) {
                cssProps.push(`line-height: ${fontConfig.lineHeight} !important`);
              }
              if (fontConfig.fontColor) {
                cssProps.push(`color: ${fontConfig.fontColor} !important`);
              }
              
              // Handle font axes (slant, italic, width)
              if (fontConfig.slntVal && fontConfig.slntVal !== 0) {
                cssProps.push(`font-style: oblique ${fontConfig.slntVal}deg !important`);
              }
              if (fontConfig.italVal && fontConfig.italVal >= 1) {
                cssProps.push(`font-style: italic !important`);
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
                cssProps.push(`font-variation-settings: ${variationSettings.join(', ')} !important`);
              }
              
              lines.push(`[data-affo-font-type="${fontType}"] { ${cssProps.join('; ')}; }`);
            }
          }
          
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
              console.log(`[AFFO Content] Applied CSS for ${fontType} from storage change:`, css);
            }
          }
        }).catch(function(e) {
          console.log(`[AFFO Content] Error applying styles after font load:`, e);
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
      console.log(`[AFFO Content] Custom font loaded event received:`, event.detail.fontName);
      
      // Re-apply styles for all active font types after custom font loads
      browser.storage.local.get('affoApplyMap').then(function(data) {
        var map = data && data.affoApplyMap ? data.affoApplyMap : {};
        var entry = map[currentOrigin];
        if (entry) {
          ['body', 'serif', 'sans', 'mono'].forEach(function(fontType) {
            var fontConfig = entry[fontType];
            if (fontConfig && fontConfig.fontName === event.detail.fontName) {
              console.log(`[AFFO Content] Re-applying ${fontType} styles after custom font ${event.detail.fontName} loaded`);
              
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
        console.log(`[AFFO Content] Error re-applying styles after custom font load:`, e);
      });
    });
  } catch(e) {
    console.log(`[AFFO Content] Error setting up custom font loaded listener:`, e);
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
      console.log(`[AFFO Content] Reapplying stored fonts for origin: ${origin}`, entry);
      
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
            if (fontConfig && fontConfig.fontName) {
              console.log(`[AFFO Content] Reapplying ${fontType} font:`, fontConfig.fontName);
              
              // Load font (handles Google Fonts, custom fonts, and FontFace-only domains)
              loadFont(fontConfig, fontType).then(function() {
                console.log(`[AFFO Content] Font ${fontConfig.fontName} loaded successfully on page load, applying styles`);
                
                // Generate CSS for this font type after font loads
              var css = '';
              var lines = [];
              
              // Add custom @font-face rule if present
              if (fontConfig.fontFaceRule) {
                lines.push(fontConfig.fontFaceRule);
              }
              
              if (fontType === 'body') {
                // Use the same CSS selector as popup.js for consistency
                var cssProps = [`font-family: "${fontConfig.fontName}", serif !important`];
                
                // Include fontSize if present
                if (fontConfig.fontSize) {
                  cssProps.push(`font-size: ${fontConfig.fontSize}px !important`);
                }
                
                // Include other font properties if present
                if (fontConfig.fontWeight) {
                  cssProps.push(`font-weight: ${fontConfig.fontWeight} !important`);
                }
                if (fontConfig.lineHeight) {
                  cssProps.push(`line-height: ${fontConfig.lineHeight} !important`);
                }
                if (fontConfig.fontColor) {
                  cssProps.push(`color: ${fontConfig.fontColor} !important`);
                }
                
                // Handle font axes (slant, italic, width)
                if (fontConfig.slntVal && fontConfig.slntVal !== 0) {
                  cssProps.push(`font-style: oblique ${fontConfig.slntVal}deg !important`);
                }
                if (fontConfig.italVal && fontConfig.italVal >= 1) {
                  cssProps.push(`font-style: italic !important`);
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
                  cssProps.push(`font-variation-settings: ${variationSettings.join(', ')} !important`);
                }
                
                lines.push(`body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo) { ${cssProps.join('; ')}; }`);
              } else {
                // Third Man In mode - need to run element walker and apply CSS
                if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
                  // Run element walker for this font type
                  runElementWalker(fontType);
                  
                  // Generate CSS targeting marked elements with full property support
                  var generic = fontType === 'serif' ? 'serif' : fontType === 'mono' ? 'monospace' : 'sans-serif';
                  var cssProps = [`font-family: "${fontConfig.fontName}", ${generic} !important`];
                  
                  // Include fontSize if present
                  if (fontConfig.fontSize) {
                    cssProps.push(`font-size: ${fontConfig.fontSize}px !important`);
                  }
                  
                  // Include other font properties if present
                  if (fontConfig.fontWeight) {
                    cssProps.push(`font-weight: ${fontConfig.fontWeight} !important`);
                  }
                  if (fontConfig.lineHeight) {
                    cssProps.push(`line-height: ${fontConfig.lineHeight} !important`);
                  }
                  if (fontConfig.fontColor) {
                    cssProps.push(`color: ${fontConfig.fontColor} !important`);
                  }
                  
                  // Handle font axes (slant, italic, width)
                  if (fontConfig.slntVal && fontConfig.slntVal !== 0) {
                    cssProps.push(`font-style: oblique ${fontConfig.slntVal}deg !important`);
                  }
                  if (fontConfig.italVal && fontConfig.italVal >= 1) {
                    cssProps.push(`font-style: italic !important`);
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
                    cssProps.push(`font-variation-settings: ${variationSettings.join(', ')} !important`);
                  }
                  
                  lines.push(`[data-affo-font-type="${fontType}"] { ${cssProps.join('; ')}; }`);
                }
              }
              
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
                  console.log(`[AFFO Content] Applied CSS for ${fontType}:`, css);
                }
              }
              }).catch(function(e) {
                console.log(`[AFFO Content] Error applying styles after font load on page init:`, e);
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
        console.log(`[AFFO Content] Storage changed for origin ${origin}:`, changes.affoApplyMap);
        var newMap = changes.affoApplyMap.newValue || {};
        var entry = newMap[origin];
        console.log(`[AFFO Content] New map:`, newMap);
        console.log(`[AFFO Content] New entry for ${origin}:`, entry);
        
        // Remove all existing styles
        ['a-font-face-off-style-body','a-font-face-off-style-serif','a-font-face-off-style-sans','a-font-face-off-style-mono'].forEach(function(id){ 
          try { 
            var n=document.getElementById(id); 
            if(n) {
              console.log(`[AFFO Content] Removing existing style element:`, id);
              n.remove(); 
            }
          } catch(e){} 
        });
        
        // Apply fonts when storage changes (both immediate apply and reload persistence)
        if (entry) {
          console.log(`[AFFO Content] Entry found - reapplying fonts:`, entry);
          reapplyStoredFontsFromEntry(entry);
        } else {
          console.log(`[AFFO Content] No entry found - all fonts should be removed`);
        }
      } catch (e) {
        console.error(`[AFFO Content] Error in storage change handler:`, e);
      }
    });
  } catch (e) {
    console.error(`[AFFO Content] Error setting up storage listener:`, e);
  }

  // Message listener - only handles cleanup, fonts applied by popup insertCSS
  try {
    browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message.type === 'applyFonts') {
        // All font application is now handled by popup insertCSS
        console.log('Content script received applyFonts message - fonts applied by popup insertCSS');
        sendResponse({success: true});
      } else if (message.type === 'resetFonts') {
        try {
          // Remove the font style element for this panel
          const styleId = 'a-font-face-off-style-' + message.panelId;
          const styleElement = document.getElementById(styleId);
          if (styleElement) {
            styleElement.remove();
            console.log('Removed font styling for panel:', message.panelId);
          }
          sendResponse({success: true});
        } catch (error) {
          console.error('Error resetting fonts:', error);
          sendResponse({success: false, error: error.message});
        }
      } else if (message.action === 'restoreOriginal') {
        try {
          // Remove all A Font Face-off styles
          ['a-font-face-off-style-body','a-font-face-off-style-serif','a-font-face-off-style-sans','a-font-face-off-style-mono'].forEach(function(id) {
            try {
              var element = document.getElementById(id);
              if (element) element.remove();
            } catch(e) {}
          });
          
          // Also remove any Third Man In data attributes
          try {
            document.querySelectorAll('[data-affo-font-type]').forEach(function(el) {
              el.removeAttribute('data-affo-font-type');
            });
          } catch(e) {}
          
          console.log('Restored original page fonts');
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