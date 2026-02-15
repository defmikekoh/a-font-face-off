// Left toolbar iframe script
(function() {
    'use strict';
    
    // This script runs in the iframe context
    
    // Initialize WhatFont by sending message to parent
    function initWhatFont() {
        // Send message to parent window to handle WhatFont
        parent.postMessage({ type: 'initWhatFont' }, '*');
    }
    
    // Hide toolbar
    function hideToolbar() {
        // Send message to parent window to hide toolbar
        parent.postMessage({ type: 'hideToolbar' }, '*');
    }
    
    // Close current tab
    function closeTab() {
        // Send message to parent window to close tab
        parent.postMessage({ type: 'closeTab' }, '*');
    }
    
    // Page up functionality
    function pageUp() {
        // Send message to parent window to scroll up
        parent.postMessage({ type: 'pageUp' }, '*');
    }
    
    // Page up longpress functionality
    function pageUpLongpress() {
        // Send message to parent window to scroll up with longpress
        parent.postMessage({ type: 'pageUpLongpress' }, '*');
    }
    
    // Page down functionality  
    function pageDown() {
        // Send message to parent window to scroll down
        parent.postMessage({ type: 'pageDown' }, '*');
    }
    
    // Page down longpress functionality  
    function pageDownLongpress() {
        // Send message to parent window to scroll down with longpress
        parent.postMessage({ type: 'pageDownLongpress' }, '*');
    }
    
    // Open extension popup  
    function openPopup() {
        // Send message to parent window to handle popup opening with domain context
        parent.postMessage({ type: 'openPopup' }, '*');
    }

    // Show SVG based on theme (exactly like Essential)
    function showSVG(svgs, theme, additionalClass) {
        svgs.forEach((svg) => {
            if (
                svg.classList.contains(theme) &&
                (!additionalClass || svg.classList.contains(additionalClass))
            ) {
                svg.style.display = 'block';
            } else {
                svg.style.display = 'none';
            }
        });
    }
    
    // Apply icon theme to all buttons
    async function applyIconTheme() {
        // Get icon theme setting
        let iconTheme = 'heroIcons'; // default
        try {
            const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
            const data = await browserAPI.storage.local.get(['affoIconTheme']);
            iconTheme = data.affoIconTheme || 'heroIcons';
        } catch (e) {
            console.error('[Left Toolbar] Error getting icon theme, using default:', e);
        }
        
        // Apply theme to all buttons with themed icons
        const themedButtons = ['faceoff-button', 'whatfont-button', 'hide-toolbar-button', 'close-tab-button', 'page-up-button', 'page-down-button'];
        themedButtons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                const svgs = button.querySelectorAll('svg');
                showSVG(svgs, iconTheme);
            }
        });
    }

    // Show quick-pick menu (signal parent to show it)
    function showQuickPickMenu() {
        parent.postMessage({ type: 'showQuickPickMenu' }, '*');
    }

    // Initialize event listeners - EXACTLY like Essential
    document.addEventListener('DOMContentLoaded', function() {
        // Get Essential-style divs
        const toolbarDiv = document.getElementById('toolbar');
        const menuDiv = document.getElementById('menu');
        
        if (!toolbarDiv || !menuDiv) {
            console.error('[Left Toolbar] Toolbar divs not found!');
            return;
        }
        
        // Set up toolbar as vertical like Essential does for left position
        toolbarDiv.classList.add('vertical');
        menuDiv.classList.add('vertical');
        toolbarDiv.style.width = '100%';
        menuDiv.style.width = '50%';
        toolbarDiv.style.left = '0';
        menuDiv.style.right = '0';
        
        // Show all our buttons in toolbar div like Essential does
        const buttons = [
            'faceoff-button',
            'whatfont-button', 
            'hide-toolbar-button',
            'close-tab-button',
            'page-up-button',
            'page-down-button'
        ];
        
        buttons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.style.display = 'flex';
                button.style.width = '100%';
                button.style.alignItems = 'center';
                button.style.justifyContent = 'center';
                toolbarDiv.appendChild(button);
            }
        });
        
        // Get button references after they're moved to toolbar
        const faceoffButton = document.getElementById('faceoff-button');
        const whatfontButton = document.getElementById('whatfont-button');
        const hideToolbarButton = document.getElementById('hide-toolbar-button');
        const closeTabButton = document.getElementById('close-tab-button');
        const pageUpButton = document.getElementById('page-up-button');
        const pageDownButton = document.getElementById('page-down-button');
        
        // Helper function to handle button press with proper touch handling and longpress support
        function handleButtonPress(button, callback, logMessage, longPressCallback) {
            let pressTimer = null;
            let isLongPress = false;
            
            // Handle click/tap
            button.addEventListener('click', function(e) {
                e.preventDefault();
                if (!isLongPress) {
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
                button.addEventListener('mousedown', function(_e) {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        this.classList.add('pressed');
                        this.blur();
                        setTimeout(() => {
                            this.classList.remove('pressed');
                            longPressCallback();
                        }, 100);
                    }, 500); // 500ms for longpress
                });

                button.addEventListener('mouseup', function(_e) {
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                });

                button.addEventListener('mouseleave', function(_e) {
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                    isLongPress = false;
                });

                // Touch events for mobile
                button.addEventListener('touchstart', function(_e) {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        this.classList.add('pressed');
                        this.blur();
                        setTimeout(() => {
                            this.classList.remove('pressed');
                            longPressCallback();
                        }, 100);
                    }, 500);
                });

                button.addEventListener('touchend', function(_e) {
                    if (pressTimer) {
                        clearTimeout(pressTimer);
                        pressTimer = null;
                    }
                });

                button.addEventListener('touchcancel', function(_e) {
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
            handleButtonPress(
                faceoffButton,
                showQuickPickMenu,  // Short click → show menu
                '[Left Toolbar] Face-off button clicked',
                openPopup  // Long press → open popup
            );
        }
        
        if (whatfontButton) {
            handleButtonPress(whatfontButton, initWhatFont, '[Left Toolbar] WhatFont button clicked');
        }
        
        handleButtonPress(hideToolbarButton, hideToolbar, '[Left Toolbar] Hide toolbar button clicked');
        handleButtonPress(closeTabButton, closeTab, '[Left Toolbar] Close tab button clicked');
        handleButtonPress(pageUpButton, pageUp, '[Left Toolbar] Page up button clicked', pageUpLongpress);
        handleButtonPress(pageDownButton, pageDown, '[Left Toolbar] Page down button clicked', pageDownLongpress);
        
        // Essential uses CSS-only sizing - no JavaScript button sizing needed
        // Let CSS aspect-ratio and iframe width handle all sizing automatically
        
        // Apply icon theme after everything is set up
        applyIconTheme();
        
    });
    
    // Apply transparency to the entire body like essential-buttons-toolbar
    function applyTransparency(transparency) {
        document.body.style.opacity = transparency;
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
        // Don't apply default transparency here - wait for parent to send the setting
    });
    
})();
