// View mode: 'body-contact', 'faceoff', or 'third-man-in' (facade mode removed)
let currentViewMode = 'body-contact';

// Panel state tracking across mode switches
const panelStates = {
    'faceoff': { top: false, bottom: false },
    'body-contact': { body: false },
    'third-man-in': { serif: false, sans: false, mono: false }
};

function getPanelLabel(position) {
    if (position === 'body') return 'Body';
    if (position === 'serif') return 'Serif';
    if (position === 'sans') return 'Sans';
    if (position === 'mono') return 'Mono';
    return position === 'top' ? 'Top Font' : 'Bottom Font';
}

function applyViewMode(forceView) {
    if (forceView) currentViewMode = forceView;
    try { localStorage.setItem('fontFaceoffView', currentViewMode); } catch (_) {}
    // Toggle body classes so CSS can react
    try {
        document.body.classList.toggle('view-faceoff', currentViewMode === 'faceoff');
        document.body.classList.toggle('view-body-contact', currentViewMode === 'body-contact');
        document.body.classList.toggle('view-third-man-in', currentViewMode === 'third-man-in');
    } catch (_) {}
    // Update control panel headings
    const topH2 = document.querySelector('#top-font-controls h2');
    const botH2 = document.querySelector('#bottom-font-controls h2');
    if (topH2) topH2.textContent = getPanelLabel('top');
    if (botH2) botH2.textContent = getPanelLabel('bottom');
    // Update grip labels
    const topGripLabel = document.querySelector('#top-font-grip .grip-label');
    const botGripLabel = document.querySelector('#bottom-font-grip .grip-label');
    if (topGripLabel) topGripLabel.textContent = getPanelLabel('top');
    if (botGripLabel) botGripLabel.textContent = getPanelLabel('bottom');
    // Reset button visibility: only meaningful in Facade view
    try {
        const rt = document.getElementById('reset-top');
        const rb = document.getElementById('reset-bottom');
        if (currentViewMode === 'faceoff') {
            if (rt) rt.style.display = 'none';
            if (rb) rb.style.display = 'none';
            // Ensure family is never unset in Faceoff: clear any 'Default' placeholders
            const fixFamily = (position, fallback) => {
                const disp = document.getElementById(`${position}-font-display`);
                const sel = document.getElementById(`${position}-font-select`);
                const heading = document.getElementById(`${position}-font-name`);
                const group = disp && disp.closest('.control-group');
                const txt = (disp && String(disp.textContent).trim().toLowerCase()) || '';
                if (disp && (disp.classList.contains('placeholder') || txt === 'default')) {
                    const name = (sel && sel.value) || (heading && heading.textContent && heading.textContent.toLowerCase() !== 'default' ? heading.textContent : fallback);
                    disp.textContent = name;
                    disp.classList.remove('placeholder');
                    if (group) group.classList.remove('unset');
                    if (heading) heading.textContent = name;
                }
            };
            fixFamily('top', 'Roboto Flex');
            fixFamily('bottom', 'Rubik');
        } else {
            try { syncApplyButtonsForOrigin(); } catch (_) {}
            if (currentViewMode === 'third-man-in') {
                try { syncThirdManInButtons(); } catch (_) {}
            }
        }
    } catch (_) {}
    // Load settings for the current mode
    loadModeSettings();
}

// Load settings for the current view mode
function loadModeSettings() {
    console.log('loadModeSettings called, currentViewMode:', currentViewMode);
    console.log('extensionState:', extensionState);
    const modeState = extensionState ? extensionState[currentViewMode] : null;
    console.log('modeState:', modeState);
    
    // Safety check - ensure modeState exists
    if (!modeState) {
        console.error('modeState is undefined for currentViewMode:', currentViewMode);
        console.log('Available modes in extensionState:', extensionState ? Object.keys(extensionState) : 'extensionState is null');
        return;
    }
    
    if (currentViewMode === 'body-contact') {
        console.log('In body-contact mode, modeState.bodyFont:', modeState?.bodyFont);
        // Body Contact mode - CHECK DOMAIN FIRST, then localStorage fallback
        (async () => {
            try {
                const origin = await getActiveOrigin();
                if (origin) {
                    const data = await browser.storage.local.get('affoApplyMap');
                    const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
                    const entry = map[origin];
                    if (entry && entry.body) {
                        // Domain has applied settings - use those (ignore localStorage)
                        console.log('DOMAIN-FIRST: Found applied body state for origin:', origin, entry.body);
                        const config = buildConfigFromPayload('body', entry.body);
                        console.log('Built config:', config);
                        await applyFontConfig('body', config);
                        
                        // Update button state to reflect that font matches applied state
                        console.log('About to update button after loading applied body state');
                        await updateBodyButtons();
                        return;
                    } else {
                        console.log('DOMAIN-FIRST: No applied body state found for origin:', origin, 'entry:', entry);
                    }
                }
                
                // Fallback: No domain-specific settings, use localStorage if available
                if (modeState && modeState.bodyFont && (modeState.bodyFont.fontName || modeState.bodyFont.activeControls?.length > 0)) {
                    console.log('LOCALSTORAGE FALLBACK: Loading from localStorage fallback:', modeState.bodyFont);
                    applyFontConfig('body', modeState.bodyFont);
                } else {
                    console.log('No settings found - using defaults');
                }
            } catch (error) {
                console.warn('Error loading applied body state:', error);
                
                // Default unset state - no font loaded, all controls inactive
                const fontDisplay = document.getElementById('body-font-display');
                const fontNameElement = document.getElementById('body-font-name');
                if (fontDisplay) {
                    fontDisplay.textContent = 'Default';
                    fontDisplay.classList.add('placeholder');
                }
                if (fontNameElement) {
                    fontNameElement.textContent = 'Default';
                }
                
                // Ensure ALL controls are in unset state
                const controlGroups = document.querySelectorAll('#body-font-controls .control-group');
                controlGroups.forEach(group => {
                    group.classList.add('unset');
                });
                
                // Update buttons after setting default state
                updateBodyButtons();
            }
        })();
    } else if (currentViewMode === 'third-man-in') {
        // Third Man In mode - load applied fonts from domain storage
        setTimeout(async () => {
            try {
                console.log('Third Man In mode: Loading applied fonts for domain');
                
                const origin = await getActiveOrigin();
                if (origin) {
                    // Check what's actually applied to this domain
                    const thirdManData = await getApplyMapForOrigin(origin, 'third-man-in');
                    console.log('Third Man In loadModeSettings: Full thirdManData:', thirdManData);
                    
                    // Load applied fonts (if any exist) and re-apply CSS
                    if (thirdManData && thirdManData.serif) {
                        console.log('Loading applied serif font:', thirdManData.serif);
                        
                        // Directly load the font and update UI elements
                        if (thirdManData.serif.fontName) {
                            console.log('Loading font directly:', thirdManData.serif.fontName);
                            loadFont('serif', thirdManData.serif.fontName, { suppressImmediateApply: true, suppressImmediateSave: true });
                            
                            // Also directly update the font display elements to ensure they show correctly
                            setTimeout(() => {
                                const fontDisplay = document.getElementById('serif-font-display');
                                const fontNameElement = document.getElementById('serif-font-name');
                                if (fontDisplay) {
                                    fontDisplay.textContent = thirdManData.serif.fontName;
                                    fontDisplay.classList.remove('placeholder');
                                }
                                if (fontNameElement) {
                                    fontNameElement.textContent = thirdManData.serif.fontName;
                                }
                            }, 100);
                        }
                        
                        // Re-apply CSS with font loading detection
                        setTimeout(() => reapplyThirdManInCSS('serif', thirdManData.serif), 500);
                    }
                    if (thirdManData && thirdManData.sans) {
                        console.log('Loading applied sans font:', thirdManData.sans);
                        
                        // Directly load the font and update UI elements
                        if (thirdManData.sans.fontName) {
                            console.log('Loading font directly:', thirdManData.sans.fontName);
                            loadFont('sans', thirdManData.sans.fontName, { suppressImmediateApply: true, suppressImmediateSave: true });
                            
                            // Also directly update the font display elements to ensure they show correctly
                            setTimeout(() => {
                                console.log('Updating sans font display elements with:', thirdManData.sans.fontName);
                                const fontDisplay = document.getElementById('sans-font-display');
                                const fontNameElement = document.getElementById('sans-font-name');
                                console.log('Found elements - fontDisplay:', !!fontDisplay, 'fontNameElement:', !!fontNameElement);
                                
                                if (fontDisplay) {
                                    console.log('Setting fontDisplay.textContent to:', thirdManData.sans.fontName);
                                    fontDisplay.textContent = thirdManData.sans.fontName;
                                    fontDisplay.classList.remove('placeholder');
                                    console.log('After setting - fontDisplay.textContent:', fontDisplay.textContent);
                                }
                                if (fontNameElement) {
                                    console.log('Setting fontNameElement.textContent to:', thirdManData.sans.fontName);
                                    fontNameElement.textContent = thirdManData.sans.fontName;
                                    console.log('After setting - fontNameElement.textContent:', fontNameElement.textContent);
                                }
                            }, 100);
                        }
                        
                        // Re-apply CSS with font loading detection
                        setTimeout(() => reapplyThirdManInCSS('sans', thirdManData.sans), 500);
                    }
                    if (thirdManData && thirdManData.mono) {
                        console.log('Loading applied mono font:', thirdManData.mono);
                        
                        // Directly load the font and update UI elements
                        if (thirdManData.mono.fontName) {
                            console.log('Loading font directly:', thirdManData.mono.fontName);
                            loadFont('mono', thirdManData.mono.fontName, { suppressImmediateApply: true, suppressImmediateSave: true });
                            
                            // Also directly update the font display elements to ensure they show correctly
                            setTimeout(() => {
                                const fontDisplay = document.getElementById('mono-font-display');
                                const fontNameElement = document.getElementById('mono-font-name');
                                if (fontDisplay) {
                                    fontDisplay.textContent = thirdManData.mono.fontName;
                                    fontDisplay.classList.remove('placeholder');
                                }
                                if (fontNameElement) {
                                    fontNameElement.textContent = thirdManData.mono.fontName;
                                }
                            }, 100);
                        }
                        
                        // Re-apply CSS with font loading detection
                        setTimeout(() => reapplyThirdManInCSS('mono', thirdManData.mono), 500);
                    }
                }
                
                // Update Apply/Reset button states after loading
                setTimeout(async () => {
                    await updateThirdManInButtons('serif');
                    await updateThirdManInButtons('sans');  
                    await updateThirdManInButtons('mono');
                }, 100);
            } catch (e) {
                console.warn('Failed to load applied Third Man In fonts:', e);
                // Fallback to defaults if loading fails
                ['serif', 'sans', 'mono'].forEach(type => {
                    const fontDisplay = document.getElementById(`${type}-font-display`);
                    const fontNameElement = document.getElementById(`${type}-font-name`);
                    if (fontDisplay) {
                        fontDisplay.textContent = type.charAt(0).toUpperCase() + type.slice(1);
                        fontDisplay.classList.add('placeholder');
                    }
                    if (fontNameElement) {
                        fontNameElement.textContent = type.charAt(0).toUpperCase() + type.slice(1);
                    }
                });
            }
        }, 50);
    } else if (currentViewMode === 'faceoff') {
        // Face-off mode (existing behavior)
        // Load top font - face-off mode always needs a font family
        if (modeState.topFont && modeState.topFont.fontName) {
            setTimeout(() => {
                applyFontConfig('top', modeState.topFont);
            }, 50);
        } else if (modeState.topFont && modeState.topFont.activeControls?.length > 0) {
            // Has saved settings but no custom font - load default font then apply settings
            loadFont('top', 'ABeeZee');
            setTimeout(() => {
                applyFontConfig('top', { ...modeState.topFont, fontName: 'ABeeZee' });
            }, 50);
        } else {
            // Use default font for this mode
            loadFont('top', 'ABeeZee');
        }
        
        // Load bottom font - face-off mode always needs a font family
        if (modeState.bottomFont && modeState.bottomFont.fontName) {
            setTimeout(() => {
                applyFontConfig('bottom', modeState.bottomFont);
            }, 50);
        } else if (modeState.bottomFont && modeState.bottomFont.activeControls?.length > 0) {
            // Has saved settings but no custom font - load default font then apply settings
            loadFont('bottom', 'Zilla Slab Highlight');
            setTimeout(() => {
                applyFontConfig('bottom', { ...modeState.bottomFont, fontName: 'Zilla Slab Highlight' });
            }, 50);
        } else {
            // Use default font for this mode
            loadFont('bottom', 'Zilla Slab Highlight');
        }
    }
    // Note: Other modes like 'body-contact' and 'third-man-in' are handled above
}

// Helper: get current active tab's origin without requiring 'tabs' permission
async function getActiveOrigin() {
    try {
        const res = await browser.tabs.executeScript({ code: 'location.origin' });
        if (Array.isArray(res) && res.length) return String(res[0]);
    } catch (_) {}
    return null;
}

// Reset face-off for a panel: remove stored per-origin data, remove injected CSS, and unset controls (keep family)
async function resetFaceoffFor(position) {
    try {
        const genericKey = (position === 'top') ? 'serif' : 'sans';
        const origin = await getActiveOrigin();
        // Remove injected CSS (immediate apply) if present
        try {
            if (appliedCssActive && appliedCssActive[genericKey]) {
                await browser.tabs.removeCSS({ code: appliedCssActive[genericKey] });
                appliedCssActive[genericKey] = null;
            }
            const styleIdOff = 'a-font-face-off-style-' + (genericKey === 'serif' ? 'serif' : 'sans');
            const linkIdOff = styleIdOff + '-link';
            await browser.tabs.executeScript({ code: `
                (function(){
                    try{ var s=document.getElementById('${styleIdOff}'); if(s) s.remove(); }catch(_){}
                    try{ var l=document.getElementById('${linkIdOff}'); if(l) l.remove(); }catch(_){}
                })();
            `});
        } catch (_) {}
        // Remove stored persistence for this origin/role
        if (origin) {
            try {
                const data = await browser.storage.local.get('affoApplyMapV2');
                const applyMap = (data && data.affoApplyMapV2) ? data.affoApplyMapV2 : {};
                if (applyMap[origin]) {
                    delete applyMap[origin][genericKey];
                    if (!applyMap[origin].serif && !applyMap[origin].sans) delete applyMap[origin];
                }
                await browser.storage.local.set({ affoApplyMapV2: applyMap });
            } catch (_) {}
        }
        // Unset controls (keep family) - face-off mode only supports top/bottom
        if (position === 'top') {
            resetTopFont();
        } else if (position === 'bottom') {
            resetBottomFont();
        }
        // Reflect buttons
        try { await syncApplyButtonsForOrigin(); } catch (_) {}
        if (currentViewMode === 'third-man-in') {
            try { await syncThirdManInButtons(); } catch (_) {}
        }
    } catch (_) {}
}

// Dynamic font axis cache populated from Google Fonts metadata + CSS parsing
// Track last applied CSS for the active tab to avoid 'tabs' permission
const appliedCssActive = { serif: null, sans: null, mono: null, body: null };
const dynamicFontDefinitions = {};

// Re-apply Third Man In CSS when popup reopens (since context is reset)
async function reapplyThirdManInCSS(fontType, fontConfig) {
    try {
        console.log(`reapplyThirdManInCSS: Re-applying ${fontType} font`, fontConfig);
        console.trace(`reapplyThirdManInCSS: Call stack for ${fontType}`);
        
        // Wait for font to be loaded if it's a Google Font
        if (fontConfig.fontName && fontConfig.fontName !== 'Default') {
            console.log(`reapplyThirdManInCSS: Waiting for font ${fontConfig.fontName} to load`);
            // Check if font is loaded by testing if it renders differently than fallback
            const fontCheckScript = `
                (function() {
                    try {
                        const testText = 'BESbswy';
                        const testSize = '72px';
                        const fallbackFont = 'monospace';
                        const targetFont = '${fontConfig.fontName}';
                        
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        
                        context.font = testSize + ' ' + fallbackFont;
                        const fallbackWidth = context.measureText(testText).width;
                        
                        context.font = testSize + ' ' + targetFont + ', ' + fallbackFont;
                        const targetWidth = context.measureText(testText).width;
                        
                        const loaded = Math.abs(targetWidth - fallbackWidth) > 1;
                        console.log('Font check:', targetFont, 'loaded:', loaded, 'fallback:', fallbackWidth, 'target:', targetWidth);
                        return loaded;
                    } catch(e) {
                        console.warn('Font check failed:', e);
                        return true; // Assume loaded on error
                    }
                })();
            `;
            
            // Try up to 5 times with 200ms intervals
            let fontLoaded = false;
            for (let i = 0; i < 5 && !fontLoaded; i++) {
                try {
                    const result = await browser.tabs.executeScript({ code: fontCheckScript });
                    fontLoaded = result && result[0];
                    if (!fontLoaded) {
                        console.log(`reapplyThirdManInCSS: Font not ready, waiting... (attempt ${i+1}/5)`);
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                } catch (e) {
                    console.warn(`reapplyThirdManInCSS: Font check failed:`, e);
                    fontLoaded = true; // Proceed anyway
                    break;
                }
            }
        }
        
        // First, run DOM walker to re-mark elements
        try {
            const walkerScript = generateElementWalkerScript(fontType);
            console.log(`reapplyThirdManInCSS: Running walker script for ${fontType}`);
            await browser.tabs.executeScript({ code: walkerScript });
        } catch (e) {
            console.warn(`reapplyThirdManInCSS: Walker script failed for ${fontType}:`, e);
        }
        
        // Then generate and apply CSS
        const cssCode = generateThirdManInCSS(fontType, fontConfig);
        if (cssCode) {
            console.log(`reapplyThirdManInCSS: Generated CSS for ${fontType}:`, cssCode);
            await browser.tabs.insertCSS({ code: cssCode });
            appliedCssActive[fontType] = cssCode;
            
            // Verify the CSS was applied with comprehensive debugging
            setTimeout(() => {
                try {
                    browser.tabs.executeScript({
                        code: `
                            console.log('=== CSS VERIFICATION START ===');
                            console.log('CSS verification: Elements with ${fontType} marker:', document.querySelectorAll('[data-affo-font-type="${fontType}"]').length);
                            
                            const elements = document.querySelectorAll('[data-affo-font-type="${fontType}"]');
                            if (elements.length > 0) {
                                const firstEl = elements[0];
                                const style = getComputedStyle(firstEl);
                                console.log('CSS verification: First element tag:', firstEl.tagName);
                                console.log('CSS verification: First element font-family:', style.fontFamily);
                                console.log('CSS verification: First element text content (first 50 chars):', firstEl.textContent.slice(0, 50));
                                
                                // Check if there are any CSS rules targeting this element
                                const matchedRules = [];
                                for (let sheet of document.styleSheets) {
                                    try {
                                        for (let rule of sheet.cssRules || sheet.rules || []) {
                                            if (rule.selectorText && rule.selectorText.includes('data-affo-font-type')) {
                                                matchedRules.push(rule.cssText);
                                            }
                                        }
                                    } catch (e) {
                                        console.log('Could not read stylesheet:', sheet.href, e.message);
                                    }
                                }
                                console.log('CSS verification: Found font-type rules:', matchedRules.length, matchedRules);
                                
                                // Check if the font is actually loaded
                                if (document.fonts && document.fonts.check) {
                                    const fontName = '${fontConfig.fontName}';
                                    const isLoaded = document.fonts.check('16px ' + fontName);
                                    console.log('CSS verification: Font loading status for', fontName, ':', isLoaded);
                                }
                            } else {
                                console.warn('CSS verification: No elements found with data-affo-font-type="${fontType}"');
                                // Check if walker ran at all
                                const allMarked = document.querySelectorAll('[data-affo-font-type]');
                                console.log('CSS verification: Total elements with any font-type marker:', allMarked.length);
                            }
                            console.log('=== CSS VERIFICATION END ===');
                        `
                    });
                } catch (e) {
                    console.warn('CSS verification failed:', e);
                }
            }, 500);
        }
    } catch (e) {
        console.warn(`reapplyThirdManInCSS: Failed to re-apply CSS for ${fontType}:`, e);
    }
}

// Font definitions from YAML data (fallbacks for known families)
const fontDefinitions = {
    "Roboto Flex": {
        axes: ["opsz", "slnt", "wght", "wdth", "YTAS", "XTRA", "YTDE", "YTFI", "GRAD", "YTLC", "XOPQ", "YOPQ", "YTUC"],
        defaults: { opsz: 14, slnt: 0, wght: 400, wdth: 100, YTAS: 750, XTRA: 468, YTDE: -203, YTFI: 738, GRAD: 0, YTLC: 514, XOPQ: 96, YOPQ: 79, YTUC: 712 },
        ranges: { opsz: [8, 144], slnt: [-10, 0], wght: [100, 1000], wdth: [25, 151], YTAS: [649, 854], XTRA: [323, 603], YTDE: [-305, -98], YTFI: [560, 788], GRAD: [-200, 150], YTLC: [416, 570], XOPQ: [27, 175], YOPQ: [25, 135], YTUC: [528, 760] },
        steps: { opsz: 0.1, slnt: 1, wght: 1, wdth: 0.1, YTAS: 1, XTRA: 1, YTDE: 1, YTFI: 1, GRAD: 1, YTLC: 1, XOPQ: 1, YOPQ: 1, YTUC: 1 }
    },
    "Rubik": {
        axes: ["ital", "wght"],
        defaults: { ital: 0, wght: 400 },
        ranges: { ital: [0, 1], wght: [300, 900] },
        steps: { ital: 1, wght: 1 }
    },
    "Inter": {
        axes: ["ital", "opsz", "wght"],
        defaults: { ital: 0, opsz: 14, wght: 400 },
        ranges: { ital: [0, 1], opsz: [14, 32], wght: [100, 900] },
        steps: { ital: 1, opsz: 0.1, wght: 1 }
    },
    "Open Sans": {
        axes: ["ital", "wdth", "wght"],
        defaults: { ital: 0, wdth: 100, wght: 400 },
        ranges: { ital: [0, 1], wdth: [75, 100], wght: [300, 800] },
        steps: { ital: 1, wdth: 0.1, wght: 1 }
    },
    "Recursive": {
        axes: ["slnt", "wght", "CASL", "CRSV", "MONO"],
        defaults: { slnt: 0, wght: 400, CASL: 0, CRSV: 0.5, MONO: 0 },
        ranges: { slnt: [-15, 0], wght: [300, 1000], CASL: [0, 1], CRSV: [0, 1], MONO: [0, 1] },
        steps: { slnt: 1, wght: 1, CASL: 0.01, CRSV: 0.1, MONO: 0.01 }
    },
    "Fraunces": {
        axes: ["ital", "opsz", "wght", "SOFT", "WONK"],
        defaults: { ital: 0, opsz: 14, wght: 400, SOFT: 0, WONK: 0 },
        ranges: { ital: [0, 1], opsz: [9, 144], wght: [100, 900], SOFT: [0, 100], WONK: [0, 1] },
        steps: { ital: 1, opsz: 0.1, wght: 1, SOFT: 0.1, WONK: 1 }
    },
    "DM Sans": {
        axes: ["ital", "opsz", "wght"],
        defaults: { ital: 0, opsz: 14, wght: 400 },
        ranges: { ital: [0, 1], opsz: [9, 40], wght: [100, 1000] },
        steps: { ital: 1, opsz: 0.1, wght: 1 }
    },
    "Outfit": {
        axes: ["wght"],
        defaults: { wght: 400 },
        ranges: { wght: [100, 900] },
        steps: { wght: 1 }
    },
    "Nunito Sans": {
        axes: ["ital", "opsz", "wdth", "wght", "YTLC"],
        defaults: { ital: 0, opsz: 12, wdth: 100, wght: 400, YTLC: 500 },
        ranges: { ital: [0, 1], opsz: [6, 12], wdth: [75, 125], wght: [200, 1000], YTLC: [440, 540] },
        steps: { ital: 1, opsz: 0.1, wdth: 0.1, wght: 1, YTLC: 1 }
    },
    "Source Sans 3": {
        axes: ["ital", "wght"],
        defaults: { ital: 0, wght: 400 },
        ranges: { ital: [0, 1], wght: [200, 900] },
        steps: { ital: 1, wght: 1 }
    },
    "Crimson Pro": {
        axes: ["ital", "wght"],
        defaults: { ital: 0, wght: 400 },
        ranges: { ital: [0, 1], wght: [200, 900] },
        steps: { ital: 1, wght: 1 }
    },
    "BBC Reith Serif": {
        axes: [],
        defaults: {},
        ranges: {},
        steps: {}
    },
    "ABC Ginto Normal Unlicensed Trial": {
        axes: [],
        defaults: {},
        ranges: {},
        steps: {}
    },
    "Merriweather": {
        axes: ["ital", "opsz", "wdth", "wght"],
        defaults: { ital: 0, opsz: 18, wdth: 100, wght: 400 },
        ranges: { ital: [0, 1], opsz: [18, 144], wdth: [87, 112], wght: [300, 900] },
        steps: { ital: 1, opsz: 0.1, wdth: 0.1, wght: 1 }
    },
    "Lora": {
        axes: ["ital", "wght"],
        defaults: { ital: 0, wght: 400 },
        ranges: { ital: [0, 1], wght: [400, 700] },
        steps: { ital: 1, wght: 1 }
    },
    "Roboto Slab": {
        axes: ["wght"],
        defaults: { wght: 400 },
        ranges: { wght: [100, 900] },
        steps: { wght: 1 }
    }
};

// Google Fonts metadata cache
let gfMetadata = null;
let css2AxisRanges = null; // built from Google Fonts metadata at runtime

// Heuristic steps when not specified per-axis
const AXIS_STEP_DEFAULTS = {
    wght: 1,
    wdth: 0.1,
    opsz: 0.1,
    slnt: 1,
    ital: 1,
    CASL: 0.01,
    MONO: 0.01,
    CRSV: 0.1,
    SOFT: 0.1
};

// Canonical default values for common axes
const AXIS_DEFAULTS = {
    wght: 400,
    wdth: 100,
    opsz: 14,
    slnt: 0,
    ital: 0
};

// Custom fonts not in Google Fonts that we support
const CUSTOM_FONTS = [
    'BBC Reith Serif',
    'ABC Ginto Normal Unlicensed Trial'
];

// Attempt to build a font definition for any Google Font at runtime
async function getOrCreateFontDefinition(fontName) {
    // Prefer dynamic cache
    if (dynamicFontDefinitions[fontName]) return dynamicFontDefinitions[fontName];
    // Use static fallback if present
    if (fontDefinitions[fontName]) return fontDefinitions[fontName];

    // Ensure metadata is loaded
    try { await ensureGfMetadata(); } catch (e) { console.warn('GF metadata load failed:', e); }

    const axesFromMetadata = getAxesForFamilyFromMetadata(fontName);
    // Build from runtime metadata map (no remote CSS/fvar probing)
    try { await ensureCss2AxisRanges(); } catch (_) {}
    const curated = css2AxisRanges && css2AxisRanges[fontName] ? css2AxisRanges[fontName] : null;

    // Compose axes list from curated.tags when present; else metadata tags
    const combinedAxes = new Set();
    if (curated && Array.isArray(curated.tags)) curated.tags.forEach(a => combinedAxes.add(a));
    axesFromMetadata.forEach(a => combinedAxes.add(a));

    // Build defaults, ranges, steps strictly from curated/metadata
    const axes = Array.from(combinedAxes);
    const defaults = {};
    const ranges = {};
    const steps = {};

    axes.forEach(axis => {
        const curatedRange = curated && curated.ranges ? curated.ranges[axis] : undefined;
        const curatedDefault = curated && curated.defaults ? curated.defaults[axis] : undefined;
        switch (axis) {
            case 'wght':
                ranges[axis] = Array.isArray(curatedRange) ? curatedRange : [100, 1000];
                defaults[axis] = (curatedDefault !== undefined) ? curatedDefault : AXIS_DEFAULTS.wght;
                steps[axis] = AXIS_STEP_DEFAULTS.wght; break;
            case 'wdth':
                ranges[axis] = Array.isArray(curatedRange) ? curatedRange : [75, 125];
                defaults[axis] = (curatedDefault !== undefined) ? curatedDefault : AXIS_DEFAULTS.wdth;
                steps[axis] = AXIS_STEP_DEFAULTS.wdth; break;
            case 'opsz':
                ranges[axis] = Array.isArray(curatedRange) ? curatedRange : [8, 144];
                defaults[axis] = (curatedDefault !== undefined) ? curatedDefault : AXIS_DEFAULTS.opsz;
                steps[axis] = AXIS_STEP_DEFAULTS.opsz; break;
            case 'slnt':
                ranges[axis] = Array.isArray(curatedRange) ? curatedRange : [-10, 0];
                defaults[axis] = (curatedDefault !== undefined) ? curatedDefault : AXIS_DEFAULTS.slnt;
                steps[axis] = AXIS_STEP_DEFAULTS.slnt; break;
            case 'ital':
                ranges[axis] = Array.isArray(curatedRange) ? curatedRange : [0, 1];
                defaults[axis] = (curatedDefault !== undefined) ? curatedDefault : AXIS_DEFAULTS.ital;
                steps[axis] = AXIS_STEP_DEFAULTS.ital; break;
            default:
                ranges[axis] = Array.isArray(curatedRange) ? curatedRange : [0, 1000];
                defaults[axis] = (curatedDefault !== undefined) ? curatedDefault : 0;
                steps[axis] = AXIS_STEP_DEFAULTS[axis] || 1;
        }
    });

    const def = { axes, defaults, ranges, steps };
    dynamicFontDefinitions[fontName] = def;
    return def;
}

// Remote CSS probing and fvar parsing removed (no network probing, no binary parsing).

function getAxesForFamilyFromMetadata(fontName) {
    if (!gfMetadata || !fontName) return [];
    const lists = [
        gfMetadata.familyMetadataList,
        gfMetadata.familyMetadata,
        gfMetadata.families
    ].filter(Boolean);

    let fam = null;
    const target = String(fontName).toLowerCase();
    for (const list of lists) {
        fam = list.find(f => String(f.family || f.name || '').toLowerCase() === target);
        if (fam) break;
    }
    if (!fam) return [];

    // Some metadata shapes: `axes`, `axesTags`, or array of objects with { tag }
    const raw = fam.axes || fam.axesTags || fam.axes_tags || [];
    const tags = Array.from(new Set((Array.isArray(raw) ? raw : [raw]).flat().map(a => {
        if (typeof a === 'string') return a;
        if (a && typeof a === 'object') return a.tag || a.axis || a.name || '';
        return '';
    }).filter(Boolean)));
    return tags;
}

async function ensureGfMetadata() {
    if (gfMetadata) return gfMetadata;
    try {
        const resLocal = await fetch('data/gf-axis-registry.json', { credentials: 'omit' });
        if (!resLocal.ok) throw new Error(`Local HTTP ${resLocal.status}`);
        const textLocal = await resLocal.text();
        const jsonLocal = textLocal.replace(/^\)\]\}'\n?/, '');
        gfMetadata = JSON.parse(jsonLocal);
        return gfMetadata;
    } catch (e2) {
        console.warn('Local metadata load failed; proceeding with empty metadata', e2);
        gfMetadata = { familyMetadataList: [] };
        return gfMetadata;
    }
}

function familyToQuery(fontName) {
    return String(fontName || '').trim().replace(/\s+/g, '+');
}

// Remote CSS probing helpers removed.

// Axis descriptions and detailed information
const axisInfo = {
    wght: {
        name: "Weight",
        description: "Adjust the style from lighter to bolder in typographic color, by varying stroke weights, spacing and kerning, and other aspects of the type. This typically changes overall width, and so may be used in conjunction with Width and Grade axes."
    },
    wdth: {
        name: "Width", 
        description: "Adjust the style from narrower to wider, by varying the proportions of counters, strokes, spacing and kerning, and other aspects of the type. This typically changes the typographic color in a subtle way, and so may be used in conjunction with Weight and Grade axes."
    },
    opsz: {
        name: "Optical Size",
        description: "Adapt the style to specific text sizes. At smaller sizes, letters typically become optimized for more legibility. At larger sizes, optimized for headlines, with more extreme weights and widths. In CSS this axis is activated automatically when it is available."
    },
    ital: {
        name: "Italic",
        description: "Adjust the style from roman to italic. This can be provided as a continuous range within a single font file, like most axes, or as a toggle between two roman and italic files that form a family as a pair."
    },
    slnt: {
        name: "Slant",
        description: "Adjust the style from upright to slanted. Negative values produce right-leaning forms, also known to typographers as an 'oblique' style. Positive values produce left-leaning forms, also called a 'backslanted' or 'reverse oblique' style."
    },
    GRAD: {
        name: "Grade",
        description: "Finesse the style from lighter to bolder in typographic color, without any changes overall width, line breaks or page layout. Negative grade makes the style lighter, while positive grade makes it bolder. The units are the same as in the Weight axis."
    },
    XTRA: {
        name: "Counter Width",
        description: "A parametric axis for varying counter widths in the X dimension. Controls the width of internal spaces in letters like 'o', 'e', and 'a'."
    },
    XOPQ: {
        name: "Thick Stroke",
        description: "A parametric axis for varying thick stroke weights, such as stems. Controls the thickness of the main vertical strokes in letters."
    },
    YOPQ: {
        name: "Thin Stroke", 
        description: "A parametric axis for varying thin stroke weights, such as bars and hairlines. Controls the thickness of horizontal strokes and thin details."
    },
    YTLC: {
        name: "Lowercase Height",
        description: "A parametric axis for varying the height of the lowercase letters. Controls the x-height of letters like 'a', 'e', 'o'."
    },
    YTUC: {
        name: "Uppercase Height",
        description: "A parametric axis for varying the heights of uppercase letterforms. Controls the cap height of letters like 'A', 'B', 'C'."
    },
    YTAS: {
        name: "Ascender Height",
        description: "A parametric axis for varying the height of lowercase ascenders. Controls how tall letters like 'b', 'd', 'h', 'k' extend above the x-height."
    },
    YTDE: {
        name: "Descender Depth",
        description: "A parametric axis for varying the depth of lowercase descenders. Controls how far letters like 'g', 'j', 'p', 'q', 'y' extend below the baseline."
    },
    YTFI: {
        name: "Figure Height",
        description: "A parametric axis for varying the height of figures (numbers 0-9). Controls whether numbers align with lowercase or uppercase heights."
    },
    CASL: {
        name: "Casual",
        description: "Adjust stroke curvature, contrast, and terminals from a sturdy, rational Linear style to a friendly, energetic Casual style."
    },
    CRSV: {
        name: "Cursive",
        description: "Control the substitution of cursive forms along the Slant axis. 'Off' (0) maintains Roman letterforms such as a double-storey a and g, 'Auto' (0.5) allows for Cursive substitution, and 'On' (1) asserts cursive forms even in upright text with a Slant of 0."
    },
    MONO: {
        name: "Monospace",
        description: "Adjust the style from Proportional (natural widths, default) to Monospace (fixed width). With proportional spacing, each glyph takes up a unique amount of space on a line, while monospace is when all glyphs have the same total character width."
    },
    SOFT: {
        name: "Softness",
        description: "Adjust letterforms to become more and more soft and rounded. Higher values create more curved, gentle letterforms."
    },
    WONK: {
        name: "Wonky",
        description: "Toggle the substitution of wonky forms. 'Off' (0) maintains more conventional letterforms, while 'On' (1) maintains wonky letterforms, such as leaning stems in roman, or flagged ascenders in italic. These forms are also controlled by Optical Size."
    }
};

// Current font controls (variables)
let topFontControlsVars = {};
let bottomFontControlsVars = {};

function getEffectiveFontDefinition(fontName) {
    return dynamicFontDefinitions[fontName] || fontDefinitions[fontName] || { axes: [], defaults: {}, ranges: {}, steps: {} };
}

// Helper function to get active controls for any position
function getActiveControls(position) {
    if (position === 'top') return topActiveControls;
    if (position === 'bottom') return bottomActiveControls;
    if (position === 'body') return bodyActiveControls;
    if (position === 'serif') return serifActiveControls;
    if (position === 'sans') return sansActiveControls;
    if (position === 'mono') return monoActiveControls;
    return new Set(); // fallback
}

// Helper function to get active axes for any position
function getActiveAxes(position) {
    if (position === 'top') return topActiveAxes;
    if (position === 'bottom') return bottomActiveAxes;
    if (position === 'body') return bodyActiveAxes;
    if (position === 'serif') return serifActiveAxes;
    if (position === 'sans') return sansActiveAxes;
    if (position === 'mono') return monoActiveAxes;
    return new Set(); // fallback
}

// Track which axes are actively set (not dimmed)
let topActiveAxes = new Set();
let bottomActiveAxes = new Set();
let bodyActiveAxes = new Set();
let serifActiveAxes = new Set();
let sansActiveAxes = new Set();
let monoActiveAxes = new Set();

// Track which basic controls are actively set
let topActiveControls = new Set();
let bottomActiveControls = new Set();
let bodyActiveControls = new Set();
let serifActiveControls = new Set();
let sansActiveControls = new Set();
let monoActiveControls = new Set();

// Function to update body apply/reset button visibility
async function updateBodyButtons() {
    console.log('updateBodyButtons called');
    const applyBtn = document.getElementById('apply-body');
    const resetBtn = document.getElementById('reset-body');
    
    try {
        const origin = await getActiveOrigin();
        if (!origin) {
            // No origin - hide both buttons
            if (applyBtn) applyBtn.style.display = 'none';
            if (resetBtn) resetBtn.style.display = 'none';
            return;
        }
        
        // Get current control values
        const currentConfig = getPanelFontConfig('body');
        console.log('Current config:', currentConfig);
        
        // Get applied state from domain storage
        const data = await browser.storage.local.get('affoApplyMap');
        const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
        const entry = map[origin];
        const appliedConfig = entry && entry['body'];
        console.log('Applied config:', appliedConfig);
        console.log('DEBUG: Full storage data:', data);
        console.log('DEBUG: Map for origin:', origin, 'entry:', entry);
        
        // Compare current vs applied state
        const hasChanges = !configsEqual(currentConfig, appliedConfig);
        const hasAppliedState = !!appliedConfig;
        
        if (hasChanges) {
            // Current values differ from applied - show Apply button
            if (applyBtn) applyBtn.style.display = 'block';
            if (resetBtn) resetBtn.style.display = 'none';
        } else if (hasAppliedState) {
            // No changes but has applied state - show Reset button  
            if (applyBtn) applyBtn.style.display = 'none';
            if (resetBtn) resetBtn.style.display = 'block';
        } else {
            // No changes and no applied state - hide both buttons
            if (applyBtn) applyBtn.style.display = 'none';
            if (resetBtn) resetBtn.style.display = 'none';
        }
    } catch (e) {
        console.error('Error in updateBodyButtons:', e);
        if (applyBtn) applyBtn.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'none';
    }
}

// Helper function to compare font configurations
function configsEqual(config1, config2) {
    // Handle null/undefined cases - both null means both are "empty/unset"
    if (!config1 && !config2) return true;
    // One is null/undefined and the other isn't - they're different
    if (!config1 || !config2) return false;
    
    // Compare font name (null and undefined are treated as equal)
    const font1 = config1.fontName || null;
    const font2 = config2.fontName || null;
    if (font1 !== font2) return false;
    
    // Handle different config formats:
    // - config1: current format with basicControls object
    // - config2: applied format with direct properties (fontWeight, fontSizePx, lineHeight)
    
    const basic1 = config1.basicControls || {};
    
    // Compare active controls first - if they differ, configs are different
    const activeControls1 = new Set(config1.activeControls || []);
    const activeControls2 = new Set();
    
    // Build activeControls2 from applied config by checking what was explicitly saved
    if (config2.fontSizePx !== null && config2.fontSizePx !== undefined) activeControls2.add('font-size');
    if (config2.lineHeight !== null && config2.lineHeight !== undefined) activeControls2.add('line-height');  
    if (config2.fontWeight !== null && config2.fontWeight !== undefined) activeControls2.add('weight');
    if (config2.fontColor !== null && config2.fontColor !== undefined && config2.fontColor !== 'default') activeControls2.add('color');
    
    // Check if active control sets are equal
    if (activeControls1.size !== activeControls2.size) return false;
    for (const control of activeControls1) {
        if (!activeControls2.has(control)) return false;
    }
    
    // Only compare values for active controls
    if (activeControls1.has('font-size')) {
        const fontSize1 = Number(basic1.fontSize);
        const fontSize2 = Number(config2.fontSizePx || config2.basicControls?.fontSize);
        if (fontSize1 !== fontSize2) return false;
    }
    
    if (activeControls1.has('line-height')) {
        const lineHeight1 = Number(basic1.lineHeight);
        const lineHeight2 = Number(config2.lineHeight || config2.basicControls?.lineHeight);
        if (lineHeight1 !== lineHeight2) return false;
    }
    
    if (activeControls1.has('weight')) {
        const fontWeight1 = Number(basic1.fontWeight);
        const fontWeight2 = Number(config2.fontWeight || config2.basicControls?.fontWeight);
        if (fontWeight1 !== fontWeight2) return false;
    }
    
    if (activeControls1.has('color')) {
        const fontColor1 = basic1.fontColor;
        const fontColor2 = config2.fontColor || config2.basicControls?.fontColor;
        if (fontColor1 !== fontColor2) return false;
    }
    
    return true;
}

// Function to update body mode preview without applying to domain
function updateBodyPreview() {
    const textElement = document.getElementById('body-font-text');
    const headingElement = document.getElementById('body-font-name');
    
    if (!textElement || !headingElement) return;
    
    // Get current control values
    const fontSizeControl = document.getElementById('body-font-size');
    const lineHeightControl = document.getElementById('body-line-height');
    const fontWeightControl = document.getElementById('body-font-weight');
    const fontColorControl = document.getElementById('body-font-color');
    
    if (!fontSizeControl || !lineHeightControl || !fontWeightControl || !fontColorControl) return;
    
    // Apply styles to preview elements
    const fontSize = fontSizeControl.value + 'px';
    const lineHeight = lineHeightControl.value;
    const fontWeight = fontWeightControl.value;
    const fontColor = fontColorControl.value;
    
    // Update text element
    if (bodyActiveControls.has('font-size')) {
        textElement.style.fontSize = fontSize;
    }
    if (bodyActiveControls.has('line-height')) {
        textElement.style.lineHeight = lineHeight;
    }
    if (bodyActiveControls.has('weight')) {
        textElement.style.fontWeight = fontWeight;
    }
    if (fontColor !== 'default') {
        textElement.style.color = fontColor;
    } else {
        textElement.style.color = '';
    }
    
    // Update heading element
    headingElement.style.fontSize = Math.max(16, parseFloat(fontSize) + 2) + 'px';
    if (fontColor !== 'default') {
        headingElement.style.color = fontColor;
    } else {
        headingElement.style.color = '';
    }
}

// Font settings memory - stores settings for each font
let topFontMemory = {};
let bottomFontMemory = {};
let bodyFontMemory = {};
let serifFontMemory = {};
let sansFontMemory = {};
let monoFontMemory = {};

// Favorites storage
let savedFavorites = {};
let savedFavoritesOrder = [];

// Extension state storage - separate for each mode
let extensionState = {
    'body-contact': {
        bodyFont: null
    },
    faceoff: {
        topFont: null,
        bottomFont: null
    },
    'third-man-in': {
        serifFont: null,
        sansFont: null,
        monoFont: null
    }
};

// Load favorites from localStorage
function loadFavoritesFromStorage() {
    try {
        const stored = localStorage.getItem('fontFaceoffFavorites');
        // Backward compatible: may be a plain object map
        const parsed = stored ? JSON.parse(stored) : {};
        // Support both legacy map form and wrapped { map, order }
        if (parsed && parsed.map && typeof parsed.map === 'object') {
            savedFavorites = parsed.map || {};
            const ord = Array.isArray(parsed.order) ? parsed.order : Object.keys(savedFavorites);
            savedFavoritesOrder = ord.filter(name => savedFavorites[name] !== undefined);
        } else {
            savedFavorites = parsed && typeof parsed === 'object' ? parsed : {};
            const ordRaw = localStorage.getItem('fontFaceoffFavoritesOrder');
            const ord = ordRaw ? JSON.parse(ordRaw) : null;
            savedFavoritesOrder = Array.isArray(ord) ? ord.filter(name => savedFavorites[name] !== undefined)
                                                     : Object.keys(savedFavorites);
        }
    } catch (error) {
        console.error('Error loading favorites:', error);
        savedFavorites = {};
        savedFavoritesOrder = [];
    }
}

// Save favorites to localStorage
function saveFavoritesToStorage() {
    try {
        // Persist map and order in separate keys for compatibility
        localStorage.setItem('fontFaceoffFavorites', JSON.stringify(savedFavorites));
        // Keep order aligned to existing keys
        const cleaned = savedFavoritesOrder.filter(name => savedFavorites[name] !== undefined);
        localStorage.setItem('fontFaceoffFavoritesOrder', JSON.stringify(cleaned));
        savedFavoritesOrder = cleaned;
    } catch (error) {
        console.error('Error saving favorites:', error);
    }
}

// Load extension state from localStorage
function loadExtensionState() {
    try {
        const stored = localStorage.getItem('fontFaceoffState');
        console.log('Loading extension state from localStorage:', stored);
        if (stored) {
            const parsed = JSON.parse(stored);
            console.log('Parsed state:', parsed);
            // Handle migration from old format
            if (parsed.topFont && parsed.bottomFont && !parsed['body-contact'] && !parsed.faceoff) {
                extensionState = {
                    'body-contact': { bodyFont: null },
                    faceoff: { topFont: parsed.topFont, bottomFont: parsed.bottomFont },
                    'third-man-in': { serifFont: null, sansFont: null, monoFont: null }
                };
            } else {
                extensionState = parsed;
                // Ensure new modes exist in loaded state
                if (!extensionState['body-contact']) {
                    extensionState['body-contact'] = { bodyFont: null };
                }
                if (!extensionState['third-man-in']) {
                    extensionState['third-man-in'] = { serifFont: null, sansFont: null, monoFont: null };
                }
            }
        } else {
            extensionState = {
                'body-contact': { bodyFont: null },
                faceoff: { topFont: null, bottomFont: null },
                'third-man-in': { serifFont: null, sansFont: null, monoFont: null }
            };
        }
    } catch (error) {
        console.error('Error loading extension state:', error);
        extensionState = {
            'body-contact': { bodyFont: null },
            faceoff: { topFont: null, bottomFont: null },
            'third-man-in': { serifFont: null, sansFont: null, monoFont: null }
        };
        console.log('Initialized fresh extension state:', extensionState);
    }
}

// Save extension state to localStorage
function saveExtensionState() {
    try {
        if (currentViewMode === 'body-contact') {
            // Body Contact mode - save single panel
            const bodyConfig = getCurrentUIConfig('body');
            if (bodyConfig) {
                extensionState[currentViewMode].bodyFont = bodyConfig;
                localStorage.setItem('fontFaceoffState', JSON.stringify(extensionState));
            }
        } else if (currentViewMode === 'third-man-in') {
            // Third Man In mode - save multiple panels
            const serifConfig = getCurrentUIConfig('top'); // Serif uses top position
            const sansConfig = getCurrentUIConfig('bottom'); // Sans uses bottom position
            // Mono would need its own position when implemented
            
            if (serifConfig) {
                extensionState[currentViewMode].serifFont = serifConfig;
            }
            if (sansConfig) {
                extensionState[currentViewMode].sansFont = sansConfig;
            }
            localStorage.setItem('fontFaceoffState', JSON.stringify(extensionState));
        } else {
            // Face-off mode (existing behavior)
            const topConfig = getCurrentUIConfig('top');
            const bottomConfig = getCurrentUIConfig('bottom');
            
            // Only save if we have valid configurations and valid mode state
            if (topConfig && bottomConfig && extensionState[currentViewMode]) {
                extensionState[currentViewMode].topFont = topConfig;
                extensionState[currentViewMode].bottomFont = bottomConfig;
                localStorage.setItem('fontFaceoffState', JSON.stringify(extensionState));
            } else if (!extensionState[currentViewMode]) {
                console.error('No extensionState found for currentViewMode:', currentViewMode);
            }
        }
    } catch (error) {
        console.error('Error saving extension state:', error);
    }
}

// Get current font configuration
function getCurrentUIConfig(position) {
    // Safety check - ensure elements exist
    const fontSelect = document.getElementById(`${position}-font-select`);
    const fontSizeControl = document.getElementById(`${position}-font-size`);
    const lineHeightControl = document.getElementById(`${position}-line-height`);
    const fontWeightControl = document.getElementById(`${position}-font-weight`);
    const fontColorControl = document.getElementById(`${position}-font-color`);
    
    if (!fontSelect || !fontSizeControl || !lineHeightControl || !fontWeightControl) {
        return null;
    }
    
    // Font color is optional for Third Man In mode positions
    const hasColorControl = !!fontColorControl;
    
    const heading = document.getElementById(`${position}-font-name`);
    const rawFontName = (heading && heading.textContent) ? heading.textContent : fontSelect.value;
    
    // For Third Man In mode, check for default states
    let fontName = null;
    if (rawFontName) {
        const normalizedName = String(rawFontName).toLowerCase();
        const isDefaultState = normalizedName === 'default' || 
                              normalizedName === 'serif' || 
                              normalizedName === 'sans' || 
                              normalizedName === 'mono';
        
        if (!isDefaultState) {
            fontName = rawFontName;
        }
    }
    const fontSize = fontSizeControl.value;
    const lineHeight = lineHeightControl.value;
    const fontWeight = fontWeightControl.value;
    const fontColor = hasColorControl ? fontColorControl.value : '#000000';
    
    // Get control groups to determine what's currently active (not unset)
    const sizeGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="font-size"]`);
    const lineHeightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="line-height"]`);
    const weightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="weight"]`);
    const colorGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="color"]`);
    
    // Determine which controls are currently active (user has explicitly interacted with them)
    const activeControls = [];
    const activeFontSize = sizeGroup && !sizeGroup.classList.contains('unset');
    const activeLineHeight = lineHeightGroup && !lineHeightGroup.classList.contains('unset');
    const activeWeight = weightGroup && !weightGroup.classList.contains('unset');
    const activeColor = colorGroup && !colorGroup.classList.contains('unset');
    
    if (activeFontSize) activeControls.push('font-size');
    if (activeLineHeight) activeControls.push('line-height');
    if (activeWeight) activeControls.push('weight');
    if (activeColor) activeControls.push('color');
    
    
    // Return UI config with only currently active controls
    const config = {
        fontName: fontName || null,
        activeControls: activeControls,
        basicControls: {
            fontSize: activeFontSize ? parseFloat(fontSize) : null,
            lineHeight: activeLineHeight ? parseFloat(lineHeight) : null,
            fontWeight: activeWeight ? parseInt(fontWeight) : null,
            fontColor: activeColor ? fontColor : null
        },
        variableAxes: {}
    };
    
    // Get variable axis values
    const fontDef = getEffectiveFontDefinition(fontName);
    if (fontDef && fontDef.axes.length > 0) {
        fontDef.axes.forEach(axis => {
            const control = document.getElementById(`${position}-${axis}`);
            if (control) {
                config.variableAxes[axis] = parseFloat(control.value);
            }
        });
    }
    
    return config;
}

// Convert savedEntry (storage format) to config format
function savedEntryToConfig(savedEntry) {
    if (!savedEntry) return null;
    
    return {
        fontName: savedEntry.fontName || null,
        activeControls: [], // Will be filled by merge logic
        basicControls: {
            fontSize: savedEntry.fontSizePx,
            lineHeight: savedEntry.lineHeight,
            fontWeight: savedEntry.fontWeight,
            fontColor: savedEntry.fontColor
        },
        variableAxes: {}
        // TODO: Handle variable axes from savedEntry.varPairs if needed
    };
}

// Merge UI config with applied config for apply operation
function mergeConfigsForApply(uiConfig, appliedConfig) {
    // If no UI changes and no applied config, nothing to apply
    if (!uiConfig && !appliedConfig) {
        return null;
    }
    
    // If only UI changes, use them directly
    if (!appliedConfig) {
        return uiConfig;
    }
    
    // If no UI changes but have applied config, can't apply (nothing new)
    if (!uiConfig || uiConfig.activeControls.length === 0) {
        return null;
    }
    
    // Merge: Start with applied config, override with active UI controls
    const merged = {
        fontName: uiConfig.fontName || appliedConfig.fontName,
        activeControls: [],
        basicControls: {
            fontSize: appliedConfig.basicControls.fontSize,
            lineHeight: appliedConfig.basicControls.lineHeight,
            fontWeight: appliedConfig.basicControls.fontWeight,
            fontColor: appliedConfig.basicControls.fontColor
        },
        variableAxes: { ...appliedConfig.variableAxes }
    };
    
    // Override with active UI controls
    uiConfig.activeControls.forEach(control => {
        merged.activeControls.push(control);
        if (control === 'font-size' && uiConfig.basicControls.fontSize !== null) {
            merged.basicControls.fontSize = uiConfig.basicControls.fontSize;
        }
        if (control === 'line-height' && uiConfig.basicControls.lineHeight !== null) {
            merged.basicControls.lineHeight = uiConfig.basicControls.lineHeight;
        }
        if (control === 'weight' && uiConfig.basicControls.fontWeight !== null) {
            merged.basicControls.fontWeight = uiConfig.basicControls.fontWeight;
        }
        if (control === 'color' && uiConfig.basicControls.fontColor !== null) {
            merged.basicControls.fontColor = uiConfig.basicControls.fontColor;
        }
    });
    
    // Add non-null applied controls that aren't being overridden
    ['font-size', 'line-height', 'weight', 'color'].forEach(control => {
        if (!merged.activeControls.includes(control)) {
            const controlKey = control === 'font-size' ? 'fontSize' : 
                             control === 'line-height' ? 'lineHeight' :
                             control === 'weight' ? 'fontWeight' : 'fontColor';
            if (merged.basicControls[controlKey] !== null) {
                merged.activeControls.push(control);
            }
        }
    });
    
    return merged;
}

// Get current font configuration for new panel-based modes
function getPanelFontConfig(panelId) {
    // Use direct position mapping for cleaner architecture
    if (['body', 'serif', 'sans', 'mono'].includes(panelId)) {
        return getCurrentUIConfig(panelId);
    }
    return null;
}

// Apply font configuration
async function applyFontConfig(position, config) {
    if (position === 'serif' || position === 'sans' || position === 'mono') {
        console.log(`applyFontConfig called for ${position}:`, config);
        console.trace('applyFontConfig call stack');
    }
    // Set font family (allow unset in Facade -> Default)
    if (config.fontName === null || String(config.fontName).toLowerCase() === 'default') {
        const disp = document.getElementById(`${position}-font-display`);
        const group = disp && disp.closest('.control-group');
        if (disp) { disp.textContent = 'Default'; disp.classList.add('placeholder'); }
        if (group) group.classList.add('unset');
    } else {
        document.getElementById(`${position}-font-select`).value = config.fontName;
        // Suppress immediate apply/save during restore; we'll apply after values are set
        loadFont(position, config.fontName, { suppressImmediateApply: true, suppressImmediateSave: true });
    }
    
    // Wait for font controls to be generated, then apply settings
    await new Promise(resolve => {
        setTimeout(() => {
        // Set basic controls
        document.getElementById(`${position}-font-size`).value = config.basicControls.fontSize || 17;
        document.getElementById(`${position}-line-height`).value = config.basicControls.lineHeight || 1.6;
        document.getElementById(`${position}-font-weight`).value = config.basicControls.fontWeight || 400;
        document.getElementById(`${position}-font-color`).value = config.basicControls.fontColor;
        
        // Set text input values
        const fontSizeTextInput = document.getElementById(`${position}-font-size-text`);
        const lineHeightTextInput = document.getElementById(`${position}-line-height-text`);
        if (fontSizeTextInput) fontSizeTextInput.value = config.basicControls.fontSize || 17;
        if (lineHeightTextInput) lineHeightTextInput.value = config.basicControls.lineHeight || 1.6;
        
        // Update display values (font size span may be absent if using only text input)
        const fsVal = document.getElementById(`${position}-font-size-value`);
        if (fsVal) fsVal.textContent = (config.basicControls.fontSize || 17) + 'px';
        document.getElementById(`${position}-line-height-value`).textContent = config.basicControls.lineHeight || 1.6;
        document.getElementById(`${position}-font-weight-value`).textContent = config.basicControls.fontWeight || 400;
        
        // Restore active controls state
        const activeControls = getActiveControls(position);
        const activeAxes = getActiveAxes(position);
        
        activeControls.clear();
        activeAxes.clear();
        
        // Add active controls back from arrays and update UI state
        if (config.activeControls && Array.isArray(config.activeControls)) {
            console.log(`applyFontConfig: Restoring active controls for ${position}:`, config.activeControls);
            config.activeControls.forEach(control => {
                activeControls.add(control);
                
                // Remove "unset" class from control groups for active controls
                const controlName = control === 'font-size' ? 'font-size' : 
                                   control === 'line-height' ? 'line-height' :
                                   control === 'weight' ? 'weight' : 
                                   control === 'color' ? 'color' : null;
                                   
                if (controlName) {
                    const controlGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="${controlName}"]`);
                    console.log(`applyFontConfig: Control group for ${controlName}:`, controlGroup, 'had unset:', controlGroup?.classList.contains('unset'));
                    if (controlGroup) {
                        controlGroup.classList.remove('unset');
                        console.log(`applyFontConfig: Removed unset from ${controlName}, now has unset:`, controlGroup.classList.contains('unset'));
                    }
                }
            });
        } else {
            console.log(`applyFontConfig: No active controls to restore for ${position}`);
        }
        
        if (config.activeAxes && Array.isArray(config.activeAxes)) {
            config.activeAxes.forEach(axis => activeAxes.add(axis));
        }
        
        // Apply variable axis values and states
        if (config.variableAxes) {
            Object.entries(config.variableAxes).forEach(([axis, value]) => {
                const control = document.getElementById(`${position}-${axis}`);
                const textInput = document.getElementById(`${position}-${axis}-text`);
                const controlGroup = document.querySelector(`#${position}-font-controls .control-group[data-axis="${axis}"]`);
                
                if (control) {
                    control.value = value;
                    if (textInput) textInput.value = value;
                    
                    // Set control group state based on active axes
                    if (controlGroup) {
                        if (activeAxes.has(axis)) {
                            controlGroup.classList.remove('unset');
                        } else {
                            controlGroup.classList.add('unset');
                        }
                    }
                }
            });
        }
        
        // Handle weight control state
        const weightControl = document.querySelector(`#${position}-font-controls .control-group[data-control="weight"]`);
        if (weightControl) {
            if (activeControls.has('weight')) {
                weightControl.classList.remove('unset');
            } else {
                weightControl.classList.add('unset');
            }
        }
        
        // Handle font-size control state
        const sizeControl = document.querySelector(`#${position}-font-controls .control-group[data-control="font-size"]`);
        if (sizeControl) {
            if (activeControls.has('font-size')) {
                sizeControl.classList.remove('unset');
            } else {
                sizeControl.classList.add('unset');
            }
        }
        
        // Handle line height control state
        const lineHeightControl = document.querySelector(`#${position}-font-controls .control-group[data-control="line-height"]`);
        if (lineHeightControl) {
            if (activeControls.has('line-height')) {
                lineHeightControl.classList.remove('unset');
            } else {
                lineHeightControl.classList.add('unset');
            }
        }
        
        // Apply the font
        applyFont(position);
        
        // Resolve the promise to indicate completion
        resolve();
    }, 100);
    });
}

// Custom Alert functions
function showCustomAlert(message) {
    const alertModal = document.getElementById('custom-alert');
    const alertMessage = document.getElementById('custom-alert-message');
    
    alertMessage.textContent = message;
    alertModal.classList.add('visible');
}

function hideCustomAlert() {
    const alertModal = document.getElementById('custom-alert');
    alertModal.classList.remove('visible');
}

// Custom Confirm functions
function showCustomConfirm(message, callback) {
    const confirmModal = document.getElementById('custom-confirm');
    const confirmMessage = document.getElementById('custom-confirm-message');
    
    confirmMessage.textContent = message;
    confirmModal.classList.add('visible');
    
    // Store callback for when user clicks OK
    confirmModal._callback = callback;
}

function hideCustomConfirm() {
    const confirmModal = document.getElementById('custom-confirm');
    confirmModal.classList.remove('visible');
    confirmModal._callback = null;
}

// Tooltip functions
let currentTooltip = null;

function showTooltip(e) {
    hideTooltip(); // Hide any existing tooltip
    
    const description = this.getAttribute('data-tooltip');
    if (!description) return;
    
    const tooltip = document.createElement('div');
    tooltip.className = 'axis-tooltip';
    tooltip.textContent = description;
    document.body.appendChild(tooltip);
    
    // Position tooltip
    const rect = this.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.bottom + 5;
    
    // Keep tooltip on screen
    if (left < 5) left = 5;
    if (left + tooltipRect.width > window.innerWidth - 5) {
        left = window.innerWidth - tooltipRect.width - 5;
    }
    if (top + tooltipRect.height > window.innerHeight - 5) {
        top = rect.top - tooltipRect.height - 5;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.display = 'block';
    
    currentTooltip = tooltip;
}

function hideTooltip() {
    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

// Initialize Google Fonts selects dynamically
function getFamiliesFromMetadata(md) {
    if (!md) return [];
    // Google Fonts uses familyMetadataList; fallbacks included for safety
    const list = md.familyMetadataList || md.familyMetadata || md.families || [];
    return list.map(f => (f.family || f.name)).filter(Boolean);
}

async function initializeGoogleFontsSelects(preferredTop, preferredBottom) {
    try {
        await ensureGfMetadata();
        // Start from Google families
        let families = getFamiliesFromMetadata(gfMetadata);
        // Ensure favorites are included
        try { loadFavoritesFromStorage(); } catch (e) {}
        const favNames = Array.from(new Set(
            Object.values(savedFavorites || {})
                .map(cfg => cfg && cfg.fontName)
                .filter(Boolean)
        ));
        // Merge custom fonts, favorites, and Google list
        const set = new Set();
        const combined = [];
        [...CUSTOM_FONTS, ...favNames, ...families].forEach(name => {
            if (!name) return;
            if (!set.has(name)) { set.add(name); combined.push(name); }
        });
        families = combined.sort((a, b) => a.localeCompare(b));

        // If we failed to get a non-empty list, keep existing options intact
        if (!families || families.length === 0) {
            console.warn('Google Fonts metadata returned no families; keeping existing dropdown options');
            return;
        }

        const selects = [
            { sel: document.getElementById('top-font-select'), want: preferredTop },
            { sel: document.getElementById('bottom-font-select'), want: preferredBottom }
        ];
        selects.forEach(({ sel, want }) => {
            if (!sel) return;
            const current = sel.value || want || '';
            // Only rebuild if we have a non-empty list
            if (families.length > 0) {
                // Clear existing options
                while (sel.firstChild) sel.removeChild(sel.firstChild);
                // Build options
                families.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    sel.appendChild(opt);
                });
                // Restore selection if present in list, else default to first
                const desired = (want && families.includes(want)) ? want : current;
                if (desired && families.includes(desired)) {
                    sel.value = desired;
                } else if (desired && !families.includes(desired)) {
                    // Preserve a prior custom/current value by adding it explicitly
                    const opt = document.createElement('option');
                    opt.value = desired;
                    opt.textContent = desired;
                    sel.insertBefore(opt, sel.firstChild);
                    sel.value = desired;
                } 
            }
        });
        return true;
    } catch (e) {
        console.warn('Failed to populate Google Fonts list:', e);
        return false;
    }
}

function resolveFamilyCase(name) {
    if (!name || !gfMetadata) return name;
    const families = getFamiliesFromMetadata(gfMetadata);
    const lower = String(name).toLowerCase();
    for (const fam of families) {
        if (String(fam).toLowerCase() === lower) return fam;
    }
    return name;
}

// Font Picker Modal implementation
function setupFontPicker() {
    const modal = document.getElementById('font-picker-modal');
    const listEl = document.getElementById('font-picker-list');
    const railEl = document.getElementById('font-picker-rail');
    const searchEl = document.getElementById('font-picker-search');
    const titleEl = document.getElementById('font-picker-title');
    const closeBtn = document.getElementById('font-picker-close');
    const cancelBtn = document.getElementById('font-picker-cancel');
    const topTrigger = document.getElementById('top-font-display');
    const bottomTrigger = document.getElementById('bottom-font-display');
    const bodyTrigger = document.getElementById('body-font-display');
    const serifTrigger = document.getElementById('serif-font-display');
    const sansTrigger = document.getElementById('sans-font-display');
    const monoTrigger = document.getElementById('mono-font-display');

    const customPinned = [
        'BBC Reith Serif',
        'ABC Ginto Normal Unlicensed Trial'
    ];

    let currentPosition = 'top';
    let families = [];
    let filtered = [];
    let sectionOffsets = {};

    function normalize(str) { return (str || '').toLowerCase(); }
    function firstLetter(name) {
        const c = (name || '').charAt(0).toUpperCase();
        return c >= 'A' && c <= 'Z' ? c : '#';
    }

    async function open(position) {
        currentPosition = position;
        titleEl.textContent = `Select ${getPanelLabel(position)} Font`;
        // Build family list (custom pinned + google)
        if (!gfMetadata) {
            try { await ensureGfMetadata(); } catch (e) { console.warn('GF metadata load failed:', e); }
        }
        // Ensure favorites are up-to-date
        try { loadFavoritesFromStorage(); } catch (e) {}
        const gf = getFamiliesFromMetadata(gfMetadata);
        const set = new Set();
        const list = [];
        // Add pinned customs first
        customPinned.forEach(f => { set.add(f); list.push(f); });
        gf.forEach(f => { if (!set.has(f)) list.push(f); });
        families = list;
        searchEl.value = '';
        buildList('');
        modal.classList.add('visible');
        // Reflect expanded state on trigger for accessibility and chevron rotation
        if (position === 'top') {
            topTrigger && topTrigger.setAttribute('aria-expanded', 'true');
        } else {
            bottomTrigger && bottomTrigger.setAttribute('aria-expanded', 'true');
        }
        // Do not autofocus the search input to avoid popping mobile keyboards
        setTimeout(() => { if (closeBtn) closeBtn.focus(); }, 0);
    }

    function close() {
        modal.classList.remove('visible');
        // Reset expanded state on both triggers
        topTrigger && topTrigger.setAttribute('aria-expanded', 'false');
        bottomTrigger && bottomTrigger.setAttribute('aria-expanded', 'false');
    }

    function buildRail(letters) {
        railEl.innerHTML = '';
        letters.forEach(L => {
            const span = document.createElement('span');
            span.className = 'rail-letter';
            span.textContent = L;
            span.title = `Jump to ${L}`;
            span.addEventListener('click', () => {
                const anchor = document.getElementById(`fp-section-${L}`);
                if (!anchor) return;
                // With listEl positioned relative, anchor.offsetTop is relative to listEl
                const top = anchor.offsetTop || 0;
                listEl.scrollTop = Math.max(0, top);
            });
            railEl.appendChild(span);
        });
    }

    function buildList(query) {
        const q = normalize(query);
        const matches = q
            ? families.filter(n => normalize(n).includes(q))
            : families.slice();
        filtered = matches;

        // Group into sections
        listEl.innerHTML = '';
        const sections = new Map();

        // Favorites section: gather unique favorited font names
        const favNames = Array.from(new Set(
            Object.values(savedFavorites || {})
                .map(cfg => cfg && cfg.fontName)
                .filter(Boolean)
        ));
        const favFiltered = favNames
            .filter(n => (q ? normalize(n).includes(q) : true))
            .filter(n => !customPinned.includes(n)); // avoid duplicate with custom section
        if (favFiltered.length) {
            sections.set('Favorites', favFiltered);
        }

        // Remaining items grouped by letter (Pinned handled as its own key)
        const favSet = new Set(favFiltered);
        const addItem = (name) => {
            const key = customPinned.includes(name) ? 'Pinned' : firstLetter(name);
            if (favSet.has(name) && key !== 'Pinned') return; // don't duplicate favorites into letters
            if (!sections.has(key)) sections.set(key, []);
            sections.get(key).push(name);
        };
        matches.forEach(addItem);

        // Order: Pinned section (if present), then A-Z, then '#'
        const order = [];
        if (sections.has('Pinned')) order.push('Pinned');
        if (sections.has('Favorites')) order.push('Favorites');
        for (let i=0;i<26;i++) {
            const L = String.fromCharCode(65+i);
            if (sections.has(L)) order.push(L);
        }
        if (sections.has('#')) order.push('#');

        // Build DOM
        order.forEach(key => {
            const title = document.createElement('div');
            title.className = 'font-picker-section-title';
            title.textContent = key === 'Pinned' ? 'Custom Fonts' : key;
            title.id = `fp-section-${key}`;
            listEl.appendChild(title);

            sections.get(key).forEach(name => {
                const item = document.createElement('div');
                item.className = 'font-picker-item';
                item.setAttribute('role', 'option');
                item.textContent = name;
                item.addEventListener('click', () => selectFont(name));
                listEl.appendChild(item);
            });
        });

        // Build rail letters
        const letters = order.filter(k => k !== 'Pinned' && k !== 'Favorites');
        buildRail(letters);

        // Compute offsets after layout
        requestAnimationFrame(() => {
            sectionOffsets = {};
            const listRect = listEl.getBoundingClientRect();
            order.forEach(key => {
                const anchor = document.getElementById(`fp-section-${key}`);
                if (!anchor) return;
                const anchorRect = anchor.getBoundingClientRect();
                const top = anchorRect.top - listRect.top + listEl.scrollTop;
                sectionOffsets[key] = Math.max(0, top);
            });
        });
    }

function selectFont(name) {
    const selectEl = document.getElementById(`${currentPosition}-font-select`);
    if (selectEl) selectEl.value = name;
    const displayEl = document.getElementById(`${currentPosition}-font-display`);
    if (displayEl) {
        displayEl.textContent = name;
        displayEl.classList.remove('placeholder');
        const group = displayEl.closest('.control-group');
        if (group) group.classList.remove('unset');
    }
    
    
    // For body mode, update buttons after font selection
    if (currentPosition === 'body') {
        updateBodyButtons();
    }
    
    // For Third Man In mode, update the preview instead of calling applyFont
    if (['serif', 'sans', 'mono'].includes(currentPosition)) {
        // Load the font CSS first, then update preview
        loadFont(currentPosition, name, { suppressImmediateApply: true, suppressImmediateSave: false });
        updateThirdManInPreview(currentPosition);
    } else {
        // Traditional applyFont for other positions
        loadFont(currentPosition, name);
    }
    close();
    // Reflect Apply/Update state immediately after changing family
    try { setTimeout(() => { try { refreshApplyButtonsDirtyState(); } catch (_) {} }, 0); } catch (_) {}
}

    // Listeners
    const triggerOpen = (pos) => () => open(pos);
    topTrigger?.addEventListener('click', triggerOpen('top'));
    bottomTrigger?.addEventListener('click', triggerOpen('bottom'));
    bodyTrigger?.addEventListener('click', triggerOpen('body')); // Body panel uses body position
    serifTrigger?.addEventListener('click', triggerOpen('serif'));
    sansTrigger?.addEventListener('click', triggerOpen('sans'));
    monoTrigger?.addEventListener('click', triggerOpen('mono'));
    topTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('top');
        }
    });
    bottomTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('bottom');
        }
    });
    bodyTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('body'); // Body panel uses body position
        }
    });
    serifTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('serif');
        }
    });
    sansTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('sans');
        }
    });
    monoTrigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            open('mono');
        }
    });
    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    searchEl.addEventListener('input', (e) => buildList(e.target.value || ''));

    // Keyboard: Esc closes when modal visible
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('visible')) {
            e.preventDefault();
            close();
        }
    });
}

// Font loading and management functions
function loadFont(position, fontName, options = {}) {
    const { suppressImmediateApply = false, suppressImmediateSave = false } = options || {};
    // Save current font settings before switching
    const fontNameElement = document.getElementById(`${position}-font-name`) || document.getElementById(`${position}-font-display`);
    const currentFontName = fontNameElement ? fontNameElement.textContent : null;
    if (currentFontName && currentFontName !== fontName) {
        saveFontSettings(position, currentFontName);
    }
    
    // Clear active axes tracking when switching fonts
    const activeAxes = getActiveAxes(position);
    activeAxes.clear();
    
    // Load font CSS (Google Fonts or custom fonts)
    if (fontName === 'ABC Ginto Normal Unlicensed Trial' || /ABC\s+Ginto\s+Nord\s+Unlicensed\s+Trial/i.test(fontName)) {
        // Ensure Ginto CSS is present (choose Normal or Nord stylesheet)
        const id = 'ginto-css-link';
        const href = (fontName === 'ABC Ginto Normal Unlicensed Trial')
            ? 'https://fonts.cdnfonts.com/css/abc-ginto-normal-unlicensed-trial'
            : 'https://fonts.cdnfonts.com/css/abc-ginto-nord-unlicensed-trial';
        if (!document.getElementById(id)) {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = () => {
                // After CSS is in, attempt to load the family
                if (document.fonts && document.fonts.load) {
                    document.fonts.load(`400 1em "${fontName}"`).then(() => {
                        applyFont(position);
                    }).catch(() => {});
                }
            };
            document.head.appendChild(link);
        } else {
            // CSS already present; try to ensure the font is activated
            if (document.fonts && document.fonts.load) {
                document.fonts.load(`400 1em "${fontName}"`).then(() => {
                    applyFont(position);
                }).catch(() => {});
            }
        }
    } else if (fontName !== 'BBC Reith Serif') {
        // Also kick off dynamic axis discovery in background for Google families
        loadGoogleFont(fontName);
        getOrCreateFontDefinition(fontName).then(() => {
            // Regenerate controls if the dynamic def was just created
            generateFontControls(position, fontName);
            restoreFontSettings(position, fontName);
            if (!suppressImmediateApply) {
                applyFont(position);
            }
        }).catch(err => console.warn('Dynamic axis discovery failed', err));
    }
    // Custom fonts are already loaded via CSS @font-face declarations
    
    // Update font name display
    const fontNameDisplayElement = document.getElementById(`${position}-font-name`);
    if (fontNameDisplayElement) {
        fontNameDisplayElement.textContent = fontName;
    }
    const familyDisplay = document.getElementById(`${position}-font-display`);
    if (familyDisplay) {
        familyDisplay.textContent = fontName;
        familyDisplay.classList.remove('placeholder');
        
        // Update default styling based on content
        if (fontName === 'Default') {
            familyDisplay.classList.add('default');
        } else {
            familyDisplay.classList.remove('default');
        }
        
        const group = familyDisplay.closest('.control-group');
        if (group) group.classList.remove('unset');
    }
    
    // Generate controls for this font
    generateFontControls(position, fontName);
    
    // Restore saved settings for this font (if any)
    restoreFontSettings(position, fontName);
    
    // Apply font to text (unless suppressed to allow a restore to set values first)
    if (!suppressImmediateApply) {
        applyFont(position);
    }
    
    // Basic controls are set up via DOMContentLoaded event listeners
    
    // Save current state unless explicitly suppressed (restores will save after values are applied)
    if (!suppressImmediateSave) {
        setTimeout(() => saveExtensionState(), 100);
    }
    // Update Apply/Applied/Update buttons to reflect new UI vs saved state
    try { setTimeout(() => { try { refreshApplyButtonsDirtyState(); } catch (_) {} }, 0); } catch (_) {}
}

async function loadGoogleFont(fontName) {
    // Skip loading for default/empty fonts
    if (!fontName || String(fontName).trim() === '' || String(fontName).toLowerCase() === 'default') {
        return;
    }
    
    // Check if font is already loaded
    const existingLink = document.querySelector(`link[data-font="${fontName}"]`);
    if (existingLink) return;
    
    // Prefer axis-tag form to guarantee variable family + axes are served
    const fontUrl = await buildCss2Url(fontName);
    
    // Skip if no URL was generated (should already be handled by buildCss2Url, but double-check)
    if (!fontUrl) return;

    // Create and append link element
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontUrl;
    link.setAttribute('data-font', fontName);
    try {
        console.log(`[Fonts] Loading css2 for ${fontName}: ${fontUrl}`);
    } catch (_) {}
    link.onload = () => { try { console.log(`[Fonts] css2 loaded for ${fontName}`); } catch (_) {} };
    link.onerror = () => { try { console.warn(`[Fonts] css2 failed for ${fontName}: ${fontUrl}`); } catch (_) {} };
    document.head.appendChild(link);
}

// Build a css2 URL that includes axis tags when available (e.g., :ital,wdth,wght)
async function buildCss2Url(fontName) {
    // Skip URL generation for default/empty font names
    if (!fontName || String(fontName).trim() === '' || String(fontName).toLowerCase() === 'default') {
        return '';
    }
    
    const familyParam = familyToQuery(fontName);
    // Prefer curated axis-tag ranges from local data file (no probe)
    try { await ensureCss2AxisRanges(); } catch (_) {}
    const entry = css2AxisRanges && css2AxisRanges[fontName];
    if (entry && entry.tags && entry.tags.length) {
        // Include ALL axes present in data (ital + custom), but drop any tag lacking a numeric range
        const tagsRaw = entry.tags.slice();
        const filtered = tagsRaw.filter(tag => {
            if (tag === 'ital') return true;
            const r = entry.ranges && entry.ranges[tag];
            return Array.isArray(r) && r.length === 2 && isFinite(r[0]) && isFinite(r[1]);
        });
        // Order requirement: alphabetical with lowercase tags first, then uppercase
        const lower = filtered.filter(t => /^[a-z]+$/.test(t)).sort();
        const upper = filtered.filter(t => /^[A-Z]+$/.test(t)).sort();
        const orderedTags = [...lower, ...upper];
        const hasItal = orderedTags.includes('ital');
        const makeTuple = (italVal) => orderedTags.map(tag => {
            if (tag === 'ital') return String(italVal);
            const r = entry.ranges[tag];
            return `${r[0]}..${r[1]}`;
        }).join(',');
        const tuples = hasItal ? [makeTuple(0), makeTuple(1)] : [makeTuple('')];
        const url = orderedTags.length
            ? `https://fonts.googleapis.com/css2?family=${familyParam}:${orderedTags.join(',')}@${tuples.join(';')}&display=swap`
            : `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`;
        try { console.log(`[Fonts] Using metadata-derived axis-tag css2 for ${fontName}: ${url}`); } catch (_) {}
        return url;
    }
    // Fallback: plain URL, rely on fvar parsing + CSS mapping to expose axes
    const url = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`;
    try { console.log(`[Fonts] Using plain css2 for ${fontName}: ${url}`); } catch (_) {}
    return url;
}

async function ensureCss2AxisRanges() {
    if (css2AxisRanges) return css2AxisRanges;
    // Build mapping from Google Fonts metadata (no local file dependency)
    try {
        await ensureGfMetadata();
        css2AxisRanges = buildCss2AxisRangesFromMetadata(gfMetadata);
    } catch (e) {
        console.warn('Failed to build css2 axis ranges from GF metadata', e);
        css2AxisRanges = {};
    }
    return css2AxisRanges;
}

function buildCss2AxisRangesFromMetadata(md) {
    if (!md) return {};
    const list = md.familyMetadataList || md.familyMetadata || md.families || [];
    const out = {};
    for (const fam of list) {
        const name = fam.family || fam.name;
        if (!name) continue;
        const axes = Array.isArray(fam.axes) ? fam.axes : [];
        const tagsSet = new Set();
        const ranges = {};
        const defaults = {};

        for (const ax of axes) {
            const tag = String(ax.tag || ax.axis || '').trim();
            if (!tag) continue;
            tagsSet.add(tag === 'ital' ? 'ital' : tag);
            const min = ax.min;
            const max = ax.max;
            if (typeof min === 'number' && typeof max === 'number') {
                ranges[tag] = [Number.isInteger(min) ? min : +min, Number.isInteger(max) ? max : +max];
            }
            const def = ax.defaultValue;
            if (typeof def === 'number' && !Number.isNaN(def)) {
                defaults[tag] = Number.isInteger(def) ? def : +def;
            }
        }

        // Add ital if family has italic styles in `fonts` map
        const fontsMap = fam.fonts || {};
        const hasItalic = Object.keys(fontsMap).some(k => /i$/.test(k));
        if (hasItalic) tagsSet.add('ital');

        const allTags = Array.from(tagsSet);
        if (!allTags.length) continue;
        const lower = allTags.filter(t => /^[a-z]+$/.test(t)).sort();
        const upper = allTags.filter(t => /^[A-Z]+$/.test(t)).sort();
        const tags = [...lower, ...upper];

        out[name] = { tags, ranges, defaults };
    }
    return out;
}

function generateFontControls(position, fontName) {
    const axesSection = document.getElementById(`${position}-axes-section`) || 
                        document.getElementById(`${position}-variable-axes`);
    // Pull dynamic defs when available
    const fontDef = dynamicFontDefinitions[fontName] || fontDefinitions[fontName];
    
    // Clear existing axes controls
    if (!axesSection) return; // Safety check
    
    if (position === 'body') {
        // Body has a different structure: clear the container, not the whole section
        const axesContainer = document.getElementById(`${position}-axes-container`);
        if (axesContainer) {
            axesContainer.innerHTML = '';
        }
    } else {
        // Top/bottom positions: clear the whole section
        axesSection.innerHTML = '<h3>Variable Axes</h3>';
    }
    
    if (!fontDef || fontDef.axes.length === 0) {
        const noAxesMsg = '<p class="no-axes">This font has no variable axes.</p>';
        if (position === 'body') {
            const axesContainer = document.getElementById(`${position}-axes-container`);
            if (axesContainer) {
                axesContainer.innerHTML = noAxesMsg;
            }
        } else {
            axesSection.innerHTML += noAxesMsg;
        }
        return;
    }
    
    // Create controls for each axis
    fontDef.axes.forEach(axis => {
        const range = fontDef.ranges[axis];
        const step = fontDef.steps[axis];
        const defaultValue = fontDef.defaults[axis];
        const axisData = axisInfo[axis] || { name: axis, description: `${axis} axis` };
        
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group unset'; // Start as unset/dimmed
        controlGroup.setAttribute('data-axis', axis);
        
        // Row 1: Label with help icon
        const labelRow = document.createElement('div');
        labelRow.className = 'control-row label-row';
        
        const label = document.createElement('label');
        label.setAttribute('for', `${position}-${axis}`);
        // Build label content so the info button sits right after the axis name
        label.textContent = `${axisData.name}: `;
        
        const infoButton = document.createElement('span');
        infoButton.className = 'axis-info-btn';
        infoButton.innerHTML = '?';
        infoButton.setAttribute('data-tooltip', axisData.description);
        
        // Add custom tooltip functionality
        infoButton.addEventListener('mouseenter', showTooltip);
        infoButton.addEventListener('mouseleave', hideTooltip);
        infoButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            showTooltip.call(this, e);
            setTimeout(() => hideTooltip.call(this), 3000);
        });
        
        // Place the info button directly after the axis name
        label.appendChild(infoButton);
        // Add the axis tag after the info button
        const axisTag = document.createElement('span');
        axisTag.className = 'axis-tag';
        axisTag.textContent = `(${axis})`;
        label.appendChild(axisTag);
        labelRow.appendChild(label);
        
        // Row 2: Reset button, text input
        const inputRow = document.createElement('div');
        inputRow.className = 'control-row input-row';
        
        const resetButton = document.createElement('span');
        resetButton.className = 'axis-reset-btn';
        resetButton.innerHTML = '↻';
        resetButton.title = 'Reset to default';
        resetButton.setAttribute('data-axis', axis);
        
        const textInput = document.createElement('input');
        textInput.type = 'number';
        textInput.id = `${position}-${axis}-text`;
        textInput.className = 'axis-text-input';
        textInput.min = range[0];
        textInput.max = range[1];
        textInput.step = step;
        textInput.value = defaultValue;
        
        inputRow.appendChild(resetButton);
        inputRow.appendChild(textInput);
        
        // Row 3: Slider
        const sliderRow = document.createElement('div');
        sliderRow.className = 'control-row slider-row';
        
        const input = document.createElement('input');
        input.type = 'range';
        input.id = `${position}-${axis}`;
        input.min = range[0];
        input.max = range[1];
        input.step = step;
        input.value = defaultValue;
        
        sliderRow.appendChild(input);
        
        // Assemble the control group
        controlGroup.appendChild(labelRow);
        controlGroup.appendChild(inputRow);
        controlGroup.appendChild(sliderRow);
        
        // Append to the correct container based on position
        if (position === 'body') {
            const axesContainer = document.getElementById(`${position}-axes-container`);
            if (axesContainer) {
                axesContainer.appendChild(controlGroup);
            }
        } else {
            axesSection.appendChild(controlGroup);
        }
        
        // Add event listeners for both slider and text input
        function activateAxis() {
            const activeAxes = getActiveAxes(position);
            if (!activeAxes.has(axis)) {
                activeAxes.add(axis);
                controlGroup.classList.remove('unset');
            }
        }
        
        function updateValues(newValue) {
            input.value = newValue;
            textInput.value = newValue;
            applyFont(position);
        }
        
        input.addEventListener('input', function() {
            activateAxis();
            updateValues(this.value);
        });
        
        textInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                activateAxis();
                const value = Math.min(Math.max(parseFloat(this.value) || defaultValue, range[0]), range[1]);
                updateValues(value);
                this.blur();
            }
        });
        
        textInput.addEventListener('blur', function() {
            // Clamp value to valid range on blur
            const value = Math.min(Math.max(parseFloat(this.value) || defaultValue, range[0]), range[1]);
            activateAxis();
            updateValues(value);
        });
        
        resetButton.addEventListener('click', function() {
            // Reset to default and make unset/dimmed again
            updateValues(defaultValue);
            const activeAxes = getActiveAxes(position);
            activeAxes.delete(axis);
            controlGroup.classList.add('unset');
            applyFont(position);
        });
    });
    
    // Store controls reference (only for top/bottom positions - body mode doesn't use this)
    if (position === 'top') {
        topFontControlsVars = {};
        topFontControlsVars.fontSize = document.getElementById('top-font-size');
        topFontControlsVars.lineHeight = document.getElementById('top-line-height');
        topFontControlsVars.fontWeight = document.getElementById('top-font-weight');
        topFontControlsVars.fontColor = document.getElementById('top-font-color');
        fontDef.axes.forEach(axis => {
            topFontControlsVars[axis] = document.getElementById(`top-${axis}`);
        });
    } else if (position === 'bottom') {
        bottomFontControlsVars = {};
        bottomFontControlsVars.fontSize = document.getElementById('bottom-font-size');
        bottomFontControlsVars.lineHeight = document.getElementById('bottom-line-height');
        bottomFontControlsVars.fontWeight = document.getElementById('bottom-font-weight');
        bottomFontControlsVars.fontColor = document.getElementById('bottom-font-color');
        fontDef.axes.forEach(axis => {
            bottomFontControlsVars[axis] = document.getElementById(`bottom-${axis}`);
        });
    }
    // Body mode and other positions don't need control variable storage
}

function formatAxisValue(axis, value) {
    switch(axis) {
        case 'wdth':
            return value + '%';
        case 'opsz':
            return value + 'pt';
        case 'slnt':
            return value + '°';
        default:
            return value;
    }
}

async function toggleApplyToPage(position) {
    console.log(`toggleApplyToPage called for position: ${position}`);
    const genericKey = (position === 'top') ? 'serif' : 
                      (position === 'body') ? 'body' : 'sans';
    try {
        const origin = await getActiveOrigin();
        const host = origin ? (new URL(origin)).hostname : '';
        console.log(`toggleApplyToPage: origin = ${origin}, genericKey = ${genericKey}`);
        // Determine saved state for this origin/role
        let savedEntry = null;
        if (origin) {
            try {
                const data = await browser.storage.local.get('affoApplyMap');
                const applyMap = (data && data.affoApplyMap) ? data.affoApplyMap : {};
                savedEntry = applyMap[origin] ? applyMap[origin][genericKey] : null;
                console.log(`toggleApplyToPage: savedEntry =`, savedEntry);
            } catch (_) { savedEntry = null; }
        }
        
        // If there is a saved entry and current UI matches it, treat this click as Unapply
        console.log(`toggleApplyToPage: Checking if savedEntry exists:`, !!savedEntry);
        if (savedEntry) {
            console.log(`toggleApplyToPage: savedEntry details:`, savedEntry);
            const currentPayload = buildCurrentPayload(position);
            if (!currentPayload || payloadEquals(savedEntry, currentPayload)) {
                // Remove immediate CSS if present
                if (appliedCssActive[genericKey]) {
                    try { await browser.tabs.removeCSS({ code: appliedCssActive[genericKey] }); } catch (_) {}
                    appliedCssActive[genericKey] = null;
                }
                // Remove saved persistence
                if (origin) {
                    try {
                        const data = await browser.storage.local.get('affoApplyMap');
                        const applyMap = (data && data.affoApplyMap) ? data.affoApplyMap : {};
                        if (applyMap[origin]) {
                            delete applyMap[origin][genericKey];
                            if (!applyMap[origin].serif && !applyMap[origin].sans) delete applyMap[origin];
                        }
                        await browser.storage.local.set({ affoApplyMap: applyMap });
                    } catch (_) {}
                }
                // Remove any previously injected <style>/<link> nodes
                const styleIdOff = 'a-font-face-off-style-' + (genericKey === 'serif' ? 'serif' : 'sans');
                const linkIdOff = styleIdOff + '-link';
                try {
                    await browser.tabs.executeScript({ code: `
                        (function(){
                            try{ var s=document.getElementById('${styleIdOff}'); if(s) s.remove(); }catch(_){}
                            try{ var l=document.getElementById('${linkIdOff}'); if(l) l.remove(); }catch(_){}
                        })();
                    `});
                } catch (_) {}
                return false;
            }
            // else: saved exists but differs from current (Update) — fall through to apply updated payload
        }
        // Get current config for this position
        const cfg = getCurrentUIConfig(position);
        console.log(`toggleApplyToPage: getCurrentUIConfig returned:`, cfg);
        if (!cfg) return false;
        
        // If updating existing config, preserve previously applied settings
        if (savedEntry) {
            console.log(`toggleApplyToPage: Merging with savedEntry to preserve settings`);
            
            // Only preserve previously applied controls that aren't explicitly unset in UI
            const sizeGroup = document.querySelector('#body-font-controls .control-group[data-control="font-size"]');
            const lineHeightGroup = document.querySelector('#body-font-controls .control-group[data-control="line-height"]');
            const weightGroup = document.querySelector('#body-font-controls .control-group[data-control="weight"]');
            const colorGroup = document.querySelector('#body-font-controls .control-group[data-control="color"]');
            
            // Only preserve if control is NOT explicitly unset (user hasn't reset it)
            if (!cfg.activeControls.includes('font-size') && (!sizeGroup || !sizeGroup.classList.contains('unset')) && savedEntry.fontSizePx !== null && savedEntry.fontSizePx !== undefined) {
                cfg.basicControls.fontSize = savedEntry.fontSizePx;
                cfg.activeControls.push('font-size');
                console.log(`toggleApplyToPage: Preserved fontSizePx: ${savedEntry.fontSizePx}`);
            }
            
            if (!cfg.activeControls.includes('line-height') && (!lineHeightGroup || !lineHeightGroup.classList.contains('unset')) && savedEntry.lineHeight !== null && savedEntry.lineHeight !== undefined) {
                cfg.basicControls.lineHeight = savedEntry.lineHeight;
                cfg.activeControls.push('line-height');
                console.log(`toggleApplyToPage: Preserved lineHeight: ${savedEntry.lineHeight}`);
            }
            
            if (!cfg.activeControls.includes('weight') && (!weightGroup || !weightGroup.classList.contains('unset')) && savedEntry.fontWeight !== null && savedEntry.fontWeight !== undefined) {
                cfg.basicControls.fontWeight = savedEntry.fontWeight;
                cfg.activeControls.push('weight');
                console.log(`toggleApplyToPage: Preserved fontWeight: ${savedEntry.fontWeight}`);
            }
            
            if (!cfg.activeControls.includes('color') && (!colorGroup || !colorGroup.classList.contains('unset')) && savedEntry.fontColor !== null && savedEntry.fontColor !== undefined) {
                cfg.basicControls.fontColor = savedEntry.fontColor;
                cfg.activeControls.push('color');
                console.log(`toggleApplyToPage: Preserved fontColor: ${savedEntry.fontColor}`);
            } else if (colorGroup && colorGroup.classList.contains('unset')) {
                console.log(`toggleApplyToPage: Color is explicitly unset - NOT preserving color`);
            }
            
            console.log(`toggleApplyToPage: Final merged config:`, cfg);
        }
        const fontName = cfg.fontName;
        const isCustom = (!!fontName) && (fontName === 'BBC Reith Serif' || fontName === 'ABC Ginto Normal Unlicensed Trial');
        const css2Url = isCustom ? '' : await buildCss2Url(fontName);
        // Determine if this origin should be FontFace-only
        let fontFaceOnly = false;
        try {
            const dd = await browser.storage.local.get('affoFontFaceOnlyDomains');
            const list = Array.isArray(dd.affoFontFaceOnlyDomains) ? dd.affoFontFaceOnlyDomains : ['x.com'];
            const h = String(host || '').toLowerCase();
            fontFaceOnly = !!list.find(d => { const dom = String(d||'').toLowerCase().trim(); return dom && (h === dom || h.endsWith('.' + dom)); });
        } catch (_) {}
        let inlineApply = false;
        try {
            const dd2 = await browser.storage.local.get('affoInlineApplyDomains');
            const list2 = Array.isArray(dd2.affoInlineApplyDomains) ? dd2.affoInlineApplyDomains : ['x.com'];
            const h2 = String(host || '').toLowerCase();
            inlineApply = !!list2.find(d => { const dom = String(d||'').toLowerCase().trim(); return dom && (h2 === dom || h2.endsWith('.' + dom)); });
        } catch (_) {}
        const activeAxes = new Set(cfg.activeAxes || []);
        var varParts = [];
        var wdthVal = null, slntVal = null, italVal = null;
        Object.entries(cfg.variableAxes || {}).forEach(function(entry){
            var axis = entry[0];
            var value = Number(entry[1]);
            if (!activeAxes.has(axis) || !isFinite(value)) return;
            if (axis === 'wdth') wdthVal = value;
            if (axis === 'slnt') slntVal = value;
            if (axis === 'ital') italVal = value;
            varParts.push('"' + axis + '" ' + value);
        });
        // Keep site semantics globally, but allow optional override on non-strong/b elements
        var weightActive = (cfg.activeControls || []).indexOf('weight') !== -1;
        var fontWeight = weightActive ? Number(cfg.basicControls && cfg.basicControls.fontWeight) : null;

        // Ensure a css2 <link> is present to start font download quickly (matches reload path)
        if (css2Url && !fontFaceOnly && !inlineApply) {
            try {
                const styleIdEnsure = 'a-font-face-off-style-' + (genericKey === 'serif' ? 'serif' : 'sans');
                const linkIdEnsure = styleIdEnsure + '-link';
                const hrefEnsure = css2Url;
                const code = `(
                    function(){
                        try{
                            var id = ${JSON.stringify(linkIdEnsure)};
                            var href = ${JSON.stringify(hrefEnsure)};
                            var l = document.getElementById(id);
                            if(!l){ l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href; document.documentElement.appendChild(l); }
                        }catch(e){}
                    }
                )();`;
                await browser.tabs.executeScript({ code });
            } catch(e) {}
        }

        // Heuristically guard inline left-border callouts ("fake blockquotes") so we don't restyle them
        try {
            const guardCode = `(() => {
              try {
                var nodes = document.querySelectorAll('[style*="border-left"]');
                nodes.forEach(function(el){
                  try {
                    var s = String(el.getAttribute('style')||'').toLowerCase();
                    if ((/border-left-style\s*:\s*solid/.test(s) || /border-left\s*:\s*\d/.test(s)) &&
                        (/border-left-width\s*:\s*\d/.test(s) || /border-left\s*:\s*\d/.test(s))) {
                      el.setAttribute('data-affo-guard', '1');
                      try { el.querySelectorAll('*').forEach(function(n){ try{ n.setAttribute('data-affo-guard','1'); }catch(_){ } }); } catch(_){ }
                    }
                  } catch(_){ }
                });
              } catch(_){ }
            })();`;
            await browser.tabs.executeScript({ code: guardCode });
        } catch (_) {}

        var lines = [];
        if (css2Url && !fontFaceOnly && !inlineApply) lines.push('@import url("' + css2Url + '");');
        var decl = [];
        if (fontName) decl.push('font-family: "' + fontName + '", ' + (genericKey === 'serif' ? 'serif' : 'sans-serif') + ' !important');
        const fontSizeValue = cfg.basicControls && cfg.basicControls.fontSize;
        const fontSizePx = fontSizeValue !== null ? Number(fontSizeValue) : null;
        const lineHeightValue = cfg.basicControls && cfg.basicControls.lineHeight;
        const lineHeight = lineHeightValue !== null ? Number(lineHeightValue) : null;
        const sizeActive = (cfg.activeControls || []).indexOf('font-size') !== -1;
        const lineActive = (cfg.activeControls || []).indexOf('line-height') !== -1;
        const colorActive = (cfg.activeControls || []).indexOf('color') !== -1;
        if (sizeActive && fontSizePx !== null && !isNaN(fontSizePx)) decl.push('font-size: ' + fontSizePx + 'px !important');
        if (lineActive && lineHeight !== null && !isNaN(lineHeight)) decl.push('line-height: ' + lineHeight + ' !important');
        if (colorActive && cfg.basicControls && cfg.basicControls.fontColor && cfg.basicControls.fontColor !== 'default') {
            console.log(`Adding color CSS: color: ${cfg.basicControls.fontColor} !important`);
            decl.push('color: ' + cfg.basicControls.fontColor + ' !important');
        } else {
            console.log(`NOT adding color CSS - colorActive: ${colorActive}, fontColor: ${cfg.basicControls?.fontColor}`);
        }
        if (wdthVal !== null) decl.push('font-stretch: ' + wdthVal + '% !important');
        if (italVal !== null && italVal >= 1) decl.push('font-style: italic !important');
        else if (slntVal !== null && slntVal !== 0) decl.push('font-style: oblique ' + slntVal + 'deg !important');
        if (varParts.length) decl.push('font-variation-settings: ' + varParts.join(', ') + ' !important');
        // Body Contact mode uses efficient broad selectors but excludes Third Man In elements
        const guardNeg = ":not(#affo-guard):not(.affo-guard):not([data-affo-guard]):not([data-affo-font-type])";
        const baseSel = "body" + guardNeg + ", " +
                        "body" + guardNeg + " :not(#affo-guard):not(.affo-guard):not([data-affo-guard]):not([data-affo-font-type])" +
                        ":not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not(strong):not(b):not([role=\\\"navigation\\\"]):not([role=\\\"banner\\\"]):not([role=\\\"contentinfo\\\"]):not([role=\\\"complementary\\\"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^=\\\"language-\\\"]):not([class*=\\\" language-\\\"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc)";
        lines.push(baseSel + ' { ' + decl.join('; ') + '; }');
        // If user activated Weight, apply traditional font-weight (independent of variable axes)
        // Bold elements already excluded by baseSel
        if (weightActive && isFinite(fontWeight)) {
            lines.push(baseSel + ' { font-weight: ' + fontWeight + ' !important; }');
        }
        // Apply variable axes independently (including wght if set)
        // Split into wght and non-wght axes to handle bold preservation
        if (varParts.length) {
            const wghtParts = varParts.filter(p => /^"wght"\s/.test(p));
            const nonWghtParts = varParts.filter(p => !/^"wght"\s/.test(p));
            
            // Apply all non-wght axes to all elements
            if (nonWghtParts.length) {
                lines.push(baseSel + ' { font-variation-settings: ' + nonWghtParts.join(', ') + ' !important; }');
            }
            
            // Apply wght axis - bold elements already excluded by baseSel
            // Combine with non-wght axes if both exist
            if (wghtParts.length) {
                const allAxesForNonBold = nonWghtParts.concat(wghtParts);
                lines.push(baseSel + ' { font-variation-settings: ' + allAxesForNonBold.join(', ') + ' !important; }');
            }
        }
        // Override rule for bold elements with maximum specificity
        lines.push('body strong, body b, html body strong, html body b { font-family: initial !important; font-weight: bold !important; font-variation-settings: initial !important; }');
        var cssCode = lines.join('\n');
        console.log(`CSS being applied to ${origin}:`, cssCode);
        if (!fontFaceOnly && !inlineApply) {
            // Skip cleanup script for performance - body mode CSS already excludes [data-affo-font-type] elements
            // TODO: Test if cleanup is actually needed for proper body mode functionality
            /*
            try {
                const cleanupScript = generateBodyContactCleanupScript();
                await browser.tabs.executeScript({ code: cleanupScript });
            } catch (e) {
                console.warn('Failed to execute Body Contact cleanup:', e);
            }
            */
            
            await browser.tabs.insertCSS({ code: cssCode });
            appliedCssActive[genericKey] = cssCode;
        } else {
            // Rely on content script injection (storage event) to attach a <style> we can keep last via observer
            appliedCssActive[genericKey] = null;
        }
        // Persist payload for this origin so content script can reapply on reload
        if (origin) {
            const payload = {
                fontName,
                generic: (genericKey === 'serif' ? 'serif' : 'sans-serif'),
                css2Url,
                fontFaceOnly,
                inlineApply,
                varPairs: varParts.map(function(p){
                    var m = p.match(/"([A-Za-z]+)"\s+([\-0-9\.]+)/); return m ? { tag: m[1], value: Number(m[2]) } : null;
                }).filter(Boolean),
                wdthVal,
                slntVal,
                italVal,
                fontWeight,
                fontSizePx: isNaN(fontSizePx) ? null : fontSizePx,
                lineHeight: isNaN(lineHeight) ? null : lineHeight,
                fontColor: (colorActive && cfg.basicControls && cfg.basicControls.fontColor !== 'default') ? cfg.basicControls.fontColor : null,
                styleId: 'a-font-face-off-style-' + (genericKey === 'serif' ? 'serif' : 'sans'),
                linkId: 'a-font-face-off-style-' + (genericKey === 'serif' ? 'serif' : 'sans') + '-link'
            };
            try {
                const data = await browser.storage.local.get('affoApplyMap');
                const applyMap = (data && data.affoApplyMap) ? data.affoApplyMap : {};
                if (!applyMap[origin]) applyMap[origin] = {};
                applyMap[origin][genericKey] = Object.assign({}, payload, { preserveBold: !!weightActive });
                await browser.storage.local.set({ affoApplyMap: applyMap });
            } catch (_) {}
        }
        return true;
    } catch (e) {
        try { console.warn('toggleApplyToPage failed', e); } catch (_) {}
        return false;
    }
}

// Third Man In mode font application
async function toggleThirdManInFont(fontType) {
    console.log(`toggleThirdManInFont: Starting for fontType: ${fontType}`);
    try {
        const origin = await getActiveOrigin();
        console.log(`toggleThirdManInFont: Origin: ${origin}`);
        if (!origin) {
            console.log('toggleThirdManInFont: No origin, returning false');
            return false;
        }
        
        const mode = 'third-man-in';
        const position = fontType; // serif, sans, mono
        const modeData = await getApplyMapForOrigin(origin, mode);
        const savedEntry = modeData ? modeData[fontType] : null;
        
        // Build current payload
        const currentPayload = buildThirdManInPayload(fontType);
        console.log(`toggleThirdManInFont: savedEntry:`, savedEntry);
        console.log(`toggleThirdManInFont: currentPayload:`, currentPayload);
        
        // If saved entry exists and matches current, treat as unapply
        if (savedEntry && currentPayload && payloadEquals(savedEntry, currentPayload)) {
            console.log(`toggleThirdManInFont: Payloads match, treating as unapply`);
            // Remove applied CSS
            if (appliedCssActive[fontType]) {
                try { await browser.tabs.removeCSS({ code: appliedCssActive[fontType] }); } catch (_) {}
                appliedCssActive[fontType] = null;
            }
            
            // Clear from storage
            await clearApplyMapForOrigin(origin, mode, fontType);
            
            // Remove injected style elements and clean up data attributes
            const styleId = `a-font-face-off-${fontType}-style`;
            const linkId = `${styleId}-link`;
            try {
                await browser.tabs.executeScript({ code: `
                    (function(){
                        try{ var s=document.getElementById('${styleId}'); if(s) s.remove(); }catch(_){}
                        try{ var l=document.getElementById('${linkId}'); if(l) l.remove(); }catch(_){}
                        // Clean up data-affo-font-type attributes for this font type
                        try{
                            document.querySelectorAll('[data-affo-font-type="${fontType}"]').forEach(el => {
                                el.removeAttribute('data-affo-font-type');
                            });
                        }catch(_){}
                    })();
                `});
            } catch (_) {}
            
            return false; // Unapplied
        }
        
        // Apply new font configuration
        console.log(`toggleThirdManInFont: About to apply new font configuration`);
        if (currentPayload) {
            console.log(`toggleThirdManInFont: currentPayload exists, proceeding with application`);
            // Remove any existing CSS for this font type
            if (appliedCssActive[fontType]) {
                try { await browser.tabs.removeCSS({ code: appliedCssActive[fontType] }); } catch (_) {}
            }
            
            // First, run DOM walker to identify and mark elements
            console.log(`toggleThirdManInFont: About to run walker script for ${fontType}`);
            try {
                const walkerScript = generateElementWalkerScript(fontType);
                console.log(`toggleThirdManInFont: Walker script length: ${walkerScript.length}`);
                const result = await browser.tabs.executeScript({ code: walkerScript });
                console.log(`toggleThirdManInFont: Walker script executed, result:`, result);
            } catch (e) {
                console.error(`toggleThirdManInFont: Failed to execute element walker for ${fontType}:`, e);
            }
            
            // Generate and apply CSS
            const cssCode = generateThirdManInCSS(fontType, currentPayload);
            console.log(`toggleThirdManInFont: Generated CSS length: ${cssCode ? cssCode.length : 'null'}`);
            console.log(`toggleThirdManInFont: Generated CSS:`, cssCode);
            if (cssCode) {
                console.log(`toggleThirdManInFont: Applying CSS to page`);
                try {
                    // Try both methods: browser.tabs.insertCSS and direct <style> injection
                    await browser.tabs.insertCSS({ code: cssCode });
                    console.log(`toggleThirdManInFont: CSS injection successful`);
                    
                    // Also inject via <style> element for better persistence
                    const styleInjectionScript = `
                        (function() {
                            // Remove any existing style
                            const existingStyle = document.getElementById('affo-third-man-${fontType}');
                            if (existingStyle) existingStyle.remove();
                            
                            // Inject new style
                            const style = document.createElement('style');
                            style.id = 'affo-third-man-${fontType}';
                            style.textContent = \`${cssCode}\`;
                            document.head.appendChild(style);
                            
                            console.log('STYLE INJECTION: Added style element for ${fontType}:', style.textContent);
                            return 'style-injected';
                        })();
                    `;
                    const styleResult = await browser.tabs.executeScript({ code: styleInjectionScript });
                    console.log(`toggleThirdManInFont: Style element injection result:`, styleResult);
                    
                    appliedCssActive[fontType] = cssCode;
                    
                    // Test basic script execution
                    try {
                        const testResult = await browser.tabs.executeScript({ code: 'console.log("SCRIPT TEST: Extension can execute scripts on this page"); "test-success"' });
                        console.log(`toggleThirdManInFont: Script execution test result:`, testResult);
                    } catch (scriptError) {
                        console.error(`toggleThirdManInFont: Script execution test failed:`, scriptError);
                    }
                } catch (error) {
                    console.error(`toggleThirdManInFont: CSS injection failed:`, error);
                }
                
                // Immediate verification of CSS application
                setTimeout(async () => {
                    try {
                        console.log(`toggleThirdManInFont: Running immediate CSS verification`);
                        const verifyScript = `
                            console.log('IMMEDIATE VERIFICATION: Elements with ${fontType} marker:', document.querySelectorAll('[data-affo-font-type="${fontType}"]').length);
                            const firstEl = document.querySelector('[data-affo-font-type="${fontType}"]');
                            if (firstEl) {
                                const style = getComputedStyle(firstEl);
                                console.log('IMMEDIATE VERIFICATION: First element font-family:', style.fontFamily);
                                console.log('IMMEDIATE VERIFICATION: First element tag:', firstEl.tagName);
                                console.log('IMMEDIATE VERIFICATION: First element text:', firstEl.textContent.slice(0, 50));
                            } else {
                                console.warn('IMMEDIATE VERIFICATION: No elements found with ${fontType} marker');
                            }
                        `;
                        await browser.tabs.executeScript({ code: verifyScript });
                    } catch (e) {
                        console.error(`toggleThirdManInFont: Immediate verification failed:`, e);
                    }
                }, 100);
                
                // Verify CSS application on page
                try {
                    const verifyScript = `
                        (function() {
                            const markedElements = document.querySelectorAll('[data-affo-font-type="${fontType}"]');
                            console.log('Verification: Found ' + markedElements.length + ' elements marked as ${fontType}');
                            
                            if (markedElements.length > 0) {
                                const firstElement = markedElements[0];
                                const computedStyle = window.getComputedStyle(firstElement);
                                const fontFamily = computedStyle.fontFamily;
                                console.log('Verification: First marked element computed font-family:', fontFamily);
                                console.log('Verification: First marked element tag:', firstElement.tagName);
                                console.log('Verification: First marked element text:', firstElement.textContent.substring(0, 50) + '...');
                            }
                        })();
                    `;
                    await browser.tabs.executeScript({ code: verifyScript });
                } catch (e) {
                    console.warn('Failed to run verification script:', e);
                }
                
                // Save to storage
                const configToSave = {};
                configToSave[fontType] = currentPayload;
                console.log(`toggleThirdManInFont: Saving config to storage:`, configToSave);
                await saveApplyMapForOrigin(origin, mode, configToSave);
                
                console.log(`toggleThirdManInFont: Successfully applied ${fontType} font`);
                return true; // Applied
            } else {
                console.log(`toggleThirdManInFont: No CSS generated, failing`);
            }
        }
        
        return false;
    } catch (e) {
        try { console.warn('toggleThirdManInFont failed', e); } catch (_) {}
        return false;
    }
}

function buildThirdManInPayload(fontType) {
    const cfg = getCurrentUIConfig(fontType);
    if (!cfg) return null;
    
    // Determine generic based on font type
    let generic;
    switch(fontType) {
        case 'serif': generic = 'serif'; break;
        case 'sans': generic = 'sans-serif'; break;
        case 'mono': generic = 'monospace'; break;
        default: return null;
    }
    
    const activeAxes = new Set(cfg.activeAxes || []);
    const varPairs = [];
    
    Object.entries(cfg.variableAxes || {}).forEach(([axis, value]) => {
        const num = Number(value);
        if (activeAxes.has(axis) && isFinite(num)) {
            varPairs.push({ tag: axis, value: num });
        }
    });
    
    const weightActive = (cfg.activeControls || []).indexOf('weight') !== -1;
    const fontWeight = weightActive ? Number(cfg.basicControls && cfg.basicControls.fontWeight) : null;
    const fontSizeActive = (cfg.activeControls || []).indexOf('font-size') !== -1;
    const fontSize = fontSizeActive && cfg.basicControls ? Number(cfg.basicControls.fontSize) : null;
    const lineHeightActive = (cfg.activeControls || []).indexOf('line-height') !== -1;
    const lineHeight = lineHeightActive && cfg.basicControls ? Number(cfg.basicControls.lineHeight) : null;
    
    // Build font variation settings string
    let fontVariationSettings = null;
    if (varPairs.length > 0) {
        fontVariationSettings = varPairs.map(p => `"${p.tag}" ${p.value}`).join(', ');
    }
    
    return {
        fontName: cfg.fontName,
        generic,
        fontSize,
        lineHeight,
        fontWeight,
        fontVariationSettings,
        varPairs,
        css2Url: cfg.css2Url || null,
        fontFaceRule: cfg.fontFaceRule || null
    };
}

// Update font previews for Third Man In mode
function updateThirdManInPreview(fontType) {
    const textElement = document.getElementById(`${fontType}-font-text`);
    const nameElement = document.getElementById(`${fontType}-font-name`);
    
    if (!textElement || !nameElement) return;
    
    const cfg = getCurrentUIConfig(fontType);
    if (!cfg) return;
    
    // Update font name display
    nameElement.textContent = cfg.fontName || fontType.charAt(0).toUpperCase() + fontType.slice(1);
    
    // Build font-family CSS
    let fontFamily = cfg.fontName || '';
    switch(fontType) {
        case 'serif': fontFamily += ', serif'; break;
        case 'sans': fontFamily += ', sans-serif'; break;
        case 'mono': fontFamily += ', monospace'; break;
    }
    
    // Apply styles to preview text
    let style = `font-family: ${fontFamily};`;
    
    if (cfg.basicControls) {
        if (cfg.basicControls.fontSize) style += ` font-size: ${cfg.basicControls.fontSize}px;`;
        if (cfg.basicControls.lineHeight) style += ` line-height: ${cfg.basicControls.lineHeight};`;
        if (cfg.basicControls.fontWeight) style += ` font-weight: ${cfg.basicControls.fontWeight};`;
    }
    
    // Add variable font settings if available
    if (cfg.variableAxes && Object.keys(cfg.variableAxes).length > 0) {
        const activeAxes = new Set(cfg.activeAxes || []);
        const varSettings = Object.entries(cfg.variableAxes)
            .filter(([axis]) => activeAxes.has(axis))
            .map(([axis, value]) => `"${axis}" ${value}`)
            .join(', ');
        
        if (varSettings) {
            style += ` font-variation-settings: ${varSettings};`;
        }
    }
    
    textElement.style.cssText = style;
}

// Pre-highlight Apply buttons based on saved per-origin settings
async function syncApplyButtonsForOrigin() {
    try {
        const applyTopBtn = document.getElementById('apply-top');
        const applyBottomBtn = document.getElementById('apply-bottom');
        if (!applyTopBtn && !applyBottomBtn) return;
        const origin = await getActiveOrigin();
        if (!origin) return;
        const data = await browser.storage.local.get('affoApplyMap');
        const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
        const entry = map[origin] || {};
        if (applyTopBtn) {
            const on = !!entry.serif;
            applyTopBtn.classList.toggle('active', on);
            applyTopBtn.textContent = on ? '✓' : 'Apply';
            const r = document.getElementById('reset-top');
            if (r) r.style.display = on ? 'inline-flex' : 'none';
        }
        if (applyBottomBtn) {
            const on = !!entry.sans;
            applyBottomBtn.classList.toggle('active', on);
            applyBottomBtn.textContent = on ? '✓' : 'Apply';
            const r = document.getElementById('reset-bottom');
            if (r) r.style.display = on ? 'inline-flex' : 'none';
        }
    } catch (_) {}
}

// Sync Third Man In apply buttons with saved state
async function syncThirdManInButtons() {
    try {
        const origin = await getActiveOrigin();
        if (!origin) return;
        
        const modeData = await getApplyMapForOrigin(origin, 'third-man-in');
        const fontTypes = ['serif', 'sans', 'mono'];
        
        fontTypes.forEach(fontType => {
            const applyBtn = document.getElementById(`apply-${fontType}`);
            const resetBtn = document.getElementById(`reset-${fontType}`);
            
            if (applyBtn) {
                const on = !!(modeData && modeData[fontType]);
                applyBtn.classList.toggle('active', on);
                applyBtn.textContent = on ? '✓' : 'Apply';
                applyBtn.style.display = on ? 'inline-flex' : 'none';
                
                if (resetBtn) {
                    resetBtn.style.display = on ? 'inline-flex' : 'none';
                }
            }
        });
    } catch (_) {}
}

function saveFontSettings(position, fontName) {
    let memory;
    if (position === 'top') memory = topFontMemory;
    else if (position === 'bottom') memory = bottomFontMemory;
    else if (position === 'body') memory = bodyFontMemory;
    else if (position === 'serif') memory = serifFontMemory;
    else if (position === 'sans') memory = sansFontMemory;
    else if (position === 'mono') memory = monoFontMemory;
    else return; // unsupported position
    const activeAxes = getActiveAxes(position);
    const activeControls = getActiveControls(position);
    const fontDef = getEffectiveFontDefinition(fontName);
    
    const fontSizeEl = document.getElementById(`${position}-font-size`);
    const lineHeightEl = document.getElementById(`${position}-line-height`);
    const fontWeightEl = document.getElementById(`${position}-font-weight`);
    const fontColorEl = document.getElementById(`${position}-font-color`);
    
    const settings = {
        basicControls: {
            fontSize: fontSizeEl ? fontSizeEl.value : null,
            lineHeight: lineHeightEl ? lineHeightEl.value : null,
            fontWeight: fontWeightEl ? fontWeightEl.value : null,
            fontColor: fontColorEl ? fontColorEl.value : null
        },
        activeControls: new Set(activeControls),
        activeAxes: new Set(activeAxes),
        axisValues: {}
    };
    
    // Save variable axis values
    if (fontDef && fontDef.axes) {
        fontDef.axes.forEach(axis => {
            const control = document.getElementById(`${position}-${axis}`);
            if (control) {
                settings.axisValues[axis] = control.value;
            }
        });
    }
    
    memory[fontName] = settings;
}

function restoreFontSettings(position, fontName) {
    let memory;
    if (position === 'top') memory = topFontMemory;
    else if (position === 'bottom') memory = bottomFontMemory;
    else if (position === 'body') memory = bodyFontMemory;
    else if (position === 'serif') memory = serifFontMemory;
    else if (position === 'sans') memory = sansFontMemory;
    else if (position === 'mono') memory = monoFontMemory;
    else return; // unsupported position
    const saved = memory[fontName];
    
    if (!saved) return; // No saved settings for this font
    
    // Restore basic controls
    document.getElementById(`${position}-font-size`).value = saved.basicControls.fontSize;
    document.getElementById(`${position}-line-height`).value = saved.basicControls.lineHeight;
    document.getElementById(`${position}-font-weight`).value = saved.basicControls.fontWeight;
    document.getElementById(`${position}-font-color`).value = saved.basicControls.fontColor;
    
    // Restore active controls tracking
    if (position === 'top') {
        topActiveControls = new Set(saved.activeControls);
        topActiveAxes = new Set(saved.activeAxes);
    } else {
        bottomActiveControls = new Set(saved.activeControls);
        bottomActiveAxes = new Set(saved.activeAxes);
    }
    
    // Restore variable axis values and activate them
    const fontDef = getEffectiveFontDefinition(fontName);
    if (fontDef && fontDef.axes) {
        fontDef.axes.forEach(axis => {
            if (saved.axisValues[axis] !== undefined) {
                const control = document.getElementById(`${position}-${axis}`);
                const textControl = document.getElementById(`${position}-${axis}-text`);
                const controlGroup = document.querySelector(`#${position}-font-controls .control-group[data-axis="${axis}"]`);
                
                if (control && textControl) {
                    const value = saved.axisValues[axis];
                    control.value = value;
                    textControl.value = value;
                    
                    // Activate the axis if it was previously active
                    if (saved.activeAxes.has(axis) && controlGroup) {
                        controlGroup.classList.remove('unset');
                    }
                }
            }
        });
    }
    
    // Restore basic control activation states
    if (saved.activeControls.has('weight')) {
        const weightControl = document.querySelector(`#${position}-font-controls .control-group[data-control="weight"]`);
        if (weightControl) {
            weightControl.classList.remove('unset');
        }
    }
}

function applyFont(position) {
    // Check if font is unset by looking for placeholder class
    const fontDisplay = document.getElementById(`${position}-font-display`);
    const isUnsetFont = fontDisplay && fontDisplay.classList.contains('placeholder');
    
    // Get font name from most reliable source - prioritize display element over heading
    const selectEl = document.getElementById(`${position}-font-select`);
    const headingEl = document.getElementById(`${position}-font-name`);
    
    let fontName = null;
    // Try display element first (most reliable after font selection)
    if (fontDisplay && !fontDisplay.classList.contains('placeholder')) {
        fontName = fontDisplay.textContent;
    }
    // Fall back to select element
    else if (selectEl && selectEl.value) {
        fontName = selectEl.value;
    }
    // Last resort: heading element (but only if it's not "Default")
    else if (headingEl && headingEl.textContent && headingEl.textContent !== 'Default') {
        fontName = headingEl.textContent;
    }
    
    if (!fontName) return; // No font selected yet
    
    const fontDef = getEffectiveFontDefinition(fontName);
    const textElement = document.getElementById(`${position}-font-text`);
    const headingElement = document.getElementById(`${position}-font-name`);
    
    // Get control elements
    const fontSizeControl = document.getElementById(`${position}-font-size`);
    const lineHeightControl = document.getElementById(`${position}-line-height`);
    const fontWeightControl = document.getElementById(`${position}-font-weight`);
    const fontColorControl = document.getElementById(`${position}-font-color`);
    
    if (!fontSizeControl) return; // Controls not ready yet
    
    // Apply basic properties
    const fontSize = fontSizeControl.value + 'px';
    const lineHeight = lineHeightControl.value;
    const fontWeight = fontWeightControl.value;
    const fontColor = fontColorControl.value;
    const activeControls = getActiveControls(position);
    
    // Apply styles to text element if it exists
    if (textElement) {
        if (activeControls.has('font-size')) { textElement.style.fontSize = fontSize; } else { textElement.style.fontSize = ''; }
        if (activeControls.has('line-height')) { textElement.style.lineHeight = lineHeight; } else { textElement.style.lineHeight = ''; }
        
        // Handle color: only apply if not "default", otherwise clear the color
        if (fontColor !== 'default') {
            textElement.style.color = fontColor;
        } else {
            textElement.style.color = '';
        }
        
        if (isUnsetFont) {
            textElement.style.fontFamily = '';
            // For body mode, always show the text even if font is "Default"
            if (position === 'body') {
                textElement.style.display = '';
            } else {
                textElement.style.display = 'none'; // Hide Gettysburg Address when font is unset in other modes
            }
        } else {
            textElement.style.fontFamily = `"${fontName}"`;
            textElement.style.display = ''; // Show Gettysburg Address when font is set
        }
    }
    
    // Only apply font-weight if the weight control has been activated
    if (textElement) {
        if (activeControls.has('weight')) {
            textElement.style.fontWeight = fontWeight;
        } else {
            textElement.style.fontWeight = ''; // Let font's default weight show
        }
    }
    
    // Apply styles to heading element if it exists
    if (headingElement) {
        headingElement.style.fontSize = Math.max(16, parseFloat(fontSize) + 2) + 'px';
        // Handle color: only apply if not "default", otherwise clear the color
        if (fontColor !== 'default') {
            headingElement.style.color = fontColor;
        } else {
            headingElement.style.color = '';
        }
        if (isUnsetFont) {
            headingElement.style.fontFamily = 'Roboto, sans-serif';
            headingElement.textContent = 'Default';
        } else {
            headingElement.style.fontFamily = `"${fontName}"`;
            headingElement.textContent = fontName;
        }
        
        // Only apply font-weight to heading if the weight control has been activated
        if (activeControls.has('weight')) {
            headingElement.style.fontWeight = fontWeight;
        } else {
            headingElement.style.fontWeight = ''; // Let font's default weight show
        }
    }
    
    // Apply variable axes if available - only active ones
    if (fontDef && fontDef.axes && fontDef.axes.length > 0) {
        const activeAxes = getActiveAxes(position);
        let wdthVal = null;
        let slntVal = null;
        let italVal = null;
        const variations = fontDef.axes.map(axis => {
            const control = document.getElementById(`${position}-${axis}`);
            const isActive = control && activeAxes.has(axis);
            if (isActive) {
                const num = parseFloat(control.value);
                if (axis === 'wdth') wdthVal = num;
                if (axis === 'slnt') slntVal = num;
                if (axis === 'ital') italVal = num;
            }
            // Only include axis if it's been activated (touched)
            return (isActive) ? `"${axis}" ${control.value}` : null;
        }).filter(Boolean).join(', ');
        
        if (variations) {
            console.log(`Font variation settings for ${position} (${fontName}):`, variations);
            if (textElement) textElement.style.fontVariationSettings = variations;
            if (headingElement) headingElement.style.fontVariationSettings = variations;
        } else {
            // Clear font variation settings if no active axes
            if (textElement) textElement.style.fontVariationSettings = '';
            if (headingElement) headingElement.style.fontVariationSettings = '';
        }

        // For registered axes, map to high-level CSS properties (which take precedence)
        if (wdthVal !== null) {
            const pct = Math.max(1, Math.min(1000, wdthVal));
            if (textElement) textElement.style.fontStretch = pct + '%';
            if (headingElement) headingElement.style.fontStretch = pct + '%';
        } else {
            if (textElement) textElement.style.fontStretch = '';
            if (headingElement) headingElement.style.fontStretch = '';
        }

        if (italVal !== null && italVal >= 1) {
            if (textElement) textElement.style.fontStyle = 'italic';
            if (headingElement) headingElement.style.fontStyle = 'italic';
        } else if (slntVal !== null && slntVal !== 0) {
            if (textElement) textElement.style.fontStyle = `oblique ${slntVal}deg`;
            if (headingElement) headingElement.style.fontStyle = `oblique ${slntVal}deg`;
        } else {
            if (textElement) textElement.style.fontStyle = '';
            if (headingElement) headingElement.style.fontStyle = '';
        }
    } else {
        // Ensure no leftover variations linger for non-variable fonts
        if (textElement) {
            textElement.style.fontVariationSettings = '';
            textElement.style.fontStretch = '';
            textElement.style.fontStyle = '';
        }
        if (headingElement) {
            headingElement.style.fontVariationSettings = '';
            headingElement.style.fontStretch = '';
            headingElement.style.fontStyle = '';
        }
    }
    
    // Save state after applying font changes
    setTimeout(() => saveExtensionState(), 50);
}

// updateBasicControls function removed - event listeners are now set up in DOMContentLoaded

    // Save Modal functionality
// Helpers for resilient checks against arrays, Sets, or object maps
function hasInCollection(coll, item) {
    if (!coll) return false;
    if (Array.isArray(coll)) return coll.indexOf(item) !== -1;
    if (typeof coll.has === 'function') return coll.has(item);
    if (typeof coll.includes === 'function') return coll.includes(item);
    if (typeof coll === 'object') return !!coll[item];
    return false;
}

function generateFontConfigName(position) {
    const config = getCurrentUIConfig(position);
    if (!config) return 'Font Configuration';
    
    
    let name = config.fontName;
    const parts = [];
    
    // Only include font size in name if it's set (not null)
    if (config.basicControls.fontSize !== null && config.basicControls.fontSize !== undefined) {
        parts.push(`${config.basicControls.fontSize}px`);
    }
    if (hasInCollection(config.activeControls, 'weight') && config.basicControls.fontWeight !== 400) {
        parts.push(`${config.basicControls.fontWeight}wt`);
    }
    if (hasInCollection(config.activeControls, 'line-height') && config.basicControls.lineHeight !== 1.6) {
        parts.push(`${config.basicControls.lineHeight}lh`);
    }
    
    // Add variable axes that are active
    if (config.variableAxes && config.activeAxes) {
        Object.entries(config.variableAxes).forEach(([axis, value]) => {
            const fontDef = getEffectiveFontDefinition(config.fontName);
            if (fontDef && fontDef.defaults[axis] !== undefined && 
                config.activeAxes.includes(axis) && 
                parseFloat(value) !== fontDef.defaults[axis]) {
                // Abbreviate common axes
                let axisName = axis;
                switch(axis) {
                    case 'wght': axisName = 'wt'; break;
                    case 'wdth': axisName = 'wd'; break;
                    case 'slnt': axisName = 'sl'; break;
                    case 'ital': axisName = value === '1' ? 'italic' : ''; break;
                    case 'opsz': axisName = 'opt'; break;
                }
                if (axisName) {
                    if (axis === 'ital' && value === '1') {
                        parts.push(axisName);
                    } else if (axis !== 'ital') {
                        parts.push(`${axisName}${value}`);
                    }
                }
            }
        });
    }
    
    // Combine parts with main name
    if (parts.length > 0) {
        name += ` (${parts.join(', ')})`;
    }
    
    // Truncate if too long
    if (name.length > 50) {
        name = name.substring(0, 47) + '...';
    }
    
    return name;
}

function generateConfigPreview(position) {
    const config = getCurrentUIConfig(position);
    if (!config) return 'No configuration available';
    
    
    const lines = [];
    lines.push(`Font: ${config.fontName}`);
    
    // Only show font size if it's set (not null)
    if (config.basicControls.fontSize !== null && config.basicControls.fontSize !== undefined) {
        lines.push(`Size: ${config.basicControls.fontSize}px`);
    }
    if (hasInCollection(config.activeControls, 'line-height') && config.basicControls.lineHeight !== 1.6) {
        lines.push(`Line Height: ${config.basicControls.lineHeight}`);
    }
    if (hasInCollection(config.activeControls, 'weight') && config.basicControls.fontWeight !== 400) {
        lines.push(`Weight: ${config.basicControls.fontWeight}`);
    }
    
    // Only show active variable axes
    if (config.variableAxes && config.activeAxes) {
        const activeAxesEntries = Object.entries(config.variableAxes)
            .filter(([axis, value]) => {
                const fontDef = getEffectiveFontDefinition(config.fontName);
                return hasInCollection(config.activeAxes, axis) && 
                       fontDef && fontDef.defaults[axis] !== undefined &&
                       parseFloat(value) !== fontDef.defaults[axis];
            });
            
        if (activeAxesEntries.length > 0) {
            const axes = activeAxesEntries
                .map(([axis, value]) => `${axis}: ${value}`)
                .join(', ');
            lines.push(`Axes: ${axes}`);
        }
    }
    
    return lines.join('<br>');
}

function showSaveModal(position) {
    const modal = document.getElementById('save-modal');
    const nameInput = document.getElementById('save-modal-name');
    const configPreview = document.getElementById('save-modal-config');
    
    // Generate suggested name and preview
    const suggestedName = generateFontConfigName(position);
    const preview = generateConfigPreview(position);
    
    nameInput.value = suggestedName;
    configPreview.innerHTML = preview;
    
    // Store the position for when save is clicked
    modal.setAttribute('data-position', position);
    
    // Show modal
    modal.classList.add('visible');
    nameInput.focus();
    nameInput.select();
}

function hideSaveModal() {
    const modal = document.getElementById('save-modal');
    modal.classList.remove('visible');
}

// Favorites Popup functionality
function showFavoritesPopup(position) {
    const popup = document.getElementById('favorites-popup');
    const listContainer = document.getElementById('favorites-popup-list');
    const noFavorites = document.getElementById('no-favorites');
    
    // Clear existing content
    listContainer.innerHTML = '';
    
    // Check if there are any favorites
    const names = (Array.isArray(savedFavoritesOrder) && savedFavoritesOrder.length)
        ? savedFavoritesOrder.filter(n => savedFavorites[n])
        : Object.keys(savedFavorites);
    if (names.length === 0) {
        noFavorites.style.display = 'block';
        listContainer.style.display = 'none';
    } else {
        noFavorites.style.display = 'none';
        listContainer.style.display = 'flex';
        
        // Populate favorites in saved order
        names.forEach(name => {
            const config = savedFavorites[name];
            const item = document.createElement('div');
            item.className = 'favorite-item';
            item.setAttribute('data-position', position);
            item.setAttribute('data-favorite-name', name);
            
            const info = document.createElement('div');
            info.className = 'favorite-item-info';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'favorite-item-name';
            nameDiv.textContent = name;
            
            const previewDiv = document.createElement('div');
            previewDiv.className = 'favorite-item-preview';
            previewDiv.textContent = generateFavoritePreview(config);
            
            info.appendChild(nameDiv);
            info.appendChild(previewDiv);
            item.appendChild(info);
            
            // Click to load
            item.addEventListener('click', function() {
                const position = this.getAttribute('data-position');
                const favoriteName = this.getAttribute('data-favorite-name');
                const config = savedFavorites[favoriteName];
                
                if (config) {
                    applyFontConfig(position, config);
                    hideFavoritesPopup();
                }
            });
            
            listContainer.appendChild(item);
        });
    }
    
    popup.classList.add('visible');
}

function hideFavoritesPopup() {
    const popup = document.getElementById('favorites-popup');
    popup.classList.remove('visible');
}

// Edit Favorites Modal functionality
function showEditFavoritesModal() {
    const modal = document.getElementById('edit-favorites-modal');
    const listContainer = document.getElementById('edit-favorites-list');
    const noFavorites = document.getElementById('no-edit-favorites');
    
    // Clear existing content
    listContainer.innerHTML = '';
    
    // Check if there are any favorites
    const names = (Array.isArray(savedFavoritesOrder) && savedFavoritesOrder.length)
        ? savedFavoritesOrder.filter(n => savedFavorites[n])
        : Object.keys(savedFavorites);
    if (names.length === 0) {
        noFavorites.style.display = 'block';
        listContainer.style.display = 'none';
    } else {
        noFavorites.style.display = 'none';
        listContainer.style.display = 'flex';
        
        // Populate editable favorites in saved order
        names.forEach(name => {
            const config = savedFavorites[name];
            const item = document.createElement('div');
            item.className = 'edit-favorite-item';
            item.setAttribute('data-name', name);
            
            // Drag handle
            const drag = document.createElement('div');
            drag.className = 'drag-handle';
            drag.setAttribute('title', 'Drag to reorder');
            drag.textContent = '⋮⋮';
            // Only allow drag when dragging the handle
            drag.addEventListener('mousedown', function() { item.setAttribute('draggable', 'true'); });
            drag.addEventListener('touchstart', function() { item.setAttribute('draggable', 'true'); }, { passive: true });
            const disableDrag = () => item.removeAttribute('draggable');
            drag.addEventListener('mouseup', disableDrag);
            drag.addEventListener('touchend', disableDrag);

            const info = document.createElement('div');
            info.className = 'edit-favorite-info';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'edit-favorite-name';
            nameDiv.textContent = name;
            
            const previewDiv = document.createElement('div');
            previewDiv.className = 'edit-favorite-preview';
            previewDiv.innerHTML = generateDetailedFavoritePreview(config);
            
            item.appendChild(drag);
            info.appendChild(nameDiv);
            info.appendChild(previewDiv);
            
            const actions = document.createElement('div');
            actions.className = 'edit-favorite-actions';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-favorite-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = `Delete ${name}`;
            deleteBtn.addEventListener('click', function() {
                showCustomConfirm(`Are you sure you want to delete "${name}"?`, function() {
                    delete savedFavorites[name];
                    if (Array.isArray(savedFavoritesOrder)) {
                        const i = savedFavoritesOrder.indexOf(name);
                        if (i !== -1) savedFavoritesOrder.splice(i, 1);
                    }
                    saveFavoritesToStorage();
                    showEditFavoritesModal(); // Refresh the modal
                });
            });
            
            actions.appendChild(deleteBtn);
            
            item.appendChild(info);
            item.appendChild(actions);
            listContainer.appendChild(item);
        });
        // Enable drag-and-drop reordering
        enableFavoritesReorder(listContainer);
    }
    
    modal.classList.add('visible');
}

function hideEditFavoritesModal() {
    const modal = document.getElementById('edit-favorites-modal');
    modal.classList.remove('visible');
}

// Drag-and-drop reordering for Edit Favorites
function enableFavoritesReorder(container) {
    if (!container) return;
    const items = container.querySelectorAll('.edit-favorite-item');
    let dropIndicator = null;
    function ensureIndicator() {
        if (!dropIndicator) {
            dropIndicator = document.createElement('div');
            dropIndicator.className = 'drop-indicator';
        }
        if (!dropIndicator.parentNode) container.appendChild(dropIndicator);
        return dropIndicator;
    }
    function hideIndicator() {
        if (dropIndicator && dropIndicator.parentNode) dropIndicator.parentNode.removeChild(dropIndicator);
    }
    items.forEach(item => {
        // Desktop HTML5 DnD
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
            ensureIndicator();
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            item.removeAttribute('draggable');
            persistFavoritesOrder(container);
            hideIndicator();
        });
    });
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const after = getDragAfterElement(container, e.clientY);
        const dragging = container.querySelector('.dragging');
        if (!dragging) return;
        // Position drop indicator
        const ind = ensureIndicator();
        const crect = container.getBoundingClientRect();
        let topPx;
        if (after == null) {
            container.appendChild(dragging);
            const last = container.querySelector('.edit-favorite-item:last-child');
            const lrect = last ? last.getBoundingClientRect() : null;
            topPx = (lrect ? (lrect.bottom - crect.top + container.scrollTop) : (container.scrollTop + container.scrollHeight));
        } else {
            container.insertBefore(dragging, after);
            const arect = after.getBoundingClientRect();
            topPx = (arect.top - crect.top + container.scrollTop);
        }
        ind.style.top = `${Math.max(0, topPx)}px`;
    });

    // Pointer/touch fallback (works on mobile)
    const handles = container.querySelectorAll('.drag-handle');
    let ptr = { active: false, item: null, container: null };
    let proxy = null;
    let startOffsetY = 0;
    const onPointerMove = (e) => {
        if (!ptr.active || !ptr.container || !ptr.item) return;
        const after = getDragAfterElement(ptr.container, e.clientY);
        const dragging = ptr.item;
        // Update proxy position
        if (proxy) {
            const y = e.clientY - startOffsetY;
            proxy.style.top = `${y}px`;
        }
        // Reorder
        const ind = ensureIndicator();
        const crect = ptr.container.getBoundingClientRect();
        let topPx;
        if (after == null) {
            ptr.container.appendChild(dragging);
            const last = ptr.container.querySelector('.edit-favorite-item:last-child');
            const lrect = last ? last.getBoundingClientRect() : null;
            topPx = (lrect ? (lrect.bottom - crect.top + ptr.container.scrollTop) : (ptr.container.scrollTop + ptr.container.scrollHeight));
        } else {
            ptr.container.insertBefore(dragging, after);
            const arect = after.getBoundingClientRect();
            topPx = (arect.top - crect.top + ptr.container.scrollTop);
        }
        ind.style.top = `${Math.max(0, topPx)}px`;
    };
    const onPointerUp = (e) => {
        if (!ptr.active) return;
        try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (_) {}
        ptr.item.classList.remove('dragging');
        ptr.item.removeAttribute('draggable');
        persistFavoritesOrder(ptr.container);
        if (proxy && proxy.parentNode) proxy.parentNode.removeChild(proxy);
        proxy = null;
        hideIndicator();
        ptr = { active: false, item: null, container: null };
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
    };
    handles.forEach(h => {
        h.addEventListener('pointerdown', (e) => {
            const item = e.target.closest('.edit-favorite-item');
            if (!item) return;
            ptr = { active: true, item, container };
            item.classList.add('dragging');
            // Prevent page scroll while dragging
            try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}
            // Create floating proxy of the item for clearer drag feedback
            const rect = item.getBoundingClientRect();
            startOffsetY = e.clientY - rect.top;
            proxy = item.cloneNode(true);
            proxy.classList.add('dragging-proxy');
            proxy.style.width = `${rect.width}px`;
            proxy.style.left = `${rect.left}px`;
            proxy.style.top = `${rect.top}px`;
            document.body.appendChild(proxy);
            ensureIndicator();
            document.addEventListener('pointermove', onPointerMove, { passive: false });
            document.addEventListener('pointerup', onPointerUp, { passive: true });
            document.addEventListener('pointercancel', onPointerUp, { passive: true });
            e.preventDefault();
        }, { passive: false });
    });
}

function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll('.edit-favorite-item:not(.dragging)')];
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    els.forEach(child => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            closest = { offset, element: child };
        }
    });
    return closest.element;
}

function persistFavoritesOrder(container) {
    const names = Array.from(container.querySelectorAll('.edit-favorite-item'))
        .map(el => el.getAttribute('data-name'))
        .filter(Boolean);
    savedFavoritesOrder = names;
    saveFavoritesToStorage();
}

function generateFavoritePreview(config) {
    if (!config) return '';
    const parts = [];
    
    if (config.fontName) parts.push(config.fontName);
    if (config.basicControls?.fontSize) {
        parts.push(`${config.basicControls.fontSize}px`);
    }
    if (config.basicControls?.fontWeight && config.basicControls.fontWeight !== 400) {
        parts.push(`${config.basicControls.fontWeight}wt`);
    }
    
    return parts.join(' • ');
}

    function generateDetailedFavoritePreview(config) {
    if (!config) return 'No configuration';
    
    const lines = [];
    if (config.fontName) lines.push(`Font: ${config.fontName}`);
    
    // Always show font size
    if (config.basicControls?.fontSize) {
        lines.push(`Size: ${config.basicControls.fontSize}px`);
    }
    if (hasInCollection(config && config.activeControls, 'line-height') && 
        config.basicControls?.lineHeight && config.basicControls.lineHeight !== 1.6) {
        lines.push(`Line Height: ${config.basicControls.lineHeight}`);
    }
    if (hasInCollection(config && config.activeControls, 'weight') && 
        config.basicControls?.fontWeight && config.basicControls.fontWeight !== 400) {
        lines.push(`Weight: ${config.basicControls.fontWeight}`);
    }
    
    // Only show active variable axes
    if (config.variableAxes && config.activeAxes) {
        const activeAxesEntries = Object.entries(config.variableAxes)
            .filter(([axis, value]) => {
                const fontDef = getEffectiveFontDefinition(config.fontName);
                return hasInCollection(config && config.activeAxes, axis) && 
                       fontDef && fontDef.defaults[axis] !== undefined &&
                       parseFloat(value) !== fontDef.defaults[axis];
            });
            
        if (activeAxesEntries.length > 0) {
            const axes = activeAxesEntries
                .map(([axis, value]) => `${axis}:${value}`)
                .join(', ');
            lines.push(`Axes: ${axes}`);
        }
    }
    
    return lines.join('<br>');
}

// Font control functionality
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded fired, starting popup initialization');
    // Get font selectors
    const topFontSelect = document.getElementById('top-font-select');
    const bottomFontSelect = document.getElementById('bottom-font-select');
    
    // Get text elements
    const topFontText = document.getElementById('top-font-text');
    const topFontSection = document.getElementById('top-font-section');
    const bottomFontText = document.getElementById('bottom-font-text');
    const bottomFontSection = document.getElementById('bottom-font-section');
    
    // Get control panels and UI elements
    const topFontControls = document.getElementById('top-font-controls');
    const bottomFontControls = document.getElementById('bottom-font-controls');
    const panelOverlay = document.getElementById('panel-overlay');
    const topFontGrip = document.getElementById('top-font-grip');
    const bottomFontGrip = document.getElementById('bottom-font-grip');
    const fontComparison = document.getElementById('font-comparison');
    
    // Load saved state first
    console.log('Loading extension state before initialization');
    loadExtensionState();
    
    // Initialize the new 3-mode interface
    console.log('About to call initializeModeInterface');
    initializeModeInterface();
    console.log('initializeModeInterface completed');

    // Mode switching is now handled by the 3-mode tab system in HTML

    // Apply-to-page buttons (Face-off mode)
    const applyTopBtn = document.getElementById('apply-top');
    const applyBottomBtn = document.getElementById('apply-bottom');
    if (applyTopBtn) {
        applyTopBtn.addEventListener('click', async () => {
            const before = buildCurrentPayload('top');
            applyTopBtn.classList.add('loading');
            applyTopBtn.textContent = 'Loading…';
            const active = await toggleApplyToPage('top');
            if (active) {
                try {
                    const family = (before && before.fontName) || (document.getElementById('top-font-name')?.textContent) || '';
                    const deadline = Date.now() + 6000;
                    while (Date.now() < deadline) {
                        const res = await browser.tabs.executeScript({ code: `document.fonts && document.fonts.check('16px "${family.replace(/"/g, '\\"')}"')` });
                        if (Array.isArray(res) && res[0] === true) break;
                        await new Promise(r => setTimeout(r, 200));
                    }
                } catch (_) {}
                applyTopBtn.classList.add('active');
                applyTopBtn.textContent = '✓';
                try { const r = document.getElementById('reset-top'); if (r) r.style.display = 'inline-flex'; } catch (_) {}
            } else {
                applyTopBtn.classList.remove('active');
                applyTopBtn.textContent = 'Apply';
                try { const r = document.getElementById('reset-top'); if (r) r.style.display = 'none'; } catch (_) {}
            }
            applyTopBtn.classList.remove('loading');
        });
    }
    if (applyBottomBtn) {
        applyBottomBtn.addEventListener('click', async () => {
            const before = buildCurrentPayload('bottom');
            applyBottomBtn.classList.add('loading');
            applyBottomBtn.textContent = 'Loading…';
            const active = await toggleApplyToPage('bottom');
            if (active) {
                try {
                    const family = (before && before.fontName) || (document.getElementById('bottom-font-name')?.textContent) || '';
                    const deadline = Date.now() + 6000;
                    while (Date.now() < deadline) {
                        const res = await browser.tabs.executeScript({ code: `document.fonts && document.fonts.check('16px "${family.replace(/"/g, '\\"')}"')` });
                        if (Array.isArray(res) && res[0] === true) break;
                        await new Promise(r => setTimeout(r, 200));
                    }
                } catch (_) {}
                applyBottomBtn.classList.add('active');
                applyBottomBtn.textContent = '✓';
                try { const r = document.getElementById('reset-bottom'); if (r) r.style.display = 'inline-flex'; } catch (_) {}
            } else {
                applyBottomBtn.classList.remove('active');
                applyBottomBtn.textContent = 'Apply';
                try { const r = document.getElementById('reset-bottom'); if (r) r.style.display = 'none'; } catch (_) {}
            }
            applyBottomBtn.classList.remove('loading');
        });
    }

    // Pre-highlight Apply buttons based on saved state for current origin
    try { syncApplyButtonsForOrigin(); } catch (_) {}
    if (currentViewMode === 'third-man-in') {
        try { syncThirdManInButtons(); } catch (_) {}
    }

    // Track changes to mark buttons as Update when UI differs from saved
    const debouncedRefresh = debounce(refreshApplyButtonsDirtyState, 200);
    document.addEventListener('input', debouncedRefresh, true);
    document.addEventListener('change', debouncedRefresh, true);

    // Body family reset button
    const bodyFamilyResetBtn = document.getElementById('body-family-reset');
    if (bodyFamilyResetBtn) {
        bodyFamilyResetBtn.addEventListener('click', function() {
            const bodyFontDisplay = document.getElementById('body-font-display');
            const bodyFontGroup = bodyFontDisplay && bodyFontDisplay.closest('.control-group');
            if (bodyFontDisplay) {
                bodyFontDisplay.textContent = 'Default';
                bodyFontDisplay.classList.add('placeholder');
            }
            if (bodyFontGroup) {
                bodyFontGroup.classList.add('unset');
            }
            // Clear from active controls and memory
            bodyActiveControls.delete('font-family');
            if (bodyFontMemory) {
                bodyFontMemory.fontName = null;
            }
            // Apply font change
            applyFont('body');
            updateBodyButtons();
            saveExtensionState();
        });
    }
    
    // Body color reset button
    const bodyColorResetBtn = document.getElementById('body-color-reset');
    if (bodyColorResetBtn) {
        bodyColorResetBtn.addEventListener('click', function() {
            const bodyFontColorSelect = document.getElementById('body-font-color');
            const bodyColorGroup = bodyFontColorSelect && bodyFontColorSelect.closest('.control-group');
            if (bodyFontColorSelect) {
                bodyFontColorSelect.value = 'default';
            }
            if (bodyColorGroup) {
                bodyColorGroup.classList.add('unset');
            }
            // Update preview and buttons
            updateBodyPreview();
            updateBodyButtons();
            saveExtensionState();
        });
    }



    const topSizeSlider = document.getElementById('top-font-size');
    const bottomSizeSlider = document.getElementById('bottom-font-size');
    const bodySizeSlider = document.getElementById('body-font-size');
    const topSizeText = document.getElementById('top-font-size-text');
    const bottomSizeText = document.getElementById('bottom-font-size-text');
    const bodySizeText = document.getElementById('body-font-size-text');
    const topSizeGroup = document.querySelector('#top-font-controls .control-group[data-control="font-size"]');
    const bottomSizeGroup = document.querySelector('#bottom-font-controls .control-group[data-control="font-size"]');
    const bodySizeGroup = document.querySelector('#body-font-controls .control-group[data-control="font-size"]');
    if (topSizeSlider) {
        topSizeSlider.addEventListener('input', function() {
            topActiveControls.add('font-size');
            if (topSizeGroup) topSizeGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (topSizeText) topSizeText.value = v;
            applyFont('top');
        });
    }
    if (bottomSizeSlider) {
        bottomSizeSlider.addEventListener('input', function() {
            bottomActiveControls.add('font-size');
            if (bottomSizeGroup) bottomSizeGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (bottomSizeText) bottomSizeText.value = v;
            applyFont('bottom');
        });
    }
    if (bodySizeSlider) {
        bodySizeSlider.addEventListener('input', function() {
            if (bodySizeGroup) bodySizeGroup.classList.remove('unset');
            updateBodyButtons(); // Note: not awaiting to avoid blocking UI
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (bodySizeText) bodySizeText.value = v;
            const bodySizeValue = document.getElementById('body-font-size-value');
            if (bodySizeValue) bodySizeValue.textContent = v + 'px';
            updateBodyPreview();
            // Save state after font-size change
            setTimeout(() => saveExtensionState(), 100);
        });
    }
    function parseSizeVal(v){
    if (v == null) return null;
    const str = String(v).trim();
    if (!str) return null;
    const m = str.match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*(px)?\s*$/i);
    if (!m) return null;
    return Number(m[1]);
}
function clamp(v, min, max){ v = parseSizeVal(v); if (v == null || isNaN(v)) return null; return Math.min(max, Math.max(min, v)); }
    if (topSizeText) {
        topSizeText.addEventListener('keydown', function(e){
            if (e.key === 'Enter') {
                const min = Number(topSizeSlider?.min || 10), max = Number(topSizeSlider?.max || 72);
                const vv = clamp(this.value, min, max);
                if (vv !== null) {
                    topActiveControls.add('font-size');
                    if (topSizeGroup) topSizeGroup.classList.remove('unset');
                    if (topSizeSlider) topSizeSlider.value = String(vv);
                    this.value = String(vv);
                    applyFont('top');
                }
                this.blur();
            }
        });
        topSizeText.addEventListener('blur', function(){
            const min = Number(topSizeSlider?.min || 10), max = Number(topSizeSlider?.max || 72);
            const vv = clamp(this.value, min, max);
            if (vv !== null) {
                topActiveControls.add('font-size');
                if (topSizeGroup) topSizeGroup.classList.remove('unset');
                if (topSizeSlider) topSizeSlider.value = String(vv);
                this.value = String(vv);
                applyFont('top');
            }
        });
    }
    if (bottomSizeText) {
        bottomSizeText.addEventListener('keydown', function(e){
            if (e.key === 'Enter') {
                const min = Number(bottomSizeSlider?.min || 10), max = Number(bottomSizeSlider?.max || 72);
                const vv = clamp(this.value, min, max);
                if (vv !== null) {
                    bottomActiveControls.add('font-size');
                    if (bottomSizeGroup) bottomSizeGroup.classList.remove('unset');
                    if (bottomSizeSlider) bottomSizeSlider.value = String(vv);
                    this.value = String(vv);
                    applyFont('bottom');
                }
                this.blur();
            }
        });
        bottomSizeText.addEventListener('blur', function(){
            const min = Number(bottomSizeSlider?.min || 10), max = Number(bottomSizeSlider?.max || 72);
            const vv = clamp(this.value, min, max);
            if (vv !== null) {
                bottomActiveControls.add('font-size');
                if (bottomSizeGroup) bottomSizeGroup.classList.remove('unset');
                if (bottomSizeSlider) bottomSizeSlider.value = String(vv);
                this.value = String(vv);
                applyFont('bottom');
            }
        });
    }
    if (bodySizeText) {
        bodySizeText.addEventListener('keydown', function(e){
            if (e.key === 'Enter') {
                const min = Number(bodySizeSlider?.min || 10), max = Number(bodySizeSlider?.max || 72);
                const vv = clamp(this.value, min, max);
                if (vv !== null) {
                    if (bodySizeGroup) bodySizeGroup.classList.remove('unset');
                    updateBodyButtons();
                    if (bodySizeSlider) bodySizeSlider.value = String(vv);
                    this.value = String(vv);
                    const bodySizeValue = document.getElementById('body-font-size-value');
                    if (bodySizeValue) bodySizeValue.textContent = vv + 'px';
                    updateBodyPreview();
                    // Save state after font-size change
                    setTimeout(() => saveExtensionState(), 100);
                }
                this.blur();
            }
        });
        bodySizeText.addEventListener('blur', function(){
            const min = Number(bodySizeSlider?.min || 10), max = Number(bodySizeSlider?.max || 72);
            const vv = clamp(this.value, min, max);
            if (vv !== null) {
                bodyActiveControls.add('font-size');
                if (bodySizeGroup) bodySizeGroup.classList.remove('unset');
                updateBodyButtons();
                if (bodySizeSlider) bodySizeSlider.value = String(vv);
                this.value = String(vv);
                const bodySizeValue = document.getElementById('body-font-size-value');
                if (bodySizeValue) bodySizeValue.textContent = vv + 'px';
                updateBodyPreview();
                // Save state after font-size change
                setTimeout(() => saveExtensionState(), 100);
            }
        });
    }

    // Body Line Height Controls
    const bodyLineHeightSlider = document.getElementById('body-line-height');
    const bodyLineHeightText = document.getElementById('body-line-height-text');
    const bodyLineHeightGroup = bodyLineHeightSlider ? bodyLineHeightSlider.closest('.control-group') : null;
    
    if (bodyLineHeightSlider) {
        bodyLineHeightSlider.addEventListener('input', function() {
            if (bodyLineHeightGroup) bodyLineHeightGroup.classList.remove('unset');
            updateBodyButtons();
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (bodyLineHeightText) bodyLineHeightText.value = v;
            const bodyLineHeightValue = document.getElementById('body-line-height-value');
            if (bodyLineHeightValue) bodyLineHeightValue.textContent = v;
            updateBodyPreview();
            // Save state after line-height change
            setTimeout(() => saveExtensionState(), 100);
        });
    }
    
    if (bodyLineHeightText) {
        bodyLineHeightText.addEventListener('keydown', function(e){
            if (e.key === 'Enter') {
                const min = Number(bodyLineHeightSlider?.min || 0.8), max = Number(bodyLineHeightSlider?.max || 2.5);
                const vv = clamp(this.value, min, max);
                if (vv !== null) {
                            if (bodyLineHeightGroup) bodyLineHeightGroup.classList.remove('unset');
                    updateBodyButtons();
                    if (bodyLineHeightSlider) bodyLineHeightSlider.value = String(vv);
                    this.value = String(vv);
                    const bodyLineHeightValue = document.getElementById('body-line-height-value');
                    if (bodyLineHeightValue) bodyLineHeightValue.textContent = vv;
                    updateBodyPreview();
                    // Save state after line-height change
                    setTimeout(() => saveExtensionState(), 100);
                }
                this.blur();
            }
        });
        bodyLineHeightText.addEventListener('blur', function(){
            const min = Number(bodyLineHeightSlider?.min || 0.8), max = Number(bodyLineHeightSlider?.max || 2.5);
            const vv = clamp(this.value, min, max);
            if (vv !== null) {
                    if (bodyLineHeightGroup) bodyLineHeightGroup.classList.remove('unset');
                updateBodyButtons();
                if (bodyLineHeightSlider) bodyLineHeightSlider.value = String(vv);
                this.value = String(vv);
                const bodyLineHeightValue = document.getElementById('body-line-height-value');
                if (bodyLineHeightValue) bodyLineHeightValue.textContent = vv;
                updateBodyPreview();
                // Save state after line-height change
                setTimeout(() => saveExtensionState(), 100);
            }
        });
    }

    // Body Font Color Control - copied from working font size pattern
    const bodyFontColorSelect = document.getElementById('body-font-color');
    const bodyColorGroup = bodyFontColorSelect ? bodyFontColorSelect.closest('.control-group') : null;
    
    if (bodyFontColorSelect) {
        bodyFontColorSelect.addEventListener('change', function() {
            if (bodyColorGroup) bodyColorGroup.classList.remove('unset');
            updateBodyButtons(); // Note: not awaiting to avoid blocking UI
            updateBodyPreview();
            // Save state after color change
            setTimeout(() => saveExtensionState(), 100);
        });
    }

    // Font Picker wiring
    setupFontPicker();

    // Initialize font family displays from current values
    const topSel = document.getElementById('top-font-select');
    const botSel = document.getElementById('bottom-font-select');
    const topDisp = document.getElementById('top-font-display');
    const botDisp = document.getElementById('bottom-font-display');
    if (topSel && topDisp) topDisp.textContent = topSel.value || 'Roboto Flex';
    if (botSel && botDisp) botDisp.textContent = botSel.value || 'Rubik';
    
    // Initialize Third Man In mode font family displays to "Default"
    const serifSel = document.getElementById('serif-font-select');
    const sansSel = document.getElementById('sans-font-select');
    const monoSel = document.getElementById('mono-font-select');
    const serifDisp = document.getElementById('serif-font-display');
    const sansDisp = document.getElementById('sans-font-display');
    const monoDisp = document.getElementById('mono-font-display');
    
    // Set Third Man In displays to Default first
    if (serifDisp) serifDisp.textContent = 'Default';
    if (sansDisp) sansDisp.textContent = 'Default';  
    if (monoDisp) monoDisp.textContent = 'Default';
    
    // Then apply styling to all displays that show "Default"
    const defaultDisplays = ['body-font-display', 'serif-font-display', 'sans-font-display', 'mono-font-display'];
    defaultDisplays.forEach(id => {
        const element = document.getElementById(id);
        if (element && element.textContent === 'Default') {
            element.classList.add('default');
        }
    });
    
    // Helper function to update font display styling based on content
    function updateFontDisplayStyling(element) {
        if (element) {
            if (element.textContent === 'Default') {
                element.classList.add('default');
            } else {
                element.classList.remove('default');
            }
        }
    }

    // Family reset handlers (no longer used - facade mode removed)
    const topFamReset = document.getElementById('top-family-reset');
    if (topFamReset) topFamReset.addEventListener('click', () => handleFamilyReset('top'));
    const botFamReset = document.getElementById('bottom-family-reset');
    if (botFamReset) botFamReset.addEventListener('click', () => handleFamilyReset('bottom'));

    // Add event listeners for footer Reset buttons
    const resetTopBtn = document.getElementById('reset-top');
    if (resetTopBtn) resetTopBtn.addEventListener('click', async function() {
        try { resetTopFont(); setTimeout(() => saveExtensionState(), 50); } catch (_) {}
    });
    const resetBottomBtn = document.getElementById('reset-bottom');
    if (resetBottomBtn) resetBottomBtn.addEventListener('click', async function() {
        try { resetBottomFont(); setTimeout(() => saveExtensionState(), 50); } catch (_) {}
    });
    const resetBodyBtn = document.getElementById('reset-body');
    if (resetBodyBtn) resetBodyBtn.addEventListener('click', async function() {
        try { await resetPanelSettings('body'); } catch (_) {}
    });
    
    // Custom alert OK button
    document.getElementById('custom-alert-ok').addEventListener('click', function() {
        hideCustomAlert();
    });
    
    // Custom alert keyboard support
    document.addEventListener('keydown', function(e) {
        const alertModal = document.getElementById('custom-alert');
        const confirmModal = document.getElementById('custom-confirm');
        
        if (alertModal.classList.contains('visible')) {
            if (e.key === 'Enter' || e.key === 'Escape') {
                hideCustomAlert();
                e.preventDefault();
            }
        } else if (confirmModal.classList.contains('visible')) {
            if (e.key === 'Enter') {
                // Enter = OK
                if (confirmModal._callback) {
                    confirmModal._callback();
                }
                hideCustomConfirm();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                // Escape = Cancel
                hideCustomConfirm();
                e.preventDefault();
            }
        }
    });
    
    // Custom confirm buttons
    document.getElementById('custom-confirm-ok').addEventListener('click', function() {
        const confirmModal = document.getElementById('custom-confirm');
        if (confirmModal._callback) {
            confirmModal._callback();
        }
        hideCustomConfirm();
    });
    
    document.getElementById('custom-confirm-cancel').addEventListener('click', function() {
        hideCustomConfirm();
    });
    
    // Add delegated event listener for basic control reset buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('axis-reset-btn') && e.target.getAttribute('data-control') === 'line-height') {
            const panel = e.target.closest('.controls-panel');
            let position;
            if (panel.id.includes('top')) position = 'top';
            else if (panel.id.includes('bottom')) position = 'bottom';
            else if (panel.id.includes('body')) position = 'body';
            else return; // unsupported panel
            
            const activeControls = getActiveControls(position);
            const controlGroup = e.target.closest('.control-group');
            
            // Reset to default line height and make unset
            const lineHeightControl = document.getElementById(`${position}-line-height`);
            const lineHeightTextInput = document.getElementById(`${position}-line-height-text`);
            const lineHeightValue = document.getElementById(`${position}-line-height-value`);
            
            if (lineHeightControl && lineHeightValue) {
                lineHeightControl.value = 1.6;
                lineHeightValue.textContent = '1.6';
                if (lineHeightTextInput) {
                    lineHeightTextInput.value = 1.6;
                }
                
                // Remove from active controls and add unset class
                activeControls.delete('line-height');
                if (controlGroup) {
                    controlGroup.classList.add('unset');
                }
                
                applyFont(position);
                setTimeout(() => saveExtensionState(), 50);
            }
        }
        
        if (e.target.classList.contains('axis-reset-btn') && e.target.getAttribute('data-control') === 'weight') {
            const panel = e.target.closest('.controls-panel');
            let position;
            if (panel.id.includes('top')) position = 'top';
            else if (panel.id.includes('bottom')) position = 'bottom';
            else if (panel.id.includes('body')) position = 'body';
            else return; // unsupported panel
            
            const activeControls = getActiveControls(position);
            const controlGroup = e.target.closest('.control-group');
            
            const weightControl = document.getElementById(`${position}-font-weight`);
            const weightValue = document.getElementById(`${position}-font-weight-value`);
            
            if (weightControl && weightValue) {
                // Reset to default weight and unset control
                weightControl.value = 400;
                weightValue.textContent = '400';
                activeControls.delete('weight');
                if (controlGroup) {
                    controlGroup.classList.add('unset');
                }
                applyFont(position);
                setTimeout(() => saveExtensionState(), 50);
            }
        }

        if (e.target.classList.contains('axis-reset-btn') && e.target.getAttribute('data-control') === 'font-size') {
            const panel = e.target.closest('.controls-panel');
            let position;
            if (panel.id.includes('top')) position = 'top';
            else if (panel.id.includes('bottom')) position = 'bottom';
            else if (panel.id.includes('body')) position = 'body';
            else return; // unsupported panel
            
            const activeControls = getActiveControls(position);
            const group = e.target.closest('.control-group');
            const slider = document.getElementById(`${position}-font-size`);
            const textInput = document.getElementById(`${position}-font-size-text`);
            const span = document.getElementById(`${position}-font-size-value`);
            if (slider) {
                slider.value = 17;
                if (textInput) textInput.value = 17;
                if (span) span.textContent = '17px';
                activeControls.delete('font-size');
                if (group) group.classList.add('unset');
                applyFont(position);
                setTimeout(() => saveExtensionState(), 50);
            }
        }
        
        // Family reset button handler
        if (e.target.classList.contains('family-reset-btn')) {
            const panelId = e.target.closest('.controls-panel').id;
            let position;
            
            // Clean direct mapping from panel IDs to positions
            if (panelId === 'top-font-controls') position = 'top';
            else if (panelId === 'bottom-font-controls') position = 'bottom';
            else if (panelId === 'body-font-controls') position = 'body';
            else if (panelId === 'serif-font-controls') position = 'serif';
            else if (panelId === 'sans-font-controls') position = 'sans';
            else if (panelId === 'mono-font-controls') position = 'mono';
            
            if (position) {
                const fontDisplay = document.getElementById(`${position}-font-display`);
                const fontSelect = document.getElementById(`${position}-font-select`);
                
                if (fontDisplay && fontSelect) {
                    // Reset to default font (first option)
                    const defaultOption = fontSelect.options[0];
                    fontDisplay.textContent = 'Default';
                    fontSelect.value = defaultOption.value;
                    
                    // Trigger change event to update preview
                    fontSelect.dispatchEvent(new Event('change'));
                    
                    // Apply the change based on mode
                    if (['top', 'bottom'].includes(position)) {
                        applyFont(position);
                    } else if (['serif', 'sans', 'mono'].includes(position)) {
                        // For Third Man In mode, update the preview text
                        updateThirdManInPreview(position);
                    }
                    
                    setTimeout(() => saveExtensionState(), 50);
                }
            }
        }
    });
    
    // Load saved state and initialize fonts
    // (loadExtensionState already called earlier)
    
    const currentModeState = extensionState ? extensionState[currentViewMode] : null;
    if (currentModeState && currentModeState.topFont && currentModeState.topFont.fontName) {
        // Restore saved top font for current mode
        setTimeout(() => {
            applyFontConfig('top', currentModeState.topFont);
        }, 100);
    } else {
        // Use default top font
        loadFont('top', 'ABeeZee');
    }
    
    if (currentModeState && currentModeState.bottomFont && currentModeState.bottomFont.fontName) {
        // Restore saved bottom font for current mode
        setTimeout(() => {
            applyFontConfig('bottom', currentModeState.bottomFont);
        }, 100);
    } else {
        // Use default bottom font
        loadFont('bottom', 'Zilla Slab Highlight');
    }
    
    // Add event listeners for font selectors
    topFontSelect.addEventListener('change', function() {
        loadFont('top', this.value);
    });
    
    bottomFontSelect.addEventListener('change', function() {
        loadFont('bottom', this.value);
    });

    // After state has been applied, populate the selects from metadata without clobbering selection
    // Small delay ensures applyFontConfig runs first so current values reflect saved state
    setTimeout(async () => {
        const currentModeState = extensionState ? extensionState[currentViewMode] : null;
        const topDesired = (currentModeState && currentModeState.topFont && currentModeState.topFont.fontName) ? resolveFamilyCase(currentModeState.topFont.fontName) : undefined;
        const botDesired = (currentModeState && currentModeState.bottomFont && currentModeState.bottomFont.fontName) ? resolveFamilyCase(currentModeState.bottomFont.fontName) : undefined;
        const ok = await initializeGoogleFontsSelects(topDesired, botDesired);
        // Re-apply saved state once more to guarantee selection sticks even if the list was rebuilt
        if (ok && extensionState) {
            const currentModeState = extensionState[currentViewMode];
            if (currentModeState) {
                const topCfg = currentModeState.topFont;
                const botCfg = currentModeState.bottomFont;
                if (topCfg && topCfg.fontName) {
                    const resolved = resolveFamilyCase(topCfg.fontName);
                    if (resolved !== topCfg.fontName) {
                        topCfg.fontName = resolved;
                    }
                    applyFontConfig('top', topCfg);
                }
                if (botCfg && botCfg.fontName) {
                    const resolved = resolveFamilyCase(botCfg.fontName);
                    if (resolved !== botCfg.fontName) {
                        botCfg.fontName = resolved;
                    }
                    applyFontConfig('bottom', botCfg);
                }
            }
        }
        // Sync visible displays again after list rebuild to the resolved values
        const topSel2 = document.getElementById('top-font-select');
        const botSel2 = document.getElementById('bottom-font-select');
        const topDisp2 = document.getElementById('top-font-display');
        const botDisp2 = document.getElementById('bottom-font-display');
        if (topSel2 && topDisp2) topDisp2.textContent = topSel2.value;
        if (botSel2 && botDisp2) botDisp2.textContent = botSel2.value;
        
        // Sync Third Man In mode displays
        const serifSel2 = document.getElementById('serif-font-select');
        const sansSel2 = document.getElementById('sans-font-select');
        const monoSel2 = document.getElementById('mono-font-select');
        const serifDisp2 = document.getElementById('serif-font-display');
        const sansDisp2 = document.getElementById('sans-font-display');
        const monoDisp2 = document.getElementById('mono-font-display');
        
        // Keep Third Man In displays as "Default" instead of syncing from select values
        if (serifSel2 && serifDisp2 && serifDisp2.textContent !== 'Default') serifDisp2.textContent = serifSel2.value;
        if (sansSel2 && sansDisp2 && sansDisp2.textContent !== 'Default') sansDisp2.textContent = sansSel2.value;
        if (monoSel2 && monoDisp2 && monoDisp2.textContent !== 'Default') monoDisp2.textContent = monoSel2.value;
        // Persist any canonicalized names
        saveExtensionState();
    }, 250);
    
    // Panel state
    let topPanelOpen = false;
    let bottomPanelOpen = false;
    
    
    function showPanel(panel) {
        // On narrow screens, enforce single-panel mode
        const isNarrow = window.innerWidth <= 599;
        if (isNarrow) {
            if (panel === 'top' && bottomPanelOpen) hidePanel('bottom');
            if (panel === 'bottom' && topPanelOpen) hidePanel('top');
        }
        if (panel === 'top') {
            topFontControlsPanel.classList.add('visible');
            panelOverlay.classList.add('visible');
            topPanelOpen = true;
            topFontGrip.classList.add('active');
            bottomFontGrip.classList.remove('active');
            topFontGrip.setAttribute('aria-pressed', 'true');
            bottomFontGrip.setAttribute('aria-pressed', 'false');
        } else if (panel === 'bottom') {
            bottomFontControlsPanel.classList.add('visible');
            panelOverlay.classList.add('visible');
            bottomPanelOpen = true;
            bottomFontGrip.classList.add('active');
            topFontGrip.classList.remove('active');
            bottomFontGrip.setAttribute('aria-pressed', 'true');
            topFontGrip.setAttribute('aria-pressed', 'false');
        }
        updateFontComparisonLayout();
    }
    
    function hidePanel(panel) {
        if (panel === 'top') {
            topFontControlsPanel.classList.remove('visible');
            topPanelOpen = false;
            topFontGrip.classList.remove('active');
            topFontGrip.setAttribute('aria-pressed', 'false');
        } else if (panel === 'bottom') {
            bottomFontControlsPanel.classList.remove('visible');
            bottomPanelOpen = false;
            bottomFontGrip.classList.remove('active');
            bottomFontGrip.setAttribute('aria-pressed', 'false');
        }
        
        // Hide overlay only if no panels are open
        if (!topPanelOpen && !bottomPanelOpen) {
            panelOverlay.classList.remove('visible');
        }
        updateFontComparisonLayout();
    }
    
    function hideAllPanels() {
        topFontControlsPanel.classList.remove('visible');
        bottomFontControlsPanel.classList.remove('visible');
        panelOverlay.classList.remove('visible');
        topPanelOpen = false;
        bottomPanelOpen = false;
        topFontGrip.classList.remove('active');
        bottomFontGrip.classList.remove('active');
        topFontGrip.setAttribute('aria-pressed', 'false');
        bottomFontGrip.setAttribute('aria-pressed', 'false');
        updateFontComparisonLayout();
    }
    
    function updateFontComparisonLayout() {
        // Remove all layout classes
        fontComparison.classList.remove('top-panel-open', 'bottom-panel-open', 'both-panels-open');
        
        // Add appropriate class based on which panels are open
        if (topPanelOpen && bottomPanelOpen) {
            fontComparison.classList.add('both-panels-open');
        } else if (topPanelOpen) {
            fontComparison.classList.add('top-panel-open');
        } else if (bottomPanelOpen) {
            fontComparison.classList.add('bottom-panel-open');
        }
    }
    
    // Grip handlers (throttled to avoid double-fire on touch/click)
    function toggleTop() { if (topPanelOpen) hidePanel('top'); else showPanel('top'); }
    function toggleBottom() { if (bottomPanelOpen) hidePanel('bottom'); else showPanel('bottom'); }
    let lastToggleTs = 0;
    function throttled(fn) {
        return (e) => {
            const now = Date.now();
            if (now - lastToggleTs < 250) { try { e && e.preventDefault && e.preventDefault(); } catch(_){} return; }
            lastToggleTs = now;
            try { e && e.preventDefault && e.preventDefault(); } catch(_){}
            fn();
        };
    }
    // Click for desktop, pointerdown for touch-capable (no separate touchstart to avoid double fire)
    topFontGrip.addEventListener('click', throttled(toggleTop));
    bottomFontGrip.addEventListener('click', throttled(toggleBottom));
    if (window && 'PointerEvent' in window) {
        topFontGrip.addEventListener('pointerdown', throttled(toggleTop), { passive: false });
        bottomFontGrip.addEventListener('pointerdown', throttled(toggleBottom), { passive: false });
    }
    
    // Close panels when clicking overlay
    panelOverlay.addEventListener('click', hideAllPanels);

    // Enforce single-panel mode on narrow screens when resizing
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 599 && topPanelOpen && bottomPanelOpen) {
            hidePanel('bottom');
        }
    });
    
    // Reference to panel elements  
    const topFontControlsPanel = topFontControls;
    const bottomFontControlsPanel = bottomFontControls;
    
    // Dynamically align panel bottoms above the bottom strip (#panel-grips)
    function adjustPanelBottomOffset() {
        try {
            const grips = document.getElementById('panel-grips');
            const h = grips ? Math.ceil(grips.getBoundingClientRect().height || 0) : 100;
            if (topFontControls) topFontControls.style.bottom = h + 'px';
            if (bottomFontControls) bottomFontControls.style.bottom = h + 'px';
        } catch (_) {}
    }
    adjustPanelBottomOffset();
    // Recalculate on resize and when the bottom strip resizes (e.g., phone layout)
    window.addEventListener('resize', adjustPanelBottomOffset);
    try {
        if ('ResizeObserver' in window) {
            const ro = new ResizeObserver(adjustPanelBottomOffset);
            const grips = document.getElementById('panel-grips');
            if (grips) ro.observe(grips);
        }
    } catch (_) {}
    
    // Initialize favorites system
    loadFavoritesFromStorage();
    
    // Save favorite functionality
    function setupSaveFavorite(position) {
        const ids = [
            `${position}-save-favorite`,
            `${position}-save-favorite-bar`
        ];
        ids.forEach(id => {
            const btn = document.getElementById(id);
            if (btn && !btn.__affoBound) {
                btn.addEventListener('click', function() { showSaveModal(position); });
                btn.__affoBound = true;
            }
        });
    }
    
    // Load favorite functionality - now opens popup
    function setupLoadFavorite(position) {
        const ids = [
            `${position}-load-favorite`,
            `${position}-load-favorite-bar`
        ];
        ids.forEach(id => {
            const btn = document.getElementById(id);
            if (btn && !btn.__affoBound) {
                btn.addEventListener('click', function() { showFavoritesPopup(position); });
                btn.__affoBound = true;
            }
        });
    }
    
    // Setup save modal event handlers
    const saveModal = document.getElementById('save-modal');
    const saveModalClose = document.getElementById('save-modal-close');
    const saveModalCancel = document.getElementById('save-modal-cancel');
    const saveModalSave = document.getElementById('save-modal-save');
    const saveModalName = document.getElementById('save-modal-name');
    
    // Close modal handlers
    saveModalClose.addEventListener('click', hideSaveModal);
    saveModalCancel.addEventListener('click', hideSaveModal);
    
    // Close on background click
    saveModal.addEventListener('click', function(e) {
        if (e.target === saveModal) {
            hideSaveModal();
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && saveModal.classList.contains('visible')) {
            hideSaveModal();
        }
    });
    
    // Save button handler
    saveModalSave.addEventListener('click', function() {
        const name = saveModalName.value.trim();
        const position = saveModal.getAttribute('data-position');
        
        if (!name) {
            showCustomAlert('Please enter a name for this favorite');
            return;
        }
        
        const config = getCurrentUIConfig(position);
        savedFavorites[name] = config;
        if (!Array.isArray(savedFavoritesOrder)) savedFavoritesOrder = [];
        if (savedFavoritesOrder.indexOf(name) === -1) savedFavoritesOrder.push(name);
        saveFavoritesToStorage();
        
        hideSaveModal();
        showCustomAlert(`Saved "${name}" to favorites!`);
    });
    
    // Save on Enter key in name input
    saveModalName.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            saveModalSave.click();
        }
    });
    
    // Setup new favorites popup and edit modal event handlers
    const favoritesPopup = document.getElementById('favorites-popup');
    const favoritesPopupClose = document.getElementById('favorites-popup-close');
    const editFavoritesModal = document.getElementById('edit-favorites-modal');
    const editModalClose = document.getElementById('edit-modal-close');
    const editFavoritesBtn = document.getElementById('edit-favorites');
    
    // Favorites popup handlers
    if (favoritesPopupClose) {
        favoritesPopupClose.addEventListener('click', hideFavoritesPopup);
    }
    if (favoritesPopup) {
        favoritesPopup.addEventListener('click', function(e) {
            if (e.target === favoritesPopup) {
                hideFavoritesPopup();
            }
        });
    }
    
    // Edit favorites modal handlers
    if (editModalClose) {
        editModalClose.addEventListener('click', hideEditFavoritesModal);
    }
    if (editFavoritesModal) {
        editFavoritesModal.addEventListener('click', function(e) {
            if (e.target === editFavoritesModal) {
                hideEditFavoritesModal();
            }
        });
    }
    
    // Edit favorites buttons for all modes
    if (editFavoritesBtn) {
        editFavoritesBtn.addEventListener('click', showEditFavoritesModal);
    }
    
    const editFavoritesBodyBtn = document.getElementById('edit-favorites-body');
    if (editFavoritesBodyBtn) {
        editFavoritesBodyBtn.addEventListener('click', showEditFavoritesModal);
    }
    
    const editFavoritesTmiBtn = document.getElementById('edit-favorites-tmi');
    if (editFavoritesTmiBtn) {
        editFavoritesTmiBtn.addEventListener('click', showEditFavoritesModal);
    }
    
    // Close popups/modals on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (saveModal.classList.contains('visible')) {
                hideSaveModal();
            }
            if (favoritesPopup.classList.contains('visible')) {
                hideFavoritesPopup();
            }
            if (editFavoritesModal.classList.contains('visible')) {
                hideEditFavoritesModal();
            }
        }
    });
    
    // Setup favorites for all panels
    setupSaveFavorite('top');
    setupLoadFavorite('top');
    setupSaveFavorite('bottom');
    setupLoadFavorite('bottom');
    setupSaveFavorite('body');
    setupLoadFavorite('body');
    
    // Third Man In mode favorites
    setupSaveFavorite('serif');
    setupLoadFavorite('serif');
    setupSaveFavorite('sans');
    setupLoadFavorite('sans');
    setupSaveFavorite('mono');
    setupLoadFavorite('mono');
});

// Reset functions
function resetTopFont() {
    const fontName = document.getElementById('top-font-select').value;
    const fontDef = getEffectiveFontDefinition(fontName);
    
    // Clear active controls and axes - back to unset state
    topActiveControls.clear();
    topActiveAxes.clear();
    
    // Reset basic properties
    document.getElementById('top-font-size').value = 17;
    document.getElementById('top-line-height').value = 1.6;
    document.getElementById('top-font-weight').value = 400;
    document.getElementById('top-font-color').value = '#000000';
    
    // Reset display values
    (function(){ const el = document.getElementById('top-font-size-value'); if (el) el.textContent = '17px'; })();
    document.getElementById('top-line-height-value').textContent = '1.6';
    document.getElementById('top-font-weight-value').textContent = '400';
    
    // Reset weight control to unset/dimmed state
    const weightControl = document.querySelector('#top-font-controls .control-group[data-control="weight"]');
    if (weightControl) {
        weightControl.classList.add('unset');
    }
    
    // Reset line height control to unset/dimmed state  
    const lineHeightControl = document.querySelector('#top-font-controls .control-group[data-control="line-height"]');
    if (lineHeightControl) {
        lineHeightControl.classList.add('unset');
    }
    
    // Reset variable axes and make them unset/dimmed
    if (fontDef && fontDef.axes.length > 0) {
        fontDef.axes.forEach(axis => {
            const control = document.getElementById(`top-${axis}`);
            const textInput = document.getElementById(`top-${axis}-text`);
            const controlGroup = document.querySelector(`#top-font-controls .control-group[data-axis="${axis}"]`);
            
            if (control) {
                control.value = fontDef.defaults[axis];
                if (textInput) textInput.value = fontDef.defaults[axis];
                if (controlGroup) {
                    controlGroup.classList.add('unset');
                }
            }
        });
    }
    
    // Apply the reset state
    applyFont('top');
}

function resetBottomFont() {
    const fontName = document.getElementById('bottom-font-select').value;
    const fontDef = getEffectiveFontDefinition(fontName);
    
    // Clear active controls and axes - back to unset state
    bottomActiveControls.clear();
    bottomActiveAxes.clear();
    
    // Reset basic properties
    document.getElementById('bottom-font-size').value = 17;
    document.getElementById('bottom-line-height').value = 1.6;
    document.getElementById('bottom-font-weight').value = 400;
    document.getElementById('bottom-font-color').value = '#000000';
    
    // Reset text input values
    const bottomFontSizeTextInput = document.getElementById('bottom-font-size-text');
    const bottomLineHeightTextInput = document.getElementById('bottom-line-height-text');
    if (bottomFontSizeTextInput) bottomFontSizeTextInput.value = 17;
    if (bottomLineHeightTextInput) bottomLineHeightTextInput.value = 1.6;
    
    // Reset display values
    (function(){ const el = document.getElementById('bottom-font-size-value'); if (el) el.textContent = '17px'; })();
    document.getElementById('bottom-line-height-value').textContent = '1.6';
    document.getElementById('bottom-font-weight-value').textContent = '400';
    
    // Reset weight control to unset/dimmed state
    const weightControl = document.querySelector('#bottom-font-controls .control-group[data-control="weight"]');
    if (weightControl) {
        weightControl.classList.add('unset');
    }
    
    // Reset line height control to unset/dimmed state  
    const lineHeightControl = document.querySelector('#bottom-font-controls .control-group[data-control="line-height"]');
    if (lineHeightControl) {
        lineHeightControl.classList.add('unset');
    }
    
    // Reset variable axes and make them unset/dimmed
    if (fontDef && fontDef.axes.length > 0) {
        fontDef.axes.forEach(axis => {
            const control = document.getElementById(`bottom-${axis}`);
            const textInput = document.getElementById(`bottom-${axis}-text`);
            const controlGroup = document.querySelector(`#bottom-font-controls .control-group[data-axis="${axis}"]`);
            const valueSpan = document.getElementById(`bottom-${axis}-value`);
            
            if (control) {
                control.value = fontDef.defaults[axis];
                if (textInput) textInput.value = fontDef.defaults[axis];
                if (valueSpan) {
                    valueSpan.textContent = formatAxisValue(axis, fontDef.defaults[axis]);
                }
                if (controlGroup) {
                    controlGroup.classList.add('unset');
                }
            }
        });
    }
    
    // Apply the reset state
    applyFont('bottom');
}

// (apply buttons listeners are bound in the primary DOMContentLoaded block above)


// Build a UI config from a persisted per-origin payload (serif/sans)
function buildConfigFromPayload(position, payload) {
    const base = getCurrentUIConfig(position) || {
        fontName: payload.fontName,
        basicControls: { fontSize: 17, lineHeight: 1.6, fontWeight: 400, fontColor: '#000000' },
        activeControls: [],
        activeAxes: [],
        variableAxes: {}
    };
    const config = {
        fontName: payload.fontName,
        basicControls: {
            fontSize: (payload.fontSizePx !== null && payload.fontSizePx !== undefined)
                ? Number(payload.fontSizePx)
                : null,
            lineHeight: (payload.lineHeight !== null && payload.lineHeight !== undefined)
                ? Number(payload.lineHeight)
                : null,
            fontWeight: (payload.fontWeight !== null && payload.fontWeight !== undefined)
                ? Number(payload.fontWeight)
                : null,
            fontColor: (payload.fontColor !== null && payload.fontColor !== undefined)
                ? payload.fontColor
                : 'default'
        },
        activeControls: [],
        activeAxes: [],
        variableAxes: {}
    };
    const hasWeight = (payload.fontWeight !== null && payload.fontWeight !== undefined);
    const hasSize = (payload.fontSizePx !== null && payload.fontSizePx !== undefined);
    const hasLine = (payload.lineHeight !== null && payload.lineHeight !== undefined);
    const hasColor = (payload.fontColor !== null && payload.fontColor !== undefined);
    const idx = config.activeControls.indexOf('weight');
    if (hasWeight && idx === -1) config.activeControls.push('weight');
    if (!hasWeight && idx !== -1) config.activeControls.splice(idx, 1);
    // Ensure font-size and line-height active flags reflect saved payload
    const idxSize = config.activeControls.indexOf('font-size');
    if (hasSize && idxSize === -1) config.activeControls.push('font-size');
    if (!hasSize && idxSize !== -1) config.activeControls.splice(idxSize, 1);
    const idxLine = config.activeControls.indexOf('line-height');
    if (hasLine && idxLine === -1) config.activeControls.push('line-height');
    if (!hasLine && idxLine !== -1) config.activeControls.splice(idxLine, 1);
    const idxColor = config.activeControls.indexOf('color');
    if (hasColor && idxColor === -1) config.activeControls.push('color');
    if (!hasColor && idxColor !== -1) config.activeControls.splice(idxColor, 1);
    const tags = new Set();
    (payload.varPairs || []).forEach(p => { if (p && p.tag) { tags.add(p.tag); config.variableAxes[p.tag] = Number(p.value); } });
    // Don't convert between traditional weight and variable axis - they're independent
    if (payload.wdthVal !== null && payload.wdthVal !== undefined && !tags.has('wdth')) { tags.add('wdth'); config.variableAxes.wdth = Number(payload.wdthVal); }
    if (payload.slntVal !== null && payload.slntVal !== undefined && !tags.has('slnt')) { tags.add('slnt'); config.variableAxes.slnt = Number(payload.slntVal); }
    if (payload.italVal !== null && payload.italVal !== undefined && !tags.has('ital')) { tags.add('ital'); config.variableAxes.ital = Number(payload.italVal); }
    config.activeAxes = Array.from(tags);
    return config;
}

// prepopulateFacadeFromSavedOrigin function removed - facade mode no longer exists


// Compare two apply payloads for equality (font + axes + weight)
function payloadEquals(a, b) {
    if (!a || !b) return false;
    if (a.fontName !== b.fontName) return false;
    const numEq = (x, y) => (x === null || x === undefined) && (y === null || y === undefined) ? true : Number(x) === Number(y);
    if (!numEq(a.fontWeight, b.fontWeight)) return false;
    if (!numEq(a.fontSizePx, b.fontSizePx)) return false;
    if (!numEq(a.lineHeight, b.lineHeight)) return false;
    if (!numEq(a.wdthVal, b.wdthVal)) return false;
    if (!numEq(a.slntVal, b.slntVal)) return false;
    if (!numEq(a.italVal, b.italVal)) return false;
    if (a.fontColor !== b.fontColor) return false;
    const toMap = (pairs) => {
        const m = new Map();
        (pairs || []).forEach(p => { if (p && p.tag !== undefined) m.set(String(p.tag), Number(p.value)); });
        return m;
    };
    const ma = toMap(a.varPairs);
    const mb = toMap(b.varPairs);
    if (ma.size !== mb.size) return false;
    for (const [k, v] of ma.entries()) { if (!mb.has(k) || mb.get(k) !== v) return false; }
    return true;
}

// New storage structure to support multiple modes per domain
async function getApplyMapForOrigin(origin, mode = null) {
    if (!origin) return null;
    try {
        const data = await browser.storage.local.get('affoApplyMapV2');
        const applyMap = (data && data.affoApplyMapV2) ? data.affoApplyMapV2 : {};
        const domainData = applyMap[origin];
        if (!domainData) return null;
        return mode ? (domainData[mode] || null) : domainData;
    } catch (_) { return null; }
}

async function saveApplyMapForOrigin(origin, mode, config) {
    if (!origin || !mode) return;
    try {
        const data = await browser.storage.local.get('affoApplyMapV2');
        const applyMap = (data && data.affoApplyMapV2) ? data.affoApplyMapV2 : {};
        if (!applyMap[origin]) applyMap[origin] = {};
        if (!applyMap[origin][mode]) applyMap[origin][mode] = {};
        Object.assign(applyMap[origin][mode], config);
        await browser.storage.local.set({ affoApplyMapV2: applyMap });
    } catch (_) {}
}

async function clearApplyMapForOrigin(origin, mode, key = null) {
    if (!origin || !mode) return;
    try {
        const data = await browser.storage.local.get('affoApplyMapV2');
        const applyMap = (data && data.affoApplyMapV2) ? data.affoApplyMapV2 : {};
        if (applyMap[origin] && applyMap[origin][mode]) {
            if (key) {
                delete applyMap[origin][mode][key];
                if (Object.keys(applyMap[origin][mode]).length === 0) {
                    delete applyMap[origin][mode];
                }
            } else {
                delete applyMap[origin][mode];
            }
            if (Object.keys(applyMap[origin]).length === 0) {
                delete applyMap[origin];
            }
        }
        await browser.storage.local.set({ affoApplyMapV2: applyMap });
    } catch (_) {}
}

// Element type detection for Third Man In mode - uses DOM walking instead of static selectors
function generateThirdManInCSS(fontType, payload) {
    if (!payload) return '';
    
    const lines = [];
    
    // Font face definition if needed
    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);
    }
    
    // Generate CSS that targets elements marked with data-affo-font-type attribute
    const fontFamily = payload.fontName ? `"${payload.fontName}", ${payload.generic}` : payload.generic;
    let styleRule = `[data-affo-font-type="${fontType}"] { font-family: ${fontFamily} !important;`;
    
    if (payload.fontSize && isFinite(payload.fontSize)) {
        styleRule += ` font-size: ${payload.fontSize}px !important;`;
    }
    if (payload.lineHeight && isFinite(payload.lineHeight)) {
        styleRule += ` line-height: ${payload.lineHeight} !important;`;
    }
    if (payload.fontWeight && isFinite(payload.fontWeight)) {
        styleRule += ` font-weight: ${payload.fontWeight} !important;`;
    }
    if (payload.fontVariationSettings) {
        styleRule += ` font-variation-settings: ${payload.fontVariationSettings} !important;`;
    }
    
    styleRule += ' }';
    lines.push(styleRule);
    
    return lines.join('\n');
}

// DOM walker to identify and mark element types for Third Man In mode
function generateElementWalkerScript(fontType) {
    return `
        (function() {
            try {
                console.log('Third Man In walker script starting for fontType: ${fontType}');
                
                // Clear ALL existing Third Man In markers when applying any font type
                const existingMarked = document.querySelectorAll('[data-affo-font-type]');
                console.log('Clearing ' + existingMarked.length + ' existing font-type markers');
                existingMarked.forEach(el => {
                    el.removeAttribute('data-affo-font-type');
                });
                
                // Element type detection logic
                function getElementFontType(element) {
                    const tagName = element.tagName.toLowerCase();
                    const className = element.className || '';
                    const style = element.style.fontFamily || '';
                    
                    // Explicit class/style overrides
                    if (className.includes('serif') || style.includes('serif')) return 'serif';
                    if (className.includes('sans') || style.includes('sans')) return 'sans';
                    if (className.includes('mono') || className.includes('code') || className.includes('monospace') || 
                        style.includes('monospace') || style.includes('mono')) return 'mono';
                    
                    // Tag-based detection
                    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) return 'serif';
                    if (['code', 'pre', 'kbd', 'samp', 'tt'].includes(tagName)) return 'mono';
                    if (['p', 'div', 'span', 'nav', 'button', 'input', 'textarea', 'select', 'label', 'li', 'td', 'th', 'a'].includes(tagName)) return 'sans';
                    
                    // Check computed styles as fallback
                    const computed = window.getComputedStyle(element);
                    const computedFamily = computed.fontFamily.toLowerCase();
                    if (computedFamily.includes('serif') && !computedFamily.includes('sans')) return 'serif';
                    if (computedFamily.includes('mono')) return 'mono';
                    
                    return 'sans'; // Default fallback
                }
                
                // Walk all text-containing elements
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_ELEMENT,
                    {
                        acceptNode: function(node) {
                            // Skip elements that are hidden or have no text content
                            if (node.offsetParent === null && node.tagName !== 'BODY') return NodeFilter.FILTER_SKIP;
                            if (!node.textContent.trim()) return NodeFilter.FILTER_SKIP;
                            
                            // Skip already processed elements and guard elements
                            if (node.hasAttribute('data-affo-guard') || 
                                node.hasAttribute('data-affo-font-type')) return NodeFilter.FILTER_SKIP;
                            
                            return NodeFilter.FILTER_ACCEPT;
                        }
                    }
                );
                
                let element;
                let totalElements = 0;
                let markedElements = 0;
                
                while (element = walker.nextNode()) {
                    totalElements++;
                    const detectedType = getElementFontType(element);
                    if (detectedType === '${fontType}') {
                        element.setAttribute('data-affo-font-type', '${fontType}');
                        markedElements++;
                    }
                }
                
                console.log('Third Man In walker completed: processed ' + totalElements + ' elements, marked ' + markedElements + ' as ${fontType}');
            } catch (e) {
                console.error('A Font Face-off: Element walker failed for ${fontType}:', e);
            }
        })();
    `;
}

// Simple cleanup script for Body Contact mode - clears Third Man In markers
function generateBodyContactCleanupScript() {
    return `
        (function() {
            try {
                // Clear Third Man In markers (modes reset each other)  
                document.querySelectorAll('[data-affo-font-type]').forEach(el => {
                    el.removeAttribute('data-affo-font-type');
                });
            } catch (e) {
                console.warn('A Font Face-off: Body Contact cleanup failed:', e);
            }
        })();
    `;
}

// Build a payload from current UI config (used to detect dirty state)
function buildCurrentPayload(position, providedConfig = null) {
    console.log(`buildCurrentPayload called for position: ${position}`, providedConfig ? 'with provided config' : '');
    const cfg = providedConfig || getCurrentUIConfig(position);
    console.log(`buildCurrentPayload: Using config:`, cfg);
    if (!cfg) {
        console.log(`buildCurrentPayload: No config found, returning null`);
        return null;
    }
    
    // Determine generic font family based on position and font name
    let genericKey;
    if (position === 'body') {
        // For body position, determine generic based on the actual font
        const serifFonts = ['Merriweather', 'Lora', 'Roboto Slab', 'Playfair Display', 'Source Serif Pro', 'Crimson Text', 'Libre Baskerville', 'Cormorant Garamond', 'EB Garamond', 'Spectral'];
        genericKey = (cfg.fontName && serifFonts.includes(cfg.fontName)) ? 'serif' : 'sans';
    } else {
        genericKey = (position === 'top') ? 'serif' : 'sans';
    }
    const activeAxes = new Set(cfg.activeAxes || []);
    const varPairs = [];
    let wdthVal = null, slntVal = null, italVal = null;
    Object.entries(cfg.variableAxes || {}).forEach(([axis, value]) => {
        const num = Number(value);
        if (!activeAxes.has(axis) || !isFinite(num)) return;
        if (axis === 'wdth') wdthVal = num;
        if (axis === 'slnt') slntVal = num;
        if (axis === 'ital') italVal = num;
        varPairs.push({ tag: axis, value: num });
    });
    // Determine which controls are active by checking if control group is not "unset" (user has interacted with them)
    const weightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="weight"]`);
    const weightActive = weightGroup && !weightGroup.classList.contains('unset');
    const fontWeight = weightActive && cfg.basicControls ? Number(cfg.basicControls.fontWeight) : null;
    console.log(`buildCurrentPayload: Weight - group:`, weightGroup, 'active:', weightActive, 'value:', fontWeight);
    
    const sizeGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="font-size"]`);
    const fontSizeActive = sizeGroup && !sizeGroup.classList.contains('unset');
    const fontSizePx = fontSizeActive && cfg.basicControls ? Number(cfg.basicControls.fontSize) : null;
    console.log(`buildCurrentPayload: Font size - group:`, sizeGroup, 'active:', fontSizeActive, 'value:', fontSizePx);
    
    const lineHeightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="line-height"]`);
    const lineHeightActive = lineHeightGroup && !lineHeightGroup.classList.contains('unset');
    const lineHeight = lineHeightActive && cfg.basicControls ? Number(cfg.basicControls.lineHeight) : null;
    console.log(`buildCurrentPayload: Line height - group:`, lineHeightGroup, 'active:', lineHeightActive, 'value:', lineHeight);
    
    // Check if color is active (not "unset")
    const colorGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="color"]`);
    const colorActive = colorGroup && !colorGroup.classList.contains('unset');
    const fontColor = colorActive && cfg.basicControls ? cfg.basicControls.fontColor : null;
    console.log(`buildCurrentPayload: Color - group:`, colorGroup, 'active:', colorActive, 'value:', fontColor);
    
    return {
        fontName: cfg.fontName,
        generic: (genericKey === 'serif' ? 'serif' : 'sans-serif'),
        varPairs,
        wdthVal,
        slntVal,
        italVal,
        fontWeight,
        fontSizePx,
        lineHeight,
        fontColor
    };
}

// Reflect button labels based on saved vs current (Applied/Update/Apply)
async function refreshApplyButtonsDirtyState() {
    try {
        const origin = await getActiveOrigin();
        const data = await browser.storage.local.get('affoApplyMapV2');
        const map = (data && data.affoApplyMapV2) ? data.affoApplyMapV2 : {};
        const entry = origin ? (map[origin] || {}) : {};
        const btnTop = document.getElementById('apply-top');
        const btnBottom = document.getElementById('apply-bottom');
        if (btnTop) {
            const saved = entry.serif || null;
            if (!saved) {
                btnTop.classList.remove('active');
                btnTop.textContent = 'Apply';
                const r = document.getElementById('reset-top'); if (r) r.style.display = 'none';
            } else {
                const current = buildCurrentPayload('top');
                const same = payloadEquals(saved, current);
                btnTop.classList.toggle('active', same);
                btnTop.textContent = same ? '✓' : 'Apply';
                const r = document.getElementById('reset-top'); if (r) r.style.display = same ? 'inline-flex' : 'none';
            }
        }
        if (btnBottom) {
            const saved = entry.sans || null;
            if (!saved) {
                btnBottom.classList.remove('active');
                btnBottom.textContent = 'Apply';
                const r = document.getElementById('reset-bottom'); if (r) r.style.display = 'none';
            } else {
                const current = buildCurrentPayload('bottom');
                const same = payloadEquals(saved, current);
                btnBottom.classList.toggle('active', same);
                btnBottom.textContent = same ? '✓' : 'Apply';
                const r = document.getElementById('reset-bottom'); if (r) r.style.display = same ? 'inline-flex' : 'none';
            }
        }
    } catch (_) {}
}

// Mode switching functionality
// Check if a mode has applied settings for the current domain
async function modeHasAppliedSettings(mode) {
    try {
        const origin = await getActiveOrigin();
        if (!origin) return false;
        
        if (mode === 'body-contact') {
            const data = await browser.storage.local.get('affoApplyMap');
            const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
            return !!(map[origin] && map[origin].body);
        } else if (mode === 'third-man-in') {
            const data = await browser.storage.local.get('affoApplyMapV2');
            const map = (data && data.affoApplyMapV2) ? data.affoApplyMapV2 : {};
            const domainData = map[origin];
            return !!(domainData && (domainData.serif || domainData.sans || domainData.mono));
        } else if (mode === 'faceoff') {
            const data = await browser.storage.local.get('affoApplyMapV2');
            const map = (data && data.affoApplyMapV2) ? data.affoApplyMapV2 : {};
            const domainData = map[origin];
            return !!(domainData && (domainData.serif || domainData.sans));
        }
        return false;
    } catch (_) {
        return false;
    }
}

// Get display name for mode
function getModeDisplayName(mode) {
    switch (mode) {
        case 'body-contact': return 'Body Contact';
        case 'faceoff': return 'Face-off';
        case 'third-man-in': return 'Third Man In';
        default: return mode;
    }
}

// Clear domain settings for all modes
async function clearAllDomainSettings() {
    try {
        const origin = await getActiveOrigin();
        if (!origin) return;
        
        // Clear body mode settings
        const bodyData = await browser.storage.local.get('affoApplyMap');
        const bodyMap = (bodyData && bodyData.affoApplyMap) ? bodyData.affoApplyMap : {};
        if (bodyMap[origin]) {
            delete bodyMap[origin];
            await browser.storage.local.set({ affoApplyMap: bodyMap });
        }
        
        // Clear third-man-in and faceoff settings
        const thirdData = await browser.storage.local.get('affoApplyMapV2');
        const thirdMap = (thirdData && thirdData.affoApplyMapV2) ? thirdData.affoApplyMapV2 : {};
        if (thirdMap[origin]) {
            delete thirdMap[origin];
            await browser.storage.local.set({ affoApplyMapV2: thirdMap });
        }
        
        // Send message to content script to restore original page
        browser.tabs.query({ active: true, currentWindow: true }, tabs => {
            if (tabs[0]) {
                browser.tabs.sendMessage(tabs[0].id, { 
                    action: 'restoreOriginal',
                    origin: origin
                });
            }
        });
    } catch (error) {
        console.error('Error clearing domain settings:', error);
    }
}

async function switchMode(newMode) {
    console.log(`switchMode called: currentViewMode=${currentViewMode}, newMode=${newMode}`);
    if (currentViewMode === newMode) {
        console.log('switchMode: Already in target mode, skipping switch');
        return;
    }
    
    // Check if current mode or target mode has applied settings
    const currentHasSettings = await modeHasAppliedSettings(currentViewMode);
    const targetHasSettings = await modeHasAppliedSettings(newMode);
    
    if (currentHasSettings || targetHasSettings) {
        // Show confirmation modal
        const currentDisplayName = getModeDisplayName(currentViewMode);
        const newDisplayName = getModeDisplayName(newMode);
        
        const confirmed = await showCustomConfirm(
            `Switching from\n${currentDisplayName} mode to ${newDisplayName} mode\nwill clear saved settings for the domain. Proceed?`
        );
        
        if (!confirmed) {
            return; // User cancelled, don't switch
        }
        
        // Clear all domain settings
        await clearAllDomainSettings();
    }
    
    // Save current mode panel states before switching
    if (currentViewMode === 'faceoff') {
        panelStates.faceoff.top = document.getElementById('top-font-controls').classList.contains('visible');
        panelStates.faceoff.bottom = document.getElementById('bottom-font-controls').classList.contains('visible');
    } else if (currentViewMode === 'body-contact') {
        panelStates['body-contact'].body = document.getElementById('body-font-controls').classList.contains('visible');
    } else if (currentViewMode === 'third-man-in') {
        panelStates['third-man-in'].serif = document.getElementById('serif-font-controls').classList.contains('visible');
        panelStates['third-man-in'].sans = document.getElementById('sans-font-controls').classList.contains('visible');
        panelStates['third-man-in'].mono = document.getElementById('mono-font-controls').classList.contains('visible');
    }
    
    // Hide current mode content
    document.querySelectorAll('.mode-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Hide all panels
    document.querySelectorAll('.controls-panel').forEach(panel => {
        panel.classList.remove('visible');
    });
    
    // Show new mode content
    const newModeContent = document.querySelector(`.${newMode}-content`);
    if (newModeContent) {
        newModeContent.classList.add('active');
    }
    
    // Activate new mode tab
    const newModeTab = document.querySelector(`.mode-tab[data-mode="${newMode}"]`);
    if (newModeTab) {
        newModeTab.classList.add('active');
    }
    
    currentViewMode = newMode;
    
    // Update body class for CSS styling
    document.body.className = `view-${currentViewMode}`;
    
    // Store the current mode
    try {
        localStorage.setItem('fontFaceoffMode', currentViewMode);
    } catch (_) {}
    
    // Load settings for the new mode
    loadModeSettings();
    
    // Restore panel states for the new mode
    if (newMode === 'faceoff') {
        if (panelStates.faceoff.top) {
            document.getElementById('top-font-controls').classList.add('visible');
            topPanelOpen = true;
        }
        if (panelStates.faceoff.bottom) {
            document.getElementById('bottom-font-controls').classList.add('visible');
            bottomPanelOpen = true;
        }
        if (topPanelOpen || bottomPanelOpen) {
            document.getElementById('panel-overlay').classList.add('visible');
        }
        updateFontComparisonLayout();
    } else if (newMode === 'body-contact') {
        if (panelStates['body-contact'].body) {
            document.getElementById('body-font-controls').classList.add('visible');
            document.getElementById('panel-overlay').classList.add('visible');
            updateFontComparisonLayoutForBody();
        }
    } else if (newMode === 'third-man-in') {
        let anyPanelOpen = false;
        if (panelStates['third-man-in'].serif) {
            document.getElementById('serif-font-controls').classList.add('visible');
            anyPanelOpen = true;
        }
        if (panelStates['third-man-in'].sans) {
            document.getElementById('sans-font-controls').classList.add('visible');
            anyPanelOpen = true;
        }
        if (panelStates['third-man-in'].mono) {
            document.getElementById('mono-font-controls').classList.add('visible');
            anyPanelOpen = true;
        }
        if (anyPanelOpen) {
            document.getElementById('panel-overlay').classList.add('visible');
        }
        updateFontComparisonLayoutForThirdManIn();
    }
    
    // Initialize Apply/Reset button states for new modes
    if (['body-contact', 'third-man-in'].includes(newMode)) {
        setTimeout(async () => {
            if (newMode === 'body-contact') {
                await updateBodyButtons();
            } else if (newMode === 'third-man-in') {
                await updateThirdManInButtons('serif');
                await updateThirdManInButtons('sans');  
                await updateThirdManInButtons('mono');
            }
        }, 100);
    }
}

function initializeModeInterface() {
    console.log('initializeModeInterface starting, current currentViewMode:', currentViewMode);
    // Allow mode persistence for Third Man In, but default others to body-contact
    try {
        const savedMode = localStorage.getItem('fontFaceoffMode');
        console.log('Saved mode from localStorage:', savedMode);
        if (savedMode === 'third-man-in') {
            console.log('Restoring third-man-in mode from localStorage');
            // Don't set currentViewMode here - let switchMode handle the full transition
        } else if (savedMode) {
            console.log('Clearing non-third-man-in saved mode, defaulting to body-contact mode');
            localStorage.removeItem('fontFaceoffMode');
        }
        console.log('Final currentViewMode after loading:', currentViewMode);
    } catch (_) {}
    
    // Set up mode tab event listeners
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.getAttribute('data-mode');
            console.log(`Tab clicked: switching to ${mode} mode`);
            switchMode(mode);
        });
    });
    
    // Initialize the current mode (use saved mode if available)
    const targetMode = (localStorage.getItem('fontFaceoffMode') === 'third-man-in') ? 'third-man-in' : currentViewMode;
    console.log('About to call switchMode with:', targetMode);
    switchMode(targetMode);
    
    // Force load settings on initial popup open (switchMode may skip if mode is already set)
    console.log('Force calling loadModeSettings for initial load');
    loadModeSettings();
    
    // Ensure body class is set on initial load
    document.body.className = `view-${currentViewMode}`;
    
    // Set up grip event listeners for all modes
    setupGripEventListeners();
    
    // Set up Apply/Reset button event listeners for new modes
    setupApplyResetEventListeners();
    
    // Set up control change listeners for button state updates
    setupControlChangeListeners('body');
    setupControlChangeListeners('serif');  
    setupControlChangeListeners('mono');
    setupControlChangeListeners('sans');
}

function setupGripEventListeners() {
    // Body Contact mode
    const bodyGrip = document.getElementById('body-font-grip');
    if (bodyGrip) {
        bodyGrip.addEventListener('click', () => togglePanel('body'));
    }
    
    // Third Man In mode
    const serifGrip = document.getElementById('serif-font-grip');
    if (serifGrip) {
        serifGrip.addEventListener('click', () => togglePanel('serif'));
    }
    
    const monoGrip = document.getElementById('mono-font-grip');
    if (monoGrip) {
        monoGrip.addEventListener('click', () => togglePanel('mono'));
    }
    
    const sansGrip = document.getElementById('sans-font-grip');
    if (sansGrip) {
        sansGrip.addEventListener('click', () => togglePanel('sans'));
    }
}

function setupApplyResetEventListeners() {
    // Body Contact mode
    setupPanelButtons('body');
    
    // Third Man In mode
    setupPanelButtons('serif');
    setupPanelButtons('mono');
    setupPanelButtons('sans');
}

function setupPanelButtons(panelId) {
    const applyBtn = document.getElementById(`apply-${panelId}`);
    const resetBtn = document.getElementById(`reset-${panelId}`);
    
    if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
            await handleApply(panelId);
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            await resetPanelSettings(panelId);
        });
    }
}

async function handleApply(panelId) {
    try {
        // Show loading state
        showApplyLoading(panelId);
        
        if (currentViewMode === 'third-man-in') {
            // Third Man In mode: Apply All strategy
            await applyAllThirdManInFonts();
            
            // Small delay to allow storage operations to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Update button states for all Third Man In panels
            await updateThirdManInButtons('serif');
            await updateThirdManInButtons('sans');
            await updateThirdManInButtons('mono');
        } else {
            // Body Contact and Face-off modes: single panel apply
            const config = getPanelFontConfig(panelId);
            await applyPanelConfiguration(panelId, config);
            
            // Handle body mode specially - update buttons after successful apply
            if (panelId === 'body') {
                console.log('Body apply completed - updating buttons');
                await updateBodyButtons(); // This should now show Reset button
                console.log('updateBodyButtons completed after apply');
            } else if (['serif', 'sans', 'mono'].includes(panelId)) {
                await updateThirdManInButtons(panelId);
            }
        }
        
    } catch (error) {
        console.error('Error applying configuration:', error);
    } finally {
        // Hide loading state
        await hideApplyLoading(panelId);
    }
}

// Apply All fonts for Third Man In mode
async function applyAllThirdManInFonts() {
    const types = ['serif', 'sans', 'mono'];
    let hasAnyNonDefaultSettings = false;
    
    console.log('applyAllThirdManInFonts: Starting Apply All process');
    
    // Check if any type has non-default settings
    for (const type of types) {
        const config = getPanelFontConfig(type);
        console.log(`applyAllThirdManInFonts: ${type} config:`, config);
        
        // Default font names for each type
        const defaultFontNames = {
            'serif': 'Serif',
            'sans': 'Sans', 
            'mono': 'Mono'
        };
        
        const isDefaultFont = !config || !config.fontName || 
                             config.fontName === 'Default' || 
                             config.fontName === defaultFontNames[type];
        
        if (!isDefaultFont) {
            console.log(`applyAllThirdManInFonts: ${type} has non-default font: ${config.fontName}`);
            hasAnyNonDefaultSettings = true;
            break;
        } else {
            console.log(`applyAllThirdManInFonts: ${type} has default font: ${config.fontName}`);
        }
    }
    
    console.log('applyAllThirdManInFonts: hasAnyNonDefaultSettings =', hasAnyNonDefaultSettings);
    
    if (hasAnyNonDefaultSettings) {
        // Apply each non-default font type
        console.log('applyAllThirdManInFonts: Applying non-default fonts');
        for (const type of types) {
            const config = getPanelFontConfig(type);
            
            // Default font names for each type
            const defaultFontNames = {
                'serif': 'Serif',
                'sans': 'Sans', 
                'mono': 'Mono'
            };
            
            const isDefaultFont = !config || !config.fontName || 
                                 config.fontName === 'Default' || 
                                 config.fontName === defaultFontNames[type];
            
            if (!isDefaultFont) {
                console.log(`applyAllThirdManInFonts: Applying ${type} with font ${config.fontName}`);
                await applyPanelConfiguration(type, config);
            } else {
                console.log(`applyAllThirdManInFonts: Skipping ${type} - has default font: ${config.fontName}`);
            }
        }
    } else {
        // All are defaults - clear all fonts from domain (everything unset state)
        console.log('applyAllThirdManInFonts: All defaults - clearing all fonts from domain');
        await clearAllFontsFromDomain();
    }
    
    // Update localStorage to match what was just applied/cleared
    // This prevents UI from reverting when loadModeSettings() is called
    setTimeout(() => saveExtensionState(), 50);
    
    console.log('applyAllThirdManInFonts: Apply All process completed');
}

// Clear all fonts from domain (everything unset state)
async function clearAllFontsFromDomain() {
    const types = ['serif', 'sans', 'mono', 'body'];
    
    console.log('clearAllFontsFromDomain: Starting to clear all fonts from domain');
    
    for (const type of types) {
        console.log(`clearAllFontsFromDomain: Clearing ${type}`);
        await applyUnsetSettings(type);
    }
    
    console.log('clearAllFontsFromDomain: All fonts cleared from domain');
}

// Count differences between current Third Man In settings and applied state
async function countThirdManInDifferences() {
    console.log('countThirdManInDifferences: Starting count');
    const types = ['serif', 'sans', 'mono'];
    let changeCount = 0;
    
    try {
        // Get what's currently applied to the domain
        const origin = await getActiveOrigin();
        console.log('countThirdManInDifferences: Origin:', origin);
        
        // Check each type individually in Third Man In mode  
        // Use the same storage system that Third Man In mode writes to
        const thirdManData = await getApplyMapForOrigin(origin, 'third-man-in');
        const appliedSerif = thirdManData ? thirdManData.serif : null;
        const appliedSans = thirdManData ? thirdManData.sans : null;
        const appliedMono = thirdManData ? thirdManData.mono : null;
        
        console.log('countThirdManInDifferences: Applied configs:', {
            serif: appliedSerif,
            sans: appliedSans, 
            mono: appliedMono
        });
        
        // Also check if Body mode has applied fonts (which affects all types)
        const appliedBody = await getAppliedConfigForDomain(origin, 'body');
        console.log('countThirdManInDifferences: Applied body:', appliedBody);
        
        // Check if domain has any applied fonts (from either mode)
        const domainHasAppliedFonts = appliedSerif || appliedSans || appliedMono || appliedBody;
        console.log('countThirdManInDifferences: domainHasAppliedFonts:', domainHasAppliedFonts);
        
        // Check if current settings have any non-defaults
        let currentHasNonDefaults = false;
        
        // Default font names for each type
        const defaultFontNames = {
            'serif': 'Serif',
            'sans': 'Sans', 
            'mono': 'Mono'
        };
        
        for (const type of types) {
            const current = getPanelFontConfig(type);
            const applied = thirdManData ? thirdManData[type] : null;
            
            const isDefaultFont = !current || !current.fontName || 
                                 current.fontName === 'Default' || 
                                 current.fontName === defaultFontNames[type];
            
            console.log(`countThirdManInDifferences: ${type} current:`, current);
            console.log(`countThirdManInDifferences: ${type} applied:`, applied);
            console.log(`countThirdManInDifferences: ${type} isDefaultFont:`, isDefaultFont);
            
            // Check if current state differs from applied state
            let isDifferent = false;
            
            if (isDefaultFont) {
                // Current is default - difference only if something is applied
                isDifferent = !!applied;
            } else {
                // Current is non-default - difference if nothing applied or different font applied
                isDifferent = !applied || current.fontName !== applied.fontName;
                currentHasNonDefaults = true;
            }
            
            if (isDifferent) {
                changeCount++;
                console.log(`countThirdManInDifferences: ${type} differs - current: ${current?.fontName}, applied: ${applied?.fontName}, changeCount now:`, changeCount);
            } else {
                console.log(`countThirdManInDifferences: ${type} matches - no change needed`);
            }
        }
        
        console.log('countThirdManInDifferences: currentHasNonDefaults:', currentHasNonDefaults);
        console.log('countThirdManInDifferences: changeCount before special case:', changeCount);
        
        // Special case: if domain has applied fonts but current is all defaults,
        // that's one change (clearing all fonts)
        if (domainHasAppliedFonts && !currentHasNonDefaults) {
            console.log('countThirdManInDifferences: Special case - domain has fonts but current is all defaults');
            changeCount = 1;
        }
        
        console.log('countThirdManInDifferences: Final changeCount:', changeCount);
        return changeCount;
    } catch (error) {
        console.error('Error counting differences:', error);
        // Fallback to simple logic
        const defaultFontNames = {
            'serif': 'Serif',
            'sans': 'Sans', 
            'mono': 'Mono'
        };
        
        for (const type of types) {
            const current = getPanelFontConfig(type);
            
            const isDefaultFont = !current || !current.fontName || 
                                 current.fontName === 'Default' || 
                                 current.fontName === defaultFontNames[type];
            
            if (!isDefaultFont) {
                changeCount++;
            }
        }
        return changeCount;
    }
}

// Apply panel configuration based on current mode
async function applyPanelConfiguration(panelId) {
    console.log(`applyPanelConfiguration: Starting for panelId: ${panelId}, mode: ${currentViewMode}`);
    try {
        const currentMode = currentViewMode;
        
        if (currentMode === 'third-man-in') {
            // Use Third Man In specific application
            if (['serif', 'sans', 'mono'].includes(panelId)) {
                console.log(`applyPanelConfiguration: Calling toggleThirdManInFont for ${panelId}`);
                const applied = await toggleThirdManInFont(panelId);
                console.log(`applyPanelConfiguration: toggleThirdManInFont returned: ${applied}`);
                return applied;
            }
        } else if (currentMode === 'body-contact' && panelId === 'body') {
            // Use existing body application logic
            // This would need to be updated to use new storage format eventually
            const applied = await toggleApplyToPage('body');
            return applied;
        } else if (currentMode === 'faceoff') {
            // Use existing face-off application logic
            if (panelId === 'serif') {
                const applied = await toggleApplyToPage('top');
                return applied;
            } else if (panelId === 'sans') {
                const applied = await toggleApplyToPage('bottom');
                return applied;
            }
        }
        
        return false;
    } catch (e) {
        console.warn('applyPanelConfiguration failed', e);
        return false;
    }
}

// Function to be called whenever any control changes in Body Contact or Third Man In modes
function onPanelControlChange(panelId) {
    // Only update button states for the new modes, but skip body (has its own button logic)
    if (['serif', 'mono', 'sans'].includes(panelId)) {
        // Debounce the update to avoid excessive calls
        const debouncedUpdate = debounce(async () => await updateThirdManInButtons(panelId), 300);
        debouncedUpdate();
    }
}

// Function to set up control change listeners for a specific panel
function setupControlChangeListeners(panelId) {
    const panelElement = document.getElementById(`${panelId}-font-controls`);
    if (!panelElement) return;
    
    // Listen for changes on all inputs within the panel
    const inputs = panelElement.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('input', () => onPanelControlChange(panelId));
        input.addEventListener('change', () => onPanelControlChange(panelId));
    });
    
    // Listen for font family changes
    const fontDisplay = document.getElementById(`${panelId}-font-display`);
    if (fontDisplay) {
        // This would need to be integrated with the font picker system
        // For now, just set up a basic observer
        const observer = new MutationObserver(() => onPanelControlChange(panelId));
        observer.observe(fontDisplay, { childList: true, subtree: true, characterData: true });
    }
}

function togglePanel(panelId) {
    const panel = document.getElementById(`${panelId}-font-controls`);
    if (!panel) return;
    
    const isVisible = panel.classList.contains('visible');
    
    if (isVisible) {
        panel.classList.remove('visible');
    } else {
        panel.classList.add('visible');
    }
    
    // Update font comparison layout
    if (panelId === 'body') {
        updateFontComparisonLayoutForBody();
    } else if (['serif', 'sans', 'mono'].includes(panelId)) {
        updateFontComparisonLayoutForThirdManIn();
    }
}

function updateFontComparisonLayoutForBody() {
    const fontComparison = document.getElementById('font-comparison');
    const bodyPanel = document.getElementById('body-font-controls');
    
    if (!fontComparison || !bodyPanel) return;
    
    // Remove existing body panel class
    fontComparison.classList.remove('body-panel-open');
    
    // Add class if body panel is visible
    if (bodyPanel.classList.contains('visible')) {
        fontComparison.classList.add('body-panel-open');
    }
}

function updateFontComparisonLayoutForThirdManIn() {
    const fontComparison = document.getElementById('font-comparison');
    if (!fontComparison) return;
    
    const serifPanel = document.getElementById('serif-font-controls');
    const sansPanel = document.getElementById('sans-font-controls');
    
    // Remove all Third Man In panel layout classes (mono doesn't affect layout)
    fontComparison.classList.remove('serif-panel-open', 'sans-panel-open');
    
    // Add appropriate classes for panels that affect font preview layout
    if (serifPanel && serifPanel.classList.contains('visible')) {
        fontComparison.classList.add('serif-panel-open');
    }
    if (sansPanel && sansPanel.classList.contains('visible')) {
        fontComparison.classList.add('sans-panel-open');
    }
    // Mono panel overlays without affecting font preview layout - no class needed
}

// TODO: Third Man In implementation only - do not use for Body Contact mode!
// Body Contact mode uses updateBodyButtons() for proper button management.
// This function is specifically for Third Man In mode panels (serif, sans, mono).
async function updateThirdManInButtons(panelId) {
    // Safety check: prevent body mode from using this function
    if (panelId === 'body') {
        console.warn('updateThirdManInButtons called with body panelId - this should use updateBodyButtons instead');
        return;
    }
    
    const applyBtn = document.getElementById(`apply-${panelId}`);
    const resetBtn = document.getElementById(`reset-${panelId}`);
    console.log('Found buttons - apply:', !!applyBtn, 'reset:', !!resetBtn);
    
    if (!applyBtn || !resetBtn) return;
    
    // Third Man In mode: Apply All/Reset All logic
    if (currentViewMode === 'third-man-in') {
        const changeCount = await countThirdManInDifferences();
        
        if (changeCount > 0) {
            applyBtn.style.display = 'block';
            applyBtn.textContent = changeCount > 1 ? `Apply All (${changeCount})` : 'Apply All';
            resetBtn.style.display = 'none';
        } else {
            // No differences - check if domain has any applied fonts
            const origin = await getActiveOrigin();
            const thirdManData = await getApplyMapForOrigin(origin, 'third-man-in');
            const domainHasFonts = thirdManData && (thirdManData.serif || thirdManData.sans || thirdManData.mono);
            
            if (domainHasFonts) {
                // Domain has fonts - show Reset All
                applyBtn.style.display = 'none';
                resetBtn.style.display = 'block';
                resetBtn.textContent = 'Reset All';
            } else {
                // Domain has no fonts - hide both buttons
                applyBtn.style.display = 'none';
                resetBtn.style.display = 'none';
            }
        }
        return;
    }
    
    try {
        // Get current panel configuration
        const currentConfig = getPanelFontConfig(panelId);
        console.log('Current config:', currentConfig);
        
        // Get applied configuration for this domain
        const origin = await getActiveOrigin();
        
        // Debug: let's see what's actually in storage
        const debugData = await browser.storage.local.get('affoApplyMap');
        const debugMap = (debugData && debugData.affoApplyMap) ? debugData.affoApplyMap : {};
        console.log('Full storage map:', debugMap);
        console.log('Entry for origin:', origin, ':', debugMap[origin]);
        
        const appliedConfig = await getAppliedConfigForDomain(origin, panelId);
        console.log('Applied config for origin:', origin, appliedConfig);
        
        // Check if current panel has any settings
        const panelHasSettings = configHasAnySettings(currentConfig);
        const domainHasSettings = configHasAnySettings(appliedConfig);
        console.log('Panel has settings:', panelHasSettings, 'Domain has settings:', domainHasSettings);
        
        // State 1: No button visible - both panel and domain are completely unset
        if (!panelHasSettings && !domainHasSettings) {
            console.log('State 1: No button visible - both unset');
            applyBtn.style.display = 'none';
            resetBtn.style.display = 'none';
            return;
        }
        
        // Check if configurations match
        const configsEqual = configsMatch(currentConfig, appliedConfig);
        console.log('Configs match:', configsEqual);
        
        // State 2: Reset button - panel matches domain AND domain has settings  
        if (domainHasSettings && configsEqual) {
            console.log('State 2: Reset button - configs match and domain has settings');
            console.log('Showing RESET button for panelId:', panelId);
            applyBtn.style.display = 'none';
            resetBtn.style.display = 'inline-flex';
            resetBtn.textContent = 'Reset';
            return;
        }
        
        // State 3: Apply button - panel doesn't match domain
        console.log('State 3: Apply button - configs do not match');
        applyBtn.style.display = 'inline-flex';
        resetBtn.style.display = 'none';
        applyBtn.textContent = 'Apply';
        
    } catch (error) {
        console.error('Error updating apply/reset button:', error);
        // Fallback to showing Apply button
        applyBtn.style.display = 'inline-flex';
        resetBtn.style.display = 'none';
        applyBtn.textContent = 'Apply';
    }
}

// Helper function to check if a config has any settings
function configHasAnySettings(config) {
    if (!config) return false;
    
    // Check if font family is set (not null/undefined/default)
    if (config.fontName && config.fontName.toLowerCase() !== 'default') return true;
    
    // Check basic controls
    if (config.basicControls) {
        if (config.basicControls.fontSize !== null && config.basicControls.fontSize !== undefined) return true;
        if (config.basicControls.lineHeight !== null && config.basicControls.lineHeight !== undefined) return true;
        if (config.basicControls.fontWeight !== null && config.basicControls.fontWeight !== undefined) return true;
    }
    
    // Check variable axes
    if (config.variableAxes && config.activeAxes && config.activeAxes.length > 0) return true;
    
    return false;
}

// Helper function to check if two configs match
function configsMatch(config1, config2) {
    console.log('Comparing configs:', {config1, config2});
    
    if (!config1 && !config2) return true;
    if (!config1 || !config2) {
        console.log('One config is null/undefined');
        return false;
    }
    
    // Compare font names
    if (config1.fontName !== config2.fontName) {
        console.log('Font names differ:', config1.fontName, 'vs', config2.fontName);
        return false;
    }
    
    // Compare basic controls
    const basic1 = config1.basicControls || {};
    const basic2 = config2.basicControls || {};
    
    if (basic1.fontSize !== basic2.fontSize) {
        console.log('Font sizes differ:', basic1.fontSize, 'vs', basic2.fontSize);
        return false;
    }
    if (basic1.lineHeight !== basic2.lineHeight) {
        console.log('Line heights differ:', basic1.lineHeight, 'vs', basic2.lineHeight);
        return false;
    }
    if (basic1.fontWeight !== basic2.fontWeight) {
        console.log('Font weights differ:', basic1.fontWeight, 'vs', basic2.fontWeight);
        return false;
    }
    if (basic1.fontColor !== basic2.fontColor) {
        console.log('Font colors differ:', basic1.fontColor, 'vs', basic2.fontColor);
        return false;
    }
    
    // Compare variable axes - only compare axes that were actually modified from defaults
    const activeAxes1 = new Set(config1.activeAxes || []);
    const activeAxes2 = new Set(config2.activeAxes || []);
    const axes1 = config1.variableAxes || {};
    const axes2 = config2.variableAxes || {};
    console.log('Variable axes comparison:', {axes1, axes2, activeAxes1: [...activeAxes1], activeAxes2: [...activeAxes2]});
    
    // Only compare axes that are active in either config
    const allActiveAxes = new Set([...activeAxes1, ...activeAxes2]);
    for (const axis of allActiveAxes) {
        const value1 = activeAxes1.has(axis) ? axes1[axis] : undefined;
        const value2 = activeAxes2.has(axis) ? axes2[axis] : undefined;
        console.log(`Comparing axis ${axis}: ${value1} vs ${value2} (active1: ${activeAxes1.has(axis)}, active2: ${activeAxes2.has(axis)})`);
        
        // If only one side has the axis active, they don't match
        if (activeAxes1.has(axis) !== activeAxes2.has(axis)) {
            console.log(`Active state differs for axis ${axis}`);
            return false;
        }
        
        // If both have it active, values must match
        if (activeAxes1.has(axis) && activeAxes2.has(axis) && value1 !== value2) {
            console.log(`Values differ for active axis ${axis}: ${value1} vs ${value2}`);
            return false;
        }
    }
    
    console.log('Configs match!');
    return true;
}

// Helper function to get applied config for domain
async function getAppliedConfigForDomain(origin, panelId) {
    try {
        if (!origin || !panelId) return null;
        
        const data = await browser.storage.local.get('affoApplyMap');
        const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
        const entry = map[origin] || {};
        
        // Get the stored payload for this panel
        let payload = null;
        if (panelId === 'body') {
            payload = entry.body;
        } else if (panelId === 'serif') {
            payload = entry.serif;
        } else if (panelId === 'sans') {
            payload = entry.sans;
        } else if (panelId === 'mono') {
            payload = entry.mono;
        }
        
        if (!payload) return null;
        
        // Convert payload back to config format
        // Reconstruct active controls based on what was set in the payload
        const activeControls = [];
        if (payload.fontSizePx !== null && payload.fontSizePx !== undefined) {
            activeControls.push('font-size');
        }
        if (payload.lineHeight !== null && payload.lineHeight !== undefined) {
            activeControls.push('line-height');
        }
        if (payload.fontWeight !== null && payload.fontWeight !== undefined) {
            activeControls.push('weight');
        }
        
        // Convert varPairs array back to object format for variableAxes
        const variableAxes = {};
        const activeAxes = [];
        if (Array.isArray(payload.varPairs)) {
            payload.varPairs.forEach(pair => {
                if (pair && pair.tag && pair.value !== undefined) {
                    variableAxes[pair.tag] = pair.value;
                    activeAxes.push(pair.tag);
                }
            });
        }
        
        return {
            fontName: payload.fontName,
            basicControls: {
                fontSize: payload.fontSizePx,
                lineHeight: payload.lineHeight,
                fontWeight: payload.fontWeight,
                fontColor: payload.fontColor || '#000000'
            },
            variableAxes,
            activeAxes,
            activeControls
        };
    } catch (error) {
        console.error('Error getting applied config for domain:', error);
        return null;
    }
}

// Show loading state on Apply button
function showApplyLoading(panelId) {
    const applyBtn = document.getElementById(`apply-${panelId}`);
    if (applyBtn) {
        applyBtn.textContent = 'Loading...';
        applyBtn.disabled = true;
    }
}

// Hide loading state on Apply button
async function hideApplyLoading(panelId) {
    const applyBtn = document.getElementById(`apply-${panelId}`);
    if (applyBtn) {
        applyBtn.disabled = false;
        // Button text will be updated by appropriate button function
        if (panelId === 'body') {
            await updateBodyButtons();
        } else if (['serif', 'sans', 'mono'].includes(panelId)) {
            await updateThirdManInButtons(panelId);
        }
    }
}

// Reset functionality for Body Contact and Third Man In modes
async function resetPanelSettings(panelId) {
    try {
        console.log('resetPanelSettings called for panelId:', panelId);
        
        if (currentViewMode === 'third-man-in') {
            // Third Man In mode: Reset All strategy
            await resetAllThirdManInFonts();
            
            // Update button states for all Third Man In panels
            await updateThirdManInButtons('serif');
            await updateThirdManInButtons('sans');
            await updateThirdManInButtons('mono');
        } else {
            // Body Contact and Face-off modes: single panel reset
            const resetBtn = document.getElementById(`reset-${panelId}`);
            if (resetBtn) {
                resetBtn.textContent = 'Resetting...';
                resetBtn.disabled = true;
            }
            
            // Unset all panel settings
            console.log('Calling unsetAllPanelControls');
            unsetAllPanelControls(panelId);
            
            // Apply the unset settings to the domain (removes all font styling)
            console.log('Calling applyUnsetSettings');
            await applyUnsetSettings(panelId);
            
            // Update button state
            if (panelId === 'body') {
                console.log('Calling updateBodyButtons');
                await updateBodyButtons();
            } else if (['serif', 'sans', 'mono'].includes(panelId)) {
                console.log('Calling updateThirdManInButtons');
                await updateThirdManInButtons(panelId);
            }
        }
        
    } catch (error) {
        console.error('Error in resetPanelSettings:', error);
    } finally {
        // Hide loading state
        const resetBtn = document.getElementById(`reset-${panelId}`);
        if (resetBtn) {
            resetBtn.textContent = 'Reset All';
            resetBtn.disabled = false;
        }
    }
}

// Reset All fonts for Third Man In mode
async function resetAllThirdManInFonts() {
    const types = ['serif', 'sans', 'mono'];
    
    for (const type of types) {
        unsetAllPanelControls(type);
        await applyUnsetSettings(type);
    }
}

// Helper to unset all controls for a panel
function unsetAllPanelControls(panelId) {
    console.log('unsetAllPanelControls called for:', panelId);
    
    // Unset font family (set to default)
    const fontDisplay = document.getElementById(`${panelId}-font-display`);
    if (fontDisplay) {
        fontDisplay.textContent = 'Default';
        fontDisplay.classList.add('placeholder');
    }
    
    // Update font preview elements
    const fontNameElement = document.getElementById(`${panelId}-font-name`);
    const fontTextElement = document.getElementById(`${panelId}-font-text`);
    if (fontNameElement) {
        fontNameElement.textContent = 'Default';
        fontNameElement.style.fontFamily = '';
    }
    if (fontTextElement) {
        fontTextElement.style.fontFamily = '';
        fontTextElement.style.fontSize = '';
        fontTextElement.style.fontWeight = '';
        fontTextElement.style.lineHeight = '';
        fontTextElement.style.color = '';
    }
    
    // Clear extension state for this panel
    if (panelId === 'body') {
        extensionState[currentViewMode].bodyFont = null;
        // Clear active axes
        bodyActiveAxes.clear();
        // Save the cleared state to localStorage
        saveExtensionState();
        
        // Reset body control values to defaults
        const bodyFontSizeSlider = document.getElementById('body-font-size');
        const bodyFontSizeText = document.getElementById('body-font-size-text');
        const bodyFontSizeValue = document.getElementById('body-font-size-value');
        const bodyLineHeightSlider = document.getElementById('body-line-height');
        const bodyLineHeightText = document.getElementById('body-line-height-text');
        const bodyLineHeightValue = document.getElementById('body-line-height-value');
        const bodyFontWeightSlider = document.getElementById('body-font-weight');
        const bodyFontWeightValue = document.getElementById('body-font-weight-value');
        
        if (bodyFontSizeSlider) bodyFontSizeSlider.value = 17;
        if (bodyFontSizeText) bodyFontSizeText.value = 17;
        if (bodyFontSizeValue) bodyFontSizeValue.textContent = '17px';
        if (bodyLineHeightSlider) bodyLineHeightSlider.value = 1.6;
        if (bodyLineHeightText) bodyLineHeightText.value = 1.6;
        if (bodyLineHeightValue) bodyLineHeightValue.textContent = '1.6';
        if (bodyFontWeightSlider) bodyFontWeightSlider.value = 400;
        if (bodyFontWeightValue) bodyFontWeightValue.textContent = '400';
    }
    
    // Unset all control groups
    const controlGroups = document.querySelectorAll(`#${panelId}-font-controls .control-group`);
    controlGroups.forEach(group => {
        group.classList.add('unset');
    });
    
    console.log('Extension state after reset:', extensionState[currentViewMode]);
}

// Helper to apply unset settings (remove all font styling from domain)
async function applyUnsetSettings(panelId) {
    try {
        console.log(`applyUnsetSettings: Starting for panelId: ${panelId}`);
        
        // Get current origin for storage
        const origin = await getActiveOrigin();
        console.log(`applyUnsetSettings: Origin: ${origin}`);
        
        if (origin) {
            // Remove the applied configuration from storage
            const data = await browser.storage.local.get('affoApplyMap');
            const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
            const entry = map[origin] || {};
            
            console.log(`applyUnsetSettings: Before deletion, entry for ${origin}:`, entry);
            console.log(`applyUnsetSettings: About to delete key: ${panelId}`);
            
            // Remove the specific panel's settings
            if (panelId === 'body') {
                delete entry.body;
            } else if (panelId === 'serif') {
                delete entry.serif;
            } else if (panelId === 'sans') {
                delete entry.sans;
            } else if (panelId === 'mono') {
                delete entry.mono;
            }
            
            console.log(`applyUnsetSettings: After deletion, entry for ${origin}:`, entry);
            
            // Update storage
            if (Object.keys(entry).length === 0) {
                console.log(`applyUnsetSettings: Entry is empty, deleting entire origin entry`);
                delete map[origin]; // Remove entire entry if no panels left
            } else {
                console.log(`applyUnsetSettings: Updating origin entry with remaining keys:`, Object.keys(entry));
                map[origin] = entry;
            }
            
            console.log(`applyUnsetSettings: About to save updated map:`, map);
            await browser.storage.local.set({ affoApplyMap: map });
            console.log(`applyUnsetSettings: Storage updated successfully`);
            
            // Send message to content script to remove fonts from page
            try {
                const tabs = await browser.tabs.query({active: true, currentWindow: true});
                if (tabs.length > 0) {
                    console.log('Sending resetFonts message to content script for panelId:', panelId);
                    const response = await browser.tabs.sendMessage(tabs[0].id, {
                        type: 'resetFonts',
                        panelId: panelId
                    });
                    console.log('Content script response:', response);
                }
            } catch (err) {
                console.warn('Could not send reset message to content script:', err);
            }
        }
    } catch (error) {
        console.error('Error applying unset settings:', error);
        throw error;
    }
}

// Debounce helper
function debounce(fn, wait) {
    let t = null; return function(...args){ clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
}
