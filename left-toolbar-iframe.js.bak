// Left toolbar iframe script
(function() {
    'use strict';
    
    // This script runs in the iframe context
    
    // Initialize WhatFont by sending message to parent
    function initWhatFont() {
        console.log('[Left Toolbar] Requesting WhatFont initialization from parent');
        // Send message to parent window to handle WhatFont
        parent.postMessage({ type: 'initWhatFont' }, '*');
    }
    
    // Hide toolbar
    function hideToolbar() {
        console.log('[Left Toolbar] Hiding toolbar');
        // Send message to parent window to hide toolbar
        parent.postMessage({ type: 'hideToolbar' }, '*');
    }
    
    // Close current tab
    function closeTab() {
        console.log('[Left Toolbar] Closing current tab');
        // Send message to parent window to close tab
        parent.postMessage({ type: 'closeTab' }, '*');
    }
    
    // Page up functionality
    function pageUp() {
        console.log('[Left Toolbar] Page up');
        // Send message to parent window to scroll up
        parent.postMessage({ type: 'pageUp' }, '*');
    }
    
    // Page up longpress functionality
    function pageUpLongpress() {
        console.log('[Left Toolbar] Page up longpress');
        // Send message to parent window to scroll up with longpress
        parent.postMessage({ type: 'pageUpLongpress' }, '*');
    }
    
    // Page down functionality  
    function pageDown() {
        console.log('[Left Toolbar] Page down');
        // Send message to parent window to scroll down
        parent.postMessage({ type: 'pageDown' }, '*');
    }
    
    // Page down longpress functionality  
    function pageDownLongpress() {
        console.log('[Left Toolbar] Page down longpress');
        // Send message to parent window to scroll down with longpress
        parent.postMessage({ type: 'pageDownLongpress' }, '*');
    }
    
    // Open extension popup  
    function openPopup() {
        console.log('[Left Toolbar] Requesting popup from parent with domain context');
        // Send message to parent window to handle popup opening with domain context
        parent.postMessage({ type: 'openPopup' }, '*');
    }
    
    // Show SVG based on theme (based on essential-buttons-toolbar)
    function showSVG(svgs, theme, additionalClass) {
        svgs.forEach((svg) => {
            if (
                svg.classList.contains(theme) &&
                (!additionalClass || svg.classList.contains(additionalClass))
            ) {
                svg.style.display = 'flex';
            } else {
                svg.style.display = 'none';
            }
        });
    }
    
    // Apply icon theme to all buttons
    async function applyIconTheme() {
        console.log('[Left Toolbar] Applying icon theme...');
        
        // Get icon theme setting
        let iconTheme = 'heroIcons'; // default
        try {
            const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
            const data = await browserAPI.storage.local.get(['affoIconTheme']);
            iconTheme = data.affoIconTheme || 'heroIcons';
        } catch (e) {
            console.error('[Left Toolbar] Error getting icon theme, using default:', e);
        }
        
        console.log('[Left Toolbar] Using icon theme:', iconTheme);
        
        // Apply theme to all buttons with themed icons
        const themedButtons = ['hide-toolbar-button', 'close-tab-button', 'page-up-button', 'page-down-button'];
        themedButtons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                const svgs = button.querySelectorAll('svg');
                showSVG(svgs, iconTheme);
            }
        });
    }
    
    // Initialize event listeners
    document.addEventListener('DOMContentLoaded', function() {
        const faceoffButton = document.getElementById('faceoff-button');
        const whatfontButton = document.getElementById('whatfont-button');
        const hideToolbarButton = document.getElementById('hide-toolbar-button');
        const closeTabButton = document.getElementById('close-tab-button');
        const pageUpButton = document.getElementById('page-up-button');
        const pageDownButton = document.getElementById('page-down-button');
        
        console.log('[Left Toolbar] DOM loaded, buttons found:', 
            !!faceoffButton, !!whatfontButton, !!hideToolbarButton, !!closeTabButton, !!pageUpButton, !!pageDownButton);
        
        if (!hideToolbarButton || !closeTabButton || !pageUpButton || !pageDownButton) {
            console.error('[Left Toolbar] Navigation buttons not found in DOM!');
            return;
        }
        
        // Helper function to handle button press with proper touch handling and longpress support
        function handleButtonPress(button, callback, logMessage, longPressCallback) {
            let pressTimer = null;
            let isLongPress = false;
            
            // Handle click/tap
            button.addEventListener('click', function(e) {
                e.preventDefault();
                if (!isLongPress) {
                    console.log(logMessage);
                    this.classList.add('pressed');
                    // Force blur to remove any stuck hover states on touch devices
                    this.blur();
                    setTimeout(() => {
                        this.classList.remove('pressed');
                        callback();
                    }, 100);
                }
                isLongPress = false;
            });
            
            // Handle longpress if callback provided
            if (longPressCallback) {
                button.addEventListener('mousedown', function(e) {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        console.log(logMessage + ' (longpress)');
                        this.classList.add('pressed');
                        this.blur();
                        setTimeout(() => {
                            this.classList.remove('pressed');
                            longPressCallback();
                        }, 100);
                    }, 500); // 500ms for longpress
                });
                
                button.addEventListener('mouseup', function(e) {
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                });
                
                button.addEventListener('mouseleave', function(e) {
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                    isLongPress = false;
                });
                
                // Touch events for mobile
                button.addEventListener('touchstart', function(e) {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        console.log(logMessage + ' (longpress)');
                        this.classList.add('pressed');
                        this.blur();
                        setTimeout(() => {
                            this.classList.remove('pressed');
                            longPressCallback();
                        }, 100);
                    }, 500);
                });
                
                button.addEventListener('touchend', function(e) {
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                });
                
                button.addEventListener('touchcancel', function(e) {
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                    isLongPress = false;
                });
            }
        }

        // Add click handlers with pressed animation like essential-buttons-toolbar
        if (faceoffButton) {
            handleButtonPress(faceoffButton, openPopup, '[Left Toolbar] Face-off button clicked');
        }
        
        if (whatfontButton) {
            handleButtonPress(whatfontButton, initWhatFont, '[Left Toolbar] WhatFont button clicked');
        }
        
        handleButtonPress(hideToolbarButton, hideToolbar, '[Left Toolbar] Hide toolbar button clicked');
        handleButtonPress(closeTabButton, closeTab, '[Left Toolbar] Close tab button clicked');
        handleButtonPress(pageUpButton, pageUp, '[Left Toolbar] Page up button clicked', pageUpLongpress);
        handleButtonPress(pageDownButton, pageDown, '[Left Toolbar] Page down button clicked', pageDownLongpress);
        
        // Set button sizes to scale with container width (like essential-buttons-toolbar)  
        const containerWidth = window.innerWidth;
        const buttonSize = Math.max(containerWidth - 4, 20); // Leave 2px margin each side, min 20px
        
        // Apply sizing to all buttons (including new faceoff, whatfont, and hide toolbar buttons)
        const allButtons = [faceoffButton, whatfontButton, hideToolbarButton, closeTabButton, pageUpButton, pageDownButton].filter(btn => btn);
        
        allButtons.forEach(button => {
            button.style.width = buttonSize + 'px';
            button.style.height = buttonSize + 'px';
            button.style.minWidth = buttonSize + 'px';
            button.style.minHeight = buttonSize + 'px';
            
            // Also scale the SVG icons proportionally
            const svg = button.querySelector('svg');
            if (svg) {
                const iconSize = Math.floor(buttonSize * 0.6); // 60% of button size like our CSS
                svg.style.width = iconSize + 'px';
                svg.style.height = iconSize + 'px';
            }
        });
        
        console.log('[Left Toolbar] Button and icon sizing details:', {
            'iframe window.innerWidth': window.innerWidth,
            'calculated buttonSize': buttonSize,
            'calculated iconSize': Math.floor(buttonSize * 0.6),
            'containerWidth - 4': containerWidth - 4
        });
        
        // Also log actual computed button dimensions
        setTimeout(() => {
            const computedStyle = getComputedStyle(closeTabButton);
            console.log('[Left Toolbar] Actual button computed dimensions:', {
                'computed width': computedStyle.width,
                'computed height': computedStyle.height,
                'computed margin': computedStyle.margin,
                'computed padding': computedStyle.padding
            });
        }, 100);
        
        // Apply icon theme after everything is set up
        applyIconTheme();
        
        console.log('[Left Toolbar] Left toolbar iframe initialized');
    });
    
    // Apply transparency to the entire body like essential-buttons-toolbar
    function applyTransparency(transparency) {
        document.body.style.opacity = transparency;
        console.log('[Left Toolbar] Applied transparency to entire body:', transparency);
    }
    
    // Listen for messages from parent window
    window.addEventListener('message', function(event) {
        if (event.data.type === 'updateStyles') {
            const styles = event.data.styles;
            applyTransparency(styles.transparency);
        } else if (event.data.type === 'updateIconTheme') {
            applyIconTheme();
        }
    });
    
    // Apply default transparency on load (will be overridden by parent)
    document.addEventListener('DOMContentLoaded', function() {
        console.log('[Left Toolbar] Initial background color:', getComputedStyle(document.body).backgroundColor);
        // Don't apply default transparency here - wait for parent to send the setting
        console.log('[Left Toolbar] Waiting for transparency setting from parent...');
    });
    
})();