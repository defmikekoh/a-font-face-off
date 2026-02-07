// Dev-mode logging: build step sets AFFO_DEBUG = false for production
var AFFO_DEBUG = true;
if (!AFFO_DEBUG) {
  console.log = function() {};
  console.warn = function() {};
}

// View mode: 'body-contact', 'faceoff', or 'third-man-in' (facade mode removed)
let currentViewMode = null; // Start modeless to avoid warnings when switching to appropriate mode
let suppressUiStateSave = false;

// Panel state tracking across mode switches
// On mobile (narrow screens), faceoff panels should start hidden
const isMobile = window.innerWidth <= 599;
const panelStates = {
    'faceoff': { top: !isMobile, bottom: !isMobile },
    'body-contact': { body: true },
    'third-man-in': { serif: false, sans: false, mono: false }
};

console.log('🔧 Initial panelStates:', panelStates);

const MODE_CONFIG = {
    'body-contact': { positions: ['body'], stateKeys: { body: 'bodyFont' }, useDomain: true },
    'faceoff': { positions: ['top', 'bottom'], stateKeys: { top: 'topFont', bottom: 'bottomFont' }, useDomain: false },
    'third-man-in': { positions: ['serif', 'sans', 'mono'], stateKeys: { serif: 'serifFont', sans: 'sansFont', mono: 'monoFont' }, useDomain: true }
};

function getPanelLabel(position) {
    if (position === 'body') return 'Body';
    if (position === 'top') return 'Top';
    if (position === 'bottom') return 'Bottom';
    if (position === 'serif') return 'Serif';
    if (position === 'sans') return 'Sans';
    if (position === 'mono') return 'Mono';
    return position; // fallback
}

// getSiteSpecificRules is now in css-generators.js

function applyViewMode(forceView) {
    if (forceView) currentViewMode = forceView;

    console.log(`🔄 applyViewMode: Setting view mode to ${currentViewMode}`);

    // Save view mode and update UI using .then() pattern
    return browser.storage.local.set({ affoCurrentView: currentViewMode }).then(() => {
        // Toggle body classes so CSS can react
        try {
            console.log(`🔄 applyViewMode: Toggling body classes for ${currentViewMode}`);
            document.body.classList.toggle('view-faceoff', currentViewMode === 'faceoff');
            document.body.classList.toggle('view-body-contact', currentViewMode === 'body-contact');
            document.body.classList.toggle('view-third-man-in', currentViewMode === 'third-man-in');
            console.log(`🔄 applyViewMode: Body classes after toggle:`, document.body.className);

            // DEBUG: Check mode content visibility after body classes are set
            document.querySelectorAll('.mode-content').forEach(content => {
                console.log(`🔄 applyViewMode DEBUG: Mode content ${content.className} visibility:`, getComputedStyle(content).display);
            });
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

    }).catch(error => {
        console.warn('Error in applyViewMode:', error);
        // Continue with UI updates even if storage fails
        loadModeSettings();
    });
}

// Load settings for the current view mode
async function loadModeSettings() {
    const callTime = Date.now();
    console.log('loadModeSettings called at', callTime, ', currentViewMode:', currentViewMode);
    console.log('extensionState:', extensionState);
    const modeState = extensionState ? extensionState[currentViewMode] : null;
    console.log('modeState:', modeState);

    // Debug: Check if we're actually in Third Man In mode based on UI
    const isThirdManInUI = document.body.classList.contains('view-third-man-in');
    console.log('loadModeSettings: UI shows third-man-in mode:', isThirdManInUI);
    if (isThirdManInUI && currentViewMode !== 'third-man-in') {
        console.error('loadModeSettings: MODE MISMATCH! UI is third-man-in but currentViewMode is', currentViewMode);
    }

    // Safety check - ensure modeState exists
    if (!modeState) {
        console.error('modeState is undefined for currentViewMode:', currentViewMode);
        console.log('Available modes in extensionState:', extensionState ? Object.keys(extensionState) : 'extensionState is null');
        return;
    }

    if (currentViewMode === 'body-contact') {
        console.log('In body-contact mode, modeState.bodyFont:', modeState?.bodyFont);
        // Body Contact mode - CHECK DOMAIN FIRST, then UI state fallback
        try {
            const origin = await getActiveOrigin();
            let domainDataFound = false;

            if (origin) {
                const config = await getApplyMapForOrigin(origin, 'body');
                if (config) {
                    // Domain has applied settings - use those (ignore UI state)
                    console.log('DOMAIN-FIRST: Found applied body state for origin:', origin, config);
                    const builtConfig = normalizeConfig(config);
                    console.log('Built config:', builtConfig);

                    await applyFontConfig('body', builtConfig);
                    // Update button state to reflect that font matches applied state
                    console.log('About to update button after loading applied body state');
                    await updateBodyButtons();
                    domainDataFound = true;
                } else {
                    console.log('DOMAIN-FIRST: No applied body state found for origin:', origin);
                }
            }

            // Only reset if no domain data was found
            if (domainDataFound) {
                console.log('DOMAIN ISOLATION: Domain data found - keeping restored state');
                return; // Skip reset
            }

            // No domain-specific settings found - start with clean state (no UI state fallback)
            console.log('DOMAIN ISOLATION: No applied settings for this domain - starting fresh');

            // Reset to completely unset state for this domain
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

            // Reset all form controls to default values
            const fontSelect = document.getElementById('body-font-select');
            const colorSelect = document.getElementById('body-font-color');
            const sizeSlider = document.getElementById('body-font-size');
            const lineSlider = document.getElementById('body-line-height');
            if (fontSelect && fontSelect.options.length > 0) fontSelect.value = fontSelect.options[0].value;
            if (colorSelect) colorSelect.value = 'default';
            if (sizeSlider) sizeSlider.value = '16';
            if (lineSlider) lineSlider.value = '1.5';

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
            await updateBodyButtons();
        }
    } else if (currentViewMode === 'third-man-in') {
        console.log('In third-man-in mode');
        // Third Man In mode - CHECK DOMAIN FIRST, then clean default state
        try {
            const origin = await getActiveOrigin();
            let domainSettingsFound = false;

            if (origin) {
                const domainData = await getApplyMapForOrigin(origin);
                console.log('DOMAIN-FIRST: domainData for origin:', origin, domainData);

                if (domainData && (domainData.serif || domainData.sans || domainData.mono)) {
                    // Domain has applied settings - use those (ignore UI state)
                    console.log('DOMAIN-FIRST: Found applied third man in state for origin:', origin);

                    const types = ['serif', 'sans', 'mono'];
                    let applyPromises = [];
                    let cssPromises = [];

                    for (const type of types) {
                        if (domainData[type]) {
                            console.log(`DOMAIN-FIRST: Loading ${type} font:`, domainData[type]);
                            const config = normalizeConfig(domainData[type]);
                            console.log(`Built ${type} config:`, config);
                            applyPromises.push(applyFontConfig(type, config));

                            // Re-apply CSS to page - coordinate with font loading
                            cssPromises.push(
                                (async () => {
                                    // Wait for font loading to stabilize
                                    await new Promise(resolve => setTimeout(resolve, 200));
                                    return await reapplyThirdManInCSS(type, domainData[type]);
                                })()
                            );
                        }
                    }

                    await Promise.all([...applyPromises, ...cssPromises]);
                    // Update button states to reflect that fonts match applied state
                    console.log('About to update buttons after loading applied third man in state');
                    await updateAllThirdManInButtons();
                    domainSettingsFound = true;
                } else {
                    console.log('DOMAIN-FIRST: No applied third man in state found for origin:', origin);
                }
            }

            if (!domainSettingsFound) {
                // Set default placeholders for fresh state, but don't overwrite domain restoration
                console.log('DOMAIN ISOLATION: Setting up default placeholders for fresh state');

                const types = ['serif', 'sans', 'mono'];
                const defaultLabels = { serif: 'Serif', sans: 'Sans', mono: 'Mono' };

                types.forEach(type => {
                    const fontNameElement = document.getElementById(`${type}-font-name`);
                    const fontDisplay = document.getElementById(`${type}-font-display`);

                    // Only set defaults if elements are empty/uninitialized (don't overwrite domain restoration)
                    if (fontNameElement && (!fontNameElement.textContent || fontNameElement.textContent.trim() === '')) {
                        fontNameElement.textContent = defaultLabels[type];
                        console.log(`Setting default ${type} heading to "${defaultLabels[type]}"`);
                    }

                    if (fontDisplay && (!fontDisplay.textContent || fontDisplay.textContent.trim() === '')) {
                        fontDisplay.textContent = 'Default';
                        fontDisplay.classList.add('placeholder');
                        console.log(`Setting default ${type} display to "Default"`);
                    }
                });

                // Update button states for clean default state
                await updateAllThirdManInButtons();
            }
        } catch (error) {
            console.error('Error in third-man-in loadModeSettings:', error);
        }
    } else if (currentViewMode === 'faceoff') {
        // Face-off mode (existing behavior)
        const priorSuppressUiStateSave = suppressUiStateSave;
        suppressUiStateSave = true;
        try {
            // Load top font - face-off mode always needs a font family
            if (modeState.topFont && modeState.topFont.fontName) {
                await applyFontConfig('top', modeState.topFont);
            } else if (modeState.topFont && (modeState.topFont.fontSize || modeState.topFont.lineHeight || modeState.topFont.fontWeight || modeState.topFont.fontColor || modeState.topFont.variableAxes)) {
                // Has saved settings but no custom font - load default font then apply settings
                await loadFont('top', 'ABeeZee');
                await applyFontConfig('top', { ...modeState.topFont, fontName: 'ABeeZee' });
            } else {
                // Use default font for this mode
                loadFont('top', 'ABeeZee');
            }

            // Load bottom font - face-off mode always needs a font family
            if (modeState.bottomFont && modeState.bottomFont.fontName) {
                await applyFontConfig('bottom', modeState.bottomFont);
            } else if (modeState.bottomFont && (modeState.bottomFont.fontSize || modeState.bottomFont.lineHeight || modeState.bottomFont.fontWeight || modeState.bottomFont.fontColor || modeState.bottomFont.variableAxes)) {
                // Has saved settings but no custom font - load default font then apply settings
                await loadFont('bottom', 'Zilla Slab Highlight');
                await applyFontConfig('bottom', { ...modeState.bottomFont, fontName: 'Zilla Slab Highlight' });
            } else {
                // Use default font for this mode
                loadFont('bottom', 'Zilla Slab Highlight');
            }
        } finally {
            suppressUiStateSave = priorSuppressUiStateSave;
        }
        await saveExtensionState();
    }
    // Note: Other modes like 'body-contact' and 'third-man-in' are handled above
}

// Helper: get current active tab's origin without requiring 'tabs' permission
function getActiveOrigin() {
    return executeScriptInTargetTab({ code: 'location.hostname' }).then(res => {
        if (Array.isArray(res) && res.length) return String(res[0]);
        return null;
    }).catch(() => null);
}

// Update domain display in the preview domain rink
async function updateDomainDisplay() {
    const domainDisplay = document.getElementById('body-domain-display');
    if (!domainDisplay) return;

    try {
        const origin = await getActiveOrigin();
        if (origin) {
            domainDisplay.textContent = origin;
        } else {
            domainDisplay.textContent = 'Unknown Domain';
        }
    } catch (error) {
        console.error('Error updating domain display:', error);
        domainDisplay.textContent = 'Error Loading Domain';
    }
}

// Helper: execute script in the correct tab (source tab if available, otherwise active tab)
function executeScriptInTargetTab(options) {
    if (window.sourceTabId) {
        console.log('[AFFO Popup] Executing script in source tab:', window.sourceTabId);
        return browser.tabs.executeScript(window.sourceTabId, options);
    } else {
        console.log('[AFFO Popup] Executing script in active tab');
        return browser.tabs.executeScript(options);
    }
}

// Helper: insert CSS in the correct tab (source tab if available, otherwise active tab)
function insertCSSInTargetTab(options) {
    if (window.sourceTabId) {
        console.log('[AFFO Popup] Inserting CSS in source tab:', window.sourceTabId);
        return browser.tabs.insertCSS(window.sourceTabId, options);
    } else {
        console.log('[AFFO Popup] Inserting CSS in active tab');
        return browser.tabs.insertCSS(options);
    }
}

// Helper: send message to the correct tab (source tab if available, otherwise active tab)
function sendMessageToTargetTab(message) {
    if (window.sourceTabId) {
        console.log('[AFFO Popup] Sending message to source tab:', window.sourceTabId);
        return browser.tabs.sendMessage(window.sourceTabId, message);
    } else {
        console.log('[AFFO Popup] Sending message to active tab');
        return browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
            if (tabs[0]) {
                return browser.tabs.sendMessage(tabs[0].id, message);
            }
        });
    }
}

// Get domain and source tab from URL parameters (for when opened in new tab with context)
function getContextFromUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const domain = urlParams.get('domain');
    const sourceTabId = urlParams.get('sourceTabId');
    console.log('[AFFO Popup] Context parameters from URL:', { domain, sourceTabId });
    return {
        domain: domain,
        sourceTabId: sourceTabId ? parseInt(sourceTabId) : null
    };
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
                    const result = await executeScriptInTargetTab({ code: fontCheckScript });
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
            await executeScriptInTargetTab({ code: walkerScript });
        } catch (e) {
            console.warn(`reapplyThirdManInCSS: Walker script failed for ${fontType}:`, e);
        }

        // Then generate and apply CSS
        const cssCode = generateThirdManInCSS(fontType, fontConfig);
        if (cssCode) {
            console.log(`reapplyThirdManInCSS: Generated CSS for ${fontType}:`, cssCode);
            await insertCSSInTargetTab({ code: cssCode });
            appliedCssActive[fontType] = cssCode;

            // Verify the CSS was applied with comprehensive debugging
            try {
                // Small delay to allow CSS injection to complete
                await new Promise(resolve => setTimeout(resolve, 100));

                await browser.tabs.executeScript({
                    code: `
                        console.log('=== CSS VERIFICATION START ===');
                        console.log('CSS verification: Elements with ${fontType} marker:', document.querySelectorAll('[data-affo-font-type="${fontType}"]').length);

                        var elements = document.querySelectorAll('[data-affo-font-type="${fontType}"]');
                        if (elements.length > 0) {
                            var firstEl = elements[0];
                            var style = getComputedStyle(firstEl);
                            console.log('CSS verification: First element tag:', firstEl.tagName);
                            console.log('CSS verification: First element font-family:', style.fontFamily);
                            console.log('CSS verification: First element text content (first 50 chars):', firstEl.textContent.slice(0, 50));

                            // Check if there are any CSS rules targeting this element
                            var matchedRules = [];
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
                                var fontName = '${fontConfig.fontName}';
                                var isLoaded = document.fonts.check('16px ' + fontName);
                                console.log('CSS verification: Font loading status for', fontName, ':', isLoaded);
                            }
                        } else {
                            console.warn('CSS verification: No elements found with data-affo-font-type="${fontType}"');
                            // Check if walker ran at all
                            var allMarked = document.querySelectorAll('[data-affo-font-type]');
                            console.log('CSS verification: Total elements with any font-type marker:', allMarked.length);
                        }
                        console.log('=== CSS VERIFICATION END ===');
                    `
                });
            } catch (e) {
                console.warn('CSS verification failed:', e);
            }
        }
    } catch (e) {
        console.warn(`reapplyThirdManInCSS: Failed to re-apply CSS for ${fontType}:`, e);
    }
}

// Custom font definitions are loaded from custom-fonts.css and ap-fonts.css.
// ap-fonts.css contains base64-embedded AP fonts (large) and is only injected
// into the popup DOM when an AP font is actually selected for preview.
let CUSTOM_FONTS = [];
let fontDefinitions = {};
let customFontsCssText = '';
let apFontsCssText = '';
let customFontsLoaded = false;
let customFontsPromise = null;

// Font families defined in ap-fonts.css (loaded lazily into popup DOM)
const AP_FONT_FAMILIES = ['AP', 'APVar'];

// Manual axis metadata for custom variable fonts (from fvar table inspection).
// Static custom fonts don't need entries here — they get empty axes by default.
const CUSTOM_FONT_AXES = {
    'APVar': {
        axes: ['wght', 'wdth'],
        defaults: { wght: 400, wdth: 100 },
        ranges:   { wght: [100, 900], wdth: [35, 100] },
    },
};

function parseCustomFontsFromCss(cssText) {
    const blocks = String(cssText || '').match(/@font-face\s*{[\s\S]*?}/gi) || [];
    const names = [];
    const byName = new Map();

    blocks.forEach(block => {
        const match = block.match(/font-family\s*:\s*(['"]?)([^;'"]+)\1\s*;/i);
        if (!match) return;
        const name = match[2].trim();
        if (!name) return;
        if (!byName.has(name)) {
            byName.set(name, []);
            names.push(name);
        }
        byName.get(name).push(block);
    });

    const defs = {};
    names.forEach(name => {
        const meta = CUSTOM_FONT_AXES[name];
        const axes = meta ? meta.axes : [];
        const defaults = meta ? meta.defaults : {};
        const ranges = meta ? meta.ranges : {};
        const steps = {};
        if (meta) {
            axes.forEach(axis => {
                steps[axis] = AXIS_STEP_DEFAULTS[axis] || 1;
            });
        }
        defs[name] = { axes, defaults, ranges, steps, fontFaceRule: byName.get(name).join('\n') };
    });

    return { names, defs };
}

async function ensureCustomFontsLoaded() {
    if (customFontsLoaded) return;
    if (!customFontsPromise) {
        customFontsPromise = (async () => {
            try {
                const stored = await browser.storage.local.get('affoCustomFontsCss');
                let cssText = stored.affoCustomFontsCss;
                if (!cssText) {
                    const url = browser.runtime.getURL('custom-fonts.css');
                    const response = await fetch(url);
                    cssText = await response.text();
                }
                customFontsCssText = cssText || '';

                // Also load AP fonts (base64-embedded, separate file for size)
                try {
                    const apUrl = browser.runtime.getURL('ap-fonts.css');
                    const apResponse = await fetch(apUrl);
                    apFontsCssText = await apResponse.text();
                } catch (_e) {
                    apFontsCssText = '';
                }

                // Parse both files and merge definitions
                const parsed = parseCustomFontsFromCss(customFontsCssText);
                const apParsed = parseCustomFontsFromCss(apFontsCssText);
                CUSTOM_FONTS = [...parsed.names, ...apParsed.names];
                fontDefinitions = { ...parsed.defs, ...apParsed.defs };
                customFontsLoaded = true;
            } catch (e) {
                console.warn('Failed to load custom fonts CSS:', e);
                CUSTOM_FONTS = [];
                fontDefinitions = {};
                customFontsCssText = '';
                apFontsCssText = '';
                customFontsLoaded = true;
            }
        })();
    }
    await customFontsPromise;
}
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

function ensureGfMetadata() {
    if (gfMetadata) return Promise.resolve(gfMetadata);

    // Check for cached metadata with 24-hour expiration
    return browser.storage.local.get(['gfMetadataCache', 'gfMetadataTimestamp']).then(data => {
        const now = Date.now();
        const cacheAge = now - (data.gfMetadataTimestamp || 0);
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const remoteUrl = 'https://fonts.google.com/metadata/fonts';

        const parseMetadataText = text => {
            const jsonLocal = text.replace(/^\)\]\}'\n?/, '');
            return JSON.parse(jsonLocal);
        };

        const cacheMetadata = metadata => {
            gfMetadata = metadata;
            browser.storage.local.set({
                gfMetadataCache: gfMetadata,
                gfMetadataTimestamp: now
            }).catch(e => console.warn('Failed to cache GF metadata:', e));
            return gfMetadata;
        };

        const fetchRemoteMetadata = () => {
            return fetch(remoteUrl, { credentials: 'omit' }).then(res => {
                if (!res.ok) throw new Error(`Remote HTTP ${res.status}`);
                return res.text();
            }).then(parseMetadataText).then(cacheMetadata);
        };

        const fetchLocalMetadata = () => {
            return fetch('data/gf-axis-registry.json', { credentials: 'omit' }).then(resLocal => {
                if (!resLocal.ok) throw new Error(`Local HTTP ${resLocal.status}`);
                return resLocal.text();
            }).then(parseMetadataText).then(cacheMetadata);
        };

        if (data.gfMetadataCache && cacheAge < twentyFourHours) {
            gfMetadata = data.gfMetadataCache;
            return gfMetadata;
        }

        // Cache expired or missing, fetch fresh data (remote first, then local fallback)
        return fetchRemoteMetadata().catch(err => {
            console.warn('Remote metadata load failed; falling back to local metadata', err);
            return fetchLocalMetadata();
        }).catch(e2 => {
            console.warn('Local metadata load failed; proceeding with empty metadata', e2);
            gfMetadata = { familyMetadataList: [] };
            return gfMetadata;
        });
    }).catch(e => {
        console.warn('Storage access failed, loading fresh metadata:', e);
        // Fallback to original behavior if storage fails
        const remoteUrl = 'https://fonts.google.com/metadata/fonts';
        const parseMetadataText = text => {
            const jsonLocal = text.replace(/^\)\]\}'\n?/, '');
            return JSON.parse(jsonLocal);
        };
        const fetchRemoteMetadata = () => {
            return fetch(remoteUrl, { credentials: 'omit' }).then(res => {
                if (!res.ok) throw new Error(`Remote HTTP ${res.status}`);
                return res.text();
            }).then(parseMetadataText);
        };
        const fetchLocalMetadata = () => {
            return fetch('data/gf-axis-registry.json', { credentials: 'omit' }).then(resLocal => {
                if (!resLocal.ok) throw new Error(`Local HTTP ${resLocal.status}`);
                return resLocal.text();
            }).then(parseMetadataText);
        };
        return fetchRemoteMetadata().then(metadata => {
            gfMetadata = metadata;
            return gfMetadata;
        }).catch(err => {
            console.warn('Remote metadata load failed; falling back to local metadata', err);
            return fetchLocalMetadata().then(metadata => {
                gfMetadata = metadata;
                return gfMetadata;
            });
        }).catch(e2 => {
            console.warn('Local metadata load failed; proceeding with empty metadata', e2);
            gfMetadata = { familyMetadataList: [] };
            return gfMetadata;
        });
    });
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
    return getActiveControlsFromUI(position);
}

// Helper function to get active axes for any position
function getActiveAxes(position) {
    return getActiveAxesFromUI(position);
}

// Active controls and axes are now derived from UI state (unset classes)
// No need for global tracking variables

// Async version of updateBodyButtons - no more setTimeout debouncing
async function updateBodyButtons() {
    try {
        await updateBodyButtonsImmediate();
    } catch (error) {
        console.error('Error in updateBodyButtons:', error);
    }
}

// determineButtonState() is now in config-utils.js

async function updateBodyButtonsImmediate() {
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
        const currentConfig = getCurrentUIConfig('body');
        console.log('Current config:', currentConfig);

        // Get applied state from domain storage
        const appliedConfig = await getApplyMapForOrigin(origin, 'body');
        console.log('Applied config:', appliedConfig);

        // Compare current vs applied state
        const changeCount = !configsEqual(currentConfig, appliedConfig) ? 1 : 0;
        const domainHasAppliedState = !!appliedConfig;

        console.log('DEBUG updateBodyButtons:', {
            changeCount,
            domainHasAppliedState,
            currentConfig,
            appliedConfig,
            configsEqualResult: configsEqual(currentConfig, appliedConfig),
            currentConfigType: typeof currentConfig,
            appliedConfigType: typeof appliedConfig
        });

        const allDefaults = !currentConfig; // currentConfig is undefined when UI shows "Default"
        const state = determineButtonState(changeCount, allDefaults, domainHasAppliedState);

        if (state.action === 'apply') {
            if (applyBtn) { applyBtn.style.display = 'block'; applyBtn.textContent = 'Apply'; applyBtn.disabled = false; }
            if (resetBtn) resetBtn.style.display = 'none';
        } else if (state.action === 'reset') {
            if (applyBtn) applyBtn.style.display = 'none';
            if (resetBtn) { resetBtn.style.display = 'block'; resetBtn.textContent = 'Reset'; resetBtn.disabled = false; }
        } else {
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
    // - config1: current flattened format
    // - config2: applied format with direct properties (fontWeight, fontSizePx, lineHeight)

    // Compare active controls first - if they differ, configs are different
    const activeControls1 = getActiveControlsFromConfig(config1);
    const activeControls2 = getActiveControlsFromConfig(config2);

    // Check if active control sets are equal
    if (activeControls1.size !== activeControls2.size) return false;
    for (const control of activeControls1) {
        if (!activeControls2.has(control)) return false;
    }

    // Only compare values for active controls
    if (activeControls1.has('font-size')) {
        const fontSize1 = Number(config1.fontSize);
        const fontSize2 = Number(config2.fontSize);
        if (fontSize1 !== fontSize2) return false;
    }

    if (activeControls1.has('line-height')) {
        const lineHeight1 = Number(config1.lineHeight);
        const lineHeight2 = Number(config2.lineHeight);
        if (lineHeight1 !== lineHeight2) return false;
    }

    if (activeControls1.has('weight')) {
        const fontWeight1 = Number(config1.fontWeight);
        const fontWeight2 = Number(config2.fontWeight);
        if (fontWeight1 !== fontWeight2) return false;
    }

    if (activeControls1.has('color')) {
        const fontColor1 = config1.fontColor;
        const fontColor2 = config2.fontColor;
        if (fontColor1 !== fontColor2) return false;
    }

    // Compare variable axes
    const currentAxes = config1.variableAxes;
    const currentActiveAxes = getActiveAxesFromVariableAxes(currentAxes);

    // Compare variable axes (using variableAxes format only)
    const appliedAxes = config2.variableAxes;
    const appliedActiveAxes = getActiveAxesFromVariableAxes(appliedAxes);


    // Check if active axes sets are equal
    if (currentActiveAxes.size !== appliedActiveAxes.size) {
        return false;
    }
    for (const axis of currentActiveAxes) {
        if (!appliedActiveAxes.has(axis)) return false;
    }

    // Compare values for active axes
    for (const axis of currentActiveAxes) {
        const currentValue = Number(currentAxes[axis]);
        const appliedValue = Number(appliedAxes[axis]);
        if (currentValue !== appliedValue) return false;
    }

    return true;
}

// Font settings memory - stores settings for each font
let topFontMemory = {};
let bottomFontMemory = {};
let bodyFontMemory = {};
let serifFontMemory = {};
let sansFontMemory = {};
let monoFontMemory = {};

function getFontMemory(position) {
    const map = { top: topFontMemory, bottom: bottomFontMemory, body: bodyFontMemory,
                  serif: serifFontMemory, sans: sansFontMemory, mono: monoFontMemory };
    return map[position] || null;
}

// Favorites storage
let savedFavorites = {};
let savedFavoritesOrder = [];

// Extension state storage - separate for each mode
let extensionState = {
    'body-contact': {},
    faceoff: {},
    'third-man-in': {}
};

// loadFavoritesFromStorage, saveFavoritesToStorage are now in favorites.js

// Load extension state from browser.storage.local
function loadExtensionState() {
    return browser.storage.local.get('affoUIState').then(result => {
        console.log('Loading extension state from browser.storage.local:', result.affoUIState);

        if (result.affoUIState) {
            const parsed = result.affoUIState;
            console.log('Parsed state:', parsed);
            {
                extensionState = parsed;
                // Ensure new modes exist in loaded state
                if (!extensionState['body-contact']) {
                    extensionState['body-contact'] = {};
                }
                if (!extensionState['third-man-in']) {
                    extensionState['third-man-in'] = {};
                }
            }
        } else {
            extensionState = {
                'body-contact': {},
                faceoff: {},
                'third-man-in': {}
            };
        }
    }).catch(error => {
        console.error('Error loading extension state:', error);
        extensionState = {
            'body-contact': {},
            faceoff: {},
            'third-man-in': {}
        };
        console.log('Initialized fresh extension state:', extensionState);
    });
}

// Async version of saveExtensionState - debouncing removed for better coordination
async function saveExtensionState() {
    try {
        await saveExtensionStateImmediate();
    } catch (error) {
        console.error('Error saving extension state:', error);
    }
}

// Save extension state to browser.storage.local
async function saveExtensionStateImmediate() {
    // Don't save if currentViewMode is not set yet
    if (!currentViewMode) {
        console.warn('saveExtensionStateImmediate: currentViewMode is not set, skipping save');
        return;
    }

    // Ensure the current mode exists in extensionState
    if (!extensionState[currentViewMode]) {
        extensionState[currentViewMode] = {};
    }

    const modeConfig = MODE_CONFIG[currentViewMode];

    // Face-off fallback: when UI controls aren't active but a font name is displayed
    const getFallbackConfig = (currentViewMode === 'faceoff') ? (position) => {
        const display = document.getElementById(`${position}-font-display`);
        const name = display ? String(display.textContent || '').trim() : '';
        if (!name || name.toLowerCase() === 'default') return undefined;
        return { fontName: name, variableAxes: {} };
    } : null;

    for (const [position, stateKey] of Object.entries(modeConfig.stateKeys)) {
        let config = getCurrentUIConfig(position);
        if (!config && getFallbackConfig) {
            config = getFallbackConfig(position);
        }
        if (config) {
            extensionState[currentViewMode][stateKey] = config;
        } else {
            delete extensionState[currentViewMode][stateKey];
        }
    }

    // Always save after updating state
    await browser.storage.local.set({ affoUIState: extensionState });
}

// Helper functions to derive active controls and axes from data structures
function getActiveControlsFromConfig(config) {
    const active = new Set();
    if (config && config.fontSize !== null && config.fontSize !== undefined) active.add('font-size');
    if (config && config.lineHeight !== null && config.lineHeight !== undefined) active.add('line-height');
    if (config && config.fontWeight !== null && config.fontWeight !== undefined) active.add('weight');
    if (config && config.fontColor && config.fontColor !== 'default') active.add('color');
    return active;
}

function getActiveAxesFromVariableAxes(variableAxes) {
    return new Set(Object.keys(variableAxes));
}

function getActiveControlsFromUI(position) {
    const activeControls = new Set();
    const sizeGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="font-size"]`);
    const lineHeightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="line-height"]`);
    const weightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="weight"]`);
    const colorGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="color"]`);

    if (sizeGroup && !sizeGroup.classList.contains('unset')) activeControls.add('font-size');
    if (lineHeightGroup && !lineHeightGroup.classList.contains('unset')) activeControls.add('line-height');
    if (weightGroup && !weightGroup.classList.contains('unset')) activeControls.add('weight');
    if (colorGroup && !colorGroup.classList.contains('unset')) activeControls.add('color');

    return activeControls;
}

function getCurrentFontName(position) {
    const fontSelect = document.getElementById(`${position}-font-select`);
    const heading = document.getElementById(`${position}-font-name`);
    const rawFontName = (heading && heading.textContent) ? heading.textContent : (fontSelect ? fontSelect.value : '');

    // For Third Man In mode, check for default states
    if (rawFontName) {
        const normalizedName = String(rawFontName).toLowerCase();
        const isDefaultState = normalizedName === 'default' ||
                              normalizedName === 'serif' ||
                              normalizedName === 'sans' ||
                              normalizedName === 'mono';

        if (!isDefaultState) {
            return rawFontName;
        }
    }

    return '';
}

function getActiveAxesFromUI(position) {
    const activeAxes = new Set();
    const fontDef = getEffectiveFontDefinition(getCurrentFontName(position));
    if (fontDef && fontDef.axes) {
        fontDef.axes.forEach(axis => {
            const controlGroup = document.querySelector(`#${position}-font-controls .control-group[data-axis="${axis}"]`);
            if (controlGroup && !controlGroup.classList.contains('unset')) {
                activeAxes.add(axis);
            }
        });
    }
    return activeAxes;
}


// Get current font configuration
function getCurrentUIConfig(position) {
    // Safety check - ensure elements exist
    const fontDisplay = document.getElementById(`${position}-font-display`);
    const fontSizeControl = document.getElementById(`${position}-font-size`);
    const lineHeightControl = document.getElementById(`${position}-line-height`);
    const fontWeightControl = document.getElementById(`${position}-font-weight`);
    const fontColorControl = document.getElementById(`${position}-font-color`);

    if (!fontDisplay || !fontSizeControl || !lineHeightControl || !fontWeightControl) {
        return null;
    }

    // Font color is optional for Third Man In mode positions
    const hasColorControl = !!fontColorControl;

    // Font display element is the source of truth for user selections
    const displayText = fontDisplay.textContent || '';
    const rawFontName = (displayText === 'Default' || displayText === 'Serif' || displayText === 'Sans' || displayText === 'Mono') ? '' : displayText;

    console.log(`getCurrentUIConfig(${position}): displayText="${displayText}", rawFontName="${rawFontName}"`);

    // Use raw font name as-is, only filter out empty values
    let fontName = null;
    if (rawFontName && rawFontName.trim()) {
        fontName = rawFontName.trim();
    }

    console.log(`getCurrentUIConfig(${position}): Final fontName="${fontName}"`);

    // If no specific font is selected, we can still have control settings applied to default font
    // Only return undefined if there are absolutely no active controls
    if (!fontName) {
        console.log(`getCurrentUIConfig(${position}): No specific font selected, checking for active controls`);

        // Check if any controls are active even without a specific font
        const sizeGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="font-size"]`);
        const lineHeightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="line-height"]`);
        const weightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="weight"]`);
        const colorGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="color"]`);

        const hasActiveControls = (sizeGroup && !sizeGroup.classList.contains('unset')) ||
                                 (lineHeightGroup && !lineHeightGroup.classList.contains('unset')) ||
                                 (weightGroup && !weightGroup.classList.contains('unset')) ||
                                 (colorGroup && !colorGroup.classList.contains('unset'));

        if (!hasActiveControls) {
            console.log(`getCurrentUIConfig(${position}): No font and no active controls, returning undefined`);
            return undefined;
        }

        // Allow fontName to remain null - we'll apply controls without changing font family
        fontName = null;

        console.log(`getCurrentUIConfig(${position}): Using default font "${fontName}" with active controls`);
    }

    const fontSize = fontSizeControl.value;
    const lineHeight = lineHeightControl.value;
    const fontWeight = fontWeightControl.value;
    const fontColor = hasColorControl ? fontColorControl.value : null;

    console.log(`getCurrentUIConfig(${position}): lineHeight control value:`, lineHeight, 'control element:', lineHeightControl);
    const lineHeightTextInput = document.getElementById(`${position}-line-height-text`);
    console.log(`getCurrentUIConfig(${position}): lineHeight text input:`, lineHeightTextInput ? lineHeightTextInput.value : 'not found', 'element:', lineHeightTextInput);

    // Debug: Check DOM attributes vs JavaScript values
    console.log(`getCurrentUIConfig(${position}): lineHeight range slider DOM value attribute:`, lineHeightControl.getAttribute('value'));
    console.log(`getCurrentUIConfig(${position}): lineHeight range slider JavaScript value:`, lineHeightControl.value);
    if (lineHeightTextInput) {
        console.log(`getCurrentUIConfig(${position}): lineHeight text input DOM value attribute:`, lineHeightTextInput.getAttribute('value'));
        console.log(`getCurrentUIConfig(${position}): lineHeight text input JavaScript value:`, lineHeightTextInput.value);
    }

    // Debug: Test floating point precision issues
    const rawLineHeight = lineHeightControl.value;
    const parseFloatResult = parseFloat(rawLineHeight);
    const numberResult = Number(rawLineHeight);
    console.log(`getCurrentUIConfig(${position}): Floating point test - raw:`, rawLineHeight, 'parseFloat:', parseFloatResult, 'Number:', numberResult, 'equal:', parseFloatResult === numberResult);

    // Get control groups to determine what's currently active (not unset)
    const sizeGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="font-size"]`);
    const lineHeightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="line-height"]`);
    const weightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="weight"]`);
    const colorGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="color"]`);

    // Determine which controls are currently active (user has explicitly interacted with them)
    const activeFontSize = sizeGroup && !sizeGroup.classList.contains('unset');
    const activeLineHeight = lineHeightGroup && !lineHeightGroup.classList.contains('unset');
    const activeWeight = weightGroup && !weightGroup.classList.contains('unset');
    const activeColor = colorGroup && !colorGroup.classList.contains('unset');

    // Debug active controls
    console.log(`getCurrentUIConfig(${position}): Active controls - fontSize:`, activeFontSize, 'lineHeight:', activeLineHeight, 'weight:', activeWeight);
    if (lineHeightGroup) {
        console.log(`getCurrentUIConfig(${position}): lineHeightGroup classes:`, lineHeightGroup.className, 'has unset:', lineHeightGroup.classList.contains('unset'));
    }


    // Return UI config with only currently active controls (flattened structure)
    // Note: variableAxes always present as empty object (even if no axes) to simplify access patterns
    const config = {
        fontName: fontName,
        variableAxes: {}
    };

    // Include fontFaceRule for custom fonts
    if (fontName) {
        const fontDef = getEffectiveFontDefinition(fontName);
        if (fontDef && fontDef.fontFaceRule) {
            config.fontFaceRule = fontDef.fontFaceRule;
        }
    }

    // Only include active basic controls directly on config (no null values)
    if (activeFontSize) config.fontSize = parseFloat(fontSize);
    if (activeLineHeight) config.lineHeight = parseFloat(lineHeight);
    if (activeWeight) config.fontWeight = parseInt(fontWeight);
    if (activeColor && fontColor !== 'default') config.fontColor = fontColor;

    // Get variable axis values (only for active/modified axes)
    const activeAxes = getActiveAxes(position);

    const fontDef = getEffectiveFontDefinition(fontName);
    if (fontDef && fontDef.axes.length > 0) {
        fontDef.axes.forEach(axis => {
            const control = document.getElementById(`${position}-${axis}`);
            if (control && activeAxes.has(axis)) {
                config.variableAxes[axis] = parseFloat(control.value);
            }
        });
    }

    return config;
}

// normalizeConfig() is now in config-utils.js

// Helper function to wait for controls to exist
async function waitForControls(position, maxWaitMs = 2000, config = null) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const controls = [
            document.getElementById(`${position}-font-size`),
            document.getElementById(`${position}-line-height`),
            document.getElementById(`${position}-font-weight`)
        ];

        // Also wait for variable axis controls if specified in config
        if (config && config.variableAxes) {
            for (const axis of Object.keys(config.variableAxes)) {
                const axisControl = document.getElementById(`${position}-${axis}`);
                controls.push(axisControl);
            }
        }

        // Check if all required controls exist
        if (controls.every(control => control !== null)) {
            return;
        }

        // Wait 10ms before checking again
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    throw new Error(`Controls for ${position} did not appear within ${maxWaitMs}ms`);
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
        // Update font display element to show the actual font name
        const disp = document.getElementById(`${position}-font-display`);
        const group = disp && disp.closest('.control-group');
        if (disp) {
            disp.textContent = config.fontName;
            disp.classList.remove('placeholder');
        }
        if (group) group.classList.remove('unset');

        // Suppress immediate apply/save during restore; we'll apply after values are set
        // Must await so generateFontControls replaces any stale axis controls
        // before waitForControls checks for them (avoids setting values on old elements)
        await loadFont(position, config.fontName, { suppressImmediateApply: true, suppressImmediateSave: true });
    }

    // Wait for font controls to be generated, then apply settings
    await waitForControls(position, 2000, config);

    try {
        // Set basic controls
        console.log(`applyFontConfig(${position}): Setting lineHeight to:`, config.lineHeight || 1.5);
        const fontSizeControl = document.getElementById(`${position}-font-size`);
        const lineHeightControl = document.getElementById(`${position}-line-height`);
        const fontWeightControl = document.getElementById(`${position}-font-weight`);
        const fontColorControl = document.getElementById(`${position}-font-color`);

        if (fontSizeControl) fontSizeControl.value = config.fontSize || 17;
        if (lineHeightControl) {
            const lineHeightValue = config.lineHeight || 1.5;
            lineHeightControl.value = lineHeightValue;
            // Force sync by setting attribute as well
            lineHeightControl.setAttribute('value', lineHeightValue);
        }
        if (fontWeightControl) fontWeightControl.value = config.fontWeight || 400;
        if (fontColorControl) {
            // Set to saved color if present, otherwise set to 'default' to clear any stale values
            fontColorControl.value = config.fontColor || 'default';
        }

        // Set text input values
        const fontSizeTextInput = document.getElementById(`${position}-font-size-text`);
        const lineHeightTextInput = document.getElementById(`${position}-line-height-text`);
        if (fontSizeTextInput) fontSizeTextInput.value = config.fontSize || 17;
        if (lineHeightTextInput) {
            const lineHeightValue = config.lineHeight || 1.5;
            console.log(`applyFontConfig(${position}): Setting lineHeight text input to:`, lineHeightValue);
            lineHeightTextInput.value = lineHeightValue;
            // Force sync by setting attribute as well
            lineHeightTextInput.setAttribute('value', lineHeightValue);
        }

        // Debug: Verify values are set correctly after assignment
        console.log(`applyFontConfig(${position}): After setting - range slider value:`, lineHeightControl ? lineHeightControl.value : 'not found');
        if (lineHeightTextInput) {
            console.log(`applyFontConfig(${position}): After setting - text input value:`, lineHeightTextInput.value);
        }

        // Update display values (font size span may be absent if using only text input)
        const fsVal = document.getElementById(`${position}-font-size-value`);
        if (fsVal) fsVal.textContent = (config.fontSize || 17) + 'px';
        const lhVal = document.getElementById(`${position}-line-height-value`);
        if (lhVal) lhVal.textContent = config.lineHeight || 1.5;
        const fwVal = document.getElementById(`${position}-font-weight-value`);
        if (fwVal) fwVal.textContent = config.fontWeight || 400;

        // Restore active controls state from flattened config
        const activeControlsFromConfig = getActiveControlsFromConfig(config);
        console.log(`applyFontConfig: Restoring active controls for ${position}:`, Array.from(activeControlsFromConfig));

        // Update UI state based on active controls
        activeControlsFromConfig.forEach(control => {

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

        // Also ensure all non-active controls are marked as unset
        ['font-size', 'line-height', 'weight', 'color'].forEach(control => {
            if (!activeControlsFromConfig.has(control)) {
                const controlGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="${control}"]`);
                if (controlGroup) {
                    controlGroup.classList.add('unset');
                }
            }
        });

        // Apply variable axis values and states
        if (config.variableAxes) {
            Object.entries(config.variableAxes).forEach(([axis, value]) => {
                const control = document.getElementById(`${position}-${axis}`);
                const textInput = document.getElementById(`${position}-${axis}-text`);
                const controlGroup = document.querySelector(`#${position}-font-controls .control-group[data-axis="${axis}"]`);

                if (control) {
                    control.value = value;
                    if (textInput) textInput.value = value;

                    // Since the axis is in variableAxes, it's active - remove unset
                    if (controlGroup) {
                        controlGroup.classList.remove('unset');
                    }
                }
            });
        }


        // Apply the font preview
        applyFont(position);

        // Update button states after configuration has been applied to UI controls and preview
        if (position === 'body') {
            await updateBodyButtons();
        } else if (['serif', 'sans', 'mono'].includes(position)) {
            await updateAllThirdManInButtons(position);
        }

        console.log(`applyFontConfig(${position}): Successfully completed`);
    } catch (error) {
        console.error(`applyFontConfig(${position}): Error applying config:`, error);
        throw error;
    }
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
function showCustomConfirm(message) {
    return new Promise((resolve) => {
        const confirmModal = document.getElementById('custom-confirm');
        const confirmMessage = document.getElementById('custom-confirm-message');
        const cancelBtn = document.getElementById('custom-confirm-cancel');
        const okBtn = document.getElementById('custom-confirm-ok');

        confirmMessage.textContent = message;
        confirmModal.classList.add('visible');

        const cleanup = () => {
            confirmModal.classList.remove('visible');
            cancelBtn.removeEventListener('click', handleCancel);
            okBtn.removeEventListener('click', handleOk);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const handleOk = () => {
            cleanup();
            resolve(true);
        };

        cancelBtn.addEventListener('click', handleCancel);
        okBtn.addEventListener('click', handleOk);
    });
}

function hideCustomConfirm() {
    const confirmModal = document.getElementById('custom-confirm');
    confirmModal.classList.remove('visible');
    confirmModal._callback = null;
}

// Tooltip functions
let currentTooltip = null;

function showTooltip(_e) {
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


// getFamiliesFromMetadata, initializeGoogleFontsSelects, resolveFamilyCase,
// setupFontPicker are now in font-picker.js


// Font loading and management functions
async function loadFont(position, fontName, options = {}) {
    const { suppressImmediateApply = false, suppressImmediateSave = false } = options || {};

    try {
        await ensureCustomFontsLoaded();
        // Save current font settings before switching
        const fontNameElement = document.getElementById(`${position}-font-name`) || document.getElementById(`${position}-font-display`);
        const currentFontName = fontNameElement ? fontNameElement.textContent : null;
        if (currentFontName && currentFontName !== fontName) {
            saveFontSettings(position, currentFontName);
        }

        // Active axes will be cleared when font controls are reset to unset state

        // Load font CSS (Google Fonts only - custom fonts handled via fontFaceRule)
        // Skip font loading for Default (no actual font to load)
        if (fontName !== 'Default' && !CUSTOM_FONTS.includes(fontName)) {
            // Also kick off dynamic axis discovery in background for Google families
            loadGoogleFont(fontName);
            try {
                await getOrCreateFontDefinition(fontName);
                // Regenerate controls if the dynamic def was just created
                generateFontControls(position, fontName);
                restoreFontSettings(position, fontName);
                if (!suppressImmediateApply) {
                    applyFont(position);
                }
            } catch (err) {
                console.warn('Dynamic axis discovery failed', err);
            }
        } else {
            // Custom fonts are already loaded via CSS @font-face declarations
            // AP fonts need lazy injection (base64-embedded, separate file)
            if (AP_FONT_FAMILIES.includes(fontName)) injectApFonts();
            // Generate controls for this font (if not already done)
            generateFontControls(position, fontName);
            restoreFontSettings(position, fontName);
            if (!suppressImmediateApply) {
                applyFont(position);
            }
        }

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

        // Basic controls are set up via DOMContentLoaded event listeners

        // Save current state unless explicitly suppressed (restores will save after values are applied)
        if (!suppressImmediateSave) {
            // Replace setTimeout with immediate save - saving state should be synchronous
            saveExtensionState();
        }

        // Update Apply/Applied/Update buttons to reflect new UI vs saved state (Face-off mode only)
        if (currentViewMode === 'faceoff') {
            try {
                refreshApplyButtonsDirtyState();
            } catch (_) {}
        }

    } catch (error) {
        console.error(`Error loading font ${fontName} for ${position}:`, error);
        throw error;
    }
}

// Helper to ensure preconnect links for faster font loading
function ensurePreconnect(origin, crossorigin = false) {
    const selector = `link[rel="preconnect"][href="${origin}"]`;
    if (document.head.querySelector(selector)) return;

    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    if (crossorigin) link.crossOrigin = '';
    document.head.appendChild(link);
}

// Add preconnect links for Google Fonts (call once during initialization)
function initializeFontPreconnects() {
    ensurePreconnect('https://fonts.googleapis.com');
    ensurePreconnect('https://fonts.gstatic.com', true);
}

function loadGoogleFont(fontName) {
    // Skip loading for default/empty fonts
    if (!fontName || String(fontName).trim() === '' || String(fontName).toLowerCase() === 'default') {
        return Promise.resolve();
    }

    // Check if font is already loaded
    const existingLink = document.querySelector(`link[data-font="${fontName}"]`);
    if (existingLink) return Promise.resolve();

    // Prefer axis-tag form to guarantee variable family + axes are served
    return buildCss2Url(fontName).then(fontUrl => {
        // Skip if no URL was generated (should already be handled by buildCss2Url, but double-check)
        if (!fontUrl) return;

        // Check for duplicate stylesheets by URL
        const existingByUrl = document.head.querySelector(`link[rel="stylesheet"][href="${fontUrl}"]`);
        if (existingByUrl) return;

        try {
            console.log(`[Fonts] Loading css2 for ${fontName}: ${fontUrl}`);
        } catch (_) {}

        // Use print-then-all pattern to prevent render blocking
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = fontUrl;
        link.media = 'print'; // Load in background
        link.crossOrigin = 'anonymous';
        link.setAttribute('data-font', fontName);
        link.onload = () => {
            link.media = 'all'; // Switch to active
            try { console.log(`[Fonts] css2 loaded for ${fontName}`); } catch (_) {}
        };
        link.onerror = () => { try { console.warn(`[Fonts] css2 failed for ${fontName}: ${fontUrl}`); } catch (_) {} };
        document.head.appendChild(link);
    });
}

// Build a css2 URL that includes axis tags when available (e.g., :ital,wdth,wght)
// fontConfig parameter is optional but unused - kept for backward compatibility
function buildCss2Url(fontName, _fontConfig) {
    // Skip URL generation for default/empty font names
    if (!fontName || String(fontName).trim() === '' || String(fontName).toLowerCase() === 'default') {
        return Promise.resolve('');
    }

    // Skip URL generation for custom fonts (they have their own @font-face rules)
    if (fontDefinitions[fontName] && fontDefinitions[fontName].fontFaceRule) {
        return Promise.resolve('');
    }

    const familyParam = familyToQuery(fontName);
    // Prefer curated axis-tag ranges from local data file (no probe)
    return ensureCss2AxisRanges().then(() => {
        const entry = css2AxisRanges && css2AxisRanges[fontName];
        if (entry && entry.tags && entry.tags.length) {
            // Include ALL axes present in data (ital + custom), but drop any tag lacking a numeric range
            const tagsRaw = entry.tags.slice();
            const filtered = tagsRaw.filter(tag => {
                if (tag === 'ital') return true; // Always include ital for italicized text on page
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
    }).catch(() => {
        // Fallback on error
        const url = `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap`;
        try { console.log(`[Fonts] Using plain css2 for ${fontName}: ${url}`); } catch (_) {}
        return url;
    });
}

function ensureCss2AxisRanges() {
    if (css2AxisRanges) return Promise.resolve(css2AxisRanges);
    // Build mapping from Google Fonts metadata (no local file dependency)
    return ensureGfMetadata().then(() => {
        css2AxisRanges = buildCss2AxisRangesFromMetadata(gfMetadata);
        return css2AxisRanges;
    }).catch(e => {
        console.warn('Failed to build css2 axis ranges from GF metadata', e);
        css2AxisRanges = {};
        return css2AxisRanges;
    });
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

    if (position === 'body' || ['serif', 'sans', 'mono'].includes(position)) {
        // Body and Third Man In panels have container structure: clear the container, not the whole section
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
        if (position === 'body' || ['serif', 'sans', 'mono'].includes(position)) {
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
        textInput.type = 'text';
        textInput.id = `${position}-${axis}-text`;
        textInput.className = 'axis-text-input numeric-trigger';
        textInput.setAttribute('readonly', 'true');
        textInput.setAttribute('data-type', 'variableAxis');
        textInput.setAttribute('data-position', position);
        textInput.setAttribute('data-axis', axis);
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
        if (position === 'body' || ['serif', 'sans', 'mono'].includes(position)) {
            const axesContainer = document.getElementById(`${position}-axes-container`);
            if (axesContainer) {
                axesContainer.appendChild(controlGroup);
            }
        } else {
            axesSection.appendChild(controlGroup);
        }

        // Add event listeners for both slider and text input
        function activateAxis() {
            console.log(`activateAxis called for ${position}-${axis}`, controlGroup);
            // Remove 'unset' class to mark axis as active
            controlGroup.classList.remove('unset');

            // Always update button states when axis is activated (even if already active)
            if (position === 'body') {
                updateBodyButtons();
                saveExtensionState();
            } else if (['serif', 'sans', 'mono'].includes(position)) {
                updateAllThirdManInButtons(position);
            }
        }

        function updateValues(newValue) {
            input.value = newValue;
            textInput.value = newValue;
            applyFont(position);

            // Update button states after changing axis value
            if (position === 'body') {
                updateBodyButtons();
                saveExtensionState();
            } else if (['serif', 'sans', 'mono'].includes(position)) {
                updateAllThirdManInButtons(position);
            }
        }

        input.addEventListener('input', function() {
            activateAxis();
            updateValues(this.value);
        });

        textInput.addEventListener('keydown', function(e) {
            console.log(`keydown event on ${position}-${axis}-text, key:`, e.key);
            if (e.key === 'Enter') {
                console.log(`Enter pressed on ${position}-${axis}-text, calling activateAxis`);
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

// formatAxisValue, generateBodyCSS are now in css-generators.js

// REGISTERED_AXES, getEffectiveWeight, getEffectiveWidth, getEffectiveSlant,
// getEffectiveItalic, buildCustomAxisSettings are now in config-utils.js

// Domain detection for inline apply domains
let inlineApplyDomains = ['x.com']; // Will be loaded from storage

// Load inline apply domains from storage
try {
    browser.storage.local.get('affoInlineApplyDomains').then(function(data) {
        if (Array.isArray(data.affoInlineApplyDomains)) {
            inlineApplyDomains = data.affoInlineApplyDomains;
            console.log('[AFFO Popup] Loaded inline apply domains:', inlineApplyDomains);
        }
    }).catch(function() {});
} catch (e) {}

function shouldUseInlineApply(origin) {
    return inlineApplyDomains.includes(origin);
}

// Separate apply/unapply functions for body mode and face-off mode
async function applyFontToPage(position, config) {
    console.log(`🟢 applyFontToPage: Applying ${position} with config:`, config);
    const genericKey = (position === 'top') ? 'serif' :
                      (position === 'body') ? 'body' : 'sans';

    try {
        const origin = await getActiveOrigin();
        if (!origin || !config) {
            console.log('applyFontToPage: Missing origin or config, returning false');
            return false;
        }

        // Allow configurations with font properties even without fontName
        if (!config.fontName) {
            const hasOtherProperties = config.fontSize || config.fontWeight || config.lineHeight || config.fontColor;
            if (!hasOtherProperties) {
                console.log('applyFontToPage: No valid config found (needs fontName or other properties)');
                return false;
            }
            console.log(`applyFontToPage: Allowing ${position} with properties but no fontName:`, config);
        }

        // Build enriched payload with fontFaceRule and css2Url
        const payload = await buildPayload(position, config);

        // Save enriched payload to storage (includes fontFaceRule for custom fonts and css2Url for Google Fonts)
        await saveApplyMapForOrigin(origin, genericKey, payload);

        // Check if this is an inline apply domain
        if (shouldUseInlineApply(origin)) {
            console.log(`applyFontToPage: Using inline apply for ${origin} - content script will handle font loading and styling`);
            // For inline apply domains, storage update is enough - content script handles everything
            return true;
        } else {
            // Apply CSS using consolidated insertCSS approach for standard domains
            let css;
            if (position === 'body') {
                // Use Body Contact CSS generation
                css = generateBodyContactCSS(payload);
            } else {
                // Use existing generateBodyCSS for face-off mode
                css = generateBodyCSS(payload);
            }

            if (css) {
                try {
                    await insertCSSInTargetTab({
                        code: css,
                        cssOrigin: 'user'
                    });
                    appliedCssActive[genericKey] = css;
                    console.log(`applyFontToPage: Successfully applied ${position} font using insertCSS`);
                    return true;
                } catch (error) {
                    console.error(`applyFontToPage: CSS injection failed:`, error);
                    return false;
                }
            }
            return false;
        }
    } catch (e) {
        console.warn('applyFontToPage failed', e);
        return false;
    }
}

async function unapplyFontFromPage(position) {
    console.log(`🔴 unapplyFontFromPage: Unapplying ${position}`);
    const genericKey = (position === 'top') ? 'serif' :
                      (position === 'body') ? 'body' : 'sans';

    try {
        const origin = await getActiveOrigin();
        if (!origin) return false;

        // Remove CSS
        if (appliedCssActive[genericKey]) {
            try {
                await browser.tabs.removeCSS({ code: appliedCssActive[genericKey] });
            } catch (error) {
                console.warn('Error removing CSS:', error);
            }
            appliedCssActive[genericKey] = null;
        }

        // Remove from storage
        await clearApplyMapForOrigin(origin, genericKey);

        // Remove injected style elements
        const styleIdOff = 'a-font-face-off-style-' + genericKey;
        try {
            await executeScriptInTargetTab({ code: `
                (function(){
                    try{ var s=document.getElementById('${styleIdOff}'); if(s) s.remove(); }catch(_){}
                    try{ var l=document.getElementById('${styleIdOff}-link'); if(l) l.remove(); }catch(_){}
                })();
            `});
        } catch (error) {
            console.warn('Error removing style elements:', error);
        }

        console.log(`unapplyFontFromPage: Successfully unapplied ${position} font`);
        return true;
    } catch (e) {
        console.warn('unapplyFontFromPage failed', e);
        return false;
    }
}

// Separate apply/unapply functions for Third Man In mode
async function applyThirdManInFont(fontType, config) {
    console.log(`🟢 applyThirdManInFont: Applying ${fontType} with config:`, config);
    return getActiveOrigin().then(async origin => {
        if (!origin || !config) {
            console.log('applyThirdManInFont: Missing origin or config, returning false');
            return false;
        }

        // Allow configurations with font properties even without fontName
        if (!config.fontName) {
            const hasOtherProperties = config.fontSize || config.fontWeight || config.lineHeight || config.fontColor;
            if (!hasOtherProperties) {
                console.log('applyThirdManInFont: No valid config found (needs fontName or other properties)');
                return false;
            }
            console.log(`applyThirdManInFont: Allowing ${fontType} with properties but no fontName:`, config);
        }

        // Build enriched payload with fontFaceRule and css2Url
        const payload = await buildPayload(fontType, config);

        // For inline apply domains (x.com), content script handles font loading
        // No preloading needed - content script already downloads via background script with progressive loading

        // Save enriched payload to storage (includes fontFaceRule for custom fonts and css2Url for Google Fonts)
        return saveApplyMapForOrigin(origin, fontType, payload).then(() => {
            // For inline apply domains, return early - content script handles font loading
            if (shouldUseInlineApply(origin)) {
                console.log(`applyThirdManInFont: Storage written - content script will load fonts progressively`);
                return true;
            }

            // First, inject Google Fonts CSS link if needed (only for non-inline domains)
            const fontName = payload.fontName;
            const css2Url = payload.css2Url;

            let fontLinkPromise = Promise.resolve();
            if (css2Url) {
                const linkId = `a-font-face-off-style-${fontType}-link`;
                const linkScript = `
                    (function() {
                        var linkId = '${linkId}';
                        var existingLink = document.getElementById(linkId);
                        if (!existingLink) {
                            var link = document.createElement('link');
                            link.id = linkId;
                            link.rel = 'stylesheet';
                            link.href = '${css2Url}';
                            document.head.appendChild(link);
                            console.log('Third Man In: Added Google Fonts link for ${fontName}:', '${css2Url}');
                        }
                    })();
                `;
                fontLinkPromise = executeScriptInTargetTab({ code: linkScript }).catch(error => {
                    console.warn(`applyThirdManInFont: Font link injection failed:`, error);
                });
            }

            return fontLinkPromise.then(() => {
                // Run element walker script to mark elements with data-affo-font-type
                const walkerScript = generateElementWalkerScript(fontType);
                console.log(`applyThirdManInFont: Running element walker script for ${fontType}`);

                return executeScriptInTargetTab({ code: walkerScript }).then(() => {
                    // Apply CSS using the already-built payload
                    if (payload) {
                        const css = generateThirdManInCSS(fontType, payload);
                        if (css) {
                            console.log(`applyThirdManInFont: Generated CSS for ${fontType}:`, css);
                            return insertCSSInTargetTab({
                                code: css,
                                cssOrigin: 'user'
                            }).then(() => {
                                appliedCssActive[fontType] = css;
                                console.log(`applyThirdManInFont: Successfully applied ${fontType} font`);
                                return true;
                            }).catch(error => {
                                console.error(`applyThirdManInFont: CSS injection failed:`, error);
                                return false;
                            });
                        }
                    }
                    return false;
                }).catch(error => {
                    console.error(`applyThirdManInFont: Element walker script failed:`, error);
                    return false;
                });
            });
        });
    }).catch(e => {
        console.warn('applyThirdManInFont failed', e);
        return false;
    });
}

function unapplyThirdManInFont(fontType) {
    console.log(`🔴 unapplyThirdManInFont: Unapplying ${fontType}`);
    console.trace('🔴 unapplyThirdManInFont: Stack trace to identify caller');

    return getActiveOrigin().then(origin => {
        if (!origin) return false;

        // Remove CSS
        let cssPromise = Promise.resolve();
        if (appliedCssActive[fontType]) {
            cssPromise = browser.tabs.removeCSS({ code: appliedCssActive[fontType] }).catch(() => {});
            appliedCssActive[fontType] = null;
        }

        // Clear from storage - only this specific font type
        return cssPromise.then(() => {
            return clearApplyMapForOrigin(origin, fontType);
        }).then(() => {
            // Remove injected style elements and clean up data attributes
            const styleId = `a-font-face-off-${fontType}-style`;
            const linkId = `${styleId}-link`;
            return executeScriptInTargetTab({ code: `
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
            `}).catch(() => {});
        }).then(() => {
            console.log(`unapplyThirdManInFont: Successfully unapplied ${fontType} font`);
            return true;
        });
    }).catch(e => {
        console.warn('unapplyThirdManInFont failed', e);
        return false;
    });
}

// Unified payload builder — enriches a canonical config with transport properties
// (css2Url, styleId) for domain storage and content script consumption.
async function buildPayload(position, providedConfig = null) {
    const cfg = providedConfig || getCurrentUIConfig(position);
    if (!cfg) return null;

    const payload = { fontName: cfg.fontName };

    // Copy canonical config properties (No Key — only those with values)
    if (cfg.variableAxes && Object.keys(cfg.variableAxes).length > 0) {
        payload.variableAxes = cfg.variableAxes;
    }
    if (cfg.fontSize != null) payload.fontSize = Number(cfg.fontSize);
    if (cfg.lineHeight != null) payload.lineHeight = Number(cfg.lineHeight);
    if (cfg.fontWeight != null) payload.fontWeight = Number(cfg.fontWeight);
    if (cfg.fontColor) payload.fontColor = cfg.fontColor;
    if (cfg.fontFaceRule) payload.fontFaceRule = cfg.fontFaceRule;

    // Add styleId for TMI positions
    if (['serif', 'sans', 'mono'].includes(position)) {
        payload.styleId = `a-font-face-off-style-${position}`;
    }

    // Add fontFaceRule from static definitions if not already on config (custom fonts)
    if (!payload.fontFaceRule && cfg.fontName) {
        const fontDef = fontDefinitions[cfg.fontName];
        if (fontDef && fontDef.fontFaceRule) {
            payload.fontFaceRule = fontDef.fontFaceRule;
        }
    }

    // Compute css2Url for Google Fonts
    if (cfg.css2Url) {
        payload.css2Url = cfg.css2Url;
    } else if (cfg.fontName && !payload.fontFaceRule) {
        const css2Url = await buildCss2Url(cfg.fontName, cfg);
        if (css2Url) payload.css2Url = css2Url;
    }

    return payload;
}

// Pre-highlight Apply buttons based on saved per-origin settings
function syncApplyButtonsForOrigin() {
    const applyTopBtn = document.getElementById('apply-top');
    const applyBottomBtn = document.getElementById('apply-bottom');
    if (!applyTopBtn && !applyBottomBtn) return Promise.resolve();

    return getActiveOrigin().then(origin => {
        if (!origin) return;

        return getApplyMapForOrigin(origin).then(domainData => {
            const entry = domainData || {};

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
        });
    }).catch(() => {});
}

// Sync Third Man In apply buttons with saved state
function syncThirdManInButtons() {
    return getActiveOrigin().then(origin => {
        if (!origin) return;

        return getApplyMapForOrigin(origin).then(domainData => {
            const fontTypes = ['serif', 'sans', 'mono'];

            fontTypes.forEach(fontType => {
                const applyBtn = document.getElementById(`apply-${fontType}`);
                const resetBtn = document.getElementById(`reset-${fontType}`);

                if (applyBtn) {
                    const on = !!(domainData && domainData[fontType]);
                    applyBtn.classList.toggle('active', on);
                    applyBtn.textContent = on ? '✓' : 'Apply';
                    applyBtn.style.display = on ? 'inline-flex' : 'none';

                    if (resetBtn) {
                        resetBtn.style.display = on ? 'inline-flex' : 'none';
                    }
                }
            });
        });
    }).catch(() => {});
}

function saveFontSettings(position, fontName) {
    const memory = getFontMemory(position);
    if (!memory) return;

    const config = getCurrentUIConfig(position);
    if (!config) {
        delete memory[fontName];
        return;
    }

    // Store canonical config (already respects unset state, uses numeric types)
    // Strip fontName and fontFaceRule — keyed externally by fontName
    const { fontName: _fn, fontFaceRule: _ffr, ...settings } = config;
    memory[fontName] = settings;
}

function restoreFontSettings(position, fontName) {
    const memory = getFontMemory(position);
    if (!memory) return;
    const saved = memory[fontName];
    if (!saved) return;

    // Restore basic controls — only set and activate controls present in saved config
    const basicControls = [
        { key: 'fontSize', controlId: `${position}-font-size`, textId: `${position}-font-size-text`, dataControl: 'font-size' },
        { key: 'lineHeight', controlId: `${position}-line-height`, textId: `${position}-line-height-text`, dataControl: 'line-height' },
        { key: 'fontWeight', controlId: `${position}-font-weight`, textId: null, dataControl: 'weight' },
    ];

    basicControls.forEach(({ key, controlId, textId, dataControl }) => {
        if (saved[key] === undefined) return;
        const control = document.getElementById(controlId);
        if (control) control.value = saved[key];
        if (textId) {
            const textControl = document.getElementById(textId);
            if (textControl) textControl.value = saved[key];
        }
        const group = document.querySelector(`#${position}-font-controls .control-group[data-control="${dataControl}"]`);
        if (group) group.classList.remove('unset');
    });

    // Restore color (select element, defaults to 'default' when absent)
    const colorControl = document.getElementById(`${position}-font-color`);
    if (colorControl) {
        colorControl.value = saved.fontColor || 'default';
    }
    if (saved.fontColor) {
        const colorGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="color"]`);
        if (colorGroup) colorGroup.classList.remove('unset');
    }

    // Restore variable axes — only axes present in saved config
    if (saved.variableAxes) {
        Object.entries(saved.variableAxes).forEach(([axis, value]) => {
            const control = document.getElementById(`${position}-${axis}`);
            const textControl = document.getElementById(`${position}-${axis}-text`);
            const controlGroup = document.querySelector(`#${position}-font-controls .control-group[data-axis="${axis}"]`);
            if (control) control.value = value;
            if (textControl) textControl.value = value;
            if (controlGroup) controlGroup.classList.remove('unset');
        });
    }
}

function applyFont(position) {
    const textElement = document.getElementById(`${position}-font-text`);
    const nameElement = document.getElementById(`${position}-font-name`);
    if (!textElement || !nameElement) return;

    const cfg = getCurrentUIConfig(position);
    const GENERIC = { serif: 'serif', sans: 'sans-serif', mono: 'monospace' };
    const genericFamily = GENERIC[position] || 'serif';

    if (!cfg) {
        // No font configured — show default
        const defaults = { serif: 'Serif', sans: 'Sans', mono: 'Mono' };
        nameElement.textContent = defaults[position] || 'Default';
        nameElement.style.fontFamily = '';
        textElement.style.cssText = `font-family: ${genericFamily};`;
        if (!suppressUiStateSave) saveExtensionState();
        return;
    }

    // Heading: show font name, apply font-family for visual preview
    nameElement.textContent = cfg.fontName || 'Default';
    nameElement.style.fontFamily = cfg.fontName ? `"${cfg.fontName}"` : '';

    // Text: build cssText from config
    const fontFamily = cfg.fontName
        ? `"${cfg.fontName}", ${genericFamily}`
        : genericFamily;

    let style = `font-family: ${fontFamily};`;
    if (cfg.fontSize) style += ` font-size: ${cfg.fontSize}px;`;
    if (cfg.lineHeight) style += ` line-height: ${cfg.lineHeight};`;
    if (cfg.fontWeight) style += ` font-weight: ${cfg.fontWeight};`;
    if (cfg.fontColor) style += ` color: ${cfg.fontColor};`;

    if (cfg.variableAxes && Object.keys(cfg.variableAxes).length > 0) {
        const varSettings = Object.entries(cfg.variableAxes)
            .map(([axis, value]) => `"${axis}" ${value}`)
            .join(', ');
        if (varSettings) style += ` font-variation-settings: ${varSettings};`;
    }

    textElement.style.cssText = style;

    if (!suppressUiStateSave) saveExtensionState();
}

// updateBasicControls function removed - event listeners are now set up in DOMContentLoaded


// Favorites functions (hasInCollection, generateFontConfigName, generateConfigPreview,
// showSaveModal, hideSaveModal, getOrderedFavoriteNames, showFavoritesPopup,
// hideFavoritesPopup, showEditFavoritesModal, hideEditFavoritesModal,
// enableFavoritesReorder, getDragAfterElement, persistFavoritesOrder,
// generateFavoritePreview, generateDetailedFavoritePreview) are now in favorites.js

// Font control functionality

// Panel state variables (used across different functions)
let topPanelOpen = false;
let bottomPanelOpen = false;

// Inject custom font @font-face rules into the popup's head.
// AP fonts (large, base64-embedded) are injected lazily via injectApFonts().
async function injectCustomFonts() {
    await ensureCustomFontsLoaded();
    if (!customFontsCssText) return;

    const styleId = 'affo-custom-fonts';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }
    styleElement.textContent = customFontsCssText;
    console.log('Injected custom font @font-face rules for:', CUSTOM_FONTS);
}

// Lazily inject AP font @font-face rules (base64-embedded, ~390KB).
// Called when an AP font is first selected for preview.
// Converts data: URLs to blob: URLs at injection time because Firefox
// extension popups don't load data: URL fonts even with CSP font-src data:.
let apFontsInjected = false;
function injectApFonts() {
    if (apFontsInjected || !apFontsCssText) return;
    apFontsInjected = true;

    // Convert data: URLs to blob: URLs for Firefox CSP compatibility
    const cssWithBlobs = apFontsCssText.replace(
        /url\("data:font\/woff2;base64,([^"]+)"\)/g,
        (_match, b64) => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'font/woff2' });
            return `url("${URL.createObjectURL(blob)}")`;
        }
    );

    const styleElement = document.createElement('style');
    styleElement.id = 'affo-ap-fonts';
    document.head.appendChild(styleElement);
    styleElement.textContent = cssWithBlobs;
    if (AFFO_DEBUG) console.log('Injected AP font @font-face rules (blob URLs)');
}

// Returns mode-appropriate preview/button callbacks for a panel position
function getPositionCallbacks(position) {
    if (position === 'body')
        return { preview: () => applyFont(position), buttons: () => updateBodyButtons(), save: false };
    if (['serif', 'sans', 'mono'].includes(position))
        return { preview: () => applyFont(position), buttons: () => updateAllThirdManInButtons(position), save: false };
    if (['top', 'bottom'].includes(position))
        return { preview: () => applyFont(position), buttons: null, save: false };
    return null;
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOMContentLoaded fired, starting popup initialization');

    // Inject custom fonts first, before any font previews
    await injectCustomFonts();

    // Get current tab hostname and context for site-specific CSS rules
    try {
        // First check if context was passed as URL parameters (from left toolbar)
        const urlContext = getContextFromUrlParams();
        if (urlContext.domain) {
            window.currentTabHostname = urlContext.domain;
            window.sourceTabId = urlContext.sourceTabId;
            console.log('🌐 Using context from URL parameters:', {
                domain: window.currentTabHostname,
                sourceTabId: window.sourceTabId
            });
        } else {
            // Fall back to getting domain from active tab
            window.currentTabHostname = await getActiveOrigin();
            window.sourceTabId = null; // Will use current active tab
            console.log('🌐 Current tab hostname from active tab:', window.currentTabHostname);
        }
    } catch (error) {
        console.warn('Could not get current tab hostname:', error);
        window.currentTabHostname = null;
        window.sourceTabId = null;
    }

    // Hide all settings until domain initialization is complete

    document.body.style.visibility = 'hidden';
    console.log('🔒 Hiding UI until domain initialization completes');

    // Initialize preconnect links for faster font loading
    initializeFontPreconnects();

    // DISABLED: URGENT FIX was interfering with domain restoration
    // The simple sync function handles selector synchronization properly
    /*
    setTimeout(() => {
        console.log('URGENT FIX: Syncing font selectors with headings');
        ['serif', 'sans', 'mono'].forEach(type => {
            const heading = document.getElementById(`${type}-font-name`);
            const display = document.getElementById(`${type}-font-display`);
            const selector = document.getElementById(`${type}-font-select`);

            if (heading || display) {
                const fontName = (heading && heading.textContent)
                    ? heading.textContent
                    : (display && display.textContent !== 'Default') ? display.textContent : null;

                if (fontName && selector && !selector.value) {
                    console.log(`URGENT FIX: ${type} heading="${fontName}" but selector empty, fixing`);
                    selector.value = fontName;
                } else if (fontName && selector) {
                    console.log(`URGENT FIX: ${type} heading="${fontName}" selector="${selector.value}" - ${selector.value ? 'OK' : 'NEEDS FIX'}`);
                }
            }
        });
    }, 500);
    */
    console.log('DEBUG TEST: This should appear if our code is running');
    console.log('Initial currentViewMode:', currentViewMode);
    console.log('Initial body classes:', document.body.className);
    // Get font selectors
    // Font selection now handled by font picker interface, no dropdowns needed

    // Get control panels and UI elements
    const topFontControls = document.getElementById('top-font-controls');
    const bottomFontControls = document.getElementById('bottom-font-controls');
    const panelOverlay = document.getElementById('panel-overlay');
    const topFontGrip = document.getElementById('top-font-grip');
    const bottomFontGrip = document.getElementById('bottom-font-grip');

    // Load saved state first, then continue initialization INSIDE the callback
    console.log('Loading extension state before initialization');
    loadExtensionState().then(() => {
        console.log('Extension state loaded, now determining correct mode');

        return determineInitialMode();
    }).then(() => {
        console.log('Initial mode determined, now initializing mode interface');

        return initializeModeInterface();
    }).then(() => {
        console.log('Mode interface initialized, now restoring from domain storage');

        return restoreUIFromDomainStorage();
    }).then(() => {
        console.log('Domain storage restoration completed');

        // ONLY NOW show UI and allow interactions - everything is ready

        document.body.style.visibility = 'visible';
        console.log('✅ UI is now visible and ready for user interaction');

    }).catch((error) => {
        console.error('Initialization failed:', error);
        // Show UI anyway to prevent blank popup
        document.body.style.visibility = 'visible';

    });


    // Mode switching is now handled by the 3-mode tab system in HTML

    // Apply-to-page buttons (Face-off mode)
    const applyTopBtn = document.getElementById('apply-top');
    const applyBottomBtn = document.getElementById('apply-bottom');
    if (applyTopBtn) {
        applyTopBtn.addEventListener('click', async () => {
            const config = getCurrentUIConfig('top');
            if (!config) return;

            // Allow configurations with font properties even without fontName
            if (!config.fontName) {
                const hasOtherProperties = config.fontSize || config.fontWeight || config.lineHeight || config.fontColor;
                if (!hasOtherProperties) return;
            }

            applyTopBtn.classList.add('loading');
            applyTopBtn.textContent = 'Loading…';
            const active = await applyFontToPage('top', config);
            if (active) {
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
            const config = getCurrentUIConfig('bottom');
            if (!config) return;

            // Allow configurations with font properties even without fontName
            if (!config.fontName) {
                const hasOtherProperties = config.fontSize || config.fontWeight || config.lineHeight || config.fontColor;
                if (!hasOtherProperties) return;
            }

            applyBottomBtn.classList.add('loading');
            applyBottomBtn.textContent = 'Loading…';
            const active = await applyFontToPage('bottom', config);
            if (active) {
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

    // Note: Apply-to-page button (Body mode) event listener is now handled by setupPanelButtons() in setupApplyResetEventListeners()

    // Pre-highlight Apply buttons based on saved state for current origin
    try { syncApplyButtonsForOrigin(); } catch (_) {}
    if (currentViewMode === 'third-man-in') {
        try { syncThirdManInButtons(); } catch (_) {}
    }

    // Track changes to mark buttons as Update when UI differs from saved (Face-off mode only)
    if (currentViewMode === 'faceoff') {
        const debouncedRefresh = debounce(refreshApplyButtonsDirtyState, 200);
        document.addEventListener('input', debouncedRefresh, true);
        document.addEventListener('change', debouncedRefresh, true);
    }

    // Body family reset button
    const bodyFamilyResetBtn = document.getElementById('body-family-reset');
    if (bodyFamilyResetBtn) {
        bodyFamilyResetBtn.addEventListener('click', function() {
            const bodyFontDisplay = document.getElementById('body-font-display');
            const bodyFontSelect = document.getElementById('body-font-select');
            const bodyFontGroup = bodyFontDisplay && bodyFontDisplay.closest('.control-group');
            if (bodyFontDisplay) {
                bodyFontDisplay.textContent = 'Default';
                bodyFontDisplay.classList.add('placeholder');
            }
            if (bodyFontSelect) {
                bodyFontSelect.value = '';
            }
            if (bodyFontGroup) {
                bodyFontGroup.classList.add('unset');
            }
            // Font family active state is now derived from UI state
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
    // Color reset buttons — factory for all positions
    ['body', 'serif', 'sans', 'mono', 'top', 'bottom'].forEach(position => {
        const btn = document.getElementById(`${position}-color-reset`);
        if (!btn) return;
        const callbacks = getPositionCallbacks(position);
        if (!callbacks) return;
        btn.addEventListener('click', function() {
            const colorSelect = document.getElementById(`${position}-font-color`);
            const colorGroup = colorSelect && colorSelect.closest('.control-group');
            if (colorSelect) colorSelect.value = 'default';
            if (colorGroup) colorGroup.classList.add('unset');
            callbacks.preview();
            if (callbacks.buttons) callbacks.buttons();
            if (callbacks.save) saveExtensionState();
        });
    });



    function parseSizeVal(v){
        if (v == null) return null;
        const str = String(v).trim();
        if (!str) return null;
        const m = str.match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*(px)?\s*$/i);
        if (!m) return null;
        return Number(m[1]);
    }
    function clamp(v, min, max){ v = parseSizeVal(v); if (v == null || isNaN(v)) return null; return Math.min(max, Math.max(min, v)); }

    // Generic slider control factory — handles slider input, text keydown/blur, value display
    // options: { format(v), suffix, clampMin, clampMax }
    function setupSliderControl(position, controlId, options = {}) {
        const slider = document.getElementById(`${position}-${controlId}`);
        if (!slider) return;
        const callbacks = getPositionCallbacks(position);
        if (!callbacks) return;
        const group = slider.closest('.control-group');
        const textInput = document.getElementById(`${position}-${controlId}-text`);
        const valueDisplay = document.getElementById(`${position}-${controlId}-value`);
        const formatVal = options.format || (v => v);
        const suffix = options.suffix || '';

        slider.addEventListener('input', function() {
            if (group) group.classList.remove('unset');
            const v = formatVal(this.value);
            if (textInput) textInput.value = v;
            if (valueDisplay) valueDisplay.textContent = v + suffix;
            if (callbacks.buttons) callbacks.buttons();
            callbacks.preview();
            if (callbacks.save) saveExtensionState();
        });

        if (textInput && options.clampMin != null) {
            const applyTextValue = function() {
                const min = Number(slider.min || options.clampMin);
                const max = Number(slider.max || options.clampMax);
                const vv = clamp(this.value, min, max);
                if (vv !== null) {
                    if (group) group.classList.remove('unset');
                    slider.value = String(vv);
                    this.value = String(vv);
                    if (valueDisplay) valueDisplay.textContent = vv + suffix;
                    if (callbacks.buttons) callbacks.buttons();
                    callbacks.preview();
                    if (callbacks.save) saveExtensionState();
                }
            };
            textInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { applyTextValue.call(this); this.blur(); }
            });
            textInput.addEventListener('blur', function() { applyTextValue.call(this); });
        }
    }

    const decimalFormat = v => Number(v).toFixed(2).replace(/\.00$/, '');
    const ALL_POSITIONS = ['top', 'bottom', 'body', 'serif', 'sans', 'mono'];

    // Font-size slider + text input handlers
    ALL_POSITIONS.forEach(pos => setupSliderControl(pos, 'font-size', { format: decimalFormat, suffix: 'px', clampMin: 10, clampMax: 72 }));

    // Line-height slider + text input handlers
    ALL_POSITIONS.forEach(pos => setupSliderControl(pos, 'line-height', { format: decimalFormat, clampMin: 0.8, clampMax: 2.5 }));

    // Font-weight slider handlers (no text input)
    ALL_POSITIONS.forEach(pos => setupSliderControl(pos, 'font-weight'));

    // Font color change handlers
    ALL_POSITIONS.forEach(position => {
        const colorSelect = document.getElementById(`${position}-font-color`);
        if (!colorSelect) return;
        const callbacks = getPositionCallbacks(position);
        if (!callbacks) return;
        const colorGroup = colorSelect.closest('.control-group');
        colorSelect.addEventListener('change', function() {
            if (colorGroup && this.value !== 'default') colorGroup.classList.remove('unset');
            if (callbacks.buttons) callbacks.buttons();
            callbacks.preview();
            if (callbacks.save) saveExtensionState();
        });
    });

    // Font Picker wiring
    setupFontPicker();

    // Initialize font family displays with default values
    const topDisp = document.getElementById('top-font-display');
    const botDisp = document.getElementById('bottom-font-display');
    if (topDisp && !topDisp.textContent) topDisp.textContent = 'ABeeZee';
    if (botDisp && !botDisp.textContent) botDisp.textContent = 'Zilla Slab Highlight';

    // Initialize Third Man In mode font family displays to "Default"
    const serifDisp = document.getElementById('serif-font-display');
    const sansDisp = document.getElementById('sans-font-display');
    const monoDisp = document.getElementById('mono-font-display');

    // Set Third Man In displays to Default only if not already set
    if (serifDisp && !serifDisp.textContent) serifDisp.textContent = 'Default';
    if (sansDisp && !sansDisp.textContent) sansDisp.textContent = 'Default';
    if (monoDisp && !monoDisp.textContent) monoDisp.textContent = 'Default';

    // Then apply styling to all displays that show "Default"
    const defaultDisplays = ['body-font-display', 'serif-font-display', 'sans-font-display', 'mono-font-display'];
    defaultDisplays.forEach(id => {
        const element = document.getElementById(id);
        if (element && element.textContent === 'Default') {
            element.classList.add('default');
        }
    });

    // Family reset handlers removed - no longer needed

    // Add event listeners for footer Reset buttons
    const resetTopBtn = document.getElementById('reset-top');
    if (resetTopBtn) resetTopBtn.addEventListener('click', async function() {
        try {
            resetTopFont();
            await unapplyFontFromPage('top');
            saveExtensionState();
        } catch (_) {}
    });
    const resetBottomBtn = document.getElementById('reset-bottom');
    if (resetBottomBtn) resetBottomBtn.addEventListener('click', async function() {
        try {
            resetBottomFont();
            await unapplyFontFromPage('bottom');
            saveExtensionState();
        } catch (_) {}
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
            else if (panel.id.includes('serif')) position = 'serif';
            else if (panel.id.includes('sans')) position = 'sans';
            else if (panel.id.includes('mono')) position = 'mono';
            else return; // unsupported panel

            const activeControls = getActiveControls(position);
            const controlGroup = e.target.closest('.control-group');

            // Reset to default line height and make unset
            const lineHeightControl = document.getElementById(`${position}-line-height`);
            const lineHeightTextInput = document.getElementById(`${position}-line-height-text`);
            const lineHeightValue = document.getElementById(`${position}-line-height-value`);

            if (lineHeightControl) {
                lineHeightControl.value = 1.5;
                if (lineHeightValue) lineHeightValue.textContent = '1.5';
                if (lineHeightTextInput) {
                    lineHeightTextInput.value = 1.5;
                }

                // Remove from active controls and add unset class
                activeControls.delete('line-height');
                if (controlGroup) {
                    controlGroup.classList.add('unset');
                }

                // Remove focus from the reset button (more aggressive for mobile)
                e.target.blur();
                setTimeout(() => {
                    e.target.blur();
                    // Force focus to body to ensure button loses focus
                    document.body.focus();
                }, 10);
                setTimeout(() => e.target.blur(), 100);

                applyFont(position);
                saveExtensionState();
            }
        }

        if (e.target.classList.contains('axis-reset-btn') && e.target.getAttribute('data-control') === 'weight') {
            const panel = e.target.closest('.controls-panel');
            let position;
            if (panel.id.includes('top')) position = 'top';
            else if (panel.id.includes('bottom')) position = 'bottom';
            else if (panel.id.includes('body')) position = 'body';
            else if (panel.id.includes('serif')) position = 'serif';
            else if (panel.id.includes('sans')) position = 'sans';
            else if (panel.id.includes('mono')) position = 'mono';
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

                // Remove focus from the reset button (more aggressive for mobile)
                e.target.blur();
                setTimeout(() => {
                    e.target.blur();
                    // Force focus to body to ensure button loses focus
                    document.body.focus();
                }, 10);
                setTimeout(() => e.target.blur(), 100);

                applyFont(position);
                saveExtensionState();
            }
        }

        if (e.target.classList.contains('axis-reset-btn') && e.target.getAttribute('data-control') === 'font-size') {
            const panel = e.target.closest('.controls-panel');
            let position;
            if (panel.id.includes('top')) position = 'top';
            else if (panel.id.includes('bottom')) position = 'bottom';
            else if (panel.id.includes('body')) position = 'body';
            else if (panel.id.includes('serif')) position = 'serif';
            else if (panel.id.includes('sans')) position = 'sans';
            else if (panel.id.includes('mono')) position = 'mono';
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

                // Remove focus from the reset button (more aggressive for mobile)
                e.target.blur();
                setTimeout(() => {
                    e.target.blur();
                    // Force focus to body to ensure button loses focus
                    document.body.focus();
                }, 10);
                setTimeout(() => e.target.blur(), 100);

                applyFont(position);
                saveExtensionState();
            }
        }

        // Variable axes reset button handler
        if (e.target.classList.contains('axis-reset-btn') && e.target.hasAttribute('data-axis')) {
            const panel = e.target.closest('.controls-panel');
            let position;
            if (panel.id.includes('top')) position = 'top';
            else if (panel.id.includes('bottom')) position = 'bottom';
            else if (panel.id.includes('body')) position = 'body';
            else if (panel.id.includes('serif')) position = 'serif';
            else if (panel.id.includes('sans')) position = 'sans';
            else if (panel.id.includes('mono')) position = 'mono';
            else return; // unsupported panel

            const axis = e.target.getAttribute('data-axis');
            const activeAxes = getActiveAxes(position);
            const controlGroup = e.target.closest('.control-group');

            // Remove the axis from active axes
            activeAxes.delete(axis);
            if (controlGroup) {
                controlGroup.classList.add('unset');
            }

            // Remove focus from the reset button
            e.target.blur();

            applyFont(position);
            saveExtensionState();
        }

        // Family reset button handler
        if (e.target.classList.contains('family-reset-btn')) {
            console.log('Family reset button clicked', e.target);
            const panelId = e.target.closest('.controls-panel').id;
            console.log('Panel ID:', panelId);
            let position;

            // Clean direct mapping from panel IDs to positions
            if (panelId === 'top-font-controls') position = 'top';
            else if (panelId === 'bottom-font-controls') position = 'bottom';
            else if (panelId === 'body-font-controls') position = 'body';
            else if (panelId === 'serif-font-controls') position = 'serif';
            else if (panelId === 'sans-font-controls') position = 'sans';
            else if (panelId === 'mono-font-controls') position = 'mono';

            if (position) {
                console.log('Position determined:', position);
                const fontDisplay = document.getElementById(`${position}-font-display`);
                const fontSelect = document.getElementById(`${position}-font-select`);
                console.log('Font elements found:', { fontDisplay, fontSelect });

                if (fontDisplay) {
                    // Handle Third Man In mode and Face-off mode differently
                    if (['serif', 'sans', 'mono'].includes(position)) {
                        // Third Man In mode: Reset like body mode
                        console.log('Third Man In reset for position:', position);
                        const fontGroup = fontDisplay.closest('.control-group');
                        fontDisplay.textContent = 'Default';
                        fontDisplay.classList.add('placeholder');
                        if (fontGroup) {
                            fontGroup.classList.add('unset');
                        }
                        // applyFont will set the correct heading text
                        applyFont(position);

                        // Update buttons after reset to show Reset All if needed
                        updateAllThirdManInButtons();
                    } else if (['top', 'bottom'].includes(position)) {
                        // Face-off mode: Reset display and preview
                        console.log('Face-off reset for position:', position);
                        const fontGroup = fontDisplay.closest('.control-group');
                        fontDisplay.textContent = 'Default';
                        fontDisplay.classList.add('placeholder');
                        if (fontGroup) {
                            fontGroup.classList.add('unset');
                        }
                        if (fontSelect) {
                            fontSelect.value = fontSelect.options[0]?.value || '';
                        }
                        applyFont(position);
                    }

                    // Replace setTimeout with immediate save
                    saveExtensionState();
                }
            }
        }
    });

    // Load saved state and initialize fonts
    // (loadExtensionState already called earlier)

    const currentModeState = extensionState ? extensionState[currentViewMode] : null;

    // Async font restoration
    (async () => {
        // Don't restore fonts if currentViewMode is not set yet
        if (!currentViewMode) {
            console.warn('Font restoration skipped: currentViewMode not set yet');
            return;
        }

        if (currentViewMode === 'third-man-in') {
            // Restore Third Man In mode fonts
            if (currentModeState && currentModeState.serifFont && currentModeState.serifFont.fontName) {
                await applyFontConfig('serif', currentModeState.serifFont);
            }

            if (currentModeState && currentModeState.sansFont && currentModeState.sansFont.fontName) {
                await applyFontConfig('sans', currentModeState.sansFont);
            }

            if (currentModeState && currentModeState.monoFont && currentModeState.monoFont.fontName) {
                await applyFontConfig('mono', currentModeState.monoFont);
            }
        } else if (currentViewMode === 'faceoff') {
            // Face-off mode font restoration
            if (currentModeState && currentModeState.topFont && currentModeState.topFont.fontName) {
                // Restore saved top font for current mode
                await applyFontConfig('top', currentModeState.topFont);
            } else {
                // Use default top font (suppress save during initialization)
                await loadFont('top', 'ABeeZee', { suppressImmediateSave: true });
            }

            if (currentModeState && currentModeState.bottomFont && currentModeState.bottomFont.fontName) {
                // Restore saved bottom font for current mode
                await applyFontConfig('bottom', currentModeState.bottomFont);
            } else {
                // Use default bottom font (suppress save during initialization)
                await loadFont('bottom', 'Zilla Slab Highlight', { suppressImmediateSave: true });
            }
        }
    })();

    // Add event listeners for font selectors
    // Font changes now handled by font picker, no dropdown event listeners needed

    // After state has been applied, populate the selects from metadata without clobbering selection
    // Small delay ensures applyFontConfig runs first so current values reflect saved state
    (async () => {
        // Wait for font restoration to complete
        await new Promise(resolve => setTimeout(resolve, 250));

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
                    await applyFontConfig('top', topCfg);
                }
                if (botCfg && botCfg.fontName) {
                    const resolved = resolveFamilyCase(botCfg.fontName);
                    if (resolved !== botCfg.fontName) {
                        botCfg.fontName = resolved;
                    }
                    await applyFontConfig('bottom', botCfg);
                }
            }
        }
        // Face-off displays already show the correct font names from the font picker
        // Third Man In displays remain as "Default" unless specifically changed by user
        // Persist any canonicalized names
        await saveExtensionState();
    })();

    // Panel state variables are declared at module level


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

    // Function moved to global scope - see updateFontComparisonLayout function below

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
        console.log('Saving favorite - config from getCurrentUIConfig:', JSON.stringify(config, null, 2));
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
    const fontName = document.getElementById('top-font-display').textContent;
    const fontDef = getEffectiveFontDefinition(fontName);

    // Controls will be marked as unset via UI state below

    // Reset basic properties
    document.getElementById('top-font-size').value = 17;
    document.getElementById('top-line-height').value = 1.5;
    document.getElementById('top-font-weight').value = 400;
    // Color left unset - will be marked as unset in UI state

    // Reset display values
    (function(){ const el = document.getElementById('top-font-size-value'); if (el) el.textContent = '17px'; })();
    const topLineHeightValue = document.getElementById('top-line-height-value');
    if (topLineHeightValue) topLineHeightValue.textContent = '1.5';
    const topFontWeightValue = document.getElementById('top-font-weight-value');
    if (topFontWeightValue) topFontWeightValue.textContent = '400';

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
    const fontName = document.getElementById('bottom-font-display').textContent;
    const fontDef = getEffectiveFontDefinition(fontName);

    // Controls will be marked as unset via UI state below

    // Reset basic properties
    document.getElementById('bottom-font-size').value = 17;
    document.getElementById('bottom-line-height').value = 1.5;
    document.getElementById('bottom-font-weight').value = 400;
    // Color left unset - will be marked as unset in UI state

    // Reset text input values
    const bottomFontSizeTextInput = document.getElementById('bottom-font-size-text');
    const bottomLineHeightTextInput = document.getElementById('bottom-line-height-text');
    if (bottomFontSizeTextInput) bottomFontSizeTextInput.value = 17;
    if (bottomLineHeightTextInput) bottomLineHeightTextInput.value = 1.5;

    // Reset display values
    (function(){ const el = document.getElementById('bottom-font-size-value'); if (el) el.textContent = '17px'; })();
    const bottomLineHeightValue = document.getElementById('bottom-line-height-value');
    if (bottomLineHeightValue) bottomLineHeightValue.textContent = '1.5';
    const bottomFontWeightValue = document.getElementById('bottom-font-weight-value');
    if (bottomFontWeightValue) bottomFontWeightValue.textContent = '400';

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


// Facade mode completely removed


// Compare two apply payloads for equality (font + axes + basic controls).
// Handles backward compat: old stored payloads may have wdthVal/slntVal/italVal
// instead of (or alongside) variableAxes entries.
function payloadEquals(a, b) {
    if (!a || !b) return false;
    if (a.fontName !== b.fontName) return false;
    const numEq = (x, y) => (x == null) && (y == null) ? true : Number(x) === Number(y);
    if (!numEq(a.fontWeight, b.fontWeight)) return false;
    if (!numEq(a.fontSize, b.fontSize)) return false;
    if (!numEq(a.lineHeight, b.lineHeight)) return false;
    if (a.fontColor !== b.fontColor) return false;
    // Normalize axes: fold legacy wdthVal/slntVal/italVal into variableAxes for comparison
    const normalize = (obj) => {
        const axes = { ...(obj.variableAxes || {}) };
        if (obj.wdthVal != null && !('wdth' in axes)) axes.wdth = Number(obj.wdthVal);
        if (obj.slntVal != null && !('slnt' in axes)) axes.slnt = Number(obj.slntVal);
        if (obj.italVal != null && !('ital' in axes)) axes.ital = Number(obj.italVal);
        return axes;
    };
    const aAxes = normalize(a);
    const bAxes = normalize(b);
    const aKeys = Object.keys(aAxes);
    const bKeys = Object.keys(bAxes);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
        if (!(key in bAxes) || Number(aAxes[key]) !== Number(bAxes[key])) return false;
    }
    return true;
}

// New storage structure to support multiple modes per domain
// cleanOrigin function removed - now using hostname directly

function getApplyMapForOrigin(origin, fontType = null) {
    if (!origin) return Promise.resolve(null);
    // Using origin directly (hostname)
    return browser.storage.local.get('affoApplyMap').then(data => {
        const applyMap = (data && data.affoApplyMap) ? data.affoApplyMap : {};
        const domainData = applyMap[origin];
        if (!domainData) return null;
        return fontType ? (domainData[fontType] || null) : domainData;
    }).catch(() => null);
}

function saveApplyMapForOrigin(origin, fontType, config) {
    console.log(`🟢 saveApplyMapForOrigin: Saving to domain storage - origin: ${origin}, fontType: ${fontType}, config:`, config);
    if (!origin || !fontType) return Promise.resolve();
    // Using origin directly (hostname)
    return browser.storage.local.get('affoApplyMap').then(data => {
        const applyMap = (data && data.affoApplyMap) ? data.affoApplyMap : {};
        console.log(`🟢 saveApplyMapForOrigin: Current applyMap before save:`, applyMap);
        if (!applyMap[origin]) applyMap[origin] = {};
        applyMap[origin][fontType] = config;
        console.log(`🟢 saveApplyMapForOrigin: New applyMap after save:`, applyMap);
        return browser.storage.local.set({ affoApplyMap: applyMap });
    }).then(() => {
        console.log(`🟢 saveApplyMapForOrigin: Successfully saved to domain storage`);
    }).catch(e => {
        console.error(`❌ saveApplyMapForOrigin: Error saving to domain storage:`, e);
    });
}

// Batch version: save multiple font types in a single storage write (for Apply All)
function saveBatchApplyMapForOrigin(origin, fontConfigs) {
    console.log(`🟢 saveBatchApplyMapForOrigin: Batch saving to domain storage - origin: ${origin}, fontConfigs:`, fontConfigs);
    if (!origin || !fontConfigs || Object.keys(fontConfigs).length === 0) return Promise.resolve();

    // Using origin directly (hostname)
    return browser.storage.local.get('affoApplyMap').then(data => {
        const applyMap = (data && data.affoApplyMap) ? data.affoApplyMap : {};
        console.log(`🟢 saveBatchApplyMapForOrigin: Current applyMap before batch save:`, applyMap);

        if (!applyMap[origin]) applyMap[origin] = {};

        // Apply all font type configs at once
        Object.entries(fontConfigs).forEach(([fontType, config]) => {
            if (config) {
                applyMap[origin][fontType] = config;
                console.log(`🟢 saveBatchApplyMapForOrigin: Added ${fontType} config:`, config);
            }
        });

        console.log(`🟢 saveBatchApplyMapForOrigin: New applyMap after batch save:`, applyMap);
        return browser.storage.local.set({ affoApplyMap: applyMap });
    }).then(() => {
        console.log(`🟢 saveBatchApplyMapForOrigin: Successfully batch saved to domain storage`);
    }).catch(e => {
        console.error(`❌ saveBatchApplyMapForOrigin: Error batch saving to domain storage:`, e);
    });
}

function clearApplyMapForOrigin(origin, fontType = null) {
    console.log(`🔴 clearApplyMapForOrigin: Clearing domain storage - origin: ${origin}, fontType: ${fontType}`);
    console.trace('🔴 clearApplyMapForOrigin: Stack trace to identify caller');
    if (!origin) return Promise.resolve();
    // Using origin directly (hostname)
    return browser.storage.local.get('affoApplyMap').then(data => {
        const applyMap = (data && data.affoApplyMap) ? data.affoApplyMap : {};
        console.log(`🔴 clearApplyMapForOrigin: Current applyMap before clear:`, applyMap);
        if (applyMap[origin]) {
            if (fontType) {
                // Clear specific font type (e.g., just 'sans')
                console.log(`🔴 clearApplyMapForOrigin: Clearing specific fontType "${fontType}" from ${origin}`);
                delete applyMap[origin][fontType];
            } else {
                // Clear entire domain
                console.log(`🔴 clearApplyMapForOrigin: Clearing entire domain "${origin}"`);
                delete applyMap[origin];
            }
            if (applyMap[origin] && Object.keys(applyMap[origin]).length === 0) {
                delete applyMap[origin];
            }
        }
        console.log(`🔴 clearApplyMapForOrigin: New applyMap after clear:`, applyMap);
        return browser.storage.local.set({ affoApplyMap: applyMap }).then(() => {
            console.log(`🔴 clearApplyMapForOrigin: Storage change event should have been fired`);
        });
    }).then(() => {
        console.log(`🔴 clearApplyMapForOrigin: Successfully cleared from domain storage`);
    }).catch(e => {
        console.error(`❌ clearApplyMapForOrigin: Error clearing from domain storage:`, e);
    });
}

// Note: clearAllThirdManInFonts removed - use clearApplyMapForOrigin(origin) to clear entire domain

// Update active tab to match current mode
function updateActiveTab(mode) {
    console.log('updateActiveTab: Setting active tab for mode:', mode);

    // Remove active class from all tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Add active class to the correct tab
    const activeTab = document.querySelector(`.mode-tab[data-mode="${mode}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
        console.log('updateActiveTab: Activated tab for mode:', mode);
    } else {
        console.warn('updateActiveTab: Could not find tab for mode:', mode);
    }
}

// Determine the correct initial mode based on domain storage to avoid warnings
function determineInitialMode() {
    return getActiveOrigin().then(origin => {
        if (!origin) {
            // No origin - default to body mode
            currentViewMode = 'body-contact';
            return Promise.resolve();
        }

        return getApplyMapForOrigin(origin).then(domainData => {
            if (!domainData) {
                // No domain data - check saved mode preference or default to body
                return browser.storage.local.get(['affoCurrentMode']).then(result => {
                    currentViewMode = result.affoCurrentMode || 'body-contact';
                    console.log('determineInitialMode: No domain data, using saved mode:', currentViewMode);
                });
            }

            // Domain has data - determine mode based on what's applied
            const hasBodyFont = !!domainData.body;
            const hasThirdManFonts = !!(domainData.serif || domainData.sans || domainData.mono);

            if (hasThirdManFonts && !hasBodyFont) {
                // Only Third Man In fonts applied
                currentViewMode = 'third-man-in';
                console.log('determineInitialMode: Domain has Third Man In fonts, starting in third-man-in mode');
            } else if (hasBodyFont && !hasThirdManFonts) {
                // Only body font applied
                currentViewMode = 'body-contact';
                console.log('determineInitialMode: Domain has body font, starting in body-contact mode');
            } else if (hasBodyFont && hasThirdManFonts) {
                // Both applied - prefer user's last saved mode or default to body
                return browser.storage.local.get(['affoCurrentMode']).then(result => {
                    currentViewMode = result.affoCurrentMode || 'body-contact';
                    console.log('determineInitialMode: Domain has both font types, using saved mode:', currentViewMode);
                });
            } else {
                // No fonts applied - use saved mode preference or default
                return browser.storage.local.get(['affoCurrentMode']).then(result => {
                    currentViewMode = result.affoCurrentMode || 'body-contact';
                    console.log('determineInitialMode: No fonts applied, using saved mode:', currentViewMode);
                });
            }
        });
    });
}

// Reset Third Man In UI to defaults before restoration
function resetThirdManInUI() {
    console.log('🔄 resetThirdManInUI: Resetting Third Man In UI to defaults');

    for (const fontType of ['serif', 'sans', 'mono']) {
        // Reset font name display
        const nameElement = document.getElementById(`${fontType}-font-name`);
        if (nameElement) nameElement.textContent = fontType.charAt(0).toUpperCase() + fontType.slice(1);

        // Reset font display
        const displayElement = document.getElementById(`${fontType}-font-display`);
        if (displayElement) displayElement.textContent = 'Default';

        // Reset font selector
        const selectElement = document.getElementById(`${fontType}-font-select`);
        if (selectElement) selectElement.value = 'Default';

        // Reset controls to defaults
        const fontSizeSlider = document.getElementById(`${fontType}-font-size`);
        const fontSizeValue = document.getElementById(`${fontType}-font-size-value`);
        if (fontSizeSlider) fontSizeSlider.value = 17;
        if (fontSizeValue) fontSizeValue.textContent = '17px';

        const fontWeightSlider = document.getElementById(`${fontType}-font-weight`);
        const fontWeightValue = document.getElementById(`${fontType}-font-weight-value`);
        if (fontWeightSlider) fontWeightSlider.value = 400;
        if (fontWeightValue) fontWeightValue.textContent = '400';

        const lineHeightSlider = document.getElementById(`${fontType}-line-height`);
        const lineHeightTextInput = document.getElementById(`${fontType}-line-height-text`);
        const lineHeightValue = document.getElementById(`${fontType}-line-height-value`);
        if (lineHeightSlider) lineHeightSlider.value = 1.5;
        if (lineHeightValue) lineHeightValue.textContent = '1.5';
        if (lineHeightTextInput) lineHeightTextInput.value = 1.5;

        // Reset color selector
        const colorSelect = document.getElementById(`${fontType}-font-color`);
        if (colorSelect) colorSelect.value = 'default';
    }
}

// Restore UI state from domain storage on popup initialization
function restoreUIFromDomainStorage() {
    console.log('🔄 restoreUIFromDomainStorage: Starting UI restoration from domain storage');

    return getActiveOrigin().then(origin => {
        if (!origin) {
            console.log('🔄 restoreUIFromDomainStorage: No origin found, skipping restoration');
            return;
        }

        console.log('🔄 restoreUIFromDomainStorage: Origin:', origin);

        // Reset UI to defaults before loading domain-specific settings
        resetThirdManInUI();

        // Load domain storage for Third Man In mode
        return getApplyMapForOrigin(origin).then(domainData => {
            console.log('🔄 restoreUIFromDomainStorage: Domain data:', domainData);

            if (!domainData) {
                console.log('🔄 restoreUIFromDomainStorage: No domain data found, UI will use defaults');
                return;
            }

            // Restore each font type (serif, sans, mono)
            for (const fontType of ['serif', 'sans', 'mono']) {
                const savedFont = domainData[fontType];

                // Check if saved font has any meaningful properties
                const hasValidSavedFont = savedFont && (savedFont.fontName || savedFont.fontSize || savedFont.fontWeight || savedFont.lineHeight || savedFont.fontColor);

                if (hasValidSavedFont) {
                    console.log(`🔄 restoreUIFromDomainStorage: Restoring ${fontType} font: ${savedFont.fontName}`);

                    // Update font name heading
                    const nameElement = document.getElementById(`${fontType}-font-name`);
                    if (nameElement) {
                        nameElement.textContent = savedFont.fontName;
                        console.log(`🔄 restoreUIFromDomainStorage: Updated ${fontType}-font-name to "${savedFont.fontName}"`);
                    }

                    // Update font display
                    const displayElement = document.getElementById(`${fontType}-font-display`);
                    if (displayElement) {
                        displayElement.textContent = savedFont.fontName;
                        console.log(`🔄 restoreUIFromDomainStorage: Updated ${fontType}-font-display to "${savedFont.fontName}"`);
                    }

                    // Update font selector
                    const selectElement = document.getElementById(`${fontType}-font-select`);
                    if (selectElement) {
                        selectElement.value = savedFont.fontName;
                        console.log(`🔄 restoreUIFromDomainStorage: Updated ${fontType}-font-select to "${savedFont.fontName}"`);
                    }

                    // Update other controls if they exist in saved data
                    if (savedFont.fontSize) {
                        const fontSizeSlider = document.getElementById(`${fontType}-font-size`);
                        const fontSizeValue = document.getElementById(`${fontType}-font-size-value`);
                        if (fontSizeSlider) fontSizeSlider.value = savedFont.fontSize;
                        if (fontSizeValue) fontSizeValue.textContent = savedFont.fontSize + 'px';
                    }

                    if (savedFont.fontWeight) {
                        const fontWeightSlider = document.getElementById(`${fontType}-font-weight`);
                        const fontWeightValue = document.getElementById(`${fontType}-font-weight-value`);
                        if (fontWeightSlider) fontWeightSlider.value = savedFont.fontWeight;
                        if (fontWeightValue) fontWeightValue.textContent = savedFont.fontWeight;
                    }

                    if (savedFont.lineHeight) {
                        const lineHeightSlider = document.getElementById(`${fontType}-line-height`);
                        const lineHeightTextInput = document.getElementById(`${fontType}-line-height-text`);
                        const lineHeightValue = document.getElementById(`${fontType}-line-height-value`);
                        if (lineHeightSlider) lineHeightSlider.value = savedFont.lineHeight;
                        if (lineHeightTextInput) lineHeightTextInput.value = savedFont.lineHeight;
                        if (lineHeightValue) lineHeightValue.textContent = savedFont.lineHeight;
                    }

                    if (savedFont.fontColor) {
                        const colorSelect = document.getElementById(`${fontType}-font-color`);
                        if (colorSelect) colorSelect.value = savedFont.fontColor;
                    }
                } else {
                    console.log(`🔄 restoreUIFromDomainStorage: No saved font for ${fontType}, ensuring defaults are set`);

                    // Ensure default heading is set
                    const nameElement = document.getElementById(`${fontType}-font-name`);
                    if (nameElement) {
                        const defaultLabel = fontType.charAt(0).toUpperCase() + fontType.slice(1);
                        nameElement.textContent = defaultLabel;
                        console.log(`🔄 restoreUIFromDomainStorage: Set default ${fontType}-font-name to "${defaultLabel}"`);
                    }

                    // Ensure default display is set
                    const displayElement = document.getElementById(`${fontType}-font-display`);
                    if (displayElement) {
                        displayElement.textContent = 'Default';
                        displayElement.classList.add('placeholder');
                        console.log(`🔄 restoreUIFromDomainStorage: Set default ${fontType}-font-display to "Default"`);
                    }
                }
            }

            console.log('🔄 restoreUIFromDomainStorage: UI restoration completed');
        });
    }).catch(error => {
        console.error('🔄 restoreUIFromDomainStorage: Error during UI restoration:', error);
    });
}

// generateBodyContactCSS, generateThirdManInCSS, generateElementWalkerScript
// are now in css-generators.js


// Reflect button labels based on saved vs current (Applied/Update/Apply)
async function refreshApplyButtonsDirtyState() {
    try {
        const origin = await getActiveOrigin();
        const entry = origin ? (await getApplyMapForOrigin(origin) || {}) : {};

        const btnTop = document.getElementById('apply-top');
        const btnBottom = document.getElementById('apply-bottom');

        if (btnTop) {
            const saved = entry.serif || null;
            if (!saved) {
                btnTop.classList.remove('active');
                btnTop.textContent = 'Apply';
                const r = document.getElementById('reset-top');
                if (r) r.style.display = 'none';
            } else {
                const current = await buildPayload('top');
                const same = payloadEquals(saved, current);
                btnTop.classList.toggle('active', same);
                btnTop.textContent = same ? '✓' : 'Apply';
                const r = document.getElementById('reset-top');
                if (r) r.style.display = same ? 'inline-flex' : 'none';
            }
        }

        if (btnBottom) {
            const saved = entry.sans || null;
            if (!saved) {
                btnBottom.classList.remove('active');
                btnBottom.textContent = 'Apply';
                const r = document.getElementById('reset-bottom');
                if (r) r.style.display = 'none';
            } else {
                const current = await buildPayload('bottom');
                const same = payloadEquals(saved, current);
                btnBottom.classList.toggle('active', same);
                btnBottom.textContent = same ? '✓' : 'Apply';
                const r = document.getElementById('reset-bottom');
                if (r) r.style.display = same ? 'inline-flex' : 'none';
            }
        }
    } catch (error) {
        console.error('Error in refreshApplyButtonsDirtyState:', error);
    }
}

// Mode switching functionality
// Check if a mode has applied settings for the current domain
function modeHasAppliedSettings(mode) {
    const modeConfig = MODE_CONFIG[mode];
    if (!modeConfig || !modeConfig.useDomain) return Promise.resolve(false);

    return getActiveOrigin().then(origin => {
        if (!origin) return false;

        return getApplyMapForOrigin(origin).then(domainData => {
            if (!domainData) return false;
            return modeConfig.positions.some(pos => !!domainData[pos]);
        });
    }).catch(() => false);
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

// Reset font previews to default state
function resetFontPreviews() {
    console.log('🔄 resetFontPreviews: Resetting all font previews to default state');

    // Reset Face-off mode previews
    const faceoffPositions = ['top', 'bottom'];
    faceoffPositions.forEach(position => {
        const nameElement = document.getElementById(`${position}-font-name`);
        const textElement = document.getElementById(`${position}-font-text`);
        if (nameElement) {
            nameElement.textContent = 'Select a font';
            nameElement.style.cssText = '';
        }
        if (textElement) {
            textElement.style.cssText = '';
            textElement.style.fontFamily = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
        }
    });

    // Reset Body mode preview
    const bodyNameElement = document.getElementById('body-font-name');
    const bodyTextElement = document.getElementById('body-font-text');
    if (bodyNameElement) {
        bodyNameElement.textContent = 'Select a font';
        bodyNameElement.style.cssText = '';
    }
    if (bodyTextElement) {
        bodyTextElement.style.cssText = '';
        bodyTextElement.style.fontFamily = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    }

    // Reset Third Man In mode previews
    const thirdManTypes = ['serif', 'sans', 'mono'];
    thirdManTypes.forEach(fontType => {
        const nameElement = document.getElementById(`${fontType}-font-name`);
        const textElement = document.getElementById(`${fontType}-font-text`);
        if (nameElement) {
            // Use proper heading names for Third Man In mode
            const heading = fontType.charAt(0).toUpperCase() + fontType.slice(1);
            nameElement.textContent = heading;
            nameElement.style.cssText = '';
        }
        if (textElement) {
            textElement.style.cssText = '';
            // Set appropriate generic font family
            let genericFamily;
            switch(fontType) {
                case 'serif': genericFamily = 'serif'; break;
                case 'sans': genericFamily = 'sans-serif'; break;
                case 'mono': genericFamily = 'monospace'; break;
                default: genericFamily = 'sans-serif';
            }
            textElement.style.fontFamily = genericFamily;
        }
    });
}

// Clear domain settings for all modes
function clearAllDomainSettings() {
    return getActiveOrigin().then(origin => {
        if (!origin) return;

        return clearApplyMapForOrigin(origin).then(() => {
            sendMessageToTargetTab({
                action: 'restoreOriginal',
                origin: origin
            });
        });
    }).catch(error => {
        console.error('Error clearing domain settings:', error);
    });
}

async function switchMode(newMode, forceInit = false) {
    console.log(`switchMode called: currentViewMode=${currentViewMode}, newMode=${newMode}, forceInit=${forceInit}`);
    if (currentViewMode === newMode && !forceInit) {
        console.log('switchMode: Already in target mode, skipping switch');
        return;
    }

    // Show confirmation modal when switching between incompatible modes that save domain settings
    // OR when switching from faceoff to a mode that would conflict with existing domain settings
    // BUT NOT during initial mode determination (when currentViewMode is null)
    const showModal = currentViewMode !== null && (
        (currentViewMode === 'body-contact' && newMode === 'third-man-in') ||
        (currentViewMode === 'third-man-in' && newMode === 'body-contact') ||
        (currentViewMode === 'faceoff' && (newMode === 'body-contact' || newMode === 'third-man-in'))
    );

    if (showModal) {
        let shouldShowConfirmation = false;

        if ((currentViewMode === 'body-contact' && newMode === 'third-man-in') ||
            (currentViewMode === 'third-man-in' && newMode === 'body-contact')) {
            // For incompatible modes, check if either has settings
            const [currentHasSettings, targetHasSettings] = await Promise.all([
                modeHasAppliedSettings(currentViewMode),
                modeHasAppliedSettings(newMode)
            ]);
            shouldShowConfirmation = currentHasSettings || targetHasSettings;
        } else if (currentViewMode === 'faceoff') {
            // For faceoff -> other modes, check if the OPPOSITE incompatible mode has settings
            // that would be lost when domain data is cleared
            if (newMode === 'body-contact') {
                // Switching to body-contact: check if third-man-in has settings that would be lost
                const oppositeHasSettings = await modeHasAppliedSettings('third-man-in');
                shouldShowConfirmation = oppositeHasSettings;
            } else if (newMode === 'third-man-in') {
                // Switching to third-man-in: check if body-contact has settings that would be lost
                const oppositeHasSettings = await modeHasAppliedSettings('body-contact');
                shouldShowConfirmation = oppositeHasSettings;
            }
        }

        if (shouldShowConfirmation) {
            // Show confirmation modal
            const currentDisplayName = getModeDisplayName(currentViewMode);
            const newDisplayName = getModeDisplayName(newMode);

            const confirmed = await showCustomConfirm(
                `Switching from\n${currentDisplayName} mode to ${newDisplayName} mode\nwill clear saved settings for the domain. Proceed?`
            );

            if (!confirmed) {
                return; // User cancelled, don't switch
            }

            // Clear all domain settings when switching between body-contact and third-man-in
            await clearAllDomainSettings();
            // Reset font previews after clearing domain data
            resetFontPreviews();
            await performModeSwitch(newMode);
        } else {
            // Reset font previews when switching modes without domain clearing
            resetFontPreviews();
            await performModeSwitch(newMode);
        }
    } else {
        // Reset font previews when switching modes without confirmation
        resetFontPreviews();
        await performModeSwitch(newMode);
    }
}

async function performModeSwitch(newMode) {
    console.log(`🔄 performModeSwitch: Switching from ${currentViewMode} to ${newMode}`);

    document.body.classList.add('mode-switching');
    try {
        // Save current mode panel states before switching (but only if we're actually switching between different modes)
        if (currentViewMode !== newMode && currentViewMode) {
            const oldConfig = MODE_CONFIG[currentViewMode];
            if (oldConfig) {
                for (const position of oldConfig.positions) {
                    const el = document.getElementById(`${position}-font-controls`);
                    if (el) panelStates[currentViewMode][position] = el.classList.contains('visible');
                }
            }
        }

        // Hide current mode content
        console.log(`🔄 performModeSwitch: Removing active class from all .mode-content elements`);
        document.querySelectorAll('.mode-content').forEach(content => {
            console.log(`🔄 performModeSwitch: Removing active from`, content.className);
            content.classList.remove('active');
        });

        console.log(`🔄 performModeSwitch: Removing active class from all .mode-tab elements`);
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Hide all panels
        console.log(`🔄 performModeSwitch: Removing visible class from all .controls-panel elements`);
        document.querySelectorAll('.controls-panel').forEach(panel => {
            panel.classList.remove('visible');
        });

        // Show new mode content
        const newModeContent = document.querySelector(`.${newMode}-content`);
        console.log(`🔄 performModeSwitch: Looking for mode content with selector: .${newMode}-content`);
        console.log(`🔄 performModeSwitch: Found mode content element:`, newModeContent);
        if (newModeContent) {
            newModeContent.classList.add('active');
            console.log(`🔄 performModeSwitch: Added active class to ${newMode} content, final classes:`, newModeContent.className);

            // DEBUG: Check all mode contents after switch
            document.querySelectorAll('.mode-content').forEach(content => {
                console.log(`🔄 DEBUG: Mode content ${content.className} visibility:`, getComputedStyle(content).display);
            });
        } else {
            console.error(`🔄 performModeSwitch: Could not find mode content for ${newMode}!`);
        }

        // Activate new mode tab
        const newModeTab = document.querySelector(`.mode-tab[data-mode="${newMode}"]`);
        if (newModeTab) {
            newModeTab.classList.add('active');
        }

        currentViewMode = newMode;

        // Apply view mode (updates body classes and saves to storage)
        try {
            await applyViewMode(currentViewMode);
        } catch (error) {
            console.error('Error applying view mode:', error);
        }

        // Load settings for the new mode
        await loadModeSettings();

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
            } else {
                console.log('❌ Body panel state is false, not showing panel');
            }
            // Update domain display when switching to body mode
            updateDomainDisplay();
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
            updateDomainDisplay();
        }

        // Initialize Apply/Reset button states for new modes
        if (['body-contact', 'third-man-in'].includes(newMode)) {
            try {
                if (newMode === 'body-contact') {
                    await updateBodyButtons();
                } else if (newMode === 'third-man-in') {
                    await updateAllThirdManInButtons();
                }
            } catch (error) {
                console.error('Error updating buttons after mode switch:', error);
            }
        }
    } finally {
        document.body.classList.remove('mode-switching');
    }
}

function initializeModeInterface() {
    console.log('initializeModeInterface starting, current currentViewMode:', currentViewMode);
    console.log('initializeModeInterface: Body classes at start:', document.body.className);
    // Allow mode persistence for Third Man In, but default others to body-contact
    return browser.storage.local.get('affoCurrentMode').then(result => {
        const savedMode = result.affoCurrentMode;
        console.log('Saved mode from browser.storage.local:', savedMode);
        if (savedMode === 'third-man-in') {
            console.log('Restoring third-man-in mode from browser.storage.local');
            // Don't set currentViewMode here - let switchMode handle the full transition
            return Promise.resolve();
        } else if (savedMode) {
            console.log('Clearing non-third-man-in saved mode, defaulting to body-contact mode');
            return browser.storage.local.remove('affoCurrentMode');
        }
        return Promise.resolve();
    }).then(() => {
        console.log('Final currentViewMode after loading:', currentViewMode);

        // Set up mode tab event listeners
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.getAttribute('data-mode');
                console.log(`Tab clicked: switching to ${mode} mode`);
                switchMode(mode);
            });
        });

        // Initialize the current mode (use saved mode if available)
        return browser.storage.local.get('affoCurrentMode');
    }).then(_result => {
        // Mode was already determined by determineInitialMode(), just use it
        const targetMode = currentViewMode || 'body-contact';
        console.log('About to call switchMode with:', targetMode);
        switchMode(targetMode, true); // Force initialization to set up panel visibility

        // Update active tab after mode is switched
        updateActiveTab(targetMode);

        // Ensure initial mode content is activated (in case switchMode skipped because already in target mode)
        const initialModeContent = document.querySelector(`.${targetMode}-content`);
        if (initialModeContent && !initialModeContent.classList.contains('active')) {
            console.log('🔄 Initialization: Activating initial mode content for:', targetMode);
            initialModeContent.classList.add('active');
        }

        // Force load settings on initial popup open (switchMode may skip if mode is already set)
        console.log('Force calling loadModeSettings for initial load');
        loadModeSettings();

        // Update domain display for body mode
        updateDomainDisplay();

        // Backup: If UI is in Third Man In mode but font restoration didn't run, force it
        (async () => {
            await new Promise(resolve => setTimeout(resolve, 200));

            if (document.body.classList.contains('view-third-man-in')) {
                console.log('Backup: Detected Third Man In UI mode, checking if fonts need restoration');
                try {
                    const origin = await getActiveOrigin();
                    if (origin) {
                        const domainData = await getApplyMapForOrigin(origin);
                        if (domainData) {
                            console.log('Backup: Found Third Man In data, checking if UI needs update');
                            // Check if sans UI needs fixing (most common case)
                            if (domainData.sans && domainData.sans.fontName) {
                                const fontDisplay = document.getElementById('sans-font-display');

                                // Restore font display if it's empty or default
                                if (fontDisplay && (!fontDisplay.textContent || fontDisplay.textContent === 'Default' || fontDisplay.textContent === 'Sans')) {
                                    console.log('Backup: Fixing sans font display');
                                    fontDisplay.textContent = domainData.sans.fontName;
                                    fontDisplay.classList.remove('placeholder');
                                }
                            }
                            // Check if serif UI needs fixing
                            if (domainData.serif && domainData.serif.fontName) {
                                const fontDisplay = document.getElementById('serif-font-display');

                                // Restore font display if it's empty or default
                                if (fontDisplay && (!fontDisplay.textContent || fontDisplay.textContent === 'Default' || fontDisplay.textContent === 'Serif')) {
                                    console.log('Backup: Fixing serif font display');
                                    fontDisplay.textContent = domainData.serif.fontName;
                                    fontDisplay.classList.remove('placeholder');
                                }
                            }
                            // Check if mono UI needs fixing
                            if (domainData.mono && domainData.mono.fontName) {
                                const fontDisplay = document.getElementById('mono-font-display');

                                // Restore font display if it's empty or default
                                if (fontDisplay && (!fontDisplay.textContent || fontDisplay.textContent === 'Default' || fontDisplay.textContent === 'Mono')) {
                                    console.log('Backup: Fixing mono font display');
                                    fontDisplay.textContent = domainData.mono.fontName;
                                    fontDisplay.classList.remove('placeholder');
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('Backup font restoration failed:', e);
                }
            }
        })();

        // DISABLED: Simple font selector sync - conflicts with display-element-as-source-of-truth architecture
        // Since we changed getCurrentUIConfig() to read from display elements instead of selectors,
        // this sync logic would override correctly restored domain data
        /*
        setTimeout(() => {
            console.log('Simple sync: Updating display elements from font selectors');
            ['serif', 'sans', 'mono'].forEach(type => {
                const display = document.getElementById(`${type}-font-display`);
                const selector = document.getElementById(`${type}-font-select`);

                if (display && selector) {
                    if (selector.value) {
                        console.log(`Simple sync: ${type} selector has "${selector.value}", updating display`);
                        display.textContent = selector.value;
                    } else {
                        console.log(`Simple sync: ${type} selector is empty, setting display to default`);
                        display.textContent = type.charAt(0).toUpperCase() + type.slice(1); // "Serif", "Sans", "Mono"
                    }
                }
            });

            // Also handle body mode
            const bodyDisplay = document.getElementById('body-font-display');
            const bodySelector = document.getElementById('body-font-select');
            if (bodyDisplay && bodySelector) {
                if (bodySelector.value) {
                    console.log(`Simple sync: body selector has "${bodySelector.value}", updating display`);
                    bodyDisplay.textContent = bodySelector.value;
                } else {
                    console.log(`Simple sync: body selector is empty, setting display to Default`);
                    bodyDisplay.textContent = 'Default';
                }
            }
        }, 300);
        */

        // Ensure body class is set on initial load
        document.body.className = `view-${currentViewMode}`;

        // Set up grip event listeners for all modes
        setupGripEventListeners();

        // Set up Apply/Reset button event listeners for new modes
        setupApplyResetEventListeners();

        // Set up control change listeners for button state updates (mode-specific)
        if (currentViewMode === 'body-contact') {
            setupControlChangeListeners('body');
        } else if (currentViewMode === 'third-man-in') {
            setupControlChangeListeners('serif');
            setupControlChangeListeners('mono');
            setupControlChangeListeners('sans');
        }
        // Face-off mode doesn't need these listeners
    }).catch(() => {
        console.log('Error in initializeModeInterface, continuing with defaults');
    });
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


    if (applyBtn && !applyBtn._affoApplyHandlerAttached) {
        applyBtn._affoApplyHandlerAttached = true;
        applyBtn.addEventListener('click', async (event) => {
            // Prevent any double-firing
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();


            // Skip if button is already disabled (processing)
            if (applyBtn.disabled) {
                return;
            }

            // Disable button immediately to prevent double clicks
            applyBtn.disabled = true;
            try {
                await handleApply(panelId);
            } finally {
                // Re-enable after a short delay
                await new Promise(resolve => setTimeout(resolve, 500));
                applyBtn.disabled = false;
            }
        });
    }

    if (resetBtn && !resetBtn._affoResetHandlerAttached) {
        resetBtn._affoResetHandlerAttached = true;
        resetBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            resetBtn.disabled = true;
            try {
                await resetPanelSettings(panelId);
            } finally {
                await new Promise(resolve => setTimeout(resolve, 500));
                resetBtn.disabled = false;
            }
        });
    }
}

// Storage Queue removed - proper async flow control with .then() prevents race conditions

// Prevent concurrent handleApply calls
const handleApplyLocks = new Set();

function handleApply(panelId) {
    // Prevent concurrent execution for the same panel
    if (handleApplyLocks.has(panelId)) {
        return Promise.resolve();
    }
    handleApplyLocks.add(panelId);

    // Show loading state
    showApplyLoading(panelId);

    let applyPromise;
    if (currentViewMode === 'third-man-in') {
        // Third Man In mode: Apply All strategy
        applyPromise = (async () => {
            await applyAllThirdManInFonts();
            // Small delay to allow storage operations to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            // Update button states for all Third Man In panels
            return await updateAllThirdManInButtons();
        })();
    } else {
        // Body Contact and Face-off modes: single panel apply
        const config = getCurrentUIConfig(panelId);
        applyPromise = applyPanelConfiguration(panelId, config).then(() => {
            // Handle body mode specially - update buttons after successful apply
            if (panelId === 'body') {
                console.log('Body apply completed - updating buttons');
                return updateBodyButtons().then(() => {
                    console.log('updateBodyButtons completed after apply');
                });
            } else if (['serif', 'sans', 'mono'].includes(panelId)) {
                return updateAllThirdManInButtons(panelId);
            }
            return Promise.resolve();
        });
    }

    return applyPromise.catch(error => {
        console.error('Error applying configuration:', error);
    }).finally(() => {
        // Hide loading state and release the lock
        return hideApplyLoading(panelId).then(() => {
            handleApplyLocks.delete(panelId);
        });
    });
}

// Apply All fonts for Third Man In mode - OPTIMIZED VERSION (single storage write)
function applyAllThirdManInFonts() {
    const types = ['serif', 'sans', 'mono'];

    console.log('applyAllThirdManInFonts: Starting OPTIMIZED Apply All process');
    console.log('applyAllThirdManInFonts: Current view mode:', currentViewMode);

    return getActiveOrigin().then(origin => {
        if (!origin) {
            console.log('applyAllThirdManInFonts: No active origin, aborting');
            return Promise.resolve();
        }

        // Step 1: Collect all font configs that need to be applied
        const fontConfigs = {};
        const cssJobs = [];
        let appliedAny = false;

        console.log('applyAllThirdManInFonts: Collecting font configurations');

        // Get current applied state for comparison
        return getApplyMapForOrigin(origin).then(rawDomainData => {
            const domainData = rawDomainData || {};

            types.forEach(type => {
                const config = getCurrentUIConfig(type);
                const appliedConfig = domainData[type];

                console.log(`applyAllThirdManInFonts: Processing ${type} - config:`, config);
                console.log(`applyAllThirdManInFonts: Processing ${type} - appliedConfig:`, appliedConfig);

                // Check if config has any meaningful properties
                const hasValidConfig = config && (config.fontName || config.fontSize || config.fontWeight || config.lineHeight || config.fontColor);

                if (hasValidConfig) {
                    // Convert applied config to same format for comparison
                    const appliedForComparison = appliedConfig ? {
                        fontName: appliedConfig.fontName || null,
                        variableAxes: appliedConfig.variableAxes || {}  // Keep fallback for old storage
                    } : null;

                    if (appliedConfig && appliedForComparison) {
                        if (appliedConfig.fontSize) appliedForComparison.fontSize = appliedConfig.fontSize;
                        if (appliedConfig.lineHeight) appliedForComparison.lineHeight = appliedConfig.lineHeight;
                        if (appliedConfig.fontWeight) appliedForComparison.fontWeight = appliedConfig.fontWeight;
                        if (appliedConfig.fontColor) appliedForComparison.fontColor = appliedConfig.fontColor;
                        if (appliedConfig.fontFaceRule) appliedForComparison.fontFaceRule = appliedConfig.fontFaceRule;
                    }

                    // Only apply if config is different from what's already applied
                    const isDifferent = !configsEqual(config, appliedForComparison);

                    if (isDifferent) {
                        console.log(`applyAllThirdManInFonts: Will set ${type} (has changes):`, config);
                        console.log(`applyAllThirdManInFonts: ${type} applied state:`, appliedForComparison);
                        fontConfigs[type] = config;
                        appliedAny = true;

                        // Prepare CSS/font loading jobs (but don't execute yet)
                        cssJobs.push({
                            type: type,
                            fontName: config.fontName,
                            config: config
                        });
                    } else {
                        console.log(`applyAllThirdManInFonts: ${type} unchanged - no action needed`);
                        // Don't include unchanged types in fontConfigs - they should remain as-is
                    }
                } else {
                    // No valid config - clear/unset this type in the batch write
                    if (appliedConfig) {
                        console.log(`applyAllThirdManInFonts: Will unset ${type} - no valid config`);
                        fontConfigs[type] = null; // Explicitly clear
                        appliedAny = true;
                    } else {
                        console.log(`applyAllThirdManInFonts: ${type} already unset - no change needed`);
                    }
                }
            });

            if (!appliedAny) {
                console.log('applyAllThirdManInFonts: No fonts to apply (all are placeholders/unset)');
                return Promise.resolve();
            }

            // Step 2a: Compute css2Url for each config before saving to storage
            // This is critical for inline apply domains (like x.com) where content.js loads fonts from storage
            console.log('applyAllThirdManInFonts: Computing css2Url for configs before storage...');
            const css2UrlPromises = Object.keys(fontConfigs).map(type => {
                const config = fontConfigs[type];
                if (!config || !config.fontName) {
                    return Promise.resolve(); // Skip null configs or configs without fontName
                }

                return buildCss2Url(config.fontName, config).then(css2Url => {
                    if (css2Url) {
                        console.log(`applyAllThirdManInFonts: Computed css2Url for ${type}:`, css2Url);
                        fontConfigs[type].css2Url = css2Url;
                    } else {
                        console.log(`applyAllThirdManInFonts: No css2Url for ${type} (custom font or default)`);
                    }
                }).catch(error => {
                    console.warn(`applyAllThirdManInFonts: Failed to compute css2Url for ${type}:`, error);
                });
            });

            return Promise.all(css2UrlPromises).then(() => {
                // Step 2b: SINGLE batch storage write for all fonts (now with css2Url included)
                // For inline apply domains, content script handles font loading with progressive loading
                console.log('applyAllThirdManInFonts: Performing SINGLE batch storage write for all fonts:', Object.keys(fontConfigs));
                return saveBatchApplyMapForOrigin(origin, fontConfigs);
            }).then(() => {

            // Step 3: Clean up any existing CSS for all types before applying new CSS
            console.log('applyAllThirdManInFonts: Cleaning up existing CSS for all types');
            const cleanupPromises = ['serif', 'sans', 'mono'].map(type => {
                if (appliedCssActive[type]) {
                    console.log(`applyAllThirdManInFonts: Removing existing CSS for ${type}`);
                    return browser.tabs.removeCSS({ code: appliedCssActive[type] }).then(() => {
                        appliedCssActive[type] = null;
                    }).catch(error => {
                        console.warn(`applyAllThirdManInFonts: Failed to remove existing CSS for ${type}:`, error);
                    });
                } else {
                    return Promise.resolve();
                }
            });

            return Promise.all(cleanupPromises).then(() => {
                // Step 4: Apply CSS and font loading in parallel for all fonts (only for non-inline domains)
                console.log('applyAllThirdManInFonts: Applying CSS and font loading for all fonts in parallel');

            const cssPromises = cssJobs.map(job => {
                return Promise.resolve().then(async () => {
                    // Build the payload to get css2Url
                    const payload = await buildPayload(job.type, job.config);
                    if (!payload) {
                        console.log(`applyAllThirdManInFonts: No payload for ${job.type}, skipping`);
                        return false;
                    }

                    // Inject Google Fonts CSS link if needed (before element walker)
                    const css2Url = payload.css2Url;
                    if (css2Url) {
                        const linkId = `a-font-face-off-style-${job.type}-link`;
                        const linkScript = `
                            (function() {
                                var linkId = '${linkId}';
                                var existingLink = document.getElementById(linkId);
                                if (!existingLink) {
                                    var link = document.createElement('link');
                                    link.id = linkId;
                                    link.rel = 'stylesheet';
                                    link.href = '${css2Url}';
                                    document.head.appendChild(link);
                                    console.log('Third Man In: Added Google Fonts link for ${payload.fontName}:', '${css2Url}');
                                }
                            })();
                        `;
                        await executeScriptInTargetTab({ code: linkScript }).catch(error => {
                            console.warn(`applyAllThirdManInFonts: Font link injection failed for ${job.type}:`, error);
                        });
                    }

                    // Element walker script - RUN AFTER font loading
                    const walkerScript = generateElementWalkerScript(job.type);
                    console.log(`applyAllThirdManInFonts: Running element walker script for ${job.type}`);

                    return executeScriptInTargetTab({ code: walkerScript }).then(async () => {
                        // Verify what elements were marked
                        return browser.tabs.executeScript({
                            code: `
                                (function() {
                                    const markedElements = document.querySelectorAll('[data-affo-font-type="${job.type}"]');
                                    console.log('VERIFICATION: ${job.type} elements marked:', markedElements.length);
                                    for (let i = 0; i < Math.min(10, markedElements.length); i++) {
                                        const el = markedElements[i];
                                        const computed = window.getComputedStyle(el);
                                        console.log('VERIFICATION: Marked ${job.type} element', i+1, ':', el.tagName, el.className, 'computedFont:', computed.fontFamily, 'text:', el.textContent.substring(0, 30));
                                    }
                                    return markedElements.length;
                                })();
                            `
                        }).then(async (result) => {
                            console.log(`applyAllThirdManInFonts: ${job.type} walker marked ${result[0]} elements`);

                            // Use the payload that was already built earlier
                            const css = generateThirdManInCSS(job.type, payload);
                            if (css) {
                                console.log(`applyAllThirdManInFonts: Generated CSS for ${job.type}:`, css);
                                console.log(`applyAllThirdManInFonts: Payload for ${job.type}:`, payload);
                                return insertCSSInTargetTab({ code: css }).then(() => {
                                    console.log(`applyAllThirdManInFonts: Successfully applied CSS for ${job.type}`);
                                    appliedCssActive[job.type] = css;
                                    return true;
                                }).catch(error => {
                                    console.error(`applyAllThirdManInFonts: insertCSS failed for ${job.type}:`, error);
                                    return false;
                                });
                            }
                            return false;
                        });
                    }).catch(error => {
                        console.error(`applyAllThirdManInFonts: Element walker failed for ${job.type}:`, error);
                        return false;
                    });
                });
            });

                return Promise.all(cssPromises);
            });
        }).then(() => {
                // Step 5: Update UI state
                saveExtensionState();
                console.log('applyAllThirdManInFonts: OPTIMIZED Apply All process completed - used 1 storage write instead of', Object.keys(fontConfigs).length);
            });
        });
    });
}

// Count differences between current Third Man In settings and applied state
function countThirdManInDifferences() {
    console.log('countThirdManInDifferences: Starting count');
    const types = ['serif', 'sans', 'mono'];
    let changeCount = 0;

    return getActiveOrigin().then(origin => {
        console.log('countThirdManInDifferences: Origin:', origin);

        // Check each type individually in Third Man In mode
        // Use the consolidated storage system
        return getApplyMapForOrigin(origin).then(domainData => {
            const appliedSerif = domainData ? domainData.serif : null;
            const appliedSans = domainData ? domainData.sans : null;
            const appliedMono = domainData ? domainData.mono : null;

            console.log('countThirdManInDifferences: Applied configs:', {
                serif: appliedSerif,
                sans: appliedSans,
                mono: appliedMono
            });

            // Also check if Body mode has applied fonts (which affects all types)
            const appliedBody = domainData ? domainData.body : null;
            console.log('countThirdManInDifferences: Applied body:', appliedBody);

            // Check if domain has any applied fonts (from either mode)
            const domainHasAppliedFonts = appliedSerif || appliedSans || appliedMono || appliedBody;
            console.log('countThirdManInDifferences: domainHasAppliedFonts:', domainHasAppliedFonts);

            // Check if current settings have any non-defaults
            let currentHasNonDefaults = false;

            for (const type of types) {
                const current = getCurrentUIConfig(type);
                const applied = domainData ? domainData[type] : null;

                // Font is considered default/unset if config is missing or has no meaningful properties
                const isDefaultFont = !current || (!current.fontName && !current.fontSize && !current.fontWeight && !current.lineHeight && !current.fontColor);

                console.log(`countThirdManInDifferences: ${type} current:`, current);
                console.log(`countThirdManInDifferences: ${type} applied:`, applied);
                console.log(`countThirdManInDifferences: ${type} isDefaultFont:`, isDefaultFont);

                // Check if current state differs from applied state
                let isDifferent = false;

                if (isDefaultFont) {
                    // Current is default - difference only if something is applied
                    isDifferent = !!applied;
                } else {
                    // Current is non-default - difference if nothing applied or different config applied
                    if (!applied) {
                        isDifferent = true;
                    } else {
                        // Convert applied payload back to flattened config format for comparison
                        const appliedConfig = applied ? {
                            fontName: applied.fontName || null,
                            variableAxes: applied.variableAxes || {}  // Keep fallback for old storage
                        } : null;

                        // Add flattened basic control properties (only if they exist)
                        if (applied && appliedConfig) {
                            if (applied.fontSize) appliedConfig.fontSize = applied.fontSize;
                            if (applied.lineHeight) appliedConfig.lineHeight = applied.lineHeight;
                            if (applied.fontWeight) appliedConfig.fontWeight = applied.fontWeight;
                            if (applied.fontColor) appliedConfig.fontColor = applied.fontColor;
                            if (applied.fontFaceRule) appliedConfig.fontFaceRule = applied.fontFaceRule;
                        }

                        // Use same comparison logic as body mode
                        isDifferent = !configsEqual(current, appliedConfig);
                    }
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
        });
    }).catch(error => {
        console.error('Error counting differences:', error);
        // Fallback to simple logic
        for (const type of types) {
            const current = getCurrentUIConfig(type);

            // Font is considered default/unset if config is missing or has no meaningful properties
            const isDefaultFont = !current || (!current.fontName && !current.fontSize && !current.fontWeight && !current.lineHeight && !current.fontColor);

            if (!isDefaultFont) {
                changeCount++;
            }
        }
        return changeCount;
    });
}

// Apply panel configuration based on current mode
function applyPanelConfiguration(panelId) {
    console.log(`applyPanelConfiguration: Starting for panelId: ${panelId}, mode: ${currentViewMode}`);
    const currentMode = currentViewMode;
    const config = getCurrentUIConfig(panelId);

    // Body mode can apply font size/weight/color changes even without selecting a specific font
    if (!config) {
        console.log('applyPanelConfiguration: No config found');
        return Promise.resolve(false);
    }

    // Allow configurations with font properties even without fontName for body and third-man-in modes
    if (!config.fontName) {
        const hasOtherProperties = config.fontSize || config.fontWeight || config.lineHeight || config.fontColor;
        if (!hasOtherProperties) {
            console.log('applyPanelConfiguration: No valid config found (needs fontName or other properties)');
            return Promise.resolve(false);
        }
        console.log(`applyPanelConfiguration: Allowing ${panelId} with properties but no fontName:`, config);
    }

    if (currentMode === 'third-man-in') {
        // Use Third Man In specific application
        if (['serif', 'sans', 'mono'].includes(panelId)) {
            console.log(`applyPanelConfiguration: Applying ${panelId} with config:`, config);
            return applyThirdManInFont(panelId, config);
        }
    } else if (currentMode === 'body-contact' && panelId === 'body') {
        // Use body application logic
        console.log(`applyPanelConfiguration: Applying body with config:`, config);
        return applyFontToPage('body', config);
    } else if (currentMode === 'faceoff') {
        // Use face-off application logic
        if (panelId === 'serif') {
            console.log(`applyPanelConfiguration: Applying top/serif with config:`, config);
            return applyFontToPage('top', config);
        } else if (panelId === 'sans') {
            console.log(`applyPanelConfiguration: Applying bottom/sans with config:`, config);
            return applyFontToPage('bottom', config);
        }
    }

    return Promise.resolve(false);
}

function unapplyPanelConfiguration(panelId) {
    console.log(`unapplyPanelConfiguration: Starting for panelId: ${panelId}, mode: ${currentViewMode}`);
    const currentMode = currentViewMode;

    if (currentMode === 'third-man-in') {
        // Use Third Man In specific unapplication
        if (['serif', 'sans', 'mono'].includes(panelId)) {
            console.log(`unapplyPanelConfiguration: Unapplying ${panelId}`);
            return unapplyThirdManInFont(panelId);
        }
    } else if (currentMode === 'body-contact' && panelId === 'body') {
        // Use body unapplication logic
        console.log(`unapplyPanelConfiguration: Unapplying body`);
        return unapplyFontFromPage('body');
    } else if (currentMode === 'faceoff') {
        // Use face-off unapplication logic
        if (panelId === 'serif') {
            console.log(`unapplyPanelConfiguration: Unapplying top/serif`);
            return unapplyFontFromPage('top');
        } else if (panelId === 'sans') {
            console.log(`unapplyPanelConfiguration: Unapplying bottom/sans`);
            return unapplyFontFromPage('bottom');
        }
    }

    return Promise.resolve(false);
}

// Function to be called whenever any control changes in Body Contact or Third Man In modes
function onPanelControlChange(panelId) {
    // Only update button states for the new modes, but skip body (has its own button logic)
    if (['serif', 'mono', 'sans'].includes(panelId)) {
        // Debounce the update to avoid excessive calls
        const debouncedUpdate = debounce(async () => await updateAllThirdManInButtons(panelId), 300);
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

function updateFontComparisonLayout() {
    const fontComparison = document.getElementById('font-comparison');
    if (!fontComparison) return;

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

// Track last changed panel for Third Man In mode button visibility
let lastChangedThirdManInPanel = null;

// Centralized Third Man In button management - shows buttons only in last changed panel
async function updateAllThirdManInButtons(triggeringPanel = null) {
    if (currentViewMode !== 'third-man-in') return;

    // Update last changed panel if provided
    if (triggeringPanel && ['serif', 'sans', 'mono'].includes(triggeringPanel)) {
        lastChangedThirdManInPanel = triggeringPanel;
    }

    await Promise.all(['serif', 'sans', 'mono'].map(async (panelId) => {
        const applyBtn = document.getElementById(`apply-${panelId}`);
        const resetBtn = document.getElementById(`reset-${panelId}`);

        if (!applyBtn || !resetBtn) return;

        // Only show buttons in the last changed panel
        const shouldShowButtonsInThisPanel = (panelId === lastChangedThirdManInPanel);

        if (!shouldShowButtonsInThisPanel) {
            // Hide buttons in all panels except the last changed one
            applyBtn.style.display = 'none';
            resetBtn.style.display = 'none';
            return;
        }

        // Show buttons in the last changed panel based on state
        const changeCount = await countThirdManInDifferences();
        const allDefaults = !getCurrentUIConfig('serif') && !getCurrentUIConfig('sans') && !getCurrentUIConfig('mono');

        let domainHasFonts = false;
        if (changeCount === 0) {
            const origin = await getActiveOrigin();
            const domainData = await getApplyMapForOrigin(origin);
            domainHasFonts = !!(domainData && (domainData.serif || domainData.sans || domainData.mono));
        }

        const state = determineButtonState(changeCount, allDefaults, domainHasFonts);

        if (state.action === 'apply') {
            applyBtn.style.display = 'block';
            applyBtn.textContent = state.changeCount > 1 ? `Apply All (${state.changeCount})` : 'Apply All';
            resetBtn.style.display = 'none';
        } else if (state.action === 'reset') {
            applyBtn.style.display = 'none';
            resetBtn.style.display = 'block';
            resetBtn.textContent = 'Reset All';
        } else {
            applyBtn.style.display = 'none';
            resetBtn.style.display = 'none';
        }
    }));
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
function hideApplyLoading(panelId) {
    const applyBtn = document.getElementById(`apply-${panelId}`);
    if (applyBtn) {
        applyBtn.disabled = false;
        // Button text will be updated by appropriate button function
        if (panelId === 'body') {
            return updateBodyButtons();
        } else if (['serif', 'sans', 'mono'].includes(panelId)) {
            return updateAllThirdManInButtons(panelId);
        }
    }
    return Promise.resolve();
}

// Reset functionality for Body Contact and Third Man In modes
function resetPanelSettings(panelId) {
    console.log('resetPanelSettings called for panelId:', panelId);

    if (currentViewMode === 'third-man-in') {
        // Third Man In mode: Reset All strategy
        return resetAllThirdManInFonts().then(() => {
            // Clear cached extension state to ensure UI shows defaults
            if (extensionState && extensionState[currentViewMode]) {
                console.log('🔄 resetPanelSettings: Clearing cached extension state after reset');
                delete extensionState[currentViewMode].serif;
                delete extensionState[currentViewMode].sans;
                delete extensionState[currentViewMode].mono;
            }
            // Update button states for all Third Man In panels
            return updateAllThirdManInButtons();
        });
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

        // Remove font from domain using new unapply function
        console.log('Calling unapplyPanelConfiguration');
        return unapplyPanelConfiguration(panelId).then(() => {
            // Update button state
            if (panelId === 'body') {
                console.log('Calling updateBodyButtons');
                return updateBodyButtons();
            } else if (['serif', 'sans', 'mono'].includes(panelId)) {
                console.log('Calling updateAllThirdManInButtons');
                return updateAllThirdManInButtons(panelId);
            }
            return Promise.resolve();
        }).catch(error => {
            console.error('Error in resetPanelSettings:', error);
        }).finally(() => {
            // Hide loading state - but only for non-Third-Man-In modes
            // Third Man In mode buttons are handled by updateAllThirdManInButtons()
            if (currentViewMode !== 'third-man-in') {
                const resetBtn = document.getElementById(`reset-${panelId}`);
                // Only restore button state if it's still visible (updateBodyButtons may have hidden it)
                if (resetBtn && resetBtn.style.display !== 'none') {
                    resetBtn.textContent = 'Reset';
                    resetBtn.disabled = false;
                }
            }
        });
    }
}

// Reset All fonts for Third Man In mode
function resetAllThirdManInFonts() {
    const types = ['serif', 'sans', 'mono'];

    // Process types sequentially to avoid conflicts
    let promise = Promise.resolve();
    for (const type of types) {
        promise = promise.then(() => {
            unsetAllPanelControls(type);
            return unapplyThirdManInFont(type);
        });
    }

    return promise;
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
        // Set heading to position name (Serif, Sans, Mono) instead of "Default"
        fontNameElement.textContent = panelId.charAt(0).toUpperCase() + panelId.slice(1);
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
        delete extensionState[currentViewMode].bodyFont;
        // Active axes will be derived from UI state
        // Save the cleared state to UI storage
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
        if (bodyLineHeightSlider) bodyLineHeightSlider.value = 1.5;
        if (bodyLineHeightText) bodyLineHeightText.value = 1.5;
        if (bodyLineHeightValue) bodyLineHeightValue.textContent = '1.5';
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

// Debounce helper
function debounce(fn, wait) {
    let t = null; return function(...args){ clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
}

// Numeric Modal Functionality
let currentNumericInput = null;
let isApplying = false;
let originalValue = null;
let originalControlState = null; // Store if control group was active/inactive

function initializeNumericModal() {
    const modal = document.getElementById('numeric-modal');
    const display = document.getElementById('numeric-input');
    const closeBtn = document.getElementById('numeric-modal-close');
    const applyBtn = document.getElementById('numeric-apply');
    const keypadBtns = document.querySelectorAll('.numeric-btn');

    // Handle numeric trigger clicks
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('numeric-trigger')) {
            e.preventDefault();
            e.stopImmediatePropagation(); // Stop other handlers from firing

            // Debug: Check control state before opening modal
            const controlGroup = e.target.closest('.control-group');
            const wasUnsetBeforeClick = controlGroup ? controlGroup.classList.contains('unset') : false;
            console.log('🖱️ Numeric input clicked, control was unset:', wasUnsetBeforeClick);

            showNumericModal(e.target);
        }
    }, true); // Use capture phase to catch it before other handlers

    // Handle keypad button clicks
    keypadBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const value = this.getAttribute('data-value');
            const action = this.getAttribute('data-action');

            if (action === 'backspace') {
                const current = display.value;
                display.value = current.slice(0, -1);
            } else if (action === 'apply') {
                // Handle enter key - same as apply button
                console.log('✅ Enter key pressed - applying value');
                if (currentNumericInput && display.value !== '') {
                    const newValue = parseFloat(display.value);
                    if (!isNaN(newValue)) {
                        isApplying = true;
                        applyNumericValue(currentNumericInput, newValue);
                    }
                }
                hideNumericModal();
            } else if (value) {
                // Check if text is selected (user wants to replace it)
                const selStart = display.selectionStart;
                const selEnd = display.selectionEnd;
                const hasSelection = selStart !== selEnd;

                if (hasSelection) {
                    // Replace selected text with new value
                    display.value = value;
                } else {
                    // Prevent multiple decimal points when appending
                    if (value === '.' && display.value.includes('.')) {
                        return;
                    }
                    display.value += value;
                }

                // Position cursor at end
                setTimeout(() => {
                    display.setSelectionRange(display.value.length, display.value.length);
                }, 0);
            }
        });
    });

    // Handle apply button
    applyBtn.addEventListener('click', function() {
        console.log('✅ Apply button clicked - applying value');
        if (currentNumericInput && display.value !== '') {
            const newValue = parseFloat(display.value);
            if (!isNaN(newValue)) {
                isApplying = true;
                applyNumericValue(currentNumericInput, newValue);
            }
        }
        hideNumericModal();
    });

    // Handle close button - explicitly cancel without applying
    closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('🚫 Close button clicked - canceling without applying');
        cancelNumericModal();
    });

    // Handle modal backdrop click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            console.log('🚫 Backdrop clicked - canceling without applying');
            cancelNumericModal();
        }
    });

    // Handle escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('visible')) {
            console.log('🚫 Escape pressed - canceling without applying');
            cancelNumericModal();
        }
    });
}

function showNumericModal(input) {
    const modal = document.getElementById('numeric-modal');
    const display = document.getElementById('numeric-input');
    const title = document.getElementById('numeric-modal-title');

    currentNumericInput = input;

    // Store original value and control state for cancel restoration
    originalValue = input.value.replace('px', '');

    // Find the control group and store its active state
    const controlGroup = input.closest('.control-group');
    originalControlState = {
        wasUnset: controlGroup ? controlGroup.classList.contains('unset') : false,
        controlGroup: controlGroup
    };
    console.log('💾 Stored original state:', { originalValue, originalControlState });

    // Set modal title based on input type
    const type = input.getAttribute('data-type');
    const position = input.getAttribute('data-position');
    const axis = input.getAttribute('data-axis');

    if (type === 'fontSize') {
        title.textContent = `Font Size (${position})`;
    } else if (type === 'lineHeight') {
        title.textContent = `Line Height (${position})`;
    } else if (type === 'variableAxis') {
        title.textContent = `${axis} (${position})`;
    } else {
        title.textContent = 'Enter Value';
    }

    // Set initial value (remove 'px' suffix if present)
    let initialValue = input.value.replace('px', '');
    display.value = initialValue;

    // Show modal
    modal.classList.add('visible');

    // Focus on the display input and select all text for easy replacement
    setTimeout(() => {
        display.focus();
        display.select(); // Select all text
    }, 100);
}

function hideNumericModal() {
    const modal = document.getElementById('numeric-modal');
    modal.classList.remove('visible');
    currentNumericInput = null;
    originalValue = null;
    originalControlState = null;
    isApplying = false; // Reset the flag
}

function cancelNumericModal() {
    console.log('🚫 cancelNumericModal: Canceling without applying changes');

    // On cancel: Don't change ANY values - just restore the original control state
    if (originalControlState && originalControlState.controlGroup) {
        console.log('🚫 Cancel: Only restoring control state, not changing any values');

        if (originalControlState.wasUnset) {
            console.log('🔄 Restoring control to unset state');
            originalControlState.controlGroup.classList.add('unset');
            console.log('🔍 Control classes after adding unset:', originalControlState.controlGroup.className);
        } else {
            console.log('🔄 Restoring control to active state');
            originalControlState.controlGroup.classList.remove('unset');
            console.log('🔍 Control classes after removing unset:', originalControlState.controlGroup.className);
        }
    }

    isApplying = false; // Explicitly set to false before hiding
    hideNumericModal();
}

function applyNumericValue(input, value) {
    console.log('🔧 applyNumericValue called with isApplying:', isApplying, 'value:', value);

    // Only apply if we're actually applying (not canceling)
    if (!isApplying) {
        console.log('🚫 applyNumericValue: Skipping apply because isApplying is false');
        return;
    }

    console.log('✅ applyNumericValue: Proceeding with apply');

    const type = input.getAttribute('data-type');
    const position = input.getAttribute('data-position');
    const axis = input.getAttribute('data-axis');

    // Update the input value
    if (type === 'fontSize') {
        input.value = value;
        // Also update the corresponding slider
        const slider = document.getElementById(`${position}-font-size`);
        if (slider) {
            slider.value = value;
            // Trigger the slider's change event to update everything
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } else if (type === 'lineHeight') {
        input.value = value;
        // Also update the corresponding slider
        const slider = document.getElementById(`${position}-line-height`);
        if (slider) {
            slider.value = value;
            // Trigger the slider's change event to update everything
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } else if (type === 'variableAxis') {
        input.value = value;
        // Also update the corresponding axis slider
        const slider = document.getElementById(`${position}-${axis}`);
        if (slider) {
            slider.value = value;
            // Trigger the slider's change event to update everything
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
}

// Initialize numeric modal when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeNumericModal();
});
