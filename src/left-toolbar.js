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
            case 'checkDomainState':
                handleCheckDomainState(event.data);
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

    // Detect dominant body font type (serif vs sans)
    function detectDominantFontType() {
        const serifNames = [
            'pt serif', 'mencken-std', 'georgia', 'times', 'times new roman',
            'merriweather', 'garamond', 'charter', 'spectral', 'lora',
            'abril', 'crimson', 'playfair', 'noto serif'
        ];

        try {
            // Helper function to check a given element's font
            const checkElementFont = (element, elementName) => {
                if (!element) return null;
                const computedStyle = window.getComputedStyle(element);
                const fontFamily = String(computedStyle.fontFamily || '').toLowerCase();

                if (AFFO_DEBUG) console.log(`[Left Toolbar] Checking ${elementName}: "${computedStyle.fontFamily}"`);

                // Check for known serif font names FIRST
                const hasSerifName = serifNames.some(name => fontFamily.includes(name));
                if (hasSerifName) {
                    if (AFFO_DEBUG) console.log(`[Left Toolbar] Found serif name in ${elementName}`);
                    return 'serif';
                }

                // Check for generic keywords
                if (fontFamily.includes('sans-serif')) {
                    if (AFFO_DEBUG) console.log(`[Left Toolbar] Found generic sans-serif in ${elementName}`);
                    return 'sans';
                }
                if (fontFamily.includes('serif') && !fontFamily.includes('sans-serif')) {
                    if (AFFO_DEBUG) console.log(`[Left Toolbar] Found generic serif in ${elementName}`);
                    return 'serif';
                }

                return null; // Couldn't determine from this element
            };

            // First, check document.body
            const bodyElement = document.body || document.documentElement;
            let result = checkElementFont(bodyElement, 'document.body');

            // If body only has generic keywords (no specific font name), check content containers
            if (!result || result === 'sans') {
                // Try common content containers in priority order
                const contentContainers = [
                    document.querySelector('article'),
                    document.querySelector('main'),
                    document.querySelector('[role="main"]'),
                    document.querySelector('.entry-content'),
                    document.querySelector('.post'),
                    document.querySelector('.content'),
                    document.querySelector('.article-body'),
                    document.querySelector('[data-content]'),
                ];

                for (const container of contentContainers) {
                    if (container) {
                        const containerName = container.tagName.toLowerCase() +
                            (container.className ? `.${container.className.split(' ')[0]}` : '');
                        const containerResult = checkElementFont(container, containerName);
                        if (containerResult === 'serif') {
                            if (AFFO_DEBUG) console.log('[Left Toolbar] Detected: serif (from content container)');
                            return 'serif';
                        }
                    }
                }
            }

            // Use body result if we got one
            if (result) {
                if (AFFO_DEBUG) console.log(`[Left Toolbar] Detected: ${result} (from body)`);
                return result;
            }

            // Default to sans
            if (AFFO_DEBUG) console.log('[Left Toolbar] Detected: sans (default)');
            return 'sans';
        } catch (e) {
            console.error('[Left Toolbar] Error detecting font type:', e);
            return 'sans';
        }
    }

    // Create quick-pick menu in page context (not iframe)
    function createQuickPickMenuIfNeeded() {
        if (quickPickMenu) return quickPickMenu;

        const overlay = document.createElement('div');
        overlay.id = 'affo-quick-pick-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 2147483647;
        `;

        const content = document.createElement('div');
        content.id = 'affo-quick-pick-content';
        content.style.cssText = `
            background: #ffffff;
            border-radius: 8px;
            max-width: 320px;
            display: flex;
            flex-direction: column;
            color: #495057;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            overflow: hidden;
            max-height: 70vh;
        `;

        // Add header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid #dee2e6;
        `;

        const headerTitle = document.createElement('h3');
        headerTitle.textContent = 'Quick Pick';
        headerTitle.style.cssText = `
            margin: 0;
            font-size: 14px;
            color: #495057;
            font-weight: 600;
        `;
        header.appendChild(headerTitle);

        // Header close button (visual, not functional - body has the functional one)
        const headerCloseBtn = document.createElement('button');
        headerCloseBtn.textContent = '✕';
        headerCloseBtn.style.cssText = `
            background: none;
            border: none;
            color: #6c757d;
            font-size: 16px;
            cursor: pointer;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s ease;
        `;
        headerCloseBtn.onmouseover = function() { this.style.background = '#dc3545'; this.style.color = 'white'; };
        headerCloseBtn.onmouseout = function() { this.style.background = 'none'; this.style.color = '#6c757d'; };
        headerCloseBtn.onclick = hideQuickPickMenu;
        header.appendChild(headerCloseBtn);

        content.appendChild(header);

        // Add body container
        const body = document.createElement('div');
        body.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            overflow-y: auto;
        `;

        // Add message element
        const message = document.createElement('div');
        message.id = 'affo-quick-pick-message';
        message.style.cssText = `
            padding: 8px;
            text-align: center;
            color: #6c757d;
            font-size: 13px;
            line-height: 1.5;
            display: none;
            font-weight: 500;
        `;
        body.appendChild(message);

        // Create 5 favorite buttons (matching Load Favorites modal button styling)
        const buttonStyleFn = function(btn) {
            btn.style.cssText = `
                padding: 0;
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                color: #495057;
                cursor: pointer;
                display: none;
                font-weight: 500;
                transition: all 150ms ease;
                text-align: left;
                display: flex;
                flex-direction: column;
                gap: 0;
            `;
            btn.onmouseover = function() { if (!this.disabled) { this.style.background = '#e9ecef'; this.style.borderColor = '#495057'; } };
            btn.onmouseout = function() { if (!this.disabled) { this.style.background = '#f8f9fa'; this.style.borderColor = '#dee2e6'; } };
            btn.onmousedown = function() { if (!this.disabled) this.style.background = '#dee2e6'; };
            btn.onmouseup = function() { if (!this.disabled) this.style.background = '#e9ecef'; };
        };

        for (let i = 1; i <= 5; i++) {
            const btn = document.createElement('button');
            btn.id = `affo-quick-pick-font-${i}`;
            buttonStyleFn(btn);
            body.appendChild(btn);
        }

        // Add unapply button (red danger button matching popup style)
        const unapplyBtn = document.createElement('button');
        unapplyBtn.id = 'affo-quick-pick-unapply';
        unapplyBtn.textContent = 'Unapply';
        unapplyBtn.style.cssText = `
            padding: 10px 12px;
            background: #dc3545;
            border: 1px solid #c82333;
            border-radius: 4px;
            color: #ffffff;
            cursor: pointer;
            font-size: 13px;
            display: none;
            font-weight: 500;
            transition: all 150ms ease;
            text-align: center;
            margin-top: 4px;
        `;
        unapplyBtn.onmouseover = function() { if (!this.disabled) { this.style.background = '#c82333'; this.style.borderColor = '#a71d2a'; } };
        unapplyBtn.onmouseout = function() { if (!this.disabled) { this.style.background = '#dc3545'; this.style.borderColor = '#c82333'; } };
        unapplyBtn.onmousedown = function() { if (!this.disabled) this.style.background = '#a71d2a'; };
        unapplyBtn.onmouseup = function() { if (!this.disabled) this.style.background = '#c82333'; };
        body.appendChild(unapplyBtn);

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
            // Fetch favorites
            const data = await browserAPI.storage.local.get(['affoFavorites', 'affoFavoritesOrder']);
            const favorites = data.affoFavorites || {};
            const order = data.affoFavoritesOrder || [];

            // Get top 5 favorites (preserve both name and config like Load Favorites modal)
            const top5 = order.slice(0, 5)
                .filter(id => favorites[id])
                .map(id => ({
                    name: id,  // Favorite name/ID (like "Atiza Text")
                    ...favorites[id]  // Spread config (fontName, fontSize, etc.)
                }));

            if (top5.length === 0) {
                // No favorites - show message
                populateQuickPickMenuInPage([], true, false, {});
            } else {
                // Check domain state via storage
                const origin = location.hostname;
                const storageData = await browserAPI.storage.local.get('affoApplyMap');
                const applyMap = (storageData && storageData.affoApplyMap) ? storageData.affoApplyMap : {};
                const domainData = applyMap[origin] || {};

                let showBodyModeMessage = false;
                if (domainData && domainData.body && !domainData.serif && !domainData.sans && !domainData.mono) {
                    showBodyModeMessage = true;
                }

                // Populate menu
                populateQuickPickMenuInPage(top5, showBodyModeMessage, domainData, origin);
            }

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

    // Populate menu with favorites (in page context)
    function populateQuickPickMenuInPage(favorites, showBodyModeMessage, domainData, origin) {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        createQuickPickMenuIfNeeded();

        const message = document.getElementById('affo-quick-pick-message');
        const unapplyBtn = document.getElementById('affo-quick-pick-unapply');

        // Hide all favorite buttons first
        for (let i = 1; i <= 5; i++) {
            const btn = document.getElementById(`affo-quick-pick-font-${i}`);
            if (btn) btn.style.display = 'none';
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
            btn.style.opacity = '1';

            // Create content with name and preview
            btn.innerHTML = '';
            btn.style.display = 'flex';
            btn.style.position = 'relative';
            btn.style.overflow = 'hidden';

            // Left side indicator (serif)
            const leftHint = document.createElement('div');
            leftHint.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 50%;
                pointer-events: none;
                border-right: 1px dashed #dee2e6;
            `;
            btn.appendChild(leftHint);

            // Content wrapper (centered text)
            const contentWrapper = document.createElement('div');
            contentWrapper.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding: 12px 16px;
                pointer-events: none;
                gap: 4px;
            `;

            const nameEl = document.createElement('div');
            nameEl.style.cssText = 'font-weight: 500; color: #495057;';
            // Show favorite name (like "Atiza Text") matching Load Favorites modal format
            nameEl.textContent = fav.name || fav.fontName || `Font ${i + 1}`;

            const previewEl = document.createElement('div');
            previewEl.style.cssText = 'font-size: 11px; color: #6c757d; line-height: 1.2;';

            // Build preview text from font properties (matching Load Favorites Modal format)
            const previewParts = [];
            if (fav.fontSize) previewParts.push(`${fav.fontSize}px`);
            if (fav.fontWeight) previewParts.push(`wt${fav.fontWeight}`);
            if (fav.lineHeight) previewParts.push(`${fav.lineHeight}lh`);

            if (previewParts.length === 0) {
                previewEl.textContent = 'Default styles';
            } else {
                previewEl.textContent = `(${previewParts.join(', ')})`;
            }

            contentWrapper.appendChild(nameEl);
            contentWrapper.appendChild(previewEl);
            btn.appendChild(contentWrapper);

            // Set up click handler that detects left/right click region
            btn.onclick = (event) => {
                // Determine if user clicked left (serif) or right (sans) side of button
                const buttonRect = btn.getBoundingClientRect();
                const buttonWidth = buttonRect.width;
                const clickX = event.clientX - buttonRect.left;
                const position = clickX < buttonWidth / 2 ? 'serif' : 'sans';

                const allBtns = Array.from({length: 5}, (_, i) => document.getElementById(`affo-quick-pick-font-${i + 1}`));

                // Show loading state
                allBtns.forEach(b => {
                    if (b && b.style.display !== 'none') {
                        b.disabled = true;
                        b.style.opacity = '0.5';
                    }
                });
                unapplyBtn.disabled = true;
                unapplyBtn.style.opacity = '0.5';

                message.textContent = `Applying ${fav.fontName || `Font ${i + 1}`} to ${position}...`;
                message.style.display = 'block';

                browserAPI.runtime.sendMessage({
                    type: 'quickApplyFavorite',
                    origin: origin || location.hostname,
                    fontConfig: fav,
                    position: position
                }).then(response => {
                    if (response && response.success) {
                        console.log('[Left Toolbar] Font applied successfully to', position);
                        // Restore button state before closing
                        allBtns.forEach(b => {
                            if (b && b.style.display !== 'none') {
                                b.disabled = false;
                                b.style.opacity = '1';
                            }
                        });
                        unapplyBtn.disabled = false;
                        unapplyBtn.style.opacity = '1';
                        hideQuickPickMenu();
                    } else {
                        console.error('[Left Toolbar] Font application failed:', response?.error);
                        message.textContent = 'Failed to apply font. Try again.';
                        allBtns.forEach(b => {
                            if (b && b.style.display !== 'none') {
                                b.disabled = false;
                                b.style.opacity = '1';
                            }
                        });
                        unapplyBtn.disabled = false;
                        unapplyBtn.style.opacity = '1';
                    }
                }).catch(err => {
                    console.error('[Left Toolbar] Error applying font:', err);
                    message.textContent = 'Error applying font.';
                    allBtns.forEach(b => {
                        if (b && b.style.display !== 'none') {
                            b.disabled = false;
                            b.style.opacity = '1';
                        }
                    });
                    unapplyBtn.disabled = false;
                    unapplyBtn.style.opacity = '1';
                });
            };

            // Add visual hint for left/right click regions
            btn.title = '← Click left for serif | Click right for sans-serif →';
            btn.style.cursor = 'pointer';
        }

        // Show unapply button if fonts are applied
        const hasFontsApplied = domainData && (domainData.serif || domainData.sans || domainData.mono || domainData.body);
        if (hasFontsApplied && !showBodyModeMessage) {
            // Reset unapply button state from previous use
            unapplyBtn.disabled = false;
            unapplyBtn.style.opacity = '1';
            unapplyBtn.style.display = 'block';
            unapplyBtn.onclick = () => {
                const allBtns = Array.from({length: 5}, (_, i) => document.getElementById(`affo-quick-pick-font-${i + 1}`));

                // Show loading state
                allBtns.forEach(b => {
                    if (b && b.style.display !== 'none') {
                        b.disabled = true;
                        b.style.opacity = '0.5';
                    }
                });
                unapplyBtn.disabled = true;
                unapplyBtn.style.opacity = '0.5';

                message.textContent = 'Removing fonts...';
                message.style.display = 'block';

                browserAPI.runtime.sendMessage({
                    type: 'quickUnapplyFonts',
                    origin: origin || location.hostname
                }).then(response => {
                    if (response && response.success) {
                        console.log('[Left Toolbar] Fonts removed successfully');
                        // Restore button state before closing
                        allBtns.forEach(b => {
                            if (b && b.style.display !== 'none') {
                                b.disabled = false;
                                b.style.opacity = '1';
                            }
                        });
                        unapplyBtn.disabled = false;
                        unapplyBtn.style.opacity = '1';
                        hideQuickPickMenu();
                    } else {
                        console.error('[Left Toolbar] Unapply failed:', response?.error);
                        message.textContent = 'Failed to remove fonts. Try popup.';
                        allBtns.forEach(b => {
                            if (b && b.style.display !== 'none') {
                                b.disabled = false;
                                b.style.opacity = '1';
                            }
                        });
                        unapplyBtn.disabled = false;
                        unapplyBtn.style.opacity = '1';
                    }
                }).catch(err => {
                    console.error('[Left Toolbar] Error removing fonts:', err);
                    message.textContent = 'Error removing fonts.';
                    allBtns.forEach(b => {
                        if (b && b.style.display !== 'none') {
                            b.disabled = false;
                            b.style.opacity = '1';
                        }
                    });
                    unapplyBtn.disabled = false;
                    unapplyBtn.style.opacity = '1';
                });
            };
        } else {
            unapplyBtn.style.display = 'none';
        }
    }

    // Check domain state and populate quick-pick menu
    function handleCheckDomainState(data) {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        const origin = location.hostname;
        const { favorites } = data;

        // Detect font type in this context (page context, not iframe)
        const detectedFontType = detectDominantFontType();

        browserAPI.storage.local.get('affoApplyMap').then(storageData => {
            const applyMap = (storageData && storageData.affoApplyMap) ? storageData.affoApplyMap : {};
            const domainData = applyMap[origin];

            let showBodyModeMessage = false;

            if (domainData && domainData.body && !domainData.serif && !domainData.sans && !domainData.mono) {
                // Domain has Body Mode fonts only → show message
                showBodyModeMessage = true;
            }

            // Send back to iframe
            if (leftToolbarIframe && leftToolbarIframe.contentWindow) {
                leftToolbarIframe.contentWindow.postMessage({
                    type: 'populateQuickPickMenu',
                    favorites: favorites,
                    showBodyModeMessage: showBodyModeMessage,
                    detectedFontType: detectedFontType
                }, '*');
            }
        }).catch(err => {
            console.error('[Left Toolbar] Error checking domain state:', err);
        });
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
                el.clientWidth > viewportWidth * 0.8 &&
                (getComputedStyle(el).overflowY === 'auto' ||
                 getComputedStyle(el).overflowY === 'scroll')) {
                return el;
            }
        }
        
        return document.documentElement;
    }
    
    // Page up (scroll up by one viewport height minus overlap)
    async function handlePageUp() {
        try {
            const data = await browser.storage.local.get([
                'affoPageUpScrollOverlap', 
                'affoPageUpScrollType'
            ]);
            
            const element = findScrollableElement();
            const overlapSetting = data.affoPageUpScrollOverlap || 80;
            const scrollType = data.affoPageUpScrollType || 'smooth';
            
            const offset = Math.max(window.innerHeight - overlapSetting, 10);
            const targetTop = Math.max(0, element.scrollTop - offset);
            
            element.scrollTo({ top: targetTop, behavior: scrollType });
        } catch (e) {
            console.error('Error in handlePageUp:', e);
        }
    }
    
    // Page down (scroll down by one viewport height minus overlap)  
    async function handlePageDown() {
        try {
            const data = await browser.storage.local.get([
                'affoPageUpScrollOverlap', 
                'affoPageUpScrollType'
            ]);
            
            const element = findScrollableElement();
            const overlapSetting = data.affoPageUpScrollOverlap || 80;
            const scrollType = data.affoPageUpScrollType || 'smooth';
            
            const offset = Math.max(window.innerHeight - overlapSetting, 10);
            const targetTop = Math.min(
                element.scrollHeight,
                element.scrollTop + offset
            );
            
            element.scrollTo({ top: targetTop, behavior: scrollType });
        } catch (e) {
            console.error('Error in handlePageDown:', e);
        }
    }
    
    // Page up longpress (scroll up by one viewport height minus longpress overlap)
    async function handlePageUpLongpress() {
        try {
            const data = await browser.storage.local.get([
                'affoPageUpLongpressOverlap', 
                'affoPageUpScrollType'
            ]);
            
            const element = findScrollableElement();
            const overlapSetting = data.affoPageUpLongpressOverlap || 60;
            const scrollType = data.affoPageUpScrollType || 'smooth';
            
            const offset = Math.max(window.innerHeight - overlapSetting, 10);
            const targetTop = Math.max(0, element.scrollTop - offset);
            
            element.scrollTo({ top: targetTop, behavior: scrollType });
        } catch (e) {
            console.error('Error in handlePageUpLongpress:', e);
        }
    }
    
    // Page down longpress (scroll down by one viewport height minus longpress overlap)
    async function handlePageDownLongpress() {
        try {
            const data = await browser.storage.local.get([
                'affoPageUpLongpressOverlap', 
                'affoPageUpScrollType'
            ]);
            
            const element = findScrollableElement();
            const overlapSetting = data.affoPageUpLongpressOverlap || 60;
            const scrollType = data.affoPageUpScrollType || 'smooth';
            
            const offset = Math.max(window.innerHeight - overlapSetting, 10);
            const targetTop = Math.min(
                element.scrollHeight,
                element.scrollTop + offset
            );
            
            element.scrollTo({ top: targetTop, behavior: scrollType });
        } catch (e) {
            console.error('Error in handlePageDownLongpress:', e);
        }
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
            'affoIconTheme'
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
                iconTheme: result.affoIconTheme || 'heroIcons'
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
                if (areaName === 'local' && changes.affoIconTheme && leftToolbarIframe) {
                    leftToolbarIframe.contentWindow.postMessage({ type: 'updateIconTheme' }, '*');
                }
            });
        }
    } catch (e) {
        console.error('[Left Toolbar] Error setting up storage listener:', e);
    }
    
})();
