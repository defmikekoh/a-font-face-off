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
  var currentOrigin = location.hostname;
  
  // Load FontFace-only domains from storage
  try {
    browser.storage.local.get('affoFontFaceOnlyDomains').then(function(data) {
      if (Array.isArray(data.affoFontFaceOnlyDomains)) {
        fontFaceOnlyDomains = data.affoFontFaceOnlyDomains;
        console.log(`[AFFO Content] FontFace-only domains:`, fontFaceOnlyDomains);
      }
    }).catch(function() {});
  } catch (e) {}
  
  function shouldUseFontFaceOnly() {
    return fontFaceOnlyDomains.includes(currentOrigin);
  }
  
  function loadFont(fontConfig, fontType) {
    var fontName = fontConfig.fontName;
    if (!fontName) return;
    
    console.log(`[AFFO Content] Loading font ${fontName} for ${fontType}, FontFace-only:`, shouldUseFontFaceOnly());
    
    // If font has custom @font-face rule (non-Google font), inject it
    if (fontConfig.fontFaceRule) {
      console.log(`[AFFO Content] Injecting custom @font-face for ${fontName}`);
      var fontFaceStyleId = 'affo-fontface-' + fontName.replace(/\s+/g, '-').toLowerCase();
      if (!document.getElementById(fontFaceStyleId)) {
        var fontFaceStyle = document.createElement('style');
        fontFaceStyle.id = fontFaceStyleId;
        fontFaceStyle.textContent = fontConfig.fontFaceRule;
        document.head.appendChild(fontFaceStyle);
      }
    }
    // If Google font (no fontFaceRule) and not FontFace-only domain, load Google Fonts CSS link
    else if (!fontConfig.fontFaceRule && !shouldUseFontFaceOnly()) {
      loadGoogleFontCSS(fontName);
    }
    
    // Only use FontFace API for Google Fonts, not custom fonts
    if (window.FontFace && document.fonts && !fontConfig.fontFaceRule) {
      try {
        var fontFace = new FontFace(fontName, `url(https://fonts.gstatic.com/s/${fontName.toLowerCase().replace(/\s+/g, '')}/v1/font.woff2)`);
        document.fonts.add(fontFace);
        fontFace.load().then(function() {
          console.log(`[AFFO Content] FontFace loaded: ${fontName}`);
        }).catch(function(e) {
          console.log(`[AFFO Content] FontFace failed for ${fontName}, falling back to CSS:`, e);
        });
      } catch (e) {
        console.log(`[AFFO Content] FontFace not supported or failed:`, e);
      }
    }
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

        // Explicit class/style overrides - check sans first to avoid serif matching sans-serif
        if (className.includes('sans') || style.includes('sans')) return 'sans';
        if (className.includes('serif') || style.includes('serif')) return 'serif';
        if (className.includes('mono') || className.includes('code') || className.includes('monospace') ||
            style.includes('monospace') || style.includes('mono')) return 'mono';

        // Tag-based detection
        if (['code', 'pre', 'kbd', 'samp', 'tt'].includes(tagName)) return 'mono';

        // Check computed styles as fallback
        var computed = window.getComputedStyle(element);
        var computedFamily = computed.fontFamily.toLowerCase();
        if (computedFamily.includes('serif') && !computedFamily.includes('sans')) return 'serif';
        if (computedFamily.includes('mono')) return 'mono';

        return 'sans'; // Default fallback
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
          loadFont(fontConfig, fontType);
          
          // Generate CSS for this font type
          var css = '';
          var lines = [];
          
          // Add custom @font-face rule if present
          if (fontConfig.fontFaceRule) {
            lines.push(fontConfig.fontFaceRule);
          }
          
          if (fontType === 'body') {
            // Use the same CSS selector as popup.js for consistency
            lines.push(`body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo) { font-family: "${fontConfig.fontName}", serif !important; }`);
          } else {
            // Third Man In mode - need to run element walker and apply CSS
            if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
              // Run element walker for this font type
              runElementWalker(fontType);
              
              // Generate CSS targeting marked elements
              var generic = fontType === 'serif' ? 'serif' : fontType === 'mono' ? 'monospace' : 'sans-serif';
              lines.push(`[data-affo-font-type="${fontType}"] { font-family: "${fontConfig.fontName}", ${generic} !important; }`);
            }
          }
          
          css = lines.join('\n');
          
          if (css) {
            // Apply CSS by creating style element
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
      });
    } catch (e) {
      console.error('[AFFO Content] Error reapplying fonts from storage change:', e);
    }
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
              loadFont(fontConfig, fontType);
              
              // Generate CSS for this font type
              var css = '';
              var lines = [];
              
              // Add custom @font-face rule if present
              if (fontConfig.fontFaceRule) {
                lines.push(fontConfig.fontFaceRule);
              }
              
              if (fontType === 'body') {
                // Use the same CSS selector as popup.js for consistency
                lines.push(`body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo) { font-family: "${fontConfig.fontName}", serif !important; }`);
              } else {
                // Third Man In mode - need to run element walker and apply CSS
                if (fontType === 'serif' || fontType === 'sans' || fontType === 'mono') {
                  // Run element walker for this font type
                  runElementWalker(fontType);
                  
                  // Generate CSS targeting marked elements
                  var generic = fontType === 'serif' ? 'serif' : fontType === 'mono' ? 'monospace' : 'sans-serif';
                  lines.push(`[data-affo-font-type="${fontType}"] { font-family: "${fontConfig.fontName}", ${generic} !important; }`);
                }
              }
              
              css = lines.join('\n');
              
              if (css) {
                // Apply CSS by creating style element
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