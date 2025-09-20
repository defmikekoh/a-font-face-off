// Left toolbar content script - based on essential-buttons-toolbar approach
(function() {
    'use strict';
    
    // Prevent multiple injections
    if (window.affoLeftToolbarInjected) {
        return;
    }
    
    
    window.affoLeftToolbarInjected = true;
    
    let leftToolbarIframe = null;
    let leftToolbarHidden = false;
    let unhideIcon = null;
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
        const containerHeight = `${options.height}vh`; // Use vh units directly like essential
        const useTransformCentering = options.height < 100; // Center if not full height
        const topPosition = useTransformCentering ? `${options.position}%` : '0';
        
        // Use Essential's EXACT initial iframe styling - visible but height 0 to prevent flash
        leftToolbarIframe.style = 
            'display: block !important; height: 0; position: fixed; z-index: 2147483647; margin: 0; padding: 0; min-height: unset; max-height: unset; min-width: unset; max-width: unset; border: 0; background: transparent; color-scheme: light; border-radius: 0';
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
                    }).then(function(response) {
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
            browserAPI.runtime.onMessage.addListener(function(message, sender, sendResponse) {
                
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