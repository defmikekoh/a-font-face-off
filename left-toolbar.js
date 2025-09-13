// Left toolbar content script - based on essential-buttons-toolbar approach
(function() {
    'use strict';
    
    // Prevent multiple injections
    if (window.affoLeftToolbarInjected) {
        console.log('[Left Toolbar] Already injected, skipping');
        return;
    }
    
    // Don't show toolbar on extension pages (options, popup, etc.)
    if (window.location.protocol === 'moz-extension:' || window.location.protocol === 'chrome-extension:') {
        console.log('[Left Toolbar] Skipping extension page:', window.location.href);
        return;
    }
    
    window.affoLeftToolbarInjected = true;
    console.log('[Left Toolbar] Starting injection...');
    
    let leftToolbarIframe = null;
    let leftToolbarHidden = false;
    let unhideIcon = null;
    let options = {};
    
    console.log('[Left Toolbar] Initializing left toolbar...');
    
    // Load toolbar options and initialize
    function init() {
        loadToolbarOptions(function() {
            console.log('[Left Toolbar] Initializing with loaded options:', options);
            if (options.enabled !== false) { // Default to enabled
                createLeftToolbar();
            } else {
                console.log('[Left Toolbar] Disabled, not creating toolbar');
            }
        });
    }
    
    // Load toolbar options from storage
    function loadToolbarOptions(callback) {
        console.log('[Left Toolbar] Loading toolbar options...');
        try {
            const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
            browserAPI.runtime.sendMessage({ type: 'getToolbarOptions' }).then(function(result) {
                console.log('[Left Toolbar] Received options from background:', result);
                
                // Use saved settings or defaults for left toolbar
                options = {
                    enabled: result.affoToolbarEnabled !== false, // Default to enabled
                    width: result.affoToolbarWidth || 48,         // Use same width setting
                    height: result.affoToolbarHeight || 20,       // Height as percentage
                    position: result.affoToolbarPosition !== undefined ? result.affoToolbarPosition : 50, // Position as percentage (for vertical centering)
                    transparency: result.affoToolbarTransparency !== undefined ? result.affoToolbarTransparency : 0.2,
                    gap: result.affoToolbarGap || 0               // Gap from left edge
                };
                
                console.log('[Left Toolbar] Final options:', options);
                callback();
            }).catch(function(e) {
                console.warn('[Left Toolbar] Error loading toolbar options via message:', e);
                // Use defaults if loading fails
                options = {
                    enabled: true,
                    width: 48,
                    height: 20,
                    position: 50,
                    transparency: 0.2,
                    gap: 0
                };
                callback();
            });
        } catch (e) {
            console.warn('[Left Toolbar] Error loading toolbar options:', e);
            // Use defaults if loading fails
            options = {
                enabled: true,
                width: 48,
                height: 20,
                position: 50,
                transparency: 0.2,
                gap: 0
            };
            callback();
        }
    }
    
    // Create the left toolbar iframe
    function createLeftToolbar() {
        console.log('[Left Toolbar] Creating left toolbar iframe...');
        leftToolbarIframe = document.createElement('iframe');
        leftToolbarIframe.id = 'affo-left-toolbar-iframe';
        
        // Use essential-buttons-toolbar's exact approach: vh units and CSS positioning
        const containerHeight = `${options.height}vh`; // Use vh units directly like essential
        const useTransformCentering = options.height < 100; // Center if not full height
        const topPosition = useTransformCentering ? `${options.position}%` : '0';
        
        // More logical approach: use saved width setting with viewport scaling
        const viewportScale = window.visualViewport?.scale || 1;
        const calculatedWidth = Math.floor(options.width / viewportScale);
        
        console.log('[Left Toolbar] Width calculation details (logical method):', {
            'saved width setting': options.width,
            'viewport scale': viewportScale,
            'calculated width': calculatedWidth,
            'containerHeight': containerHeight,
            'useTransformCentering': useTransformCentering
        });
        
        // Use essential-buttons-toolbar's exact iframe styling approach with vh units and transform centering
        const iframeCSS = `display: block !important; position: fixed !important; z-index: 2147483647 !important; ` +
                         `margin: 0 !important; padding: 0 !important; min-height: unset !important; max-height: unset !important; ` +
                         `min-width: unset !important; max-width: unset !important; border: 0 !important; ` +
                         `background: transparent !important; color-scheme: light !important; border-radius: 0 !important; ` +
                         `left: ${options.gap}px !important; width: ${calculatedWidth}px !important; height: ${containerHeight} !important; ` +
                         `pointer-events: auto !important; overflow: hidden !important; outline: none !important; ` +
                         `visibility: visible !important; filter: none !important; clip: auto !important; clip-path: none !important; ` +
                         (useTransformCentering ? 
                           `top: ${topPosition} !important; transform: translateY(-50%) !important;` : 
                           `top: 0 !important; transform: none !important;`);
        
        leftToolbarIframe.style.cssText = iframeCSS;
        leftToolbarIframe.src = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('left-toolbar-iframe.html');
        
        console.log('[Left Toolbar] Applied iframe CSS:', iframeCSS);
        
        // Add iframe event listeners
        leftToolbarIframe.addEventListener('load', function() {
            console.log('[Left Toolbar] Iframe loaded successfully');
            
            // Send initial styles to iframe with saved transparency setting
            console.log('[Left Toolbar] Sending transparency to iframe:', options.transparency);
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
        
        document.body.appendChild(leftToolbarIframe);
        
        // Add viewport resize listener like essential-buttons-toolbar
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function() {
                console.log('[Left Toolbar] Viewport resized, updating toolbar dimensions');
                // Recreate toolbar with new dimensions
                if (leftToolbarIframe) {
                    leftToolbarIframe.remove();
                    leftToolbarIframe = null;
                    createLeftToolbar();
                }
            });
        }
        
        console.log('[Left Toolbar] Left toolbar iframe created and added to page');
    }
    
    // Handle messages from iframe and toolbar option changes
    window.addEventListener('message', function(event) {
        if (!event.data || !event.data.type) return;
        
        console.log('[Left Toolbar] Received message:', event.data);
        
        switch (event.data.type) {
            case 'initWhatFont':
                handleInitWhatFont();
                break;
            case 'openPopup':
                handleOpenPopup();
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
        }
    });
    
    // Handle WhatFont initialization - using original working architecture
    function handleInitWhatFont() {
        console.log('[Left Toolbar] Initializing WhatFont...');
        console.log('[Left Toolbar] jQuery available:', typeof window.$);
        console.log('[Left Toolbar] WhatFont available:', typeof window.WhatFont);
        
        // Check if WhatFont is already loaded (from content script)
        if (typeof window.WhatFont !== 'undefined') {
            console.log('[Left Toolbar] WhatFont already loaded, initializing...');
            try {
                // Set the CSS URL to use local file before initializing
                const localCSSUrl = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('wf.css');
                console.log('[Left Toolbar] Setting WhatFont CSS URL to:', localCSSUrl);
                window.WhatFont.setCSSURL(localCSSUrl);
                
                window.WhatFont.init();
                console.log('[Left Toolbar] WhatFont initialized successfully');
            } catch (e) {
                console.error('[Left Toolbar] Error initializing WhatFont:', e);
            }
            return;
        }
        
        // Check if jQuery is available first
        if (typeof window.$ === 'undefined') {
            console.log('[Left Toolbar] jQuery not available, loading it first...');
            loadJQueryThenWhatFont();
            return;
        }
        
        // Load WhatFont script
        console.log('[Left Toolbar] jQuery available, loading WhatFont...');
        const script = document.createElement('script');
        script.src = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('whatfont_core.js');
        script.onload = function() {
            console.log('[Left Toolbar] WhatFont script loaded');
            
            // Add a small delay to let the script execute
            setTimeout(() => {
                console.log('[Left Toolbar] _whatFont function available:', typeof window._whatFont);
                console.log('[Left Toolbar] window keys containing whatFont:', Object.keys(window).filter(key => key.toLowerCase().includes('whatfont') || key.toLowerCase().includes('_whatfont')));
                
                // Create WhatFont object from _whatFont function
                if (typeof window._whatFont === 'function') {
                    try {
                        window.WhatFont = window._whatFont();
                        console.log('[Left Toolbar] WhatFont object created successfully');
                        
                        // Set the CSS URL to use local file before initializing
                        const localCSSUrl = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('wf.css');
                        console.log('[Left Toolbar] Setting WhatFont CSS URL to:', localCSSUrl);
                        window.WhatFont.setCSSURL(localCSSUrl);
                        
                        window.WhatFont.init();
                        console.log('[Left Toolbar] WhatFont initialized successfully');
                    } catch (e) {
                        console.error('[Left Toolbar] Error creating/initializing WhatFont:', e);
                    }
                } else {
                    console.error('[Left Toolbar] _whatFont function not available after script load');
                }
            }, 100);
        };
        script.onerror = function() {
            console.error('[Left Toolbar] Error loading WhatFont script');
        };
        document.head.appendChild(script);
    }
    
    
    // Load jQuery first, then WhatFont - using original working architecture
    function loadJQueryThenWhatFont() {
        console.log('[Left Toolbar] Loading jQuery first...');
        const jqueryScript = document.createElement('script');
        jqueryScript.src = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('jquery.js');
        jqueryScript.onload = function() {
            console.log('[Left Toolbar] jQuery loaded, now loading WhatFont...');
            const whatfontScript = document.createElement('script');
            whatfontScript.src = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('whatfont_core.js');
            whatfontScript.onload = function() {
                console.log('[Left Toolbar] WhatFont script loaded');
                console.log('[Left Toolbar] _whatFont function available:', typeof window._whatFont);
                
                // Create WhatFont object from _whatFont function
                if (typeof window._whatFont === 'function') {
                    try {
                        window.WhatFont = window._whatFont();
                        console.log('[Left Toolbar] WhatFont object created successfully');
                        
                        // Set the CSS URL to use local file before initializing
                        const localCSSUrl = (typeof browser !== 'undefined' ? browser : chrome).runtime.getURL('wf.css');
                        console.log('[Left Toolbar] Setting WhatFont CSS URL to:', localCSSUrl);
                        window.WhatFont.setCSSURL(localCSSUrl);
                        
                        window.WhatFont.init();
                        console.log('[Left Toolbar] WhatFont initialized successfully');
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
        console.log('[Left Toolbar] Opening popup with domain and tab context...');
        try {
            const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
            const currentDomain = window.location.hostname;
            
            console.log('[Left Toolbar] Current domain:', currentDomain);
            
            // Get current tab info to pass to popup
            browserAPI.runtime.sendMessage({ 
                type: 'getCurrentTab' 
            }).then(function(tabResponse) {
                console.log('[Left Toolbar] Current tab response:', tabResponse);
                
                const currentTabId = tabResponse.tabId;
                
                // Check if we're on mobile Firefox (no real popups)
                const isMobileFirefox = navigator.userAgent.includes('Mobile') && navigator.userAgent.includes('Firefox');
                
                if (isMobileFirefox) {
                    console.log('[Left Toolbar] Mobile Firefox detected, using fallback directly');
                    browserAPI.runtime.sendMessage({ 
                        type: 'openPopupFallback', 
                        domain: currentDomain,
                        sourceTabId: currentTabId
                    }).then(function(response) {
                        console.log('[Left Toolbar] Fallback response:', response);
                    }).catch(function(e) {
                        console.error('[Left Toolbar] Error opening fallback popup:', e);
                    });
                } else {
                    browserAPI.runtime.sendMessage({ 
                        type: 'openPopup', 
                        domain: currentDomain,
                        sourceTabId: currentTabId
                    }).then(function(response) {
                        console.log('[Left Toolbar] Popup response:', response);
                        if (!response || !response.success) {
                            console.log('[Left Toolbar] Popup failed, trying fallback...');
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
        console.log('[Left Toolbar] Toolbar options changed:', newOptions);
        
        // Update options with new values
        Object.assign(options, newOptions);
        
        // Recreate toolbar with new settings
        if (leftToolbarIframe) {
            leftToolbarIframe.remove();
            leftToolbarIframe = null;
        }
        
        if (options.enabled !== false) {
            createLeftToolbar();
        }
    }
    
    // Close current tab
    function handleCloseTab() {
        console.log('[Left Toolbar] Handling close tab');
        try {
            const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
            browserAPI.runtime.sendMessage({ type: 'closeCurrentTab' });
        } catch (e) {
            console.error('[Left Toolbar] Error closing tab:', e);
        }
    }
    
    // Handle hide toolbar (based on essential-buttons-toolbar implementation)
    function handleHideToolbar() {
        console.log('[Left Toolbar] Handling hide toolbar');
        leftToolbarHidden = true;
        reinitializeToolbar();
    }
    
    // Handle unhide toolbar (show toolbar again)
    function handleUnhideToolbar() {
        console.log('[Left Toolbar] Handling unhide toolbar');
        leftToolbarHidden = false;
        reinitializeToolbar();
    }
    
    // Reinitialize toolbar (handle hide/unhide)
    function reinitializeToolbar() {
        console.log('[Left Toolbar] Reinitializing toolbar, hidden:', leftToolbarHidden);
        
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
        console.log('[Left Toolbar] Creating unhide icon...');
        
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
        
        console.log('[Left Toolbar] Unhide icon created and positioned');
    }
    
    // Page up (scroll up by one viewport height minus overlap)
    async function handlePageUp() {
        console.log('[Left Toolbar] Handling page up');
        try {
            const data = await browser.storage.local.get(['affoPageUpScrollOverlap']);
            const scrollOverlap = data.affoPageUpScrollOverlap !== undefined ? data.affoPageUpScrollOverlap : 80;
            const scrollDistance = Math.max(window.innerHeight - scrollOverlap, 10);
            
            window.scrollBy({
                top: -scrollDistance,
                behavior: 'smooth'
            });
        } catch (e) {
            console.error('[Left Toolbar] Error getting scroll overlap setting, using default:', e);
            window.scrollBy({
                top: -(window.innerHeight - 80),
                behavior: 'smooth'
            });
        }
    }
    
    // Page down (scroll down by one viewport height minus overlap)  
    async function handlePageDown() {
        console.log('[Left Toolbar] Handling page down');
        try {
            const data = await browser.storage.local.get(['affoPageUpScrollOverlap']);
            const scrollOverlap = data.affoPageUpScrollOverlap !== undefined ? data.affoPageUpScrollOverlap : 80;
            const scrollDistance = Math.max(window.innerHeight - scrollOverlap, 10);
            
            window.scrollBy({
                top: scrollDistance,
                behavior: 'smooth'
            });
        } catch (e) {
            console.error('[Left Toolbar] Error getting scroll overlap setting, using default:', e);
            window.scrollBy({
                top: (window.innerHeight - 80),
                behavior: 'smooth'
            });
        }
    }
    
    // Page up longpress (scroll up by one viewport height minus longpress overlap)
    async function handlePageUpLongpress() {
        console.log('[Left Toolbar] Handling page up longpress');
        try {
            const data = await browser.storage.local.get(['affoPageUpLongpressOverlap']);
            const scrollOverlap = data.affoPageUpLongpressOverlap !== undefined ? data.affoPageUpLongpressOverlap : 60;
            const scrollDistance = Math.max(window.innerHeight - scrollOverlap, 10);
            
            window.scrollBy({
                top: -scrollDistance,
                behavior: 'smooth'
            });
        } catch (e) {
            console.error('[Left Toolbar] Error getting longpress scroll overlap setting, using default:', e);
            window.scrollBy({
                top: -(window.innerHeight - 60),
                behavior: 'smooth'
            });
        }
    }
    
    // Page down longpress (scroll down by one viewport height minus longpress overlap)
    async function handlePageDownLongpress() {
        console.log('[Left Toolbar] Handling page down longpress');
        try {
            const data = await browser.storage.local.get(['affoPageUpLongpressOverlap']);
            const scrollOverlap = data.affoPageUpLongpressOverlap !== undefined ? data.affoPageUpLongpressOverlap : 60;
            const scrollDistance = Math.max(window.innerHeight - scrollOverlap, 10);
            
            window.scrollBy({
                top: scrollDistance,
                behavior: 'smooth'
            });
        } catch (e) {
            console.error('[Left Toolbar] Error getting longpress scroll overlap setting, using default:', e);
            window.scrollBy({
                top: (window.innerHeight - 60),
                behavior: 'smooth'
            });
        }
    }
    
    // Initialize when DOM is ready
    console.log('[Left Toolbar] Document ready state:', document.readyState);
    if (document.readyState === 'loading') {
        console.log('[Left Toolbar] DOM still loading, adding event listener');
        document.addEventListener('DOMContentLoaded', init);
    } else {
        console.log('[Left Toolbar] DOM already loaded, initializing immediately');
        init();
    }
    
    // Listen for toolbar option changes from background script
    try {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        if (browserAPI && browserAPI.runtime) {
            browserAPI.runtime.onMessage.addListener(function(message, sender, sendResponse) {
                console.log('[Left Toolbar] Received runtime message:', message);
                
                if (message.type === 'toolbarOptionsChanged') {
                    console.log('[Left Toolbar] Toolbar options changed via runtime:', message.options);
                    
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
                    
                    if (options.enabled !== false) {
                        createLeftToolbar();
                    } else {
                        console.log('[Left Toolbar] Disabled, toolbar will not be shown');
                    }
                }
            });
        }
    } catch (e) {
        console.warn('[Left Toolbar] Could not set up runtime message listener:', e);
    }
    
    console.log('[Left Toolbar] Left toolbar script loaded');
    
    // Try to catch any errors that might be preventing whatfont_core.js from executing
    window.addEventListener('error', function(e) {
        if (e.filename && e.filename.includes('whatfont')) {
            console.error('[Left Toolbar] WhatFont script error detected:', e.message, 'at', e.filename, ':', e.lineno);
        }
    });
    console.log('[Left Toolbar] Extension ID/URL check:', 
        typeof browser !== 'undefined' ? browser.runtime.getURL('') : 
        typeof chrome !== 'undefined' ? chrome.runtime.getURL('') : 'No runtime');
    console.log('[Left Toolbar] Current page URL:', window.location.href);
    console.log('[Left Toolbar] Content script should match:', 
        /^https?:\/\//.test(window.location.href) ? 'YES' : 'NO');
    console.log('[Left Toolbar] Initial state - jQuery:', typeof window.$);
    console.log('[Left Toolbar] Initial state - _whatFont:', typeof window._whatFont);
    console.log('[Left Toolbar] Initial state - WhatFont:', typeof window.WhatFont);
    
    // Check if whatfont_core.js is already in the DOM from content script
    const existingWhatFontScripts = document.querySelectorAll('script[src*="whatfont"]');
    console.log('[Left Toolbar] Existing WhatFont scripts in DOM:', existingWhatFontScripts.length);
    existingWhatFontScripts.forEach((script, index) => {
        console.log('[Left Toolbar] Script', index, ':', script.src);
    });
    
    // Check all script tags to see what was actually loaded by content scripts
    const allScripts = document.querySelectorAll('script[src]');
    console.log('[Left Toolbar] All script tags with src:', allScripts.length);
    const extensionScripts = Array.from(allScripts).filter(script => 
        script.src.includes('moz-extension') || script.src.includes('chrome-extension')
    );
    console.log('[Left Toolbar] Extension scripts loaded:', extensionScripts.length);
    extensionScripts.forEach((script, index) => {
        console.log('[Left Toolbar] Extension script', index, ':', script.src.split('/').pop());
    });
    
    // If _whatFont is available, create WhatFont object
    if (typeof window._whatFont === 'function' && typeof window.WhatFont === 'undefined') {
        try {
            window.WhatFont = window._whatFont();
            console.log('[Left Toolbar] Created WhatFont object from _whatFont function');
        } catch (e) {
            console.error('[Left Toolbar] Error creating WhatFont object:', e);
        }
    }
    
    // Set up a retry mechanism for WhatFont initialization since content scripts load asynchronously
    let whatFontRetryCount = 0;
    const maxRetries = 10;
    
    function waitForWhatFont() {
        if (typeof window._whatFont === 'function' && typeof window.WhatFont === 'undefined') {
            try {
                window.WhatFont = window._whatFont();
                console.log('[Left Toolbar] Created WhatFont object from _whatFont function (retry)');
            } catch (e) {
                console.error('[Left Toolbar] Error creating WhatFont object (retry):', e);
            }
        } else if (whatFontRetryCount < maxRetries && typeof window._whatFont === 'undefined') {
            whatFontRetryCount++;
            console.log('[Left Toolbar] Waiting for _whatFont to load, retry', whatFontRetryCount);
            setTimeout(waitForWhatFont, 200);
        }
    }
    
    // Start the retry mechanism if _whatFont isn't immediately available
    if (typeof window._whatFont === 'undefined') {
        setTimeout(waitForWhatFont, 200);
    }
    
    // Listen for storage changes to update icon theme
    try {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        if (browserAPI && browserAPI.storage && browserAPI.storage.onChanged) {
            browserAPI.storage.onChanged.addListener((changes, areaName) => {
                if (areaName === 'local' && changes.affoIconTheme && leftToolbarIframe) {
                    console.log('[Left Toolbar] Icon theme changed, updating iframe');
                    leftToolbarIframe.contentWindow.postMessage({ type: 'updateIconTheme' }, '*');
                }
            });
        }
    } catch (e) {
        console.error('[Left Toolbar] Error setting up storage listener:', e);
    }
    
})();