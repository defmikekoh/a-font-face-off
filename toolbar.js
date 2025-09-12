// A Font Face-off toolbar content script
(function() {
    'use strict';
    
    if (window.self !== window.top) return; // Skip iframes
    
    let toolbarContainer;
    let toolbarButton;
    let options = {
        enabled: true,
        width: 36, // Default 36px button width
        height: 20, // Default 20% of screen height
        transparency: 0.2, // Default 0.2 transparency
        gap: 0 // Default 0px gap from edge
    };
    
    // Remove any existing toolbar
    function removeExistingToolbar() {
        const existing = document.getElementById('affo-toolbar-container');
        if (existing) {
            console.log('[AFFO Toolbar] Removing existing toolbar element');
            existing.remove();
        } else {
            console.log('[AFFO Toolbar] No existing toolbar to remove');
        }
    }
    
    // Load options from storage via message passing
    function loadOptions(callback) {
        console.log('[AFFO Toolbar] Loading options from storage...');
        console.log('[AFFO Toolbar] window.browser:', typeof window.browser);
        console.log('[AFFO Toolbar] window.chrome:', typeof window.chrome);
        console.log('[AFFO Toolbar] window.browser.runtime:', window.browser && typeof window.browser.runtime);
        console.log('[AFFO Toolbar] window.chrome.runtime:', window.chrome && typeof window.chrome.runtime);
        
        try {
            // Try multiple approaches to get browser API
            let browserAPI = null;
            
            if (typeof browser !== 'undefined' && browser.runtime) {
                browserAPI = browser;
            } else if (window.browser && window.browser.runtime) {
                browserAPI = window.browser;
            } else if (window.chrome && window.chrome.runtime) {
                browserAPI = window.chrome;
            } else if (typeof chrome !== 'undefined' && chrome.runtime) {
                browserAPI = chrome;
            }
            
            if (!browserAPI) {
                console.error('[AFFO Toolbar] No browser API available, using defaults');
                callback();
                return;
            }
            
            console.log('[AFFO Toolbar] Using browser API:', browserAPI === browser ? 'browser' : browserAPI === chrome ? 'chrome' : 'window.browser/chrome');
            
            // Use message passing to get storage data from background script
            browserAPI.runtime.sendMessage({
                type: 'getToolbarOptions'
            }).then(function(result) {
                console.log('[AFFO Toolbar] Loaded options from storage:', result);
                if (result && typeof result === 'object') {
                    if (result.affoToolbarEnabled !== undefined) options.enabled = result.affoToolbarEnabled;
                    if (result.affoToolbarWidth !== undefined) options.width = result.affoToolbarWidth;
                    if (result.affoToolbarHeight !== undefined) options.height = result.affoToolbarHeight;
                    if (result.affoToolbarTransparency !== undefined) options.transparency = result.affoToolbarTransparency;
                    if (result.affoToolbarGap !== undefined) options.gap = result.affoToolbarGap;
                }
                console.log('[AFFO Toolbar] Final options:', options);
                callback();
            }).catch(function(e) {
                console.warn('[AFFO Toolbar] Error loading toolbar options via message:', e);
                callback();
            });
        } catch (e) {
            console.warn('[AFFO Toolbar] Error loading toolbar options:', e);
            callback();
        }
    }
    
    // Create the toolbar container
    function createToolbarContainer() {
        console.log('[AFFO Toolbar] Creating toolbar container...');
        toolbarContainer = document.createElement('div');
        toolbarContainer.id = 'affo-toolbar-container';
        
        const containerHeight = (window.innerHeight * options.height / 100);
        const topOffset = (window.innerHeight - containerHeight) * (options.height / 100); // Position based on height percentage
        
        console.log('[AFFO Toolbar] Container dimensions:', {
            height: containerHeight,
            topOffset: topOffset,
            windowHeight: window.innerHeight,
            heightPercent: options.height
        });
        
        // Apply styles directly to avoid CSP issues
        const finalOpacity = 1 - options.transparency;
        console.log('[AFFO Toolbar] Transparency calculation:', {
            optionsTransparency: options.transparency,
            finalOpacity: finalOpacity
        });
        
        const containerStyles = {
            position: 'fixed',
            top: topOffset + 'px',
            right: options.gap + 'px',
            width: options.width + 'px',
            height: containerHeight + 'px',
            zIndex: '2147483647', // Maximum z-index
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'rgba(249, 249, 251, 0.9)',
            borderRadius: '8px',
            transition: 'opacity 0.2s ease',
            opacity: finalOpacity,
            boxSizing: 'border-box'
        };
        console.log('[AFFO Toolbar] Applying container styles:', containerStyles);
        Object.assign(toolbarContainer.style, containerStyles);
        
        console.log('[AFFO Toolbar] Applied styles to container');
        
        // Hide during printing
        const mediaQuery = window.matchMedia('print');
        function handlePrint() {
            toolbarContainer.style.display = mediaQuery.matches ? 'none' : 'flex';
        }
        mediaQuery.addListener(handlePrint);
        handlePrint();
        
        if (!document.body) {
            console.error('[AFFO Toolbar] document.body not available!');
            return;
        }
        
        document.body.appendChild(toolbarContainer);
        console.log('[AFFO Toolbar] Container appended to body');
        return toolbarContainer;
    }
    
    // Create the toolbar buttons
    function createToolbarButtons() {
        // Main font face-off button
        toolbarButton = document.createElement('button');
        toolbarButton.id = 'affo-toolbar-button';
        toolbarButton.setAttribute('aria-label', 'Open A Font Face-off');
        toolbarButton.setAttribute('title', 'Open A Font Face-off');
        
        // Load the monochrome icon
        toolbarButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
                 role="img" aria-label="Hockey mask with sticks and puck" style="pointer-events: none; background: transparent;">
              <title>Hockey mask with sticks and puck</title>
              <!-- Left stick (moved outward, no crossing) -->
              <path d="M4 4 L7.5 12.5"/>
              <path d="M7.5 12.5 l-1.5 3 H4.5"/>
              <!-- Right stick (moved outward, no crossing) -->
              <path d="M20 4 L16.5 12.5"/>
              <path d="M16.5 12.5 l1.5 3 H19.5"/>
              <!-- Simple hockey mask outline -->
              <path d="M12 7c-3 0-4.5 2.1-4.5 4.2 0 3.1 2 6.2 4.5 6.7 2.5-.5 4.5-3.6 4.5-6.7C16.5 9.1 15 7 12 7Z"/>
              <!-- Eyes -->
              <circle cx="9.8" cy="10.6" r="0.9" fill="currentColor" stroke="none"/>
              <circle cx="14.2" cy="10.6" r="0.9" fill="currentColor" stroke="none"/>
              <!-- Vents -->
              <circle cx="12" cy="13.2" r="0.6" fill="currentColor" stroke="none"/>
              <circle cx="10.6" cy="13.2" r="0.6" fill="currentColor" stroke="none"/>
              <circle cx="13.4" cy="13.2" r="0.6" fill="currentColor" stroke="none"/>
              <!-- Puck -->
              <ellipse cx="12" cy="19" rx="3.0" ry="1.4" fill="currentColor" stroke="none"/>
            </svg>
        `;
        
        // Apply styles directly to avoid CSP issues  
        const buttonSize = Math.max(options.width - 8, 24); // Ensure minimum 24px button size
        Object.assign(toolbarButton.style, {
            width: buttonSize + 'px',
            height: buttonSize + 'px',
            border: 'none',
            borderRadius: '8px',
            background: 'transparent',
            color: '#2d7ef7',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            margin: '0',
            outline: 'none',
            boxShadow: 'none',
            backgroundColor: 'transparent',
            backgroundImage: 'none',
            transition: 'all 0.2s ease',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            backgroundClip: 'padding-box',
            borderImage: 'none'
        });
        
        // Add hover effects
        toolbarButton.addEventListener('mouseenter', function() {
            Object.assign(toolbarButton.style, {
                background: 'rgba(45, 126, 247, 0.1)',
                transform: 'scale(1.05)',
                boxShadow: 'none'
            });
        });
        
        toolbarButton.addEventListener('mouseleave', function() {
            Object.assign(toolbarButton.style, {
                background: 'transparent',
                transform: 'scale(1)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
            });
        });
        
        // Add long press detection for hiding toolbar
        let longPressTimer;
        let isLongPress = false;

        toolbarButton.addEventListener('mousedown', function(e) {
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                hideToolbar();
                e.preventDefault();
                e.stopPropagation();
            }, 800); // 800ms for long press
        });

        toolbarButton.addEventListener('mouseup', function() {
            clearTimeout(longPressTimer);
        });

        toolbarButton.addEventListener('mouseleave', function() {
            clearTimeout(longPressTimer);
        });

        // Add touch events for mobile
        toolbarButton.addEventListener('touchstart', function(e) {
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                hideToolbar();
                e.preventDefault();
                e.stopPropagation();
            }, 800);
        });

        toolbarButton.addEventListener('touchend', function() {
            clearTimeout(longPressTimer);
        });

        // Add click handler to open popup (only if not long press)
        toolbarButton.addEventListener('click', function(e) {
            if (!isLongPress) {
                console.log('[AFFO Toolbar] Button clicked!');
                e.preventDefault();
                e.stopPropagation();
                openExtensionPopup();
            }
        });
        
        toolbarContainer.appendChild(toolbarButton);
        
        // Font inspector button
        const fontInspectorButton = document.createElement('button');
        fontInspectorButton.id = 'affo-font-inspector-button';
        fontInspectorButton.setAttribute('aria-label', 'Inspect Font');
        fontInspectorButton.setAttribute('title', 'Click to inspect fonts on this page');
        
        // Font inspector icon (magnifying glass)
        fontInspectorButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 style="pointer-events: none; background: transparent;">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
                <text x="11" y="15" text-anchor="middle" font-size="8" fill="currentColor" stroke="none">T</text>
            </svg>
        `;
        
        // Apply styles to font inspector button
        const inspectorButtonSize = Math.max(options.width - 8, 24);
        Object.assign(fontInspectorButton.style, {
            width: inspectorButtonSize + 'px',
            height: inspectorButtonSize + 'px',
            border: 'none',
            borderRadius: '8px',
            background: 'transparent',
            color: '#2d7ef7',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            margin: '12px 0 0 0',
            outline: 'none',
            boxShadow: 'none',
            backgroundColor: 'transparent',
            backgroundImage: 'none',
            transition: 'all 0.2s ease',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            backgroundClip: 'padding-box',
            borderImage: 'none'
        });
        
        // Add hover effects to font inspector button
        fontInspectorButton.addEventListener('mouseenter', function() {
            Object.assign(fontInspectorButton.style, {
                background: 'rgba(45, 126, 247, 0.1)',
                transform: 'scale(1.05)',
                boxShadow: 'none'
            });
        });
        
        fontInspectorButton.addEventListener('mouseleave', function() {
            Object.assign(fontInspectorButton.style, {
                background: 'transparent',
                transform: 'scale(1)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
            });
        });
        
        // Add long press detection for hiding toolbar
        let fontInspectorLongPressTimer;
        let fontInspectorIsLongPress = false;

        fontInspectorButton.addEventListener('mousedown', function(e) {
            fontInspectorIsLongPress = false;
            fontInspectorLongPressTimer = setTimeout(() => {
                fontInspectorIsLongPress = true;
                hideToolbar();
                e.preventDefault();
                e.stopPropagation();
            }, 800); // 800ms for long press
        });

        fontInspectorButton.addEventListener('mouseup', function() {
            clearTimeout(fontInspectorLongPressTimer);
        });

        fontInspectorButton.addEventListener('mouseleave', function() {
            clearTimeout(fontInspectorLongPressTimer);
        });

        // Add touch events for mobile
        fontInspectorButton.addEventListener('touchstart', function(e) {
            fontInspectorIsLongPress = false;
            fontInspectorLongPressTimer = setTimeout(() => {
                fontInspectorIsLongPress = true;
                hideToolbar();
                e.preventDefault();
                e.stopPropagation();
            }, 800);
        });

        fontInspectorButton.addEventListener('touchend', function() {
            clearTimeout(fontInspectorLongPressTimer);
        });

        // Add click handler for font inspection (only if not long press)
        fontInspectorButton.addEventListener('click', function(e) {
            if (!fontInspectorIsLongPress) {
                console.log('[AFFO Toolbar] Font inspector clicked!');
                e.preventDefault();
                e.stopPropagation();
                toggleFontInspection();
            }
        });
        
        toolbarContainer.appendChild(fontInspectorButton);
        return toolbarContainer;
    }
    
    // Open the extension popup
    function openExtensionPopup() {
        console.log('[AFFO Toolbar] openExtensionPopup called');
        try {
            // Try multiple approaches to get browser API
            let browserAPI = null;
            
            if (typeof browser !== 'undefined' && browser.runtime) {
                browserAPI = browser;
                console.log('[AFFO Toolbar] Using global browser API');
            } else if (window.browser && window.browser.runtime) {
                browserAPI = window.browser;
                console.log('[AFFO Toolbar] Using window.browser API');
            } else if (window.chrome && window.chrome.runtime) {
                browserAPI = window.chrome;
                console.log('[AFFO Toolbar] Using window.chrome API');
            } else if (typeof chrome !== 'undefined' && chrome.runtime) {
                browserAPI = chrome;
                console.log('[AFFO Toolbar] Using global chrome API');
            }
            
            if (!browserAPI) {
                console.error('[AFFO Toolbar] No browser API available for opening popup');
                return;
            }
            
            // Add visual feedback
            Object.assign(toolbarButton.style, {
                background: 'rgba(45, 126, 247, 0.2)',
                transform: 'scale(0.95)'
            });
            
            setTimeout(() => {
                Object.assign(toolbarButton.style, {
                    background: 'rgba(255, 255, 255, 0.95)',
                    transform: 'scale(1)'
                });
            }, 150);
            
            // For Firefox Android, skip the popup attempt and go straight to new tab
            console.log('[AFFO Toolbar] Opening extension popup in new tab (Firefox Android)...');
            browserAPI.runtime.sendMessage({
                type: 'openPopupFallback'
            }).then(function(response) {
                console.log('[AFFO Toolbar] openPopupFallback response:', response);
                if (response && response.success) {
                    console.log('[AFFO Toolbar] Successfully opened extension in new tab');
                } else {
                    console.error('[AFFO Toolbar] Failed to open extension:', response);
                }
            }).catch(function(error) {
                console.warn('[AFFO Toolbar] Error opening extension:', error);
            });
            
        } catch (error) {
            console.error('Error opening extension popup:', error);
        }
    }
    
    // Update toolbar appearance based on options
    function updateToolbarAppearance() {
        if (!toolbarContainer || !toolbarButton) return;
        
        const containerHeight = (window.innerHeight * options.height / 100);
        const topOffset = (window.innerHeight - containerHeight) * (options.height / 100); // Position based on height percentage
        
        // Update container
        Object.assign(toolbarContainer.style, {
            top: topOffset + 'px',
            right: options.gap + 'px',
            width: options.width + 'px',
            height: containerHeight + 'px',
            background: 'rgba(249, 249, 251, 0.9)',
            opacity: 1 - options.transparency
        });
        
        // Update button
        const buttonSize = Math.max(options.width - 8, 24);
        Object.assign(toolbarButton.style, {
            width: buttonSize + 'px',
            height: buttonSize + 'px'
        });
    }
    
    // Handle window resize
    function handleResize() {
        if (toolbarContainer) {
            updateToolbarAppearance();
        }
    }
    
    // WhatFont functionality (copied from whatfont_core.js)
    let whatFontActive = false;
    let whatFontInstance = null;
    let toolbarHidden = false;
    
    function toggleFontInspection() {
        if (whatFontActive) {
            deactivateWhatFont();
        } else {
            activateWhatFont();
        }
    }
    
    function hideToolbar() {
        console.log('[AFFO Toolbar] Hiding toolbar (long press detected)');
        
        // Save current toolbar state
        toolbarHidden = true;
        
        // Remove existing toolbar
        removeExistingToolbar();
        
        // Create unhide icon like essential-buttons-toolbar does
        createUnhideIcon();
    }
    
    function createUnhideIcon() {
        // Create small unhide icon that can be clicked to restore toolbar
        const unhideIcon = document.createElement('div');
        unhideIcon.id = 'affo-unhide-icon';
        unhideIcon.setAttribute('title', 'Click to show A Font Face-off toolbar');
        unhideIcon.setAttribute('aria-label', 'Show toolbar');
        
        // Use our same hockey mask icon but smaller
        unhideIcon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
                 style="pointer-events: none; background: transparent;">
              <path d="M4 4 L7.5 12.5"/>
              <path d="M7.5 12.5 l-1.5 3 H4.5"/>
              <path d="M20 4 L16.5 12.5"/>
              <path d="M16.5 12.5 l1.5 3 H19.5"/>
              <path d="M12 7c-3 0-4.5 2.1-4.5 4.2 0 3.1 2 6.2 4.5 6.7 2.5-.5 4.5-3.6 4.5-6.7C16.5 9.1 15 7 12 7Z"/>
              <circle cx="9.8" cy="10.6" r="0.9" fill="currentColor" stroke="none"/>
              <circle cx="14.2" cy="10.6" r="0.9" fill="currentColor" stroke="none"/>
              <circle cx="12" cy="13.2" r="0.6" fill="currentColor" stroke="none"/>
              <circle cx="10.6" cy="13.2" r="0.6" fill="currentColor" stroke="none"/>
              <circle cx="13.4" cy="13.2" r="0.6" fill="currentColor" stroke="none"/>
              <ellipse cx="12" cy="19" rx="3.0" ry="1.4" fill="currentColor" stroke="none"/>
            </svg>
        `;
        
        // Style the unhide icon
        Object.assign(unhideIcon.style, {
            position: 'fixed',
            top: options.height * window.innerHeight / 100 / 2 + 10 + 'px',
            right: '10px',
            width: '32px',
            height: '32px',
            background: 'rgba(45, 126, 247, 0.9)',
            color: 'white',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: '2147483647',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            border: 'none',
            margin: '0',
            padding: '0'
        });
        
        // Add click handler to restore toolbar
        unhideIcon.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showToolbar();
        });
        
        document.body.appendChild(unhideIcon);
        console.log('[AFFO Toolbar] Unhide icon created');
    }
    
    function showToolbar() {
        console.log('[AFFO Toolbar] Showing toolbar');
        
        // Remove unhide icon
        const unhideIcon = document.getElementById('affo-unhide-icon');
        if (unhideIcon) {
            unhideIcon.remove();
        }
        
        // Restore toolbar
        toolbarHidden = false;
        initializeToolbar();
    }
    
    function activateWhatFont() {
        whatFontActive = true;
        
        // Add visual feedback to the button
        const inspectorButton = document.getElementById('affo-font-inspector-button');
        if (inspectorButton) {
            inspectorButton.style.background = 'rgba(45, 126, 247, 0.2)';
        }
        
        // Initialize whatfont
        initializeWhatFont();
        
        console.log('[AFFO Toolbar] WhatFont activated');
    }
    
    function deactivateWhatFont() {
        whatFontActive = false;
        
        // Remove visual feedback from button
        const inspectorButton = document.getElementById('affo-font-inspector-button');
        if (inspectorButton) {
            inspectorButton.style.background = 'transparent';
        }
        
        // Restore whatfont (hide UI)
        if (whatFontInstance) {
            whatFontInstance.restore();
        }
        
        console.log('[AFFO Toolbar] WhatFont deactivated');
    }
    
    function initializeWhatFont() {
        loadWhatFont();
    }
    
    function loadWhatFont() {
        // Like original WhatFont - check if jQuery is available, exit if not
        var $ = window.jQuery || window.$;
        
        if (!$) {
            console.log('[AFFO Toolbar] jQuery not available, cannot activate font inspector');
            return false;
        }
        
        console.log('[AFFO Toolbar] jQuery available, initializing WhatFont');
        initWhatFontCore();
    }
    
    function initWhatFontCore() {
        // Use the original WhatFont implementation
        var wf = _whatFont();
        
        // Set the CSS URL to our local file (like the original extension does)
        try {
            const cssUrl = (typeof browser !== 'undefined' && browser.runtime) ? 
                browser.runtime.getURL('wf.css') : 
                chrome.runtime.getURL('wf.css');
            wf.setCSSURL(cssUrl);
            console.log('[AFFO Toolbar] Set WhatFont CSS URL to:', cssUrl);
        } catch(e) {
            console.warn('[AFFO Toolbar] Could not set CSS URL:', e);
        }
        
        whatFontInstance = wf;
        
        console.log('[AFFO Toolbar] Using original WhatFont implementation');
        whatFontInstance.init();
    }
    
    
    // Initialize toolbar
    function initializeToolbar() {
        console.log('[AFFO Toolbar] Initializing toolbar with options:', options);
        
        if (!options.enabled) {
            console.log('[AFFO Toolbar] Toolbar disabled, removing any existing toolbar');
            removeExistingToolbar();
            return;
        }
        
        // If toolbar is hidden, show unhide icon instead
        if (toolbarHidden) {
            console.log('[AFFO Toolbar] Toolbar is hidden, showing unhide icon');
            removeExistingToolbar();
            createUnhideIcon();
            return;
        }
        
        console.log('[AFFO Toolbar] Toolbar enabled, creating...');
        removeExistingToolbar();
        
        try {
            createToolbarContainer();
            console.log('[AFFO Toolbar] Container created');
            createToolbarButtons();
            console.log('[AFFO Toolbar] Buttons created');
            
            // Add resize listener
            window.addEventListener('resize', handleResize);
            
            console.log('[AFFO Toolbar] Toolbar initialization complete');
        } catch (e) {
            console.error('[AFFO Toolbar] Error during initialization:', e);
        }
    }
    
    // Listen for option changes via message passing
    function listenForOptionChanges() {
        try {
            // Try multiple approaches to get browser API
            let browserAPI = null;
            
            if (typeof browser !== 'undefined' && browser.runtime) {
                browserAPI = browser;
            } else if (window.browser && window.browser.runtime) {
                browserAPI = window.browser;
            } else if (window.chrome && window.chrome.runtime) {
                browserAPI = window.chrome;
            } else if (typeof chrome !== 'undefined' && chrome.runtime) {
                browserAPI = chrome;
            }
            
            if (!browserAPI) {
                console.warn('[AFFO Toolbar] No browser API available for listening to changes');
                return;
            }
            
            // Listen for messages from background script about option changes
            browserAPI.runtime.onMessage.addListener(function(message, sender, sendResponse) {
                if (message.type === 'toolbarOptionsChanged') {
                    console.log('[AFFO Toolbar] Options changed:', message.options);
                    
                    let shouldUpdate = false;
                    
                    if (message.options.affoToolbarEnabled !== undefined) {
                        options.enabled = message.options.affoToolbarEnabled;
                        shouldUpdate = true;
                    }
                    if (message.options.affoToolbarWidth !== undefined) {
                        options.width = message.options.affoToolbarWidth;
                        shouldUpdate = true;
                    }
                    if (message.options.affoToolbarHeight !== undefined) {
                        options.height = message.options.affoToolbarHeight;
                        shouldUpdate = true;
                    }
                    if (message.options.affoToolbarTransparency !== undefined) {
                        options.transparency = message.options.affoToolbarTransparency;
                        shouldUpdate = true;
                    }
                    if (message.options.affoToolbarGap !== undefined) {
                        options.gap = message.options.affoToolbarGap;
                        shouldUpdate = true;
                    }
                    
                    if (shouldUpdate) {
                        console.log('[AFFO Toolbar] Reinitializing toolbar with new options:', options);
                        initializeToolbar();
                    }
                }
            });
        } catch (e) {
            console.warn('[AFFO Toolbar] Error setting up toolbar option listener:', e);
        }
    }
    
    // Start initialization
    function start() {
        console.log('[AFFO Toolbar] Starting toolbar initialization...');
        console.log('[AFFO Toolbar] Protocol:', location.protocol);
        console.log('[AFFO Toolbar] URL:', location.href);
        console.log('[AFFO Toolbar] Document ready state:', document.readyState);
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            console.log('[AFFO Toolbar] DOM loading, waiting for DOMContentLoaded...');
            document.addEventListener('DOMContentLoaded', function() {
                console.log('[AFFO Toolbar] DOMContentLoaded fired, loading options...');
                loadOptions(initializeToolbar);
            });
        } else {
            console.log('[AFFO Toolbar] DOM ready, loading options...');
            loadOptions(initializeToolbar);
        }
        
        // Set up option change listener
        listenForOptionChanges();
    }
    
    // Only run on http/https pages
    if (location.protocol === 'http:' || location.protocol === 'https:') {
        console.log('[AFFO Toolbar] Valid protocol, starting...');
        start();
    } else {
        console.log('[AFFO Toolbar] Invalid protocol (' + location.protocol + '), skipping toolbar');
    }
    
})();