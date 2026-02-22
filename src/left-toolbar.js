// Left toolbar content script - based on essential-buttons-toolbar approach
(function() {
    'use strict';

    // Dev-mode logging: build step sets AFFO_DEBUG = false for production
    var AFFO_DEBUG = true;
    if (!AFFO_DEBUG) {
      console.log = function() {};
      console.warn = function() {};
    }

    // Prevent multiple injections
    if (window.affoLeftToolbarInjected) {
        return;
    }
    
    
    window.affoLeftToolbarInjected = true;
    
    let leftToolbarIframe = null;
    let leftToolbarHidden = false;
    let unhideIcon = null;
    let quickPickMenu = null;
    let options = {};

    // --- Early font preloading (runs at document_start for maximum lead time) ---
    // For domains with stored fonts, inject preconnect + <link> tags immediately
    // so browser starts fetching fonts before page is fully loaded.
    (function earlyFontPreload() {
        try {
            const origin = location.hostname;
            browser.storage.local.get(['affoApplyMap', 'affoCss2UrlCache']).then(data => {
                const map = data.affoApplyMap || {};
                const entry = map[origin];
                const css2UrlCache = data.affoCss2UrlCache || {};

                if (!entry) return;

                // Wait for document.head to be available
                function injectWhenReady() {
                    if (document.head) {
                        injectPreloads();
                    } else {
                        setTimeout(injectWhenReady, 10);
                    }
                }

                function injectPreloads() {
                    // Inject preconnect hints first
                    if (!document.querySelector('link[rel="preconnect"][href="https://fonts.googleapis.com"]')) {
                        const pc1 = document.createElement('link');
                        pc1.rel = 'preconnect';
                        pc1.href = 'https://fonts.googleapis.com';
                        document.head.appendChild(pc1);
                    }
                    if (!document.querySelector('link[rel="preconnect"][href="https://fonts.gstatic.com"]')) {
                        const pc2 = document.createElement('link');
                        pc2.rel = 'preconnect';
                        pc2.href = 'https://fonts.gstatic.com';
                        pc2.crossOrigin = '';
                        document.head.appendChild(pc2);
                    }

                    // Inject <link> tags for any Google fonts in stored config
                    ['body', 'serif', 'sans', 'mono'].forEach(fontType => {
                        const fontConfig = entry[fontType];
                        if (!fontConfig || !fontConfig.fontName) return;

                        // Skip custom fonts (they have special handling in content.js)
                        // Only preload fonts that have a cached Google Fonts URL
                        const fontName = fontConfig.fontName;
                        const cachedUrl = css2UrlCache[fontName];
                        if (!cachedUrl) return;

                        const linkId = 'a-font-face-off-style-' + fontName.replace(/\s+/g, '-').toLowerCase() + '-link';

                        if (!document.getElementById(linkId)) {
                            const link = document.createElement('link');
                            link.id = linkId;
                            link.rel = 'stylesheet';
                            link.href = cachedUrl;
                            document.head.appendChild(link);
                            if (AFFO_DEBUG) console.log(`[AFFO Toolbar] Early preload for ${fontName}: ${cachedUrl}`);
                        }
                    });
                }

                injectWhenReady();
            }).catch(e => {
                console.warn('[AFFO Toolbar] Early font preload failed:', e);
            });
        } catch (e) {}
    })();


    // Create the left toolbar iframe with robust DOM body checking (like Essential)
    function createLeftToolbar() {
        return new Promise((resolve) => {
            if (document.body) {
                createToolbarAndResolve(resolve);
                return;
            }
            const observer = new MutationObserver(() => {
                if (document.body) {
                    observer.disconnect();
                    createToolbarAndResolve(resolve);
                }
            });
            observer.observe(document.documentElement, {
                childList: true,
                subtree: false
            });
        });
    }
    
    function createToolbarAndResolve(resolve) {
        leftToolbarIframe = document.createElement('iframe');
        leftToolbarIframe.id = 'affo-left-toolbar-iframe';
        
        // Use essential-buttons-toolbar's exact approach: vh units and CSS positioning
        const _containerHeight = `${options.height}vh`; // Use vh units directly like essential
        const useTransformCentering = options.height < 100; // Center if not full height
        const _topPosition = useTransformCentering ? `${options.position}%` : '0';
        
        // Initial iframe styling — include width upfront so the iframe is never
        // unconstrained.  min-width/max-width need !important because sites
        // like today.com set `iframe { min-width: 100% !important }` in their
        // stylesheets, which overrides non-important inline min-width.
        const initialWidth = Math.floor(options.width / (window.visualViewport ? window.visualViewport.scale : 1));
        leftToolbarIframe.style =
            `display: block !important; height: 0; position: fixed; z-index: 2147483647; margin: 0; padding: 0; min-height: unset !important; max-height: unset !important; min-width: unset !important; max-width: unset !important; border: 0; background: transparent; color-scheme: light; border-radius: 0; width: ${initialWidth}px !important; left: 0px`;
        leftToolbarIframe.src = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('left-toolbar-iframe.html');
        
        
        // Add iframe event listeners - WAIT for load before sizing like Essential
        leftToolbarIframe.addEventListener('load', function() {
            // Apply initial sizing with width after iframe is fully loaded (like Essential does)
            applyInitialSizing();
            
            // Send initial styles to iframe with saved transparency setting
            leftToolbarIframe.contentWindow.postMessage({
                type: 'updateStyles',
                styles: {
                    transparency: options.transparency
                }
            }, '*');
        });
        
        // Hide during printing
        const mediaQuery = window.matchMedia('print');
        function handlePrint() {
            leftToolbarIframe.style.display = mediaQuery.matches ? 'none' : 'block';
        }
        mediaQuery.addListener(handlePrint);
        handlePrint();
        
        // Use Essential's exact DOM insertion method
        document.body.insertAdjacentElement('afterend', leftToolbarIframe);
        
        // Add viewport resize listener like essential-buttons-toolbar
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', updateToolbarHeight);
        }
        
        // Add load event listener to check and fix sizing issues like Essential does
        window.addEventListener('load', checkToolbarHeight);
        
        // DON'T call updateToolbarHeight immediately - wait for iframe load event like Essential
        
        if (resolve) resolve();
    }
    
    // Apply initial sizing with width after iframe loads (like Essential does)
    function applyInitialSizing() {
        if (!leftToolbarIframe) return;
        
        // Use Essential's EXACT calculation method
        const scale = window.visualViewport.scale;
        const calculatedWidth = Math.floor(options.width / scale);
        
        // Apply sizing like Essential: height first, then width 
        leftToolbarIframe.style.cssText += `height: ${options.height}vh !important;`;
        leftToolbarIframe.style.cssText += `width: ${calculatedWidth}px !important;`;
        
        // Apply positioning based on user's position setting
        if (Number(options.height) !== 100) {
            leftToolbarIframe.style.top = `${options.position}%`;
            leftToolbarIframe.style.transform = 'translateY(-50%)';
        } else {
            leftToolbarIframe.style.top = '0';
        }
        
        // Apply positioning exactly like Essential - left is always 0px, use margin for gap
        leftToolbarIframe.style.left = '0px';
        if (Number(options.gap) !== 0) {
            const margin = Math.floor(options.gap / window.visualViewport.scale);
            leftToolbarIframe.style.margin = `0 ${margin}px`;
        }
    }
    
    // Update toolbar height and positioning EXACTLY like Essential does (no width changes)
    function updateToolbarHeight() {
        if (!leftToolbarIframe) return;
        
        // Only update height and positioning on viewport changes, not width
        leftToolbarIframe.style.cssText += `height: ${options.height}vh !important;`;
        
        // Apply positioning based on user's position setting
        if (Number(options.height) !== 100) {
            leftToolbarIframe.style.top = `${options.position}%`;
            leftToolbarIframe.style.transform = 'translateY(-50%)';
        } else {
            leftToolbarIframe.style.top = '0';
        }
        
        // Update positioning and margin for viewport scale changes
        leftToolbarIframe.style.left = '0px';
        if (Number(options.gap) !== 0) {
            const margin = Math.floor(options.gap / window.visualViewport.scale);
            leftToolbarIframe.style.margin = `0 ${margin}px`;
        }
    }
    
    // Check and fix toolbar height after page load like Essential does
    function checkToolbarHeight() {
        setTimeout(function() {
            const targetElement = document.getElementById('affo-left-toolbar-iframe');
            if (!targetElement || targetElement.parentElement.tagName.toLowerCase() !== 'html') {
                // Toolbar missing or misplaced, reinitialize
                createLeftToolbar();
                return;
            }
            
            // Force a height/width recalculation to fix any sizing issues
            updateToolbarHeight();
            
            // Remove the event listener after checking
            window.removeEventListener('load', checkToolbarHeight);
        }, 100); // Small delay to ensure everything is loaded
    }
    
    // Handle messages from iframe and toolbar option changes
    window.addEventListener('message', function(event) {
        if (!event.data || !event.data.type) return;


        switch (event.data.type) {
            case 'initWhatFont':
                handleInitWhatFont();
                break;
            case 'openPopup':
                handleOpenPopup();
                break;
            case 'showQuickPickMenu':
                showQuickPickMenu();
                break;
            case 'hideToolbar':
                handleHideToolbar();
                break;
            case 'closeTab':
                handleCloseTab();
                break;
            case 'pageUp':
                handlePageUp();
                break;
            case 'pageUpLongpress':
                handlePageUpLongpress();
                break;
            case 'pageDown':
                handlePageDown();
                break;
            case 'pageDownLongpress':
                handlePageDownLongpress();
                break;
            case 'toolbarOptionsChanged':
                handleToolbarOptionsChanged(event.data.options);
                break;
            case 'applyQuickPickFont':
                handleApplyQuickPickFont(event.data);
                break;
        }
    });
    
    // Handle WhatFont initialization - using original working architecture
    function handleInitWhatFont() {
        
        // Check if WhatFont is already loaded (from content script)
        if (typeof window.WhatFont !== 'undefined') {
            try {
                // Set the CSS URL to use local file before initializing
                const localCSSUrl = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('wf.css');
                window.WhatFont.setCSSURL(localCSSUrl);
                
                window.WhatFont.init();
            } catch (e) {
                console.error('[Left Toolbar] Error initializing WhatFont:', e);
            }
            return;
        }
        
        // Check if jQuery is available first
        if (typeof window.$ === 'undefined') {
            loadJQueryThenWhatFont();
            return;
        }
        
        // Load WhatFont script
        const script = document.createElement('script');
        script.src = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('whatfont_core.js');
        script.onload = function() {
            
            // Create WhatFont object from _whatFont function
            if (typeof window._whatFont === 'function') {
                try {
                    window.WhatFont = window._whatFont();
                    
                    // Set the CSS URL to use local file before initializing
                    const localCSSUrl = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('wf.css');
                    window.WhatFont.setCSSURL(localCSSUrl);
                    
                    window.WhatFont.init();
                } catch (e) {
                    console.error('[Left Toolbar] Error creating/initializing WhatFont:', e);
                }
            }
        };
        script.onerror = function() {
            console.error('[Left Toolbar] Error loading WhatFont script');
        };
        document.head.appendChild(script);
    }
    
    
    // Load jQuery first, then WhatFont - using original working architecture
    function loadJQueryThenWhatFont() {
        const jqueryScript = document.createElement('script');
        jqueryScript.src = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('jquery.js');
        jqueryScript.onload = function() {
            const whatfontScript = document.createElement('script');
            whatfontScript.src = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('whatfont_core.js');
            whatfontScript.onload = function() {
                
                // Create WhatFont object from _whatFont function
                if (typeof window._whatFont === 'function') {
                    try {
                        window.WhatFont = window._whatFont();
                        
                        // Set the CSS URL to use local file before initializing
                        const localCSSUrl = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('wf.css');
                        window.WhatFont.setCSSURL(localCSSUrl);
                        
                        window.WhatFont.init();
                    } catch (e) {
                        console.error('[Left Toolbar] Error creating/initializing WhatFont:', e);
                    }
                } else {
                    console.warn('[Left Toolbar] _whatFont function not found after loading script');
                }
            };
            whatfontScript.onerror = function(e) {
                console.error('[Left Toolbar] Error loading WhatFont script:', e);
            };
            document.head.appendChild(whatfontScript);
        };
        jqueryScript.onerror = function(e) {
            console.error('[Left Toolbar] Error loading jQuery:', e);
        };
        document.head.appendChild(jqueryScript);
    }
    
    // Handle opening popup with current domain and tab context
    function handleOpenPopup() {
        try {
            const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
            const currentDomain = window.location.hostname;
            
            
            // Get current tab info to pass to popup
            browserAPI.runtime.sendMessage({ 
                type: 'getCurrentTab' 
            }).then(function(tabResponse) {
                
                const currentTabId = tabResponse.tabId;
                
                // Check if we're on mobile Firefox (no real popups)
                const isMobileFirefox = navigator.userAgent.includes('Mobile') && navigator.userAgent.includes('Firefox');
                
                if (isMobileFirefox) {
                    browserAPI.runtime.sendMessage({ 
                        type: 'openPopupFallback', 
                        domain: currentDomain,
                        sourceTabId: currentTabId
                    }).then(function(_response) {
                    }).catch(function(e) {
                        console.error('[Left Toolbar] Error opening fallback popup:', e);
                    });
                } else {
                    browserAPI.runtime.sendMessage({ 
                        type: 'openPopup', 
                        domain: currentDomain,
                        sourceTabId: currentTabId
                    }).then(function(response) {
                        if (!response || !response.success) {
                            return browserAPI.runtime.sendMessage({ 
                                type: 'openPopupFallback', 
                                domain: currentDomain,
                                sourceTabId: currentTabId
                            });
                        }
                        return response;
                    }).catch(function(e) {
                        console.error('[Left Toolbar] Error opening popup:', e);
                    });
                }
            }).catch(function(e) {
                console.error('[Left Toolbar] Error getting current tab:', e);
            });
        } catch (e) {
            console.error('[Left Toolbar] Error opening popup:', e);
        }
    }

    // Handle toolbar option changes
    function handleToolbarOptionsChanged(newOptions) {
        
        // Update options with new values
        Object.assign(options, newOptions);
        
        // Recreate toolbar with new settings
        if (leftToolbarIframe) {
            leftToolbarIframe.remove();
            leftToolbarIframe = null;
        }
        
        createLeftToolbar();
    }

    // Create quick-pick menu in page context (not iframe)
    function createQuickPickMenuIfNeeded() {
        if (quickPickMenu) return quickPickMenu;

        const overlay = document.createElement('div');
        overlay.id = 'affo-quick-pick-overlay';
        overlay.setAttribute('data-affo-guard', '');
        overlay.style.cssText = `
            position: fixed !important;
            inset: 0 !important;
            background: rgba(0, 0, 0, 0.6) !important;
            display: none;
            align-items: center !important;
            justify-content: center !important;
            z-index: 2147483647 !important;
            font-family: system-ui, sans-serif !important;
            font-size: 14px !important;
        `;

        const content = document.createElement('div');
        content.id = 'affo-quick-pick-content';
        content.style.cssText = `
            background: #ffffff !important;
            border-radius: 8px !important;
            max-width: 320px !important;
            display: flex !important;
            flex-direction: column !important;
            color: #495057 !important;
            font-family: system-ui, sans-serif !important;
            font-size: 14px !important;
            line-height: 1.4 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
            word-spacing: normal !important;
            font-style: normal !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            overflow: hidden;
            max-height: 90vh;
        `;

        // Add header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 12px 16px !important;
            border-bottom: 1px solid #dee2e6 !important;
        `;

        const headerTitle = document.createElement('h3');
        headerTitle.textContent = 'Quick Pick';
        headerTitle.style.cssText = `
            margin: 0 !important;
            font-size: 14px !important;
            font-family: inherit !important;
            color: #495057 !important;
            font-weight: 600 !important;
            line-height: 1.4 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
        `;
        header.appendChild(headerTitle);

        // Header close button (visual, not functional - body has the functional one)
        const headerCloseBtn = document.createElement('button');
        headerCloseBtn.textContent = '✕';
        headerCloseBtn.style.cssText = `
            background: none !important;
            border: none !important;
            color: #6c757d !important;
            font-size: 16px !important;
            font-family: inherit !important;
            cursor: pointer;
            padding: 0 !important;
            width: 20px !important;
            height: 20px !important;
            min-width: 20px !important;
            min-height: 20px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            border-radius: 50% !important;
            transition: all 0.2s ease;
            line-height: 1 !important;
        `;
        headerCloseBtn.onmouseover = function() { this.style.setProperty('background', '#dc3545', 'important'); this.style.setProperty('color', 'white', 'important'); };
        headerCloseBtn.onmouseout = function() { this.style.setProperty('background', 'none', 'important'); this.style.setProperty('color', '#6c757d', 'important'); };
        headerCloseBtn.onclick = hideQuickPickMenu;
        header.appendChild(headerCloseBtn);

        content.appendChild(header);

        // Add body container
        const body = document.createElement('div');
        body.style.cssText = `
            padding: 16px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
            overflow-y: auto;
        `;

        // Add message element
        const message = document.createElement('div');
        message.id = 'affo-quick-pick-message';
        message.style.cssText = `
            padding: 8px;
            text-align: center;
            color: #6c757d !important;
            font-size: 13px !important;
            font-family: inherit !important;
            line-height: 1.5 !important;
            display: none;
            font-weight: 500 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
        `;
        body.appendChild(message);

        // Aggressive Override checkbox (above favorites for visibility)
        const aggressiveLbl = document.createElement('label');
        aggressiveLbl.style.cssText = 'display: flex !important; align-items: center !important; gap: 6px !important; cursor: pointer; font-size: 12px !important; font-family: inherit !important; color: #495057 !important; margin: 0 !important; line-height: 1.4 !important; letter-spacing: normal !important; text-transform: none !important;';
        const aggressiveCb = document.createElement('input');
        aggressiveCb.type = 'checkbox';
        aggressiveCb.id = 'affo-quick-pick-aggressive';
        aggressiveCb.style.cssText = 'cursor: pointer; margin: 0;';
        aggressiveLbl.appendChild(aggressiveCb);
        aggressiveLbl.appendChild(document.createTextNode('Aggressive Override Domain'));
        body.appendChild(aggressiveLbl);

        const aggressiveHr = document.createElement('hr');
        aggressiveHr.style.cssText = 'border: none; border-top: 1px solid #dee2e6; margin: 2px 0;';
        body.appendChild(aggressiveHr);

        // Create 5 favorite buttons (matching Load Favorites modal button styling)
        const buttonStyleFn = function(btn) {
            btn.style.cssText = `
                padding: 0 !important;
                font-size: inherit !important;
                font-family: inherit !important;
                background: #f8f9fa !important;
                border: 1px solid #dee2e6 !important;
                border-radius: 4px !important;
                color: #495057 !important;
                cursor: pointer;
                display: none;
                font-weight: 500 !important;
                transition: all 150ms ease;
                text-align: left !important;
                line-height: 1.4 !important;
                letter-spacing: normal !important;
                text-transform: none !important;
                min-height: 40px !important;
                box-sizing: border-box !important;
            `;
            btn.onmouseover = function() { if (!this.disabled) { this.style.setProperty('background', '#e9ecef', 'important'); this.style.setProperty('border-color', '#495057', 'important'); } };
            btn.onmouseout = function() { if (!this.disabled) { this.style.setProperty('background', '#f8f9fa', 'important'); this.style.setProperty('border-color', '#dee2e6', 'important'); } };
            btn.onmousedown = function() { if (!this.disabled) this.style.setProperty('background', '#dee2e6', 'important'); };
            btn.onmouseup = function() { if (!this.disabled) this.style.setProperty('background', '#e9ecef', 'important'); };
        };

        for (let i = 1; i <= 5; i++) {
            const btn = document.createElement('button');
            btn.id = `affo-quick-pick-font-${i}`;
            buttonStyleFn(btn);
            body.appendChild(btn);
        }

        // Add rewalk button (for TMI mode - re-walks DOM to pick up dynamic content)
        const rewalkBtn = document.createElement('button');
        rewalkBtn.id = 'affo-quick-pick-rewalk';
        rewalkBtn.textContent = 'Rewalk';
        rewalkBtn.style.cssText = `
            padding: 10px 12px !important;
            background: #0d6efd !important;
            border: 1px solid #0b5ed7 !important;
            border-radius: 4px !important;
            color: #ffffff !important;
            cursor: pointer;
            font-size: 13px !important;
            font-family: inherit !important;
            display: none;
            font-weight: 500 !important;
            transition: all 150ms ease;
            text-align: center !important;
            justify-content: center !important;
            align-items: center !important;
            margin-top: 4px;
            line-height: 1.4 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
            min-height: 0 !important;
            box-sizing: border-box !important;
        `;
        rewalkBtn.onmouseover = function() { if (!this.disabled) { this.style.setProperty('background', '#0b5ed7', 'important'); this.style.setProperty('border-color', '#0a58ca', 'important'); } };
        rewalkBtn.onmouseout = function() { if (!this.disabled) { this.style.setProperty('background', '#0d6efd', 'important'); this.style.setProperty('border-color', '#0b5ed7', 'important'); } };
        rewalkBtn.onmousedown = function() { if (!this.disabled) this.style.setProperty('background', '#0a58ca', 'important'); };
        rewalkBtn.onmouseup = function() { if (!this.disabled) this.style.setProperty('background', '#0b5ed7', 'important'); };
        body.appendChild(rewalkBtn);

        // Add unapply button (red danger button matching popup style)
        const unapplyBtn = document.createElement('button');
        unapplyBtn.id = 'affo-quick-pick-unapply';
        unapplyBtn.textContent = 'Unapply';
        unapplyBtn.style.cssText = `
            padding: 10px 12px !important;
            background: #dc3545 !important;
            border: 1px solid #c82333 !important;
            border-radius: 4px !important;
            color: #ffffff !important;
            cursor: pointer;
            font-size: 13px !important;
            font-family: inherit !important;
            display: none;
            font-weight: 500 !important;
            transition: all 150ms ease;
            text-align: center !important;
            justify-content: center !important;
            align-items: center !important;
            margin-top: 4px;
            line-height: 1.4 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
            min-height: 0 !important;
            box-sizing: border-box !important;
        `;
        unapplyBtn.onmouseover = function() { if (!this.disabled) { this.style.setProperty('background', '#c82333', 'important'); this.style.setProperty('border-color', '#a71d2a', 'important'); } };
        unapplyBtn.onmouseout = function() { if (!this.disabled) { this.style.setProperty('background', '#dc3545', 'important'); this.style.setProperty('border-color', '#c82333', 'important'); } };
        unapplyBtn.onmousedown = function() { if (!this.disabled) this.style.setProperty('background', '#a71d2a', 'important'); };
        unapplyBtn.onmouseup = function() { if (!this.disabled) this.style.setProperty('background', '#c82333', 'important'); };
        body.appendChild(unapplyBtn);

        // Domain setting checkboxes
        const checkboxSection = document.createElement('div');
        checkboxSection.style.cssText = `
            border-top: 1px solid #dee2e6;
            margin-top: 8px;
            padding-top: 8px;
            display: flex !important;
            flex-direction: column !important;
            gap: 6px !important;
        `;

        const checkboxDefs = [
            { id: 'affo-quick-pick-inline', label: 'Inline Apply Domain' },
            { id: 'affo-quick-pick-ffonly', label: 'FontFace-only Domain' },
        ];

        for (const def of checkboxDefs) {
            const lbl = document.createElement('label');
            lbl.style.cssText = 'display: flex !important; align-items: center !important; gap: 6px !important; cursor: pointer; font-size: 12px !important; font-family: inherit !important; color: #495057 !important; margin: 0 !important; line-height: 1.4 !important; letter-spacing: normal !important; text-transform: none !important;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = def.id;
            cb.style.cssText = 'cursor: pointer; margin: 0;';
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(def.label));
            checkboxSection.appendChild(lbl);
        }

        body.appendChild(checkboxSection);

        content.appendChild(body);
        overlay.appendChild(content);
        document.body.appendChild(overlay);

        quickPickMenu = overlay;
        return overlay;
    }

    // Show quick-pick menu
    async function showQuickPickMenu() {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

        try {
            // Fetch favorites and domain lists
            const origin = location.hostname;
            const data = await browserAPI.storage.local.get([
                'affoFavorites', 'affoFavoritesOrder', 'affoApplyMap',
                'affoFontFaceOnlyDomains', 'affoInlineApplyDomains', 'affoAggressiveDomains'
            ]);
            const favorites = data.affoFavorites || {};
            const order = data.affoFavoritesOrder || [];
            const applyMap = data.affoApplyMap || {};
            const domainData = applyMap[origin] || {};

            const domainLists = {
                ffonly: data.affoFontFaceOnlyDomains || [],
                inline: data.affoInlineApplyDomains || [],
                aggressive: data.affoAggressiveDomains || [],
            };

            // Get top 5 favorites (preserve both name and config like Load Favorites modal)
            const top5 = order.slice(0, 5)
                .filter(id => favorites[id])
                .map(id => ({
                    name: id,  // Favorite name/ID (like "Atiza Text")
                    ...favorites[id]  // Spread config (fontName, fontSize, etc.)
                }));

            const hasBodyOnly = domainData && domainData.body && !domainData.serif && !domainData.sans && !domainData.mono;

            populateQuickPickMenuInPage({
                favorites: top5,
                noFavorites: top5.length === 0,
                showBodyModeMessage: hasBodyOnly,
                domainData,
                origin,
                domainLists,
            });

            // Show menu
            createQuickPickMenuIfNeeded().style.display = 'flex';
        } catch (e) {
            console.error('[Left Toolbar] Error showing quick-pick menu:', e);
        }
    }

    // Hide quick-pick menu
    function hideQuickPickMenu() {
        if (quickPickMenu) {
            quickPickMenu.style.display = 'none';
        }
    }

    // Set disabled/loading state on all quick-pick buttons
    function setQuickPickButtonsDisabled(disabled) {
        const allBtns = Array.from({length: 5}, (_, i) => document.getElementById(`affo-quick-pick-font-${i + 1}`));
        const unapplyBtn = document.getElementById('affo-quick-pick-unapply');
        allBtns.forEach(b => {
            if (b && b.style.display !== 'none') {
                b.disabled = disabled;
                b.style.opacity = disabled ? '0.5' : '1';
            }
        });
        if (unapplyBtn) {
            unapplyBtn.disabled = disabled;
            unapplyBtn.style.opacity = disabled ? '0.5' : '1';
        }
        const rewalkBtn = document.getElementById('affo-quick-pick-rewalk');
        if (rewalkBtn) {
            rewalkBtn.disabled = disabled;
            rewalkBtn.style.opacity = disabled ? '0.5' : '1';
        }
    }

    // Populate menu with favorites (in page context)
    function populateQuickPickMenuInPage({ favorites, noFavorites, showBodyModeMessage, domainData, origin, domainLists }) {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        createQuickPickMenuIfNeeded();

        const message = document.getElementById('affo-quick-pick-message');
        const unapplyBtn = document.getElementById('affo-quick-pick-unapply');
        const currentOrigin = origin || location.hostname;

        // Domain setting checkboxes (always wired, independent of favorites/mode state)
        const checkboxConfig = [
            { id: 'affo-quick-pick-ffonly', key: 'affoFontFaceOnlyDomains', listKey: 'ffonly' },
            { id: 'affo-quick-pick-inline', key: 'affoInlineApplyDomains', listKey: 'inline' },
            { id: 'affo-quick-pick-aggressive', key: 'affoAggressiveDomains', listKey: 'aggressive' },
        ];

        for (const cfg of checkboxConfig) {
            const cb = document.getElementById(cfg.id);
            if (!cb) continue;
            const list = (domainLists && domainLists[cfg.listKey]) || [];
            cb.checked = list.includes(currentOrigin);
            cb.onchange = async function() {
                const storageData = await browserAPI.storage.local.get(cfg.key);
                let current = storageData[cfg.key] || [];
                if (cb.checked) {
                    if (!current.includes(currentOrigin)) {
                        current.push(currentOrigin);
                    }
                } else {
                    current = current.filter(d => d !== currentOrigin);
                }
                await browserAPI.storage.local.set({ [cfg.key]: current });
            };
        }

        // Hide all favorite buttons first
        for (let i = 1; i <= 5; i++) {
            const btn = document.getElementById(`affo-quick-pick-font-${i}`);
            if (btn) btn.style.display = 'none';
        }

        if (noFavorites) {
            message.textContent = 'No favorites saved. Add favorites in the popup.';
            message.style.display = 'block';
            unapplyBtn.style.display = 'none';
            return;
        }

        if (showBodyModeMessage) {
            message.textContent = 'Domain has already been set in Body Mode. Use popup.';
            message.style.display = 'block';
            unapplyBtn.style.display = 'none';
            return;
        }

        message.style.display = 'none';

        // Show favorite buttons and set up click handlers
        for (let i = 0; i < Math.min(favorites.length, 5); i++) {
            const fav = favorites[i];
            const btn = document.getElementById(`affo-quick-pick-font-${i + 1}`);
            if (!btn) continue;

            // Reset button state from previous use
            btn.disabled = false;
            btn.style.setProperty('opacity', '1', 'important');

            // Create content with name and preview
            btn.innerHTML = '';
            btn.style.setProperty('display', 'flex', 'important');
            btn.style.setProperty('position', 'relative', 'important');
            btn.style.setProperty('overflow', 'hidden', 'important');

            // Left side indicator (serif)
            const leftHint = document.createElement('div');
            leftHint.style.cssText = 'position: absolute; left: 0; top: 0; bottom: 0; width: 50%; pointer-events: none; border-right: 1px dashed #dee2e6;';
            btn.appendChild(leftHint);

            // Content wrapper (centered text)
            const contentWrapper = document.createElement('div');
            contentWrapper.style.cssText = 'flex: 1; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; padding: 4px 16px !important; pointer-events: none; gap: 2px !important;';

            const nameEl = document.createElement('div');
            nameEl.style.cssText = 'font-weight: 500 !important; font-family: inherit !important; color: #495057 !important; font-size: inherit !important; line-height: 1.4 !important; letter-spacing: normal !important; text-transform: none !important;';
            nameEl.textContent = fav.name || fav.fontName || `Font ${i + 1}`;

            const previewEl = document.createElement('div');
            previewEl.style.cssText = 'font-size: 11px !important; font-family: inherit !important; color: #6c757d !important; line-height: 1.2 !important; letter-spacing: normal !important; text-transform: none !important;';

            const previewParts = [];
            if (fav.fontSize) previewParts.push(`${fav.fontSize}px`);
            if (fav.fontWeight) previewParts.push(`wt${fav.fontWeight}`);
            if (fav.lineHeight) previewParts.push(`${fav.lineHeight}lh`);
            if (fav.letterSpacing != null) previewParts.push(`${fav.letterSpacing}ls`);
            previewEl.textContent = previewParts.length === 0 ? 'Default styles' : `(${previewParts.join(', ')})`;

            contentWrapper.appendChild(nameEl);
            contentWrapper.appendChild(previewEl);
            btn.appendChild(contentWrapper);

            // Click handler — left half = serif, right half = sans
            btn.onclick = (event) => {
                const buttonRect = btn.getBoundingClientRect();
                const clickX = event.clientX - buttonRect.left;
                const position = clickX < buttonRect.width / 2 ? 'serif' : 'sans';

                setQuickPickButtonsDisabled(true);
                message.textContent = `Applying ${fav.fontName || `Font ${i + 1}`} to ${position}...`;
                message.style.display = 'block';

                browserAPI.runtime.sendMessage({
                    type: 'quickApplyFavorite',
                    origin: currentOrigin,
                    fontConfig: fav,
                    position: position
                }).then(response => {
                    if (response && response.success) {
                        setQuickPickButtonsDisabled(false);
                        hideQuickPickMenu();
                    } else {
                        console.error('[Left Toolbar] Font application failed:', response?.error);
                        message.textContent = 'Failed to apply font. Try again.';
                        setQuickPickButtonsDisabled(false);
                    }
                }).catch(err => {
                    console.error('[Left Toolbar] Error applying font:', err);
                    message.textContent = 'Error applying font.';
                    setQuickPickButtonsDisabled(false);
                });
            };

            btn.title = '\u2190 Click left for serif | Click right for sans-serif \u2192';
            btn.style.cursor = 'pointer';
        }

        // Show unapply button if fonts are applied
        const hasFontsApplied = domainData && (domainData.serif || domainData.sans || domainData.mono || domainData.body);
        if (hasFontsApplied) {
            unapplyBtn.disabled = false;
            unapplyBtn.style.opacity = '1';
            unapplyBtn.style.setProperty('display', 'flex', 'important');
            unapplyBtn.onclick = () => {
                setQuickPickButtonsDisabled(true);
                message.textContent = 'Removing fonts...';
                message.style.display = 'block';

                browserAPI.runtime.sendMessage({
                    type: 'quickUnapplyFonts',
                    origin: currentOrigin
                }).then(response => {
                    if (response && response.success) {
                        setQuickPickButtonsDisabled(false);
                        hideQuickPickMenu();
                    } else {
                        console.error('[Left Toolbar] Unapply failed:', response?.error);
                        message.textContent = 'Failed to remove fonts. Try popup.';
                        setQuickPickButtonsDisabled(false);
                    }
                }).catch(err => {
                    console.error('[Left Toolbar] Error removing fonts:', err);
                    message.textContent = 'Error removing fonts.';
                    setQuickPickButtonsDisabled(false);
                });
            };
        } else {
            unapplyBtn.style.display = 'none';
        }

        // Show rewalk button if TMI fonts are applied
        const rewalkBtn = document.getElementById('affo-quick-pick-rewalk');
        const hasTmiFonts = domainData && (domainData.serif || domainData.sans || domainData.mono);
        if (rewalkBtn && hasTmiFonts) {
            rewalkBtn.disabled = false;
            rewalkBtn.style.opacity = '1';
            rewalkBtn.style.setProperty('display', 'flex', 'important');
            rewalkBtn.onclick = () => {
                setQuickPickButtonsDisabled(true);
                message.textContent = 'Rewalking...';
                message.style.display = 'block';

                browserAPI.runtime.sendMessage({
                    type: 'quickRewalk',
                    origin: currentOrigin
                }).then(response => {
                    if (response && response.success) {
                        setQuickPickButtonsDisabled(false);
                        hideQuickPickMenu();
                    } else {
                        console.error('[Left Toolbar] Rewalk failed:', response?.error);
                        message.textContent = 'Rewalk failed. Try popup.';
                        setQuickPickButtonsDisabled(false);
                    }
                }).catch(err => {
                    console.error('[Left Toolbar] Error rewalking:', err);
                    message.textContent = 'Error rewalking.';
                    setQuickPickButtonsDisabled(false);
                });
            };
        } else if (rewalkBtn) {
            rewalkBtn.style.display = 'none';
        }
    }

    // Apply quick-pick font to detected position
    function handleApplyQuickPickFont(data) {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        const origin = location.hostname;
        const { config, position } = data;

        // Send to background to handle CSS injection
        browserAPI.runtime.sendMessage({
            type: 'quickApplyFavorite',
            origin: origin,
            fontConfig: config,
            position: position  // 'serif' or 'sans'
        }).then(response => {
            if (response && response.success) {
                console.log('[Left Toolbar] Font applied successfully to', position);
            } else {
                console.error('[Left Toolbar] Font application failed:', response?.error);
            }
        }).catch(err => {
            console.error('[Left Toolbar] Error applying font:', err);
        });
    }

    // Close current tab
    function handleCloseTab() {
        try {
            const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
            browserAPI.runtime.sendMessage({ type: 'closeCurrentTab' });
        } catch (e) {
            console.error('[Left Toolbar] Error closing tab:', e);
        }
    }
    
    // Handle hide toolbar (based on essential-buttons-toolbar implementation)
    function handleHideToolbar() {
        leftToolbarHidden = true;
        reinitializeToolbar();
    }
    
    // Handle unhide toolbar (show toolbar again)
    function handleUnhideToolbar() {
        leftToolbarHidden = false;
        reinitializeToolbar();
    }
    
    // Reinitialize toolbar (handle hide/unhide)
    function reinitializeToolbar() {
        
        // Remove existing iframe or unhide icon
        if (leftToolbarIframe) {
            leftToolbarIframe.remove();
            leftToolbarIframe = null;
        }
        if (unhideIcon) {
            unhideIcon.remove();
            unhideIcon = null;
        }
        
        // Create appropriate element based on hidden state
        if (leftToolbarHidden) {
            createUnhideIcon();
        } else {
            createLeftToolbar();
        }
    }
    
    // Create unhide icon (based on essential-buttons-toolbar implementation)
    async function createUnhideIcon() {
        
        unhideIcon = document.createElement('div');
        unhideIcon.setAttribute('id', 'affo-unhide-icon');
        
        // Get icon theme setting
        let iconTheme = 'heroIcons'; // default
        try {
            const data = await browser.storage.local.get(['affoIconTheme']);
            iconTheme = data.affoIconTheme || 'heroIcons';
        } catch (e) {
            console.error('[Left Toolbar] Error getting icon theme, using default:', e);
        }
        
        // Create image element using the themed icon like essential-buttons-toolbar
        const img = document.createElement('img');
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        img.src = browserAPI.runtime.getURL(`icons/${iconTheme}/unhide.svg`);
        img.style.cssText = 'pointer-events: none; height: 50%; width: 50%; margin: auto;';
        
        // Style similar to essential-buttons-toolbar
        const viewportScale = window.visualViewport?.scale || 1;
        const calculatedSize = Math.floor(options.width / viewportScale);
        
        unhideIcon.style.cssText = `
            display: flex !important;
            position: fixed !important;
            z-index: 2147483647 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 2px solid #45444c !important;
            background: rgba(43, 42, 51, 0.8) !important;
            color-scheme: light !important;
            border-radius: 20% !important;
            box-sizing: border-box !important;
            cursor: pointer !important;
            left: ${options.gap}px !important;
            width: ${calculatedSize}px !important;
            height: ${calculatedSize}px !important;
        `;
        
        // Position near bottom of screen like essential-buttons-toolbar
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        unhideIcon.style.top = `${viewportHeight - calculatedSize * 2.5}px`;
        
        unhideIcon.appendChild(img);
        
        // Add click handler to unhide toolbar
        unhideIcon.addEventListener('click', handleUnhideToolbar);
        
        // Add to DOM
        document.body.appendChild(unhideIcon);
        
    }
    
    // Find scrollable element (same logic as essential-buttons-toolbar)
    function findScrollableElement() {
        const candidates = document.querySelectorAll('main, div, section');
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        
        if (document.documentElement.scrollHeight > viewportHeight) {
            return document.documentElement;
        }
        if (document.body.scrollHeight > document.body.clientHeight) {
            return document.body;
        }
        
        for (const el of candidates) {
            if (el.scrollHeight > viewportHeight * 0.95 &&
                el.clientWidth > viewportWidth * 0.8) {
                const style = getComputedStyle(el);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    return el;
                }
            }
        }
        
        return document.documentElement;
    }
    
    // Shared scroll helper — direction determined by sign of overlap parameter
    function scrollByOffset(overlap, scrollType) {
        try {
            const element = findScrollableElement();
            const absOverlap = Math.abs(overlap);
            const offset = Math.max(window.innerHeight - absOverlap, 10);
            const targetTop = overlap < 0
                ? Math.max(0, element.scrollTop - offset)
                : Math.min(element.scrollHeight, element.scrollTop + offset);
            element.scrollTo({ top: targetTop, behavior: scrollType });
        } catch (e) {
            console.error('Error in scrollByOffset:', e);
        }
    }

    // Page up (scroll up by one viewport height minus overlap)
    function handlePageUp() {
        scrollByOffset(-(options.scrollOverlap || 80), options.scrollType || 'smooth');
    }

    // Page down (scroll down by one viewport height minus overlap)
    function handlePageDown() {
        scrollByOffset(options.scrollOverlap || 80, options.scrollType || 'smooth');
    }

    // Page up longpress (scroll up by one viewport height minus longpress overlap)
    function handlePageUpLongpress() {
        scrollByOffset(-(options.longpressOverlap || 60), options.scrollType || 'smooth');
    }

    // Page down longpress (scroll down by one viewport height minus longpress overlap)
    function handlePageDownLongpress() {
        scrollByOffset(options.longpressOverlap || 60, options.scrollType || 'smooth');
    }
    
    // Initialize toolbar like Essential - simple and direct
    function initializeToolbar() {
        getSettingsValues().then(() => {
            createLeftToolbar();
        });
    }

    // Get settings like Essential does
    function getSettingsValues() {
        const keys = [
            'affoToolbarEnabled',
            'affoToolbarWidth',
            'affoToolbarHeight',
            'affoToolbarPosition',
            'affoToolbarTransparency',
            'affoToolbarGap',
            'affoIconTheme',
            'affoPageUpScrollOverlap',
            'affoPageUpLongpressOverlap',
            'affoPageUpScrollType'
        ];
        return (typeof browser !== 'undefined' ? browser : chrome).storage.local.get(keys).then((result) => {
            // Set options from storage like Essential
            options = {
                enabled: result.affoToolbarEnabled !== false, // Default to enabled
                width: result.affoToolbarWidth || 48,
                height: result.affoToolbarHeight || 20,
                position: result.affoToolbarPosition !== undefined ? result.affoToolbarPosition : 50,
                transparency: result.affoToolbarTransparency !== undefined ? result.affoToolbarTransparency : 0.2,
                gap: result.affoToolbarGap || 0,
                iconTheme: result.affoIconTheme || 'heroIcons',
                scrollOverlap: result.affoPageUpScrollOverlap || 80,
                longpressOverlap: result.affoPageUpLongpressOverlap || 60,
                scrollType: result.affoPageUpScrollType || 'smooth'
            };
            });
    }

    // Start initialization immediately like Essential
    initializeToolbar();
    
    // Listen for toolbar option changes from background script
    try {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        if (browserAPI && browserAPI.runtime) {
            browserAPI.runtime.onMessage.addListener(function(message, _sender, _sendResponse) {
                
                if (message.type === 'toolbarOptionsChanged') {
                    
                    // Update options
                    if (message.options.affoToolbarEnabled !== undefined) options.enabled = message.options.affoToolbarEnabled;
                    if (message.options.affoToolbarWidth !== undefined) options.width = message.options.affoToolbarWidth;
                    if (message.options.affoToolbarHeight !== undefined) options.height = message.options.affoToolbarHeight;
                    if (message.options.affoToolbarPosition !== undefined) options.position = message.options.affoToolbarPosition;
                    if (message.options.affoToolbarTransparency !== undefined) options.transparency = message.options.affoToolbarTransparency;
                    if (message.options.affoToolbarGap !== undefined) options.gap = message.options.affoToolbarGap;
                    
                    // Recreate toolbar with new settings
                    if (leftToolbarIframe) {
                        leftToolbarIframe.remove();
                        leftToolbarIframe = null;
                    }
                    
                    createLeftToolbar();
                }
            });
        }
    } catch (e) {
        console.warn('[Left Toolbar] Could not set up runtime message listener:', e);
    }
    
    
    // Try to catch any errors that might be preventing whatfont_core.js from executing
    window.addEventListener('error', function(e) {
        if (e.filename && e.filename.includes('whatfont')) {
            console.error('[Left Toolbar] WhatFont script error detected:', e.message, 'at', e.filename, ':', e.lineno);
        }
    });
    
    
    // If _whatFont is available, create WhatFont object
    if (typeof window._whatFont === 'function' && typeof window.WhatFont === 'undefined') {
        try {
            window.WhatFont = window._whatFont();
        } catch (e) {
            console.error('[Left Toolbar] Error creating WhatFont object:', e);
        }
    }
    
    
    // Listen for storage changes to update icon theme
    try {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        if (browserAPI && browserAPI.storage && browserAPI.storage.onChanged) {
            browserAPI.storage.onChanged.addListener((changes, areaName) => {
                if (areaName !== 'local') return;
                if (changes.affoIconTheme && leftToolbarIframe) {
                    leftToolbarIframe.contentWindow.postMessage({ type: 'updateIconTheme' }, '*');
                }
                // Invalidate cached scroll settings when changed via Options page
                if (changes.affoPageUpScrollOverlap) options.scrollOverlap = changes.affoPageUpScrollOverlap.newValue || 80;
                if (changes.affoPageUpLongpressOverlap) options.longpressOverlap = changes.affoPageUpLongpressOverlap.newValue || 60;
                if (changes.affoPageUpScrollType) options.scrollType = changes.affoPageUpScrollType.newValue || 'smooth';
            });
        }
    } catch (e) {
        console.error('[Left Toolbar] Error setting up storage listener:', e);
    }
    
})();
