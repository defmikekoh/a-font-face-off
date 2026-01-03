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

function getPanelLabel(position) {
    if (position === 'body') return 'Body';
    if (position === 'top') return 'Top';
    if (position === 'bottom') return 'Bottom';
    if (position === 'serif') return 'Serif';
    if (position === 'sans') return 'Sans';
    if (position === 'mono') return 'Mono';
    return position; // fallback
}

function determineGenericFontFamily(fontName) {
    if (!fontName) return Promise.resolve('sans-serif'); // Default fallback

    const name = fontName.toLowerCase();

    // Load user-configured known fonts using .then() pattern
    return browser.storage.local.get(['affoKnownSerif', 'affoKnownSans']).then(data => {
        const knownSerif = Array.isArray(data.affoKnownSerif) ? data.affoKnownSerif.map(s => String(s || '').toLowerCase().trim()) : ['pt serif'];
        const knownSans = Array.isArray(data.affoKnownSans) ? data.affoKnownSans.map(s => String(s || '').toLowerCase().trim()) : [];

        // Check user-configured known fonts first
        if (knownSerif.some(serif => name.includes(serif))) {
            return 'serif';
        }
        if (knownSans.some(sans => name.includes(sans))) {
            return 'sans-serif';
        }

        // Monospace patterns
        if (/\b(mono|code|courier|consolas)\b/i.test(name) ||
            /dejavu sans mono|fira code|source code/i.test(name)) {
            return 'monospace';
        }

        // Sans-serif patterns (check before serif to avoid "sans serif" fonts being misclassified)
        if (/\bsans.serif\b/i.test(name) || /\bsans\b/i.test(name)) {
            return 'sans-serif';
        }

        // Built-in serif patterns (excluding sans-serif)
        if (/\bserif\b/i.test(name.replace(/sans.serif/gi, '')) ||
            /\b(times|georgia|book|antiqua|roman|baskerville|caslon|garamond|minion|palatino|trajan)\b/i.test(name) ||
            /reith serif|noto serif|pt serif/i.test(name)) {
            return 'serif';
        }

        // Default to sans-serif for everything else
        return 'sans-serif';
    }).catch(error => {
        console.warn('Error loading font family config:', error);
        // Fallback logic when storage fails
        if (/\b(mono|code|courier)\b/i.test(name)) {
            return 'monospace';
        }
        if (/\bsans.serif\b/i.test(name) || /\bsans\b/i.test(name)) {
            return 'sans-serif';
        }
        if (/\bserif\b/i.test(name.replace(/sans.serif/gi, '')) ||
            /\b(times|georgia)\b/i.test(name) ||
            /reith serif|noto serif|pt serif/i.test(name)) {
            return 'serif';
        }
        return 'sans-serif';
    });
}

function getSiteSpecificRules(fontType, otherProps, hostname = null) {
    // If no hostname provided, try to get it from the active tab
    // For now, we'll focus on Wikipedia rules since that's what we've tested
    if (hostname && hostname.includes('wikipedia.org')) {
        // High-specificity Wikipedia rules that we know work
        return `html.mf-font-size-clientpref-small body.skin-minerva .content p[data-affo-font-type="${fontType}"], html.mf-font-size-clientpref-small body.skin-minerva .content span[data-affo-font-type="${fontType}"], html.mf-font-size-clientpref-small body.skin-minerva .content li[data-affo-font-type="${fontType}"] { ${otherProps.join('; ')}; }`;
    }

    // No site-specific rules for other sites yet
    return null;
}

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
                    const builtConfig = buildConfigFromPayload('body', config);
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
                            const config = buildConfigFromPayload(type, domainData[type]);
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

// Reset face-off for a panel: remove stored per-origin data, remove injected CSS, and unset controls (keep family)
function resetFaceoffFor(position) {
    const genericKey = (position === 'top') ? 'serif' : 'sans';

    return getActiveOrigin().then(origin => {
        // Remove injected CSS (immediate apply) if present
        const cssPromises = [];

        if (appliedCssActive && appliedCssActive[genericKey]) {
            cssPromises.push(
                browser.tabs.removeCSS({ code: appliedCssActive[genericKey] }).then(() => {
                    appliedCssActive[genericKey] = null;
                }).catch(() => {})
            );
        }

        const styleIdOff = 'a-font-face-off-style-' + genericKey;
        const linkIdOff = styleIdOff + '-link';
        cssPromises.push(
            executeScriptInTargetTab({ code: `
                (function(){
                    try{ var s=document.getElementById('${styleIdOff}'); if(s) s.remove(); }catch(_){}
                    try{ var l=document.getElementById('${linkIdOff}'); if(l) l.remove(); }catch(_){}
                })();
            `}).catch(() => {})
        );

        return Promise.all(cssPromises).then(() => {
            // Remove stored persistence for this origin/role
            if (origin) {
                return clearApplyMapForOrigin(origin, fontType).catch(() => {});
            }
        }).then(() => {
            // Unset controls (keep family) - face-off mode only supports top/bottom
            if (position === 'top') {
                resetTopFont();
            } else if (position === 'bottom') {
                resetBottomFont();
            }

            // Reflect buttons
            const buttonPromises = [
                syncApplyButtonsForOrigin().catch(() => {})
            ];

            if (currentViewMode === 'third-man-in') {
                buttonPromises.push(syncThirdManInButtons().catch(() => {}));
            }

            return Promise.all(buttonPromises);
        });
    }).catch(() => {});
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

// Custom font definitions are loaded from custom-fonts.css.
let CUSTOM_FONTS = [];
let fontDefinitions = {};
let customFontsCssText = '';
let customFontsLoaded = false;
let customFontsPromise = null;

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
        defs[name] = {
            axes: [],
            defaults: {},
            ranges: {},
            steps: {},
            fontFaceRule: byName.get(name).join('\n')
        };
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
                const parsed = parseCustomFontsFromCss(customFontsCssText);
                CUSTOM_FONTS = parsed.names;
                fontDefinitions = parsed.defs;
                customFontsLoaded = true;
            } catch (e) {
                console.warn('Failed to load custom fonts CSS:', e);
                CUSTOM_FONTS = [];
                fontDefinitions = {};
                customFontsCssText = '';
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

// Helper function to get current panel font configuration
function getPanelFontConfig(panelId) {
    return getCurrentUIConfig(panelId);
}

// Function to update body apply/reset button visibility
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

        if (changeCount > 0) {
            // Check if all UI changes are actually defaults (Reset case)
            const allDefaults = !currentConfig; // currentConfig is undefined when UI shows "Default"

            if (allDefaults) {
                // Special case: changeCount > 0 but UI is default - show Reset
                if (applyBtn) applyBtn.style.display = 'none';
                if (resetBtn) {
                    resetBtn.style.display = 'block';
                    resetBtn.textContent = 'Reset';
                    resetBtn.disabled = false;
                }
            } else {
                // Normal case: UI differs from applied - show Apply button
                if (applyBtn) {
                    applyBtn.style.display = 'block';
                    applyBtn.textContent = 'Apply';
                    applyBtn.disabled = false;
                }
                if (resetBtn) resetBtn.style.display = 'none';
            }
        } else {
            // changeCount === 0 - check if domain has applied state
            if (domainHasAppliedState) {
                // No changes but domain has applied state - show Reset button
                if (applyBtn) applyBtn.style.display = 'none';
                if (resetBtn) {
                    resetBtn.style.display = 'block';
                    resetBtn.textContent = 'Reset';
                    resetBtn.disabled = false;
                }
            } else {
                // No changes and no applied state - hide both buttons
                if (applyBtn) applyBtn.style.display = 'none';
                if (resetBtn) resetBtn.style.display = 'none';
            }
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
    const currentAxes = config1.variableAxes || {};
    const currentActiveAxes = getActiveAxesFromVariableAxes(currentAxes);

    // Compare variable axes (using variableAxes format only)
    const appliedAxes = config2.variableAxes || {};
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

// Function to update body mode preview without applying to domain
// Update font previews for Body mode (analogous to updateThirdManInPreview)
function updateBodyPreview() {
    const textElement = document.getElementById('body-font-text');
    const nameElement = document.getElementById('body-font-name');

    if (!textElement || !nameElement) return;

    const cfg = getCurrentUIConfig('body');
    if (!cfg) {
        // No font selected - show default
        nameElement.textContent = 'Default';
        textElement.style.cssText = 'font-family: serif;';
        return;
    }

    // Update font name display
    nameElement.textContent = cfg.fontName || 'Default';

    // Build font-family CSS - body mode uses serif fallback
    const fontFamily = cfg.fontName ? `"${cfg.fontName}", serif` : 'serif';

    // Apply styles to preview text (same pattern as updateThirdManInPreview)
    let style = `font-family: ${fontFamily};`;

    if (cfg.fontSize) style += ` font-size: ${cfg.fontSize}px;`;
    if (cfg.lineHeight) style += ` line-height: ${cfg.lineHeight};`;
    if (cfg.fontWeight) style += ` font-weight: ${cfg.fontWeight};`;
    if (cfg.fontColor) style += ` color: ${cfg.fontColor};`;

    // Add variable font settings if available
    if (cfg.variableAxes && Object.keys(cfg.variableAxes).length > 0) {
        const varSettings = Object.entries(cfg.variableAxes)
            .map(([axis, value]) => `"${axis}" ${value}`)
            .join(', ');

        if (varSettings) {
            style += ` font-variation-settings: ${varSettings};`;
        }
    }

    textElement.style.cssText = style;
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
    'body-contact': {},
    faceoff: {},
    'third-man-in': {}
};

// Load favorites from browser.storage.local
function loadFavoritesFromStorage() {
    return browser.storage.local.get(['affoFavorites', 'affoFavoritesOrder']).then(result => {
        if (result.affoFavorites) {
            savedFavorites = result.affoFavorites || {};
            savedFavoritesOrder = result.affoFavoritesOrder || Object.keys(savedFavorites);
        } else {
            savedFavorites = {};
            savedFavoritesOrder = [];
        }
    }).catch(error => {
        console.error('Error loading favorites:', error);
        savedFavorites = {};
        savedFavoritesOrder = [];
    });
}

// Save favorites to browser.storage.local
function saveFavoritesToStorage() {
    // Keep order aligned to existing keys
    const cleaned = savedFavoritesOrder.filter(name => savedFavorites[name] !== undefined);
    savedFavoritesOrder = cleaned;
    return browser.storage.local.set({
        affoFavorites: savedFavorites,
        affoFavoritesOrder: cleaned
    }).catch(error => {
        console.error('Error saving favorites:', error);
    });
}

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

    if (currentViewMode === 'body-contact') {
        // Body Contact mode - save single panel
        const bodyConfig = getCurrentUIConfig('body');
        if (bodyConfig) {
            extensionState[currentViewMode].bodyFont = bodyConfig;
        } else {
            delete extensionState[currentViewMode].bodyFont;
        }
    } else if (currentViewMode === 'third-man-in') {
        // Third Man In mode - save multiple panels
        const serifConfig = getCurrentUIConfig('serif');
        const sansConfig = getCurrentUIConfig('sans');
        const monoConfig = getCurrentUIConfig('mono');

        if (serifConfig) {
            extensionState[currentViewMode].serifFont = serifConfig;
        } else {
            delete extensionState[currentViewMode].serifFont;
        }
        if (sansConfig) {
            extensionState[currentViewMode].sansFont = sansConfig;
        } else {
            delete extensionState[currentViewMode].sansFont;
        }
        if (monoConfig) {
            extensionState[currentViewMode].monoFont = monoConfig;
        } else {
            delete extensionState[currentViewMode].monoFont;
        }
    } else {
        // Face-off mode
        const getFaceoffFallbackConfig = (position) => {
            const display = document.getElementById(`${position}-font-display`);
            const name = display ? String(display.textContent || '').trim() : '';
            if (!name || name.toLowerCase() === 'default') return undefined;
            return { fontName: name, variableAxes: {} };
        };

        const topConfig = getCurrentUIConfig('top') || getFaceoffFallbackConfig('top');
        const bottomConfig = getCurrentUIConfig('bottom') || getFaceoffFallbackConfig('bottom');
        console.log('saveExtensionStateImmediate: faceoff configs', { topConfig, bottomConfig });

        if (topConfig) {
            extensionState[currentViewMode].topFont = topConfig;
        } else {
            delete extensionState[currentViewMode].topFont;
        }
        if (bottomConfig) {
            extensionState[currentViewMode].bottomFont = bottomConfig;
        } else {
            delete extensionState[currentViewMode].bottomFont;
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
    if (config && config.fontColor) active.add('color');
    return active;
}

function getActiveAxesFromVariableAxes(variableAxes) {
    return new Set(Object.keys(variableAxes || {}));
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
    if (activeColor) config.fontColor = fontColor;

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

// Convert savedEntry (storage format) to config format
function savedEntryToConfig(savedEntry) {
    if (!savedEntry) return null;

    const config = {
        fontName: savedEntry.fontName || null,
        variableAxes: savedEntry.variableAxes || {}
    };

    // Only include properties that have values (no key approach)
    // Handle both fontSizePx and fontSize property names for compatibility
    const savedFontSize = savedEntry.fontSizePx !== null && savedEntry.fontSizePx !== undefined ? savedEntry.fontSizePx : savedEntry.fontSize;
    if (savedFontSize !== null && savedFontSize !== undefined) config.fontSize = savedFontSize;
    if (savedEntry.lineHeight !== null && savedEntry.lineHeight !== undefined) config.lineHeight = savedEntry.lineHeight;
    if (savedEntry.fontWeight !== null && savedEntry.fontWeight !== undefined) config.fontWeight = savedEntry.fontWeight;
    if (savedEntry.fontColor !== null && savedEntry.fontColor !== undefined) config.fontColor = savedEntry.fontColor;

    return config;
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
    const activeControls = getActiveControlsFromConfig(uiConfig);
    if (!uiConfig || activeControls.size === 0) {
        return null;
    }

    // Merge: Start with applied config, override with active UI controls (flattened structure)
    const merged = {
        fontName: uiConfig.fontName || appliedConfig.fontName,
        variableAxes: { ...appliedConfig.variableAxes }
    };

    // Copy applied config font properties
    if (appliedConfig.fontSize) merged.fontSize = appliedConfig.fontSize;
    if (appliedConfig.lineHeight) merged.lineHeight = appliedConfig.lineHeight;
    if (appliedConfig.fontWeight) merged.fontWeight = appliedConfig.fontWeight;
    if (appliedConfig.fontColor) merged.fontColor = appliedConfig.fontColor;

    // Override with active UI controls (UI config already only has active properties)
    if (uiConfig.fontSize !== undefined) merged.fontSize = uiConfig.fontSize;
    if (uiConfig.lineHeight !== undefined) merged.lineHeight = uiConfig.lineHeight;
    if (uiConfig.fontWeight !== undefined) merged.fontWeight = uiConfig.fontWeight;
    if (uiConfig.fontColor !== undefined) merged.fontColor = uiConfig.fontColor;

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
        loadFont(position, config.fontName, { suppressImmediateApply: true, suppressImmediateSave: true });
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
        if (config.fontColor && fontColorControl) {
            fontColorControl.value = config.fontColor;
        }
        // When no color is saved, leave the input at its default - it will be marked as unset anyway

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


        // Apply the font
        applyFont(position);

        // Update preview to reflect restored settings
        if (position === 'body') {
            updateBodyPreview();
        } else if (['serif', 'sans', 'mono'].includes(position)) {
            updateThirdManInPreview(position);
        }

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
        await ensureCustomFontsLoaded();
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

    // Use CUSTOM_FONTS for pinned custom fonts

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
        await ensureCustomFontsLoaded();
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
        CUSTOM_FONTS.forEach(f => { set.add(f); list.push(f); });
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
            .filter(n => !CUSTOM_FONTS.includes(n)); // avoid duplicate with custom section
        if (favFiltered.length) {
            sections.set('Favorites', favFiltered);
        }

        // Remaining items grouped by letter (Pinned handled as its own key)
        const favSet = new Set(favFiltered);
        const addItem = (name) => {
            const key = CUSTOM_FONTS.includes(name) ? 'Pinned' : firstLetter(name);
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

async function selectFont(name) {
    // Prevent font selection during initialization
    if (!initializationComplete) {
        console.log(`selectFont: Ignoring font selection "${name}" - initialization still in progress`);
        return;
    }

    console.log(`selectFont: Selecting "${name}" for position "${currentPosition}"`);

    try {
        // Display element is now the source of truth - no need to manage select options
        const displayEl = document.getElementById(`${currentPosition}-font-display`);
        if (displayEl) {
            // Check selector before updating display
            const selectElBefore = document.getElementById(`${currentPosition}-font-select`);
            console.log(`selectFont: Before updating display, ${currentPosition}-font-select.value = "${selectElBefore ? selectElBefore.value : 'null'}"`);

            displayEl.textContent = name;

            // Check selector immediately after setting display text
            const selectElAfter = document.getElementById(`${currentPosition}-font-select`);
            console.log(`selectFont: After setting display text, ${currentPosition}-font-select.value = "${selectElAfter ? selectElAfter.value : 'null'}"`);

            // Handle Default vs specific font styling
            if (name === 'Default') {
                displayEl.classList.add('placeholder');
                const group = displayEl.closest('.control-group');
                if (group) group.classList.add('unset');
            } else {
                displayEl.classList.remove('placeholder');
                const group = displayEl.closest('.control-group');
                if (group) group.classList.remove('unset');
            }
            console.log(`selectFont: Updated ${currentPosition}-font-display to "${name}"`);
        }

        // For body mode, update preview and buttons after font selection
        if (currentPosition === 'body') {
            // Check selector value right before updateBodyButtons
            const checkEl = document.getElementById('body-font-select');
            console.log(`selectFont: Right before updateBodyButtons, body-font-select.value = "${checkEl ? checkEl.value : 'null'}"`);

            // Also check what getCurrentUIConfig returns
            const config = getCurrentUIConfig('body');
            console.log(`selectFont: getCurrentUIConfig('body') returns:`, config);

            // Load font CSS for preview and await completion
            if (name) {
                await loadFont('body', name, { suppressImmediateApply: true, suppressImmediateSave: false });
                // Update preview after font is loaded
                updateBodyPreview();
            } else {
                // Update preview immediately if no font to load
                updateBodyPreview();
            }

            // Update buttons after font loading completes
            try {
                await updateBodyButtons();
            } catch (error) {
                console.error('Error updating body buttons after font selection:', error);
            }
        }

        // For Third Man In mode, update the preview instead of calling applyFont
        if (['serif', 'sans', 'mono'].includes(currentPosition)) {
            // Ensure font name heading is updated for Third Man In mode BEFORE loadFont
            const fontNameDisplayElement = document.getElementById(`${currentPosition}-font-name`);
            if (fontNameDisplayElement) {
                console.log(`selectFont: Updating ${currentPosition}-font-name from "${fontNameDisplayElement.textContent}" to "${name}"`);
                // For Default, show the position name (Serif, Sans, Mono) instead of "Default"
                if (name === 'Default') {
                    fontNameDisplayElement.textContent = currentPosition.charAt(0).toUpperCase() + currentPosition.slice(1);
                } else {
                    fontNameDisplayElement.textContent = name;
                }
                console.log(`selectFont: After update, ${currentPosition}-font-name.textContent = "${fontNameDisplayElement.textContent}"`);
            } else {
                console.error(`selectFont: Could not find ${currentPosition}-font-name element!`);
            }

            // Load the font CSS first and await completion
            await loadFont(currentPosition, name, { suppressImmediateApply: true, suppressImmediateSave: false });

            updateThirdManInPreview(currentPosition);

            // Update buttons after operations complete
            try {
                console.log(`selectFont: About to call updateAllThirdManInButtons for ${currentPosition}`);
                await updateAllThirdManInButtons(currentPosition);
                console.log(`selectFont: updateAllThirdManInButtons completed for ${currentPosition}`);
            } catch (error) {
                console.error('Error updating Third Man In buttons after font selection:', error);
            }
        } else {
            // Traditional applyFont for other positions
            await loadFont(currentPosition, name);
        }

        close();

        // Reflect Apply/Update state immediately after changing family (Face-off mode only)
        if (currentViewMode === 'faceoff') {
            try {
                refreshApplyButtonsDirtyState();
            } catch (_) {}
        }

    } catch (error) {
        console.error(`Error selecting font ${name} for ${currentPosition}:`, error);
        throw error;
    }
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

const PRELOAD_MAX_OTHER_SUBSETS = 6;
const PRELOAD_MAX_CONCURRENT_DOWNLOADS = 4;
const PRELOAD_MAX_SUBSET_DOWNLOADS = 16;

function dedupeUrls(urls) {
    if (!Array.isArray(urls) || urls.length === 0) return [];
    const seen = new Set();
    const unique = [];
    urls.forEach((url) => {
        if (!seen.has(url)) {
            seen.add(url);
            unique.push(url);
        }
    });
    return unique;
}

function runWithConcurrency(items, limit, handler) {
    if (!Array.isArray(items) || items.length === 0) return Promise.resolve([]);
    const results = new Array(items.length);
    let nextIndex = 0;
    let inFlight = 0;
    const maxParallel = Math.max(1, limit || 1);

    return new Promise((resolve) => {
        const launchNext = () => {
            if (nextIndex >= items.length && inFlight === 0) {
                resolve(results);
                return;
            }
            while (inFlight < maxParallel && nextIndex < items.length) {
                const currentIndex = nextIndex++;
                inFlight++;
                Promise.resolve(handler(items[currentIndex], currentIndex))
                    .then((result) => { results[currentIndex] = result; })
                    .catch(() => { results[currentIndex] = false; })
                    .then(() => {
                        inFlight--;
                        launchNext();
                    });
            }
        };
        launchNext();
    });
}

async function filterFontSubsetsForActivePage(fontName, cssText, urls) {
    if (!urls.length) return urls;
    try {
        const response = await sendMessageToTargetTab({
            type: 'affoFilterFontSubsets',
            fontName,
            cssText,
            urls,
            maxUrls: PRELOAD_MAX_SUBSET_DOWNLOADS
        });
        if (response && response.ok && Array.isArray(response.urls) && response.urls.length) {
            if (response.urls.length !== urls.length) {
                console.log(`[AFFO Preload] ${fontName}: Using ${response.urls.length}/${urls.length} subsets based on page text`);
            }
            return response.urls;
        }
        if (response && response.ok && Array.isArray(response.urls)) {
            console.log(`[AFFO Preload] ${fontName}: Page text filter returned 0 subsets, falling back to full list`);
        }
    } catch (error) {
        console.warn(`[AFFO Preload] ${fontName}: Page text filter unavailable, using full list`, error);
    }
    return urls;
}

// Preload all font subsets for a given font (used for eager caching on Apply All)
async function preloadAllFontSubsets(fontName, css2Url) {
    console.log(`[AFFO Preload] Starting preload for ${fontName} with css2Url:`, css2Url);

    try {
        // Step 1: Fetch the Google Fonts CSS to get all WOFF2 URLs
        const cssResponse = await browser.runtime.sendMessage({
            type: 'affoFetch',
            url: css2Url,
            binary: false
        });

        if (!cssResponse || !cssResponse.ok) {
            throw new Error(`Failed to fetch CSS for ${fontName}`);
        }

        const css = cssResponse.data;

        // Step 2: Extract all WOFF2 URLs from the CSS
        const woff2Matches = css.match(/url\(([^)]+\.woff2[^)]*)\)/g);

        if (!woff2Matches || woff2Matches.length === 0) {
            console.warn(`[AFFO Preload] No WOFF2 URLs found in CSS for ${fontName}`);
            return;
        }

        const woff2Urls = woff2Matches.map(match =>
            match.replace(/url\((['"]?)([^'"]+)\1\)/, '$2')
        );

        const uniqueWoff2Urls = dedupeUrls(woff2Urls);
        const filteredWoff2Urls = await filterFontSubsetsForActivePage(fontName, css, uniqueWoff2Urls);
        const subsetUrls = Array.isArray(filteredWoff2Urls) && filteredWoff2Urls.length
            ? filteredWoff2Urls
            : uniqueWoff2Urls;

        console.log(`[AFFO Preload] Found ${subsetUrls.length} WOFF2 files for ${fontName}`);

        // Step 3: Prioritize Latin subsets first, then load others
        const latinUrls = subsetUrls.filter(url =>
            url.includes('latin') && !url.includes('ext')
        );
        const latinExtUrls = subsetUrls.filter(url =>
            url.includes('latin-ext')
        );
        const otherUrls = subsetUrls.filter(url =>
            !url.includes('latin')
        );

        const limitedOtherUrls = otherUrls.slice(0, PRELOAD_MAX_OTHER_SUBSETS);
        if (otherUrls.length > limitedOtherUrls.length) {
            console.log(`[AFFO Preload] Limiting other subsets for ${fontName} to ${limitedOtherUrls.length}/${otherUrls.length} to avoid overload`);
        }

        console.log(`[AFFO Preload] ${fontName}: ${latinUrls.length} Latin, ${latinExtUrls.length} Latin-ext, ${limitedOtherUrls.length}/${otherUrls.length} other subsets`);

        // Step 4: Load Latin first (most critical), then Latin-ext, then others in background
        const loadSubsets = async (urls, label) => {
            if (!urls.length) return [];
            return runWithConcurrency(urls, PRELOAD_MAX_CONCURRENT_DOWNLOADS, async (url) => {
                try {
                    const response = await browser.runtime.sendMessage({
                        type: 'affoFetch',
                        url: url,
                        binary: true
                    });
                    if (response && response.ok) {
                        const status = response.cached ? 'cached' : 'downloaded';
                        console.log(`[AFFO Preload] ${fontName} ${label} subset ${status}:`, url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('.')));
                        return true;
                    }
                    return false;
                } catch (error) {
                    console.warn(`[AFFO Preload] Failed to download ${label} subset:`, url, error);
                    return false;
                }
            });
        };

        // Load Latin subsets first (blocking)
        await loadSubsets(latinUrls, 'Latin');

        // Load Latin-ext in parallel (blocking)
        await loadSubsets(latinExtUrls, 'Latin-ext');

        // Flush the cache immediately to ensure fonts are written to storage
        // This is critical - background.js batches writes with 100ms debounce
        console.log(`[AFFO Preload] ${fontName} - Flushing cache to ensure fonts are persisted...`);
        await browser.runtime.sendMessage({ type: 'flushFontCache' });
        console.log(`[AFFO Preload] ${fontName} - Critical subsets cached and flushed to storage`);

        // Load other subsets in background (non-blocking)
        if (limitedOtherUrls.length > 0) {
            loadSubsets(limitedOtherUrls, 'other').then(async () => {
                console.log(`[AFFO Preload] ${fontName} - All subsets downloaded, flushing...`);
                await browser.runtime.sendMessage({ type: 'flushFontCache' });
                console.log(`[AFFO Preload] ${fontName} - All subsets cached and flushed`);
            });
        }

    } catch (error) {
        console.error(`[AFFO Preload] Error preloading ${fontName}:`, error);
        throw error;
    }
}

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
function buildCss2Url(fontName, fontConfig) {
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



// Generate CSS string from payload object for body mode
function generateBodyCSS(payload, position) {
    if (!payload) return '';

    // Check if there's anything meaningful to apply
    const hasAnyProperties = payload.fontName || payload.fontSize || payload.lineHeight || payload.fontWeight || payload.fontColor || (payload.variableAxes && Object.keys(payload.variableAxes).length > 0);
    if (!hasAnyProperties) return '';

    // Determine generic family based on position
    let generic;
    if (position === 'body') {
        generic = 'serif';
    } else {
        generic = (position === 'top') ? 'serif' : 'sans-serif';
    }

    // Body Contact CSS selector (broad selector targeting all body text)
    const sel = 'body, ' +
                'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not(strong):not(b):not([role="navigation"]):not([role="banner"]):not([role="contentinfo"]):not([role="complementary"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^="language-"]):not([class*=" language-"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc)';

    const decl = [];

    // Only add font-family if we have a specific font name
    if (payload.fontName) {
        decl.push(`font-family:"${payload.fontName}" !important`);
    }

    if (payload.fontSize !== null && payload.fontSize !== undefined) {
        decl.push(`font-size:${payload.fontSize}px !important`);
    }
    if (payload.lineHeight !== null && payload.lineHeight !== undefined) {
        decl.push(`line-height:${payload.lineHeight} !important`);
    }
    if (payload.fontColor) {
        decl.push(`color:${payload.fontColor} !important`);
    }
    if (payload.wdthVal !== null && payload.wdthVal !== undefined) {
        decl.push(`font-stretch:${payload.wdthVal}% !important`);
    }
    if (payload.italVal !== null && payload.italVal !== undefined && payload.italVal >= 1) {
        decl.push('font-style:italic !important');
    } else if (payload.slntVal !== null && payload.slntVal !== undefined && payload.slntVal !== 0) {
        decl.push(`font-style:oblique ${payload.slntVal}deg !important`);
    }
    if (payload.variableAxes && Object.keys(payload.variableAxes).length > 0) {
        const v = Object.entries(payload.variableAxes).map(pair => `"${pair[0]}" ${pair[1]}`).join(', ');
        decl.push(`font-variation-settings:${v} !important`);
    }

    let css = `${sel}{${decl.join('; ')};}`;

    if (payload.fontWeight !== null && payload.fontWeight !== undefined) {
        // Build var settings including wght along with any other per-axis values
        const axes = Object.assign({}, payload.variableAxes || {});
        axes.wght = Number(payload.fontWeight);
        const vstr = Object.entries(axes).map(pair => `"${pair[0]}" ${pair[1]}`).join(', ');
        css += '\n' + sel + `{font-weight:${payload.fontWeight} !important; font-variation-settings:${vstr} !important;}`;
    }

    // Override rule for bold elements with maximum specificity
    css += '\nbody strong, body b, html body strong, html body b { font-family: initial !important; font-weight: bold !important; font-variation-settings: initial !important; }';

    return css;
}

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
        const payload = await buildCurrentPayload(position, config);

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
                css = generateBodyCSS(payload, position);
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
        const payload = await buildThirdManInPayload(fontType, config);

        // For inline apply domains (x.com), preload fonts BEFORE writing to storage
        if (shouldUseInlineApply(origin)) {
            console.log(`applyThirdManInFont: Inline apply domain ${origin} detected - preloading font BEFORE storage write`);

            // Eagerly preload font subsets so they're cached before content.js needs them
            if (payload.fontName && payload.css2Url) {
                await preloadAllFontSubsets(payload.fontName, payload.css2Url).then(() => {
                    console.log(`applyThirdManInFont: Preloading complete for ${fontType} - now writing to storage`);
                }).catch(error => {
                    console.warn(`applyThirdManInFont: Preloading failed (non-critical):`, error);
                    // Continue anyway - content script will load fonts if cache misses
                });
            }
        }

        // Save enriched payload to storage (includes fontFaceRule for custom fonts and css2Url for Google Fonts)
        // For inline domains, fonts are already cached at this point
        return saveApplyMapForOrigin(origin, fontType, payload).then(() => {
            // For inline apply domains, return early - content script handles everything with cached fonts
            if (shouldUseInlineApply(origin)) {
                console.log(`applyThirdManInFont: Storage written - content script will use cached fonts`);
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

async function buildThirdManInPayload(fontType, providedConfig = null) {
    console.log(`🔧 buildThirdManInPayload: Building payload for fontType: ${fontType}`, providedConfig ? 'with provided config' : '');
    const cfg = providedConfig || getCurrentUIConfig(fontType);
    console.log(`🔧 buildThirdManInPayload: Using config:`, cfg);
    if (!cfg) {
        console.log(`🔧 buildThirdManInPayload: No config found, returning null`);
        return null;
    }

    return buildThirdManInPayloadFromConfig(fontType, cfg);
}

async function buildThirdManInPayloadFromConfig(fontType, cfg) {
    console.log(`🔧 buildThirdManInPayloadFromConfig: Building payload for fontType: ${fontType} with specific config:`, cfg);

    if (!cfg) {
        console.log(`🔧 buildThirdManInPayloadFromConfig: No config provided, returning null`);
        return null;
    }

    // Determine generic based on font type
    let generic;
    switch(fontType) {
        case 'serif': generic = 'serif'; break;
        case 'sans': generic = 'sans-serif'; break;
        case 'mono': generic = 'monospace'; break;
        default: return null;
    }

    const weightActive = cfg.fontWeight !== null && cfg.fontWeight !== undefined;
    const fontWeight = weightActive ? Number(cfg.fontWeight) : null;
    const fontSizeActive = cfg.fontSize !== null && cfg.fontSize !== undefined;
    const fontSize = fontSizeActive ? Number(cfg.fontSize) : null;
    const lineHeightActive = cfg.lineHeight !== null && cfg.lineHeight !== undefined;
    const lineHeight = lineHeightActive ? Number(cfg.lineHeight) : null;

    const payload = {
        fontName: cfg.fontName,
        styleId: `a-font-face-off-style-${fontType}`
    };

    // Only include properties that have actual values (no null properties)
    if (cfg.variableAxes && Object.keys(cfg.variableAxes).length > 0) {
        payload.variableAxes = cfg.variableAxes;
    }
    if (fontSize !== null && fontSize !== undefined) payload.fontSize = fontSize;
    if (lineHeight !== null && lineHeight !== undefined) payload.lineHeight = lineHeight;
    if (fontWeight !== null && fontWeight !== undefined) payload.fontWeight = fontWeight;
    if (cfg.fontFaceRule) payload.fontFaceRule = cfg.fontFaceRule;

    // Compute css2Url for Google Fonts (same logic as buildCurrentPayload)
    if (cfg.css2Url) {
        payload.css2Url = cfg.css2Url;
    } else if (cfg.fontName && !cfg.fontFaceRule) {
        // For Google Fonts (non-custom fonts), compute the css2Url
        const css2Url = await buildCss2Url(cfg.fontName, cfg);
        if (css2Url) {
            payload.css2Url = css2Url;
            console.log(`🔧 buildThirdManInPayloadFromConfig: Computed css2Url for ${cfg.fontName}:`, css2Url);
        }
    }

    console.log(`🔧 buildThirdManInPayloadFromConfig: Final payload:`, payload);
    return payload;
}

// Update font previews for Third Man In mode
function updateThirdManInPreview(fontType) {
    const textElement = document.getElementById(`${fontType}-font-text`);
    const nameElement = document.getElementById(`${fontType}-font-name`);

    if (!textElement || !nameElement) return;

    const cfg = getCurrentUIConfig(fontType);

    // Handle both configured fonts and "Default" (no config)
    if (cfg) {
        // Update font name display for specific font
        nameElement.textContent = cfg.fontName || fontType.charAt(0).toUpperCase() + fontType.slice(1);

        // Build font-family CSS with specific font
        let fontFamily = cfg.fontName || '';
        switch(fontType) {
            case 'serif': fontFamily += ', serif'; break;
            case 'sans': fontFamily += ', sans-serif'; break;
            case 'mono': fontFamily += ', monospace'; break;
        }

        // Apply styles to preview text
        let style = `font-family: ${fontFamily};`;

        if (cfg.fontSize) style += ` font-size: ${cfg.fontSize}px;`;
        if (cfg.lineHeight) style += ` line-height: ${cfg.lineHeight};`;
        if (cfg.fontWeight) style += ` font-weight: ${cfg.fontWeight};`;
        if (cfg.fontColor) style += ` color: ${cfg.fontColor};`;

        // Add variable font settings if available
        if (cfg.variableAxes && Object.keys(cfg.variableAxes).length > 0) {
            const varSettings = Object.entries(cfg.variableAxes)
                .map(([axis, value]) => `"${axis}" ${value}`)
                .join(', ');

            if (varSettings) {
                style += ` font-variation-settings: ${varSettings};`;
            }
        }

        textElement.style.cssText = style;
    } else {
        // Handle "Default" case (no config)
        const headingText = fontType.charAt(0).toUpperCase() + fontType.slice(1);
        console.log(`updateThirdManInPreview: Setting ${fontType} heading to "${headingText}"`);
        nameElement.textContent = headingText;

        // Reset the heading font to default (same as other unset headings)
        nameElement.style.cssText = '';
        console.log(`updateThirdManInPreview: After reset, ${fontType} heading shows: "${nameElement.textContent}"`);

        // Reset preview text to generic font family
        let genericFamily;
        switch(fontType) {
            case 'serif': genericFamily = 'serif'; break;
            case 'sans': genericFamily = 'sans-serif'; break;
            case 'mono': genericFamily = 'monospace'; break;
        }

        textElement.style.cssText = `font-family: ${genericFamily};`;
    }
}

// Pre-highlight Apply buttons based on saved per-origin settings
function syncApplyButtonsForOrigin() {
    const applyTopBtn = document.getElementById('apply-top');
    const applyBottomBtn = document.getElementById('apply-bottom');
    if (!applyTopBtn && !applyBottomBtn) return Promise.resolve();

    return getActiveOrigin().then(origin => {
        if (!origin) return;

        return browser.storage.local.get('affoApplyMap').then(data => {
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
        fontSize: fontSizeEl ? fontSizeEl.value : null,
        lineHeight: lineHeightEl ? lineHeightEl.value : null,
        fontWeight: fontWeightEl ? fontWeightEl.value : null,
        fontColor: fontColorEl ? fontColorEl.value : null,
        variableAxes: {}
    };

    // Save variable axis values
    if (fontDef && fontDef.axes) {
        fontDef.axes.forEach(axis => {
            const control = document.getElementById(`${position}-${axis}`);
            if (control) {
                settings.variableAxes[axis] = control.value;
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
    document.getElementById(`${position}-font-size`).value = saved.fontSize;
    document.getElementById(`${position}-line-height`).value = saved.lineHeight;
    document.getElementById(`${position}-font-weight`).value = saved.fontWeight;
    document.getElementById(`${position}-font-color`).value = saved.fontColor;

    // Restore variable axis values
    const fontDef = getEffectiveFontDefinition(fontName);
    if (fontDef && fontDef.axes && saved.variableAxes) {
        fontDef.axes.forEach(axis => {
            if (saved.variableAxes[axis] !== undefined) {
                const control = document.getElementById(`${position}-${axis}`);
                const textControl = document.getElementById(`${position}-${axis}-text`);
                const controlGroup = document.querySelector(`#${position}-font-controls .control-group[data-axis="${axis}"]`);

                if (control && textControl) {
                    const value = saved.variableAxes[axis];
                    control.value = value;
                    textControl.value = value;

                    // Activate the axis since it has a value
                    if (controlGroup) {
                        controlGroup.classList.remove('unset');
                    }
                }
            }
        });
    }

    // Restore basic control activation states based on saved values
    if (saved.fontWeight) {
        const weightControl = document.querySelector(`#${position}-font-controls .control-group[data-control="weight"]`);
        if (weightControl) {
            weightControl.classList.remove('unset');
        }
    }
    if (saved.fontSize) {
        const sizeControl = document.querySelector(`#${position}-font-controls .control-group[data-control="font-size"]`);
        if (sizeControl) {
            sizeControl.classList.remove('unset');
        }
    }
    if (saved.lineHeight) {
        const lineHeightControl = document.querySelector(`#${position}-font-controls .control-group[data-control="line-height"]`);
        if (lineHeightControl) {
            lineHeightControl.classList.remove('unset');
        }
    }
    if (saved.fontColor) {
        const colorControl = document.querySelector(`#${position}-font-controls .control-group[data-control="color"]`);
        if (colorControl) {
            colorControl.classList.remove('unset');
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
        if (fontColor) {
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
        if (fontColor) {
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

    // Save state after applying font changes (skip during restoration)
    if (!suppressUiStateSave) {
        saveExtensionState();
    }
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
    if (config.fontSize !== null && config.fontSize !== undefined) {
        parts.push(`${config.fontSize}px`);
    }
    if (config.fontWeight) {
        parts.push(`${config.fontWeight}wt`);
    }
    if (config.lineHeight) {
        parts.push(`${config.lineHeight}lh`);
    }
    if (config.fontColor) {
        parts.push('colored');
    }

    // Add variable axes that are active
    if (config.variableAxes && Object.keys(config.variableAxes).length > 0) {
        Object.entries(config.variableAxes).forEach(([axis, value]) => {
            const fontDef = getEffectiveFontDefinition(config.fontName);
            if (fontDef && fontDef.defaults[axis] !== undefined &&
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
    if (config.fontSize !== null && config.fontSize !== undefined) {
        lines.push(`Size: ${config.fontSize}px`);
    }
    if (config.lineHeight) {
        lines.push(`Line Height: ${config.lineHeight}`);
    }
    if (config.fontWeight && config.fontWeight !== 400) {
        lines.push(`Weight: ${config.fontWeight}`);
    }
    if (config.fontColor) {
        lines.push(`Color: ${config.fontColor}`);
    }

    // Only show active variable axes
    if (config.variableAxes && Object.keys(config.variableAxes).length > 0) {
        const activeAxesEntries = Object.entries(config.variableAxes)
            .filter(([axis, value]) => {
                const fontDef = getEffectiveFontDefinition(config.fontName);
                return fontDef && fontDef.defaults[axis] !== undefined &&
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
}

function hideSaveModal() {
    const modal = document.getElementById('save-modal');
    modal.classList.remove('visible');
}

// Favorites Popup functionality
function showFavoritesPopup(position) {
    console.log('showFavoritesPopup called for position:', position);
    const popup = document.getElementById('favorites-popup');
    const listContainer = document.getElementById('favorites-popup-list');
    const noFavorites = document.getElementById('no-favorites');
    console.log('Favorites popup elements:', {popup, listContainer, noFavorites});

    // Clear existing content
    listContainer.innerHTML = '';

    // Check if there are any favorites
    const names = (Array.isArray(savedFavoritesOrder) && savedFavoritesOrder.length)
        ? savedFavoritesOrder.filter(n => savedFavorites[n])
        : Object.keys(savedFavorites);
    console.log('savedFavorites:', savedFavorites);
    console.log('savedFavoritesOrder:', savedFavoritesOrder);
    console.log('Favorite names to show:', names);
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
            item.addEventListener('click', async function() {
                const position = this.getAttribute('data-position');
                const favoriteName = this.getAttribute('data-favorite-name');
                const rawConfig = savedFavorites[favoriteName];
                console.log('Loading favorite - raw config:', JSON.stringify(rawConfig, null, 2));
                const config = savedEntryToConfig(rawConfig);
                console.log('Loading favorite - processed config:', JSON.stringify(config, null, 2));

                if (config) {
                    try {
                        // Apply font config and wait for completion
                        await applyFontConfig(position, config);
                        console.log(`Favorite loaded and applied for ${position}`);

                        // Update Apply button visibility after loading favorite (now that control groups are updated)
                        if (position === 'body') {
                            await updateBodyButtons();
                        } else if (currentViewMode === 'third-man-in') {
                            await updateAllThirdManInButtons();
                        } else if (currentViewMode === 'faceoff') {
                            saveExtensionState();
                            try {
                                refreshApplyButtonsDirtyState();
                            } catch (_) {}
                        }

                        // Only hide popup after everything is complete
                        hideFavoritesPopup();
                    } catch (error) {
                        console.error('Error loading favorite:', error);
                        hideFavoritesPopup(); // Hide popup even on error
                    }
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
                showCustomConfirm(`Are you sure you want to delete "${name}"?`).then(confirmed => {
                    if (confirmed) {
                        delete savedFavorites[name];
                        if (Array.isArray(savedFavoritesOrder)) {
                            const i = savedFavoritesOrder.indexOf(name);
                            if (i !== -1) savedFavoritesOrder.splice(i, 1);
                        }
                        saveFavoritesToStorage();
                        showEditFavoritesModal(); // Refresh the modal
                    }
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

    // Get all drag handles for event listeners
    const dragHandles = container.querySelectorAll('.drag-handle');
    let dropIndicator = null;
    let autoScrollInterval = null;
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
    let currentMouseY = 0;
    function startAutoScroll(clientY) {
        currentMouseY = clientY;
        console.log('startAutoScroll called with clientY:', clientY, 'existing interval:', !!autoScrollInterval);
        console.log('Container element:', container.className, container.id, 'tagName:', container.tagName);
        if (autoScrollInterval) {
            console.log('Returning early, interval already exists');
            return;
        }

        console.log('Creating new auto-scroll interval');
        autoScrollInterval = setInterval(() => {
            const containerRect = container.getBoundingClientRect();
            const scrollZone = 200; // pixels from edge to trigger scroll (very generous)
            const maxScrollSpeed = 200; // max pixels per second (reduced for better control)

            // Allow scrolling when mouse is above/below container or within expanded scroll zones
            // More generous zones for easier triggering when reordering
            const shouldScrollUp = currentMouseY <= containerRect.top + scrollZone;
            const shouldScrollDown = currentMouseY >= containerRect.bottom - scrollZone;

            console.log('Auto-scroll tick - mouseY:', currentMouseY, 'containerTop:', containerRect.top, 'containerBottom:', containerRect.bottom, 'shouldScrollUp:', shouldScrollUp, 'shouldScrollDown:', shouldScrollDown, 'scrollTop:', container.scrollTop, 'scrollHeight:', container.scrollHeight, 'clientHeight:', container.clientHeight);

            // Find the actually scrollable container
            let scrollContainer = container;
            if (container.scrollHeight <= container.clientHeight) {
                // Container isn't scrollable, try parent elements
                let parent = container.parentElement;
                while (parent && parent.scrollHeight <= parent.clientHeight && parent !== document.body) {
                    parent = parent.parentElement;
                }
                if (parent && parent.scrollHeight > parent.clientHeight) {
                    scrollContainer = parent;
                    console.log('Using parent as scroll container:', parent.className, parent.tagName);
                }
            }

            if (shouldScrollUp && scrollContainer.scrollTop > 0) {
                // Calculate scroll speed based on distance from edge (closer = faster)
                // When above the container, use maximum speed
                let scrollSpeed;
                if (currentMouseY < containerRect.top) {
                    scrollSpeed = maxScrollSpeed; // Maximum speed when completely above
                } else {
                    const distanceFromTop = currentMouseY - containerRect.top;
                    const normalizedDistance = Math.min(distanceFromTop / scrollZone, 1);
                    scrollSpeed = Math.max(30, maxScrollSpeed * (1 - normalizedDistance)); // Reduced minimum speed
                }
                console.log('Scrolling up, mouseY:', currentMouseY, 'containerTop:', containerRect.top, 'scrollTop:', scrollContainer.scrollTop);
                scrollContainer.scrollBy({ top: -scrollSpeed / 15, behavior: 'auto' }); // Reduced scroll speed
            } else if (shouldScrollDown && scrollContainer.scrollTop < scrollContainer.scrollHeight - scrollContainer.clientHeight) {
                // Calculate scroll speed based on distance from edge (closer = faster)
                // When below the container, use maximum speed
                let scrollSpeed;
                if (currentMouseY > containerRect.bottom) {
                    scrollSpeed = maxScrollSpeed; // Maximum speed when completely below
                } else {
                    const distanceFromBottom = containerRect.bottom - currentMouseY;
                    const normalizedDistance = Math.min(distanceFromBottom / scrollZone, 1);
                    scrollSpeed = Math.max(30, maxScrollSpeed * (1 - normalizedDistance)); // Reduced minimum speed
                }
                scrollContainer.scrollBy({ top: scrollSpeed / 15, behavior: 'auto' }); // Reduced scroll speed
            } else {
                // Don't stop auto-scroll here - let the drag handlers manage it
                console.log('No scroll needed, but keeping interval active');
            }
        }, 16); // ~60fps for smooth scrolling
    }
    function updateAutoScroll(clientY) {
        currentMouseY = clientY;
    }
    function stopAutoScroll() {
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }
    // Get favorite items for HTML5 drag events
    const favoriteItems = container.querySelectorAll('.edit-favorite-item');
    favoriteItems.forEach(item => {
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
            stopAutoScroll();
        });
    });
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const after = getDragAfterElement(container, e.clientY);
        const dragging = container.querySelector('.dragging');
        if (!dragging) return;

        // Update auto-scroll position and start if needed
        if (!autoScrollInterval) {
            startAutoScroll(e.clientY);
        } else {
            updateAutoScroll(e.clientY);
        }

        // Store the target position for when drop happens, but don't move the item yet
        dragging.dataset.dropAfter = after ? after.dataset.name : '';

        // Only position drop indicator - don't actually move the item during drag
        const ind = ensureIndicator();
        const crect = container.getBoundingClientRect();
        let topPx;
        if (after == null) {
            // Drop at end
            const items = [...container.querySelectorAll('.edit-favorite-item:not(.dragging)')];
            const last = items[items.length - 1];
            const lrect = last ? last.getBoundingClientRect() : null;
            topPx = (lrect ? (lrect.bottom - crect.top + container.scrollTop) : (container.scrollTop + container.scrollHeight));
        } else {
            // Drop before this item
            const arect = after.getBoundingClientRect();
            topPx = (arect.top - crect.top + container.scrollTop);
        }
        ind.style.top = `${Math.max(0, topPx)}px`;
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const dragging = container.querySelector('.dragging');
        if (!dragging) return;

        // Now actually perform the reorder based on stored drop position
        const dropAfterName = dragging.dataset.dropAfter;
        if (dropAfterName === '') {
            // Drop at end
            container.appendChild(dragging);
        } else {
            // Drop before the specified item
            const after = container.querySelector(`[data-name="${dropAfterName}"]`);
            if (after) {
                container.insertBefore(dragging, after);
            }
        }

        // Clean up
        delete dragging.dataset.dropAfter;
    });

    // Pointer/touch fallback (works on mobile)
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

        // Update auto-scroll position and start if needed
        if (!autoScrollInterval) {
            startAutoScroll(e.clientY);
        } else {
            updateAutoScroll(e.clientY);
        }

        // Store the target position for when drop happens, but don't move the item yet
        dragging.dataset.dropAfter = after ? after.dataset.name : '';

        // Only show indicator - don't actually move the item during drag
        const ind = ensureIndicator();
        const crect = ptr.container.getBoundingClientRect();
        let topPx;
        if (after == null) {
            // Drop at end
            const items = [...ptr.container.querySelectorAll('.edit-favorite-item:not(.dragging)')];
            const last = items[items.length - 1];
            const lrect = last ? last.getBoundingClientRect() : null;
            topPx = (lrect ? (lrect.bottom - crect.top + ptr.container.scrollTop) : (ptr.container.scrollTop + ptr.container.scrollHeight));
        } else {
            // Drop before this item
            const arect = after.getBoundingClientRect();
            topPx = (arect.top - crect.top + ptr.container.scrollTop);
        }
        ind.style.top = `${Math.max(0, topPx)}px`;
    };
    const onPointerUp = (e) => {
        if (!ptr.active) return;
        try { e.target.releasePointerCapture && e.target.releasePointerCapture(e.pointerId); } catch (_) {}

        // Perform the actual reorder based on stored drop position
        const dragging = ptr.item;
        const dropAfterName = dragging.dataset.dropAfter;
        if (dropAfterName !== undefined) {
            if (dropAfterName === '') {
                // Drop at end
                ptr.container.appendChild(dragging);
            } else {
                // Drop before the specified item
                const after = ptr.container.querySelector(`[data-name="${dropAfterName}"]`);
                if (after) {
                    ptr.container.insertBefore(dragging, after);
                }
            }
        }

        // Clean up
        delete dragging.dataset.dropAfter;
        ptr.item.classList.remove('dragging');
        ptr.item.removeAttribute('draggable');
        persistFavoritesOrder(ptr.container);
        if (proxy && proxy.parentNode) proxy.parentNode.removeChild(proxy);
        proxy = null;
        hideIndicator();
        stopAutoScroll();
        ptr = { active: false, item: null, container: null };
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
    };
    dragHandles.forEach(handle => {
        handle.addEventListener('pointerdown', (e) => {
            const item = e.target.closest('.edit-favorite-item');
            if (!item) return;

            // Prevent default browser behavior (text selection, page scroll, etc.)
            e.preventDefault();

            ptr = { active: true, item, container };
            item.classList.add('dragging');
            // Prevent page scroll while dragging
            try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (_) {}

            // Attach global listeners immediately
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
            document.addEventListener('pointercancel', onPointerUp);
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
    if (config.fontSize) {
        parts.push(`${config.fontSize}px`);
    }
    if (config.fontWeight) {
        parts.push(`${config.fontWeight}wt`);
    }
    if (config.fontColor) {
        parts.push(config.fontColor);
    }
    if (config.variableAxes && Object.keys(config.variableAxes).length > 0) {
        const axesCount = Object.keys(config.variableAxes).length;
        parts.push(`${axesCount} axes`);
    }

    return parts.join(' • ');
}

    function generateDetailedFavoritePreview(config) {
    if (!config) return 'No configuration';

    const lines = [];
    if (config.fontName) lines.push(`Font: ${config.fontName}`);

    // Always show font size
    if (config.basicControls?.fontSize) {
        lines.push(`Size: ${config.fontSize}px`);
    }
    if (hasInCollection(config && config.activeControls, 'line-height') &&
        config.lineHeight) {
        lines.push(`Line Height: ${config.lineHeight}`);
    }
    if (hasInCollection(config && config.activeControls, 'weight') &&
        config.fontWeight && config.fontWeight !== 400) {
        lines.push(`Weight: ${config.fontWeight}`);
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
// Flag to prevent font selection during initialization
let initializationComplete = false;

// Panel state variables (used across different functions)
let topPanelOpen = false;
let bottomPanelOpen = false;

// Inject custom font @font-face rules into the popup's head
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
    initializationComplete = false;
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
        initializationComplete = true;
        document.body.style.visibility = 'visible';
        console.log('✅ UI is now visible and ready for user interaction');

    }).catch((error) => {
        console.error('Initialization failed:', error);
        // Show UI anyway to prevent blank popup
        document.body.style.visibility = 'visible';
        initializationComplete = true;
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
            if (topSizeGroup) topSizeGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (topSizeText) topSizeText.value = v;
            applyFont('top');
        });
    }
    if (bottomSizeSlider) {
        bottomSizeSlider.addEventListener('input', function() {
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
            saveExtensionState();
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
                    saveExtensionState();
                }
                this.blur();
            }
        });
        bodySizeText.addEventListener('blur', function(){
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
                saveExtensionState();
            }
        });
    }

    // Third Man In Font Size Controls
    const serifSizeSlider = document.getElementById('serif-font-size');
    const serifSizeText = document.getElementById('serif-font-size-text');
    const serifSizeGroup = document.querySelector('#serif-font-controls .control-group[data-control="font-size"]');
    if (serifSizeSlider) {
        serifSizeSlider.addEventListener('input', function() {
            if (serifSizeGroup) serifSizeGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (serifSizeText) serifSizeText.value = v;
            const serifSizeValue = document.getElementById('serif-font-size-value');
            if (serifSizeValue) serifSizeValue.textContent = v + 'px';
            updateThirdManInPreview('serif');
            updateAllThirdManInButtons('serif');
            // Save state after font-size change
            saveExtensionState();
        });
    }
    if (serifSizeText) {
        serifSizeText.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const min = Number(serifSizeSlider?.min || 10), max = Number(serifSizeSlider?.max || 72);
                const vv = clamp(this.value, min, max);
                if (vv !== null) {
                    if (serifSizeGroup) serifSizeGroup.classList.remove('unset');
                    if (serifSizeSlider) serifSizeSlider.value = String(vv);
                    this.value = String(vv);
                    const serifSizeValue = document.getElementById('serif-font-size-value');
                    if (serifSizeValue) serifSizeValue.textContent = vv + 'px';
                    updateThirdManInPreview('serif');
                    updateAllThirdManInButtons('serif');
                    // Save state after font-size change
                    saveExtensionState();
                }
                this.blur();
            }
        });
        serifSizeText.addEventListener('blur', function() {
            const min = Number(serifSizeSlider?.min || 10), max = Number(serifSizeSlider?.max || 72);
            const vv = clamp(this.value, min, max);
            if (vv !== null) {
                if (serifSizeGroup) serifSizeGroup.classList.remove('unset');
                if (serifSizeSlider) serifSizeSlider.value = String(vv);
                this.value = String(vv);
                const serifSizeValue = document.getElementById('serif-font-size-value');
                if (serifSizeValue) serifSizeValue.textContent = vv + 'px';
                updateThirdManInPreview('serif');
                updateAllThirdManInButtons('serif');
                // Save state after font-size change
                saveExtensionState();
            }
        });
    }

    const sansSizeSlider = document.getElementById('sans-font-size');
    const sansSizeText = document.getElementById('sans-font-size-text');
    const sansSizeGroup = document.querySelector('#sans-font-controls .control-group[data-control="font-size"]');
    if (sansSizeSlider) {
        sansSizeSlider.addEventListener('input', function() {
            if (sansSizeGroup) sansSizeGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (sansSizeText) sansSizeText.value = v;
            const sansSizeValue = document.getElementById('sans-font-size-value');
            if (sansSizeValue) sansSizeValue.textContent = v + 'px';
            updateThirdManInPreview('sans');
            updateAllThirdManInButtons('sans');
            // Save state after font-size change
            saveExtensionState();
        });
    }
    if (sansSizeText) {
        sansSizeText.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const min = Number(sansSizeSlider?.min || 10), max = Number(sansSizeSlider?.max || 72);
                const vv = clamp(this.value, min, max);
                if (vv !== null) {
                    if (sansSizeGroup) sansSizeGroup.classList.remove('unset');
                    if (sansSizeSlider) sansSizeSlider.value = String(vv);
                    this.value = String(vv);
                    const sansSizeValue = document.getElementById('sans-font-size-value');
                    if (sansSizeValue) sansSizeValue.textContent = vv + 'px';
                    updateThirdManInPreview('sans');
                    updateAllThirdManInButtons('sans');
                    // Save state after font-size change
                    saveExtensionState();
                }
                this.blur();
            }
        });
        sansSizeText.addEventListener('blur', function() {
            const min = Number(sansSizeSlider?.min || 10), max = Number(sansSizeSlider?.max || 72);
            const vv = clamp(this.value, min, max);
            if (vv !== null) {
                if (sansSizeGroup) sansSizeGroup.classList.remove('unset');
                if (sansSizeSlider) sansSizeSlider.value = String(vv);
                this.value = String(vv);
                const sansSizeValue = document.getElementById('sans-font-size-value');
                if (sansSizeValue) sansSizeValue.textContent = vv + 'px';
                updateThirdManInPreview('sans');
                updateAllThirdManInButtons('sans');
                // Save state after font-size change
                saveExtensionState();
            }
        });
    }

    const monoSizeSlider = document.getElementById('mono-font-size');
    const monoSizeText = document.getElementById('mono-font-size-text');
    const monoSizeGroup = document.querySelector('#mono-font-controls .control-group[data-control="font-size"]');
    if (monoSizeSlider) {
        monoSizeSlider.addEventListener('input', function() {
            if (monoSizeGroup) monoSizeGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (monoSizeText) monoSizeText.value = v;
            const monoSizeValue = document.getElementById('mono-font-size-value');
            if (monoSizeValue) monoSizeValue.textContent = v + 'px';
            updateThirdManInPreview('mono');
            updateAllThirdManInButtons('mono');
            // Save state after font-size change
            saveExtensionState();
        });
    }
    if (monoSizeText) {
        monoSizeText.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const min = Number(monoSizeSlider?.min || 10), max = Number(monoSizeSlider?.max || 72);
                const vv = clamp(this.value, min, max);
                if (vv !== null) {
                    if (monoSizeGroup) monoSizeGroup.classList.remove('unset');
                    if (monoSizeSlider) monoSizeSlider.value = String(vv);
                    this.value = String(vv);
                    const monoSizeValue = document.getElementById('mono-font-size-value');
                    if (monoSizeValue) monoSizeValue.textContent = vv + 'px';
                    updateThirdManInPreview('mono');
                    updateAllThirdManInButtons('mono');
                    // Save state after font-size change
                    saveExtensionState();
                }
                this.blur();
            }
        });
        monoSizeText.addEventListener('blur', function() {
            const min = Number(monoSizeSlider?.min || 10), max = Number(monoSizeSlider?.max || 72);
            const vv = clamp(this.value, min, max);
            if (vv !== null) {
                if (monoSizeGroup) monoSizeGroup.classList.remove('unset');
                if (monoSizeSlider) monoSizeSlider.value = String(vv);
                this.value = String(vv);
                const monoSizeValue = document.getElementById('mono-font-size-value');
                if (monoSizeValue) monoSizeValue.textContent = vv + 'px';
                updateThirdManInPreview('mono');
                updateAllThirdManInButtons('mono');
                // Save state after font-size change
                saveExtensionState();
            }
        });
    }

    // Third Man In Line Height Controls
    const serifLineHeightSlider = document.getElementById('serif-line-height');
    const serifLineHeightText = document.getElementById('serif-line-height-text');
    const serifLineHeightGroup = serifLineHeightSlider ? serifLineHeightSlider.closest('.control-group') : null;

    if (serifLineHeightSlider) {
        serifLineHeightSlider.addEventListener('input', function() {
            if (serifLineHeightGroup) serifLineHeightGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (serifLineHeightText) serifLineHeightText.value = v;
            const serifLineHeightValue = document.getElementById('serif-line-height-value');
            if (serifLineHeightValue) serifLineHeightValue.textContent = v;
            updateThirdManInPreview('serif');
            updateAllThirdManInButtons('serif');
            saveExtensionState();
        });
    }

    const sansLineHeightSlider = document.getElementById('sans-line-height');
    const sansLineHeightText = document.getElementById('sans-line-height-text');
    const sansLineHeightGroup = sansLineHeightSlider ? sansLineHeightSlider.closest('.control-group') : null;

    if (sansLineHeightSlider) {
        sansLineHeightSlider.addEventListener('input', function() {
            if (sansLineHeightGroup) sansLineHeightGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (sansLineHeightText) sansLineHeightText.value = v;
            const sansLineHeightValue = document.getElementById('sans-line-height-value');
            if (sansLineHeightValue) sansLineHeightValue.textContent = v;
            updateThirdManInPreview('sans');
            updateAllThirdManInButtons('sans');
            saveExtensionState();
        });
    }

    const monoLineHeightSlider = document.getElementById('mono-line-height');
    const monoLineHeightText = document.getElementById('mono-line-height-text');
    const monoLineHeightGroup = monoLineHeightSlider ? monoLineHeightSlider.closest('.control-group') : null;

    if (monoLineHeightSlider) {
        monoLineHeightSlider.addEventListener('input', function() {
            if (monoLineHeightGroup) monoLineHeightGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            if (monoLineHeightText) monoLineHeightText.value = v;
            const monoLineHeightValue = document.getElementById('mono-line-height-value');
            if (monoLineHeightValue) monoLineHeightValue.textContent = v;
            updateThirdManInPreview('mono');
            updateAllThirdManInButtons('mono');
            saveExtensionState();
        });
    }

    // Third Man In Font Weight Controls
    const serifFontWeightSlider = document.getElementById('serif-font-weight');
    const serifFontWeightGroup = serifFontWeightSlider ? serifFontWeightSlider.closest('.control-group') : null;

    if (serifFontWeightSlider) {
        serifFontWeightSlider.addEventListener('input', function() {
            if (serifFontWeightGroup) serifFontWeightGroup.classList.remove('unset');
            const v = this.value;
            const serifFontWeightValue = document.getElementById('serif-font-weight-value');
            if (serifFontWeightValue) serifFontWeightValue.textContent = v;
            updateThirdManInPreview('serif');
            updateAllThirdManInButtons('serif');
            saveExtensionState();
        });
    }

    const sansFontWeightSlider = document.getElementById('sans-font-weight');
    const sansFontWeightGroup = sansFontWeightSlider ? sansFontWeightSlider.closest('.control-group') : null;

    if (sansFontWeightSlider) {
        sansFontWeightSlider.addEventListener('input', function() {
            if (sansFontWeightGroup) sansFontWeightGroup.classList.remove('unset');
            const v = this.value;
            const sansFontWeightValue = document.getElementById('sans-font-weight-value');
            if (sansFontWeightValue) sansFontWeightValue.textContent = v;
            updateThirdManInPreview('sans');
            updateAllThirdManInButtons('sans');
            saveExtensionState();
        });
    }

    const monoFontWeightSlider = document.getElementById('mono-font-weight');
    const monoFontWeightGroup = monoFontWeightSlider ? monoFontWeightSlider.closest('.control-group') : null;

    if (monoFontWeightSlider) {
        monoFontWeightSlider.addEventListener('input', function() {
            if (monoFontWeightGroup) monoFontWeightGroup.classList.remove('unset');
            const v = this.value;
            const monoFontWeightValue = document.getElementById('mono-font-weight-value');
            if (monoFontWeightValue) monoFontWeightValue.textContent = v;
            updateThirdManInPreview('mono');
            updateAllThirdManInButtons('mono');
            saveExtensionState();
        });
    }

    // Third Man In Color Controls
    const serifColorSelect = document.getElementById('serif-font-color');
    const serifColorGroup = serifColorSelect ? serifColorSelect.closest('.control-group') : null;

    if (serifColorSelect) {
        serifColorSelect.addEventListener('change', function() {
            if (serifColorGroup) serifColorGroup.classList.remove('unset');
            updateThirdManInPreview('serif');
            updateAllThirdManInButtons('serif');
            saveExtensionState();
        });
    }

    const sansColorSelect = document.getElementById('sans-font-color');
    const sansColorGroup = sansColorSelect ? sansColorSelect.closest('.control-group') : null;

    if (sansColorSelect) {
        sansColorSelect.addEventListener('change', function() {
            if (sansColorGroup) sansColorGroup.classList.remove('unset');
            updateThirdManInPreview('sans');
            updateAllThirdManInButtons('sans');
            saveExtensionState();
        });
    }

    const monoColorSelect = document.getElementById('mono-font-color');
    const monoColorGroup = monoColorSelect ? monoColorSelect.closest('.control-group') : null;

    if (monoColorSelect) {
        monoColorSelect.addEventListener('change', function() {
            if (monoColorGroup) monoColorGroup.classList.remove('unset');
            updateThirdManInPreview('mono');
            updateAllThirdManInButtons('mono');
            saveExtensionState();
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
            saveExtensionState();
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
                    saveExtensionState();
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
                saveExtensionState();
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
            saveExtensionState();
        });
    }

    // Body Font Weight Control - copied from working font size pattern
    const bodyFontWeightSlider = document.getElementById('body-font-weight');
    const bodyWeightGroup = bodyFontWeightSlider ? bodyFontWeightSlider.closest('.control-group') : null;

    if (bodyFontWeightSlider) {
        bodyFontWeightSlider.addEventListener('input', function() {
            if (bodyWeightGroup) bodyWeightGroup.classList.remove('unset');
            updateBodyButtons();
            const bodyFontWeightValue = document.getElementById('body-font-weight-value');
            if (bodyFontWeightValue) bodyFontWeightValue.textContent = this.value;
            updateBodyPreview();
            // Save state after weight change
            saveExtensionState();
        });
    }

    // Face-off Mode Line Height Controls
    const topLineHeightSlider = document.getElementById('top-line-height');
    const bottomLineHeightSlider = document.getElementById('bottom-line-height');
    const topLineHeightGroup = topLineHeightSlider ? topLineHeightSlider.closest('.control-group') : null;
    const bottomLineHeightGroup = bottomLineHeightSlider ? bottomLineHeightSlider.closest('.control-group') : null;

    if (topLineHeightSlider) {
        topLineHeightSlider.addEventListener('input', function() {
            if (topLineHeightGroup) topLineHeightGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            const topLineHeightValue = document.getElementById('top-line-height-value');
            const topLineHeightText = document.getElementById('top-line-height-text');
            if (topLineHeightValue) topLineHeightValue.textContent = v;
            if (topLineHeightText) topLineHeightText.value = v;
            updateThirdManInPreview('top');
            // Save state after line-height change
            saveExtensionState();
        });
    }

    if (bottomLineHeightSlider) {
        bottomLineHeightSlider.addEventListener('input', function() {
            if (bottomLineHeightGroup) bottomLineHeightGroup.classList.remove('unset');
            const v = Number(this.value).toFixed(2).replace(/\.00$/, '');
            const bottomLineHeightValue = document.getElementById('bottom-line-height-value');
            const bottomLineHeightText = document.getElementById('bottom-line-height-text');
            if (bottomLineHeightValue) bottomLineHeightValue.textContent = v;
            if (bottomLineHeightText) bottomLineHeightText.value = v;
            updateThirdManInPreview('bottom');
            // Save state after line-height change
            saveExtensionState();
        });
    }

    // Face-off Mode Font Weight Controls
    const topFontWeightSlider = document.getElementById('top-font-weight');
    const bottomFontWeightSlider = document.getElementById('bottom-font-weight');
    const topWeightGroup = topFontWeightSlider ? topFontWeightSlider.closest('.control-group') : null;
    const bottomWeightGroup = bottomFontWeightSlider ? bottomFontWeightSlider.closest('.control-group') : null;

    if (topFontWeightSlider) {
        topFontWeightSlider.addEventListener('input', function() {
            if (topWeightGroup) topWeightGroup.classList.remove('unset');
            const topFontWeightValue = document.getElementById('top-font-weight-value');
            if (topFontWeightValue) topFontWeightValue.textContent = this.value;
            updateThirdManInPreview('top');
            // Save state after weight change
            saveExtensionState();
        });
    }

    if (bottomFontWeightSlider) {
        bottomFontWeightSlider.addEventListener('input', function() {
            if (bottomWeightGroup) bottomWeightGroup.classList.remove('unset');
            const bottomFontWeightValue = document.getElementById('bottom-font-weight-value');
            if (bottomFontWeightValue) bottomFontWeightValue.textContent = this.value;
            updateThirdManInPreview('bottom');
            // Save state after weight change
            saveExtensionState();
        });
    }

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
                        // updateThirdManInPreview will set the correct heading text
                        updateThirdManInPreview(position);

                        // Update buttons after reset to show Reset All if needed
                        updateAllThirdManInButtons();
                    } else if (['top', 'bottom'].includes(position) && fontSelect) {
                        // Face-off mode: Use selectFont and reset select element
                        console.log('Face-off reset for position:', position);
                        const previousPosition = currentPosition;
                        currentPosition = position; // Set global position for selectFont
                        selectFont('Default').then(() => {
                            currentPosition = previousPosition; // Restore previous position
                        }).catch(error => {
                            console.error('Error during font reset:', error);
                            currentPosition = previousPosition; // Restore on error too
                        });
                        const defaultOption = fontSelect.options[0];
                        fontSelect.value = defaultOption.value;
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


// Build a UI config from a persisted per-origin payload (serif/sans)
function buildConfigFromPayload(position, payload) {
    console.log(`buildConfigFromPayload: position=${position}, payload:`, payload);
    const config = {
        fontName: payload.fontName,
        variableAxes: {}
    };

    // Only include properties with actual values (no null properties)
    if (payload.fontSize !== null && payload.fontSize !== undefined) {
        config.fontSize = Number(payload.fontSize);
    }
    if (payload.lineHeight !== null && payload.lineHeight !== undefined) {
        config.lineHeight = Number(payload.lineHeight);
    }
    if (payload.fontWeight !== null && payload.fontWeight !== undefined) {
        config.fontWeight = Number(payload.fontWeight);
    }
    if (payload.fontColor !== null && payload.fontColor !== undefined) {
        config.fontColor = payload.fontColor;
    }

    // Handle variable axes (new object format)
    if (payload.variableAxes && typeof payload.variableAxes === 'object') {
        Object.entries(payload.variableAxes).forEach(([axis, value]) => {
            config.variableAxes[axis] = Number(value);
        });
    }

    console.log(`buildConfigFromPayload: Built config:`, config);
    return config;
}

// Facade mode completely removed


// Compare two apply payloads for equality (font + axes + weight)
function payloadEquals(a, b) {
    if (!a || !b) return false;
    if (a.fontName !== b.fontName) return false;
    const numEq = (x, y) => (x === null || x === undefined) && (y === null || y === undefined) ? true : Number(x) === Number(y);
    if (!numEq(a.fontWeight, b.fontWeight)) return false;
    if (!numEq(a.fontSize, b.fontSize)) return false;
    if (!numEq(a.lineHeight, b.lineHeight)) return false;
    if (!numEq(a.wdthVal, b.wdthVal)) return false;
    if (!numEq(a.slntVal, b.slntVal)) return false;
    if (!numEq(a.italVal, b.italVal)) return false;
    if (a.fontColor !== b.fontColor) return false;
    // Compare variableAxes
    const aAxes = a.variableAxes || {};
    const bAxes = b.variableAxes || {};
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

// Element type detection for Third Man In mode - uses DOM walking instead of static selectors
function generateBodyContactCSS(payload) {
    if (!payload) return '';

    const lines = [];

    // Font face definition if needed
    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);
    }

    // Generate CSS that targets body elements (Body Contact mode)
    const selector = `body, body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(.no-affo)`;
    let styleRule = `${selector} {`;

    // Only set font-family if a specific font is chosen
    if (payload.fontName) {
        styleRule += ` font-family: "${payload.fontName}" !important;`;
    }

    if (payload.fontSize && isFinite(payload.fontSize)) {
        styleRule += ` font-size: ${payload.fontSize}px !important;`;
    }
    if (payload.lineHeight && isFinite(payload.lineHeight)) {
        styleRule += ` line-height: ${payload.lineHeight} !important;`;
    }
    if (payload.fontWeight && isFinite(payload.fontWeight)) {
        styleRule += ` font-weight: ${payload.fontWeight} !important;`;
    }
    if (payload.fontColor) {
        styleRule += ` color: ${payload.fontColor} !important;`;
    }

    // Handle variable axes
    const variableAxes = payload.variableAxes || {};
    const axisEntries = Object.entries(variableAxes);

    // Add font-weight from wght axis if present
    if (payload.fontWeight && isFinite(payload.fontWeight)) {
        // Already handled above
    }

    // Handle width, slant, italic axes
    if (payload.wdthVal && isFinite(payload.wdthVal)) {
        // Width is typically handled via font-variation-settings
    }
    if (payload.slntVal && isFinite(payload.slntVal) && payload.slntVal !== 0) {
        styleRule += ` font-style: oblique ${payload.slntVal}deg !important;`;
    }
    if (payload.italVal && payload.italVal >= 1) {
        styleRule += ` font-style: italic !important;`;
    }

    // Build font-variation-settings
    const variationSettings = [];
    axisEntries.forEach(([axis, value]) => {
        if (isFinite(Number(value))) {
            variationSettings.push(`"${axis}" ${value}`);
        }
    });

    // Add other variable axes
    if (payload.wdthVal && isFinite(payload.wdthVal)) {
        variationSettings.push(`"wdth" ${payload.wdthVal}`);
    }
    if (payload.fontWeight && isFinite(payload.fontWeight)) {
        variationSettings.push(`"wght" ${payload.fontWeight}`);
    }
    if (payload.slntVal && isFinite(payload.slntVal)) {
        variationSettings.push(`"slnt" ${payload.slntVal}`);
    }
    if (payload.italVal && isFinite(payload.italVal)) {
        variationSettings.push(`"ital" ${payload.italVal}`);
    }

    if (variationSettings.length > 0) {
        styleRule += ` font-variation-settings: ${variationSettings.join(', ')} !important;`;
    }

    styleRule += ' }';
    lines.push(styleRule);

    return lines.join('\n');
}

function generateThirdManInCSS(fontType, payload) {
    if (!payload) return '';

    const lines = [];

    // Font face definition if needed
    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);
    }

    // Generate CSS with separate rules for font-family vs other properties
    const generic = fontType === 'serif' ? 'serif' : fontType === 'mono' ? 'monospace' : 'sans-serif';

    // Rule 1: Font family applies to ALL marked elements
    if (payload.fontName) {
        lines.push(`[data-affo-font-type="${fontType}"] { font-family: "${payload.fontName}" !important; }`);
    }

    // Rule 2: Variable axes apply to ALL elements with this font type (including headings)
    if (payload.variableAxes && Object.keys(payload.variableAxes).length > 0) {
        const variationSettings = Object.entries(payload.variableAxes)
            .map(([axis, value]) => `"${axis}" ${value}`)
            .join(', ');
        lines.push(`[data-affo-font-type="${fontType}"] { font-variation-settings: ${variationSettings} !important; }`);
    }

    // Rule 3: Other properties apply only to body text elements (not headings, nav, etc.)
    const otherProps = [];
    if (payload.fontSize && isFinite(payload.fontSize)) {
        otherProps.push(`font-size: ${payload.fontSize}px !important`);
    }
    if (payload.lineHeight && isFinite(payload.lineHeight)) {
        otherProps.push(`line-height: ${payload.lineHeight} !important`);
    }
    if (payload.fontWeight && isFinite(payload.fontWeight)) {
        otherProps.push(`font-weight: ${payload.fontWeight} !important`);
    }

    if (otherProps.length > 0) {
        // Apply size/weight only to body text elements, not headings or navigation
        // Use maximum specificity to override site CSS
        lines.push(`html body p[data-affo-font-type="${fontType}"], html body span[data-affo-font-type="${fontType}"], html body td[data-affo-font-type="${fontType}"], html body th[data-affo-font-type="${fontType}"], html body li[data-affo-font-type="${fontType}"] { ${otherProps.join('; ')}; }`);

        // Add site-specific high-specificity rules
        // Use global currentTabHostname if available
        const hostname = window.currentTabHostname || null;
        const siteSpecificRules = getSiteSpecificRules(fontType, otherProps, hostname);
        if (siteSpecificRules) {
            lines.push(siteSpecificRules);
        }

        // Fallback: Generic high-specificity rules for other sites
        lines.push(`html body p[data-affo-font-type="${fontType}"], html body span[data-affo-font-type="${fontType}"], html body td[data-affo-font-type="${fontType}"], html body th[data-affo-font-type="${fontType}"], html body li[data-affo-font-type="${fontType}"] { ${otherProps.join('; ')}; }`);
    }

    const css = lines.join('\n');
    console.log(`🎯 Generated CSS for ${fontType}:`, css);
    return css;
}

// DOM walker to identify and mark element types for Third Man In mode
function generateElementWalkerScript(fontType) {
    return `
        (function() {
            try {
                console.log('Third Man In walker script starting for fontType: ${fontType}');

                // Clear only existing markers for this specific font type
                const existingMarked = document.querySelectorAll('[data-affo-font-type="${fontType}"]');
                console.log('Clearing ' + existingMarked.length + ' existing ${fontType} markers');
                existingMarked.forEach(el => {
                    el.removeAttribute('data-affo-font-type');
                });

                // Element type detection logic - only mark elements that clearly match the target type
                function getElementFontType(element) {
                    const tagName = element.tagName.toLowerCase();

                    const className = element.className || '';
                    const style = element.style.fontFamily || '';

                    // Exclude pure UI elements (but not headings)
                    if (['nav', 'header', 'footer', 'aside'].indexOf(tagName) !== -1) return null;

                    // Exclude navigation and UI class names
                    if (className && /\\b(nav|menu|header|footer|sidebar|toolbar|breadcrumb)\\b/i.test(className)) return null;

                    // Get computed font-family (what WhatFont sees)
                    const computedStyle = window.getComputedStyle(element);
                    const computedFontFamily = computedStyle.fontFamily || '';

                    // Check for complete words/phrases in class names and styles
                    // Convert className to string safely (it might be a DOMTokenList)
                    const classText = (typeof className === 'string' ? className : className.toString()).toLowerCase();
                    const styleText = style.toLowerCase();
                    const computedText = computedFontFamily.toLowerCase();

                    // Check for monospace keywords
                    if (/\\b(monospace|mono|code)\\b/.test(classText) ||
                        /\\b(monospace|mono)\\b/.test(styleText)) return 'mono';

                    // Check for sans-serif as complete phrase first
                    if (/\\bsans-serif\\b/.test(classText) || /\\bsans-serif\\b/.test(styleText)) return 'sans';

                    // Check for standalone sans (but not sans-serif)
                    if (/\\bsans\\b(?!-serif)/.test(classText) || /\\bsans\\b(?!-serif)/.test(styleText)) return 'sans';

                    // Check for sans-serif in computed font-family (what WhatFont sees)
                    if (/\\bsans-serif\\b/.test(computedText)) {
                        console.log('SANS FOUND (computed):', element.tagName, 'computedFont:', computedFontFamily);
                        return 'sans';
                    }

                    // Check for serif in computed font-family (what WhatFont sees)
                    if (/\\bserif\\b/.test(computedText.replace('sans-serif', ''))) {
                        console.log('SERIF FOUND (computed):', element.tagName, 'computedFont:', computedFontFamily);
                        return 'serif';
                    }

                    // Check for serif (but not sans-serif) in class names and inline styles
                    if (/\\bserif\\b/.test(classText.replace('sans-serif', '')) ||
                        /\\bserif\\b/.test(styleText.replace('sans-serif', ''))) {
                        console.log('SERIF FOUND (class/style):', element.tagName, 'className:', classText, 'style:', styleText);
                        return 'serif';
                    }

                    // Tag-based detection for monospace
                    if (['code', 'pre', 'kbd', 'samp', 'tt'].indexOf(tagName) !== -1) return 'mono';

                    // Third Man In mode only finds explicit markers - no assumptions

                    // No explicit indicators found - don't mark this element
                    return null;
                }

                // Debug: Find and analyze the "17 November" text before processing
                const allElements = Array.from(document.querySelectorAll('*'));
                const novemberElements = allElements.filter(el => el.textContent && el.textContent.includes('17 November'));
                console.log('🔍 PRE-SCAN: Found', novemberElements.length, 'elements containing "17 November"');
                novemberElements.forEach((el, i) => {
                    console.log('🔍 Element', i+1, ':', el.tagName, el.className, 'text:', el.textContent.substring(0, 100));
                });

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
                        console.log('Marked ${fontType} element:', element.tagName, element.className, 'willGetSize:', ['P', 'SPAN', 'TD', 'TH', 'LI'].indexOf(element.tagName) !== -1, element.textContent.substring(0, 50));

                        // Debug specific "17 November" paragraph
                        if (element.textContent.includes('17 November')) {
                            console.log('🔍 FOUND "17 November" paragraph - marked as: ${fontType}');
                            console.log('🔍 Element:', element);
                            console.log('🔍 Computed style font-size:', window.getComputedStyle(element).fontSize);
                            console.log('🔍 Has attribute data-affo-font-type:', element.getAttribute('data-affo-font-type'));
                        }
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
async function buildCurrentPayload(position, providedConfig = null) {
    console.log(`buildCurrentPayload called for position: ${position}`, providedConfig ? 'with provided config' : '');
    const cfg = providedConfig || getCurrentUIConfig(position);
    console.log(`buildCurrentPayload: Using config:`, cfg);
    if (!cfg) {
        console.log(`buildCurrentPayload: No config found, returning null`);
        return null;
    }


    // Determine generic font family based on position
    let genericKey;
    if (position === 'body') {
        genericKey = 'body';
    } else {
        genericKey = (position === 'top') ? 'serif' : 'sans';
    }
    const activeAxes = new Set(cfg.activeAxes || []);
    let wdthVal = null, slntVal = null, italVal = null;
    Object.entries(cfg.variableAxes || {}).forEach(([axis, value]) => {
        const num = Number(value);
        if (!activeAxes.has(axis) || !isFinite(num)) return;
        if (axis === 'wdth') wdthVal = num;
        if (axis === 'slnt') slntVal = num;
        if (axis === 'ital') italVal = num;
    });
    // Determine which controls are active by checking if control group is not "unset" (user has interacted with them)
    const weightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="weight"]`);
    const weightActive = weightGroup && !weightGroup.classList.contains('unset');
    const fontWeight = weightActive ? Number(cfg.fontWeight) : null;
    console.log(`buildCurrentPayload: Weight - group:`, weightGroup, 'active:', weightActive, 'value:', fontWeight);

    const sizeGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="font-size"]`);
    const fontSizeActive = sizeGroup && !sizeGroup.classList.contains('unset');
    const fontSize = fontSizeActive ? Number(cfg.fontSize) : null;
    console.log(`buildCurrentPayload: Font size - group:`, sizeGroup, 'active:', fontSizeActive, 'value:', fontSize);

    const lineHeightGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="line-height"]`);
    const lineHeightActive = lineHeightGroup && !lineHeightGroup.classList.contains('unset');
    const lineHeight = lineHeightActive ? Number(cfg.lineHeight) : null;
    console.log(`buildCurrentPayload: Line height - group:`, lineHeightGroup, 'active:', lineHeightActive, 'raw cfg.lineHeight:', cfg.lineHeight, 'Number() result:', lineHeight);

    // Check if color is active (not "unset")
    const colorGroup = document.querySelector(`#${position}-font-controls .control-group[data-control="color"]`);
    const colorActive = colorGroup && !colorGroup.classList.contains('unset');
    const fontColor = colorActive ? cfg.fontColor : null;
    console.log(`buildCurrentPayload: Color - group:`, colorGroup, 'active:', colorActive, 'value:', fontColor);

    // Get font definition to include fontFaceRule if it's a custom font
    const fontDefinition = fontDefinitions[cfg.fontName];
    const payload = {
        fontName: cfg.fontName,
        variableAxes: cfg.variableAxes || {},
        wdthVal,
        slntVal,
        italVal,
        fontWeight,
        fontSize,
        lineHeight,
        fontColor
    };

    // Add fontFaceRule for custom fonts
    if (fontDefinition && fontDefinition.fontFaceRule) {
        payload.fontFaceRule = fontDefinition.fontFaceRule;
    }

    // Add css2Url for Google Fonts if available (or compute it for variable fonts)
    if (fontDefinition && fontDefinition.css2Url) {
        payload.css2Url = fontDefinition.css2Url;
    } else if (cfg.fontName && !fontDefinition?.fontFaceRule) {
        // For Google Fonts (non-custom fonts), compute the css2Url
        const css2Url = await buildCss2Url(cfg.fontName, cfg);
        if (css2Url) {
            payload.css2Url = css2Url;
            console.log(`buildCurrentPayload: Computed css2Url for ${cfg.fontName}:`, css2Url);
        }
    }

    // Remove properties with null values to follow "no key" architecture
    Object.keys(payload).forEach(key => {
        if (payload[key] === null || payload[key] === undefined) {
            delete payload[key];
        }
    });

    return payload;
}

// Reflect button labels based on saved vs current (Applied/Update/Apply)
async function refreshApplyButtonsDirtyState() {
    try {
        const origin = await getActiveOrigin();
        const data = await browser.storage.local.get('affoApplyMap');
        const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
        const originKey = origin ? origin : '';
        const entry = originKey ? (map[originKey] || {}) : {};

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
                const current = await buildCurrentPayload('top');
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
                const current = await buildCurrentPayload('bottom');
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
    return getActiveOrigin().then(origin => {
        if (!origin) return false;

        if (mode === 'body-contact') {
            return browser.storage.local.get('affoApplyMap').then(data => {
                const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
                return !!(map[origin] && map[origin].body);
            });
        } else if (mode === 'third-man-in') {
            return browser.storage.local.get('affoApplyMap').then(data => {
                const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
                // Using origin directly (hostname)
                const domainData = map[origin];
                return !!(domainData && (domainData.serif || domainData.sans || domainData.mono));
            });
        } else if (mode === 'faceoff') {
            // Faceoff mode never saves domain settings - it's preview-only
            return false;
        }
        return false;
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

        // Clear consolidated storage settings
        // Using origin directly (hostname)
        return browser.storage.local.get('affoApplyMap').then(bodyData => {
            const bodyMap = (bodyData && bodyData.affoApplyMap) ? bodyData.affoApplyMap : {};
            const bodyPromise = bodyMap[origin] ?
                (delete bodyMap[origin], browser.storage.local.set({ affoApplyMap: bodyMap })) :
                Promise.resolve();

            // Clear all font settings (already done in bodyPromise since storage is consolidated)
            return bodyPromise.then(() => {
                // Send message to content script to restore original page
                sendMessageToTargetTab({
                    action: 'restoreOriginal',
                    origin: origin
                });
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
        if (currentViewMode !== newMode) {
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
    }).then(result => {
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
        const config = getPanelFontConfig(panelId);
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
        return browser.storage.local.get('affoApplyMap').then(data => {
            const applyMap = (data && data.affoApplyMap) ? data.affoApplyMap : {};
            const domainData = applyMap[origin] || {};

            types.forEach(type => {
                const config = getPanelFontConfig(type);
                const appliedConfig = domainData[type];

                console.log(`applyAllThirdManInFonts: Processing ${type} - config:`, config);
                console.log(`applyAllThirdManInFonts: Processing ${type} - appliedConfig:`, appliedConfig);

                // Check if config has any meaningful properties
                const hasValidConfig = config && (config.fontName || config.fontSize || config.fontWeight || config.lineHeight || config.fontColor);

                if (hasValidConfig) {
                    // Convert applied config to same format for comparison
                    const appliedForComparison = appliedConfig ? {
                        fontName: appliedConfig.fontName || null,
                        variableAxes: appliedConfig.variableAxes || {}
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
                // Step 2a.5: For inline apply domains, preload fonts BEFORE writing to storage
                // This prevents race condition where content.js starts loading before cache is ready
                if (shouldUseInlineApply(origin)) {
                    console.log(`applyAllThirdManInFonts: Inline apply domain ${origin} detected - preloading fonts BEFORE storage write`);

                    // Eagerly preload ALL font subsets so they're cached before content.js needs them
                    const preloadPromises = Object.keys(fontConfigs).map(type => {
                        const config = fontConfigs[type];
                        if (!config || !config.fontName || !config.css2Url) {
                            return Promise.resolve();
                        }

                        console.log(`applyAllThirdManInFonts: Preloading ${type} font ${config.fontName} with css2Url:`, config.css2Url);
                        return preloadAllFontSubsets(config.fontName, config.css2Url);
                    });

                    // Wait for preloading to complete before writing to storage
                    return Promise.all(preloadPromises).then(() => {
                        console.log(`applyAllThirdManInFonts: Preloading complete - now writing to storage so content script can use cached fonts`);
                    }).catch(error => {
                        console.warn(`applyAllThirdManInFonts: Preloading failed (non-critical):`, error);
                        // Continue anyway - content script will load fonts if cache misses
                    });
                }
                return Promise.resolve();
            }).then(() => {
                // Step 2b: SINGLE batch storage write for all fonts (now with css2Url included)
                // For inline domains, fonts are already cached at this point
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
                    const payload = await buildThirdManInPayloadFromConfig(job.type, job.config);
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

// Clear all fonts from domain (everything unset state)
function clearAllFontsFromDomain() {
    const types = ['serif', 'sans', 'mono', 'body'];

    console.log('🔥 clearAllFontsFromDomain: Starting to clear all fonts from domain');
    console.trace('🔥 clearAllFontsFromDomain: Stack trace to identify caller');

    // Process types sequentially to avoid conflicts
    let promise = Promise.resolve();
    for (const type of types) {
        promise = promise.then(() => {
            console.log(`clearAllFontsFromDomain: Clearing ${type}`);
            return applyUnsetSettings(type);
        });
    }

    return promise.then(() => {
        console.log('clearAllFontsFromDomain: All fonts cleared from domain');
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
                const current = getPanelFontConfig(type);
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
                            variableAxes: applied.variableAxes || {}
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
            const current = getPanelFontConfig(type);

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
        if (changeCount > 0) {
            // Check if all UI changes are actually defaults (Reset All case)
            const serifConfig = getCurrentUIConfig('serif');
            const sansConfig = getCurrentUIConfig('sans');
            const monoConfig = getCurrentUIConfig('mono');
            const allDefaults = !serifConfig && !sansConfig && !monoConfig;

            if (allDefaults) {
                // Special case: changeCount > 0 but all UI is defaults - show Reset All
                applyBtn.style.display = 'none';
                resetBtn.style.display = 'block';
                resetBtn.textContent = 'Reset All';
            } else {
                // Normal case: UI differs from storage - show Apply All
                applyBtn.style.display = 'block';
                applyBtn.textContent = changeCount > 1 ? `Apply All (${changeCount})` : 'Apply All';
                resetBtn.style.display = 'none';
            }
        } else {
            // UI matches storage - check if domain has any applied fonts
            const origin = await getActiveOrigin();
            const domainData = await getApplyMapForOrigin(origin);
            const domainHasFonts = domainData && (domainData.serif || domainData.sans || domainData.mono);

            if (domainHasFonts) {
                // Domain has fonts and UI matches - show Reset All
                applyBtn.style.display = 'none';
                resetBtn.style.display = 'block';
                resetBtn.textContent = 'Reset All';
            } else {
                // Domain has no fonts - hide both buttons
                applyBtn.style.display = 'none';
                resetBtn.style.display = 'none';
            }
        }
    }));
}

// TODO: Third Man In implementation only - do not use for Body Contact mode!
// Body Contact mode uses updateBodyButtons() for proper button management.
// This function is specifically for Third Man In mode panels (serif, sans, mono).
function updateThirdManInButtons(panelId) {
    // Safety check: prevent body mode from using this function
    if (panelId === 'body') {
        console.warn('updateThirdManInButtons called with body panelId - this should use updateBodyButtons instead');
        return Promise.resolve();
    }

    const applyBtn = document.getElementById(`apply-${panelId}`);
    const resetBtn = document.getElementById(`reset-${panelId}`);
    console.log('Found buttons - apply:', !!applyBtn, 'reset:', !!resetBtn);

    if (!applyBtn || !resetBtn) return Promise.resolve();

    // Third Man In mode: Apply All/Reset All logic
    if (currentViewMode === 'third-man-in') {
        return countThirdManInDifferences().then(changeCount => {
            if (changeCount > 0) {
                // Check if all UI changes are actually defaults (Reset All case)
                const serifConfig = getCurrentUIConfig('serif');
                const sansConfig = getCurrentUIConfig('sans');
                const monoConfig = getCurrentUIConfig('mono');
                const allDefaults = !serifConfig && !sansConfig && !monoConfig;

                if (allDefaults) {
                    // Special case: changeCount > 0 but all UI is defaults - show Reset All
                    applyBtn.style.display = 'none';
                    resetBtn.style.display = 'block';
                    resetBtn.textContent = 'Reset All';
                } else {
                    // Normal case: UI differs from storage - show Apply All
                    applyBtn.style.display = 'block';
                    applyBtn.textContent = changeCount > 1 ? `Apply All (${changeCount})` : 'Apply All';
                    resetBtn.style.display = 'none';
                }
            } else {
                // No differences - check if domain has any applied fonts
                return getActiveOrigin().then(origin => {
                    return getApplyMapForOrigin(origin).then(domainData => {
                        const domainHasFonts = domainData && (domainData.serif || domainData.sans || domainData.mono);

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
                    });
                });
            }
        });
    }

    // Get current panel configuration
    const currentConfig = getPanelFontConfig(panelId);
    console.log('Current config:', currentConfig);

    // Get applied configuration for this domain
    return getActiveOrigin().then(origin => {
        // Debug: let's see what's actually in storage
        return browser.storage.local.get('affoApplyMap').then(debugData => {
            const debugMap = (debugData && debugData.affoApplyMap) ? debugData.affoApplyMap : {};
            console.log('Full storage map:', debugMap);
            console.log('Entry for origin:', origin, ':', debugMap[origin]);

            return getAppliedConfigForDomain(origin, panelId).then(appliedConfig => {
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
            });
        });
    }).catch(error => {
        console.error('Error updating apply/reset button:', error);
        // Fallback to showing Apply button
        applyBtn.style.display = 'inline-flex';
        resetBtn.style.display = 'none';
        applyBtn.textContent = 'Apply';
    });
}

// Helper function to check if a config has any settings
function configHasAnySettings(config) {
    if (!config) return false;

    // Check if font family is set (not null/undefined/default)
    if (config.fontName && config.fontName.toLowerCase() !== 'default') return true;

    // Check basic controls (flattened "No Key" architecture - properties directly on config)
    if (config.fontSize !== null && config.fontSize !== undefined) return true;
    if (config.lineHeight !== null && config.lineHeight !== undefined) return true;
    if (config.fontWeight !== null && config.fontWeight !== undefined) return true;
    if (config.fontColor !== null && config.fontColor !== undefined) return true;

    // Check variable axes
    if (config.variableAxes && Object.keys(config.variableAxes).length > 0) return true;

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
function getAppliedConfigForDomain(origin, panelId) {
    if (!origin || !panelId) return Promise.resolve(null);

    // Use correct storage based on panel type
    if (panelId === 'body') {
        // Body mode uses consolidated affoApplyMap
        return browser.storage.local.get('affoApplyMap').then(data => {
            const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
            // Using origin directly (hostname)
            const entry = map[origin] || {};
            const payload = entry.body;

            if (!payload) return null;

            return convertPayloadToConfig(payload);
        });
    } else if (['serif', 'sans', 'mono'].includes(panelId)) {
        // Third Man In mode now uses consolidated affoApplyMap
        return getApplyMapForOrigin(origin, panelId).then(payload => {

            if (!payload) return null;

            return convertPayloadToConfig(payload);
        });
    }

    return Promise.resolve(null);
}

function convertPayloadToConfig(payload) {
    // Convert payload back to config format
    // Reconstruct active controls based on what was set in the payload
    const activeControls = [];
    if (payload.fontSize !== null && payload.fontSize !== undefined) {
        activeControls.push('font-size');
    }
    if (payload.lineHeight !== null && payload.lineHeight !== undefined) {
        activeControls.push('line-height');
    }
    if (payload.fontWeight !== null && payload.fontWeight !== undefined) {
        activeControls.push('weight');
    }

    // Use variableAxes directly
    const variableAxes = payload.variableAxes || {};
    const activeAxes = Object.keys(variableAxes);

    return {
        fontName: payload.fontName,
        basicControls: {
            fontSize: payload.fontSizePx,
            lineHeight: payload.lineHeight,
            fontWeight: payload.fontWeight,
            fontColor: payload.fontColor || null
        },
        variableAxes,
        activeAxes,
        activeControls
    };
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

// Helper to apply unset settings (remove all font styling from domain)
function applyUnsetSettings(panelId) {
    console.log(`applyUnsetSettings: Starting for panelId: ${panelId}`);

    // Get current origin for storage
    return getActiveOrigin().then(origin => {
        console.log(`applyUnsetSettings: Origin: ${origin}`);

        if (origin) {
            // Remove the applied configuration from storage
            return browser.storage.local.get('affoApplyMap').then(data => {
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
                return browser.storage.local.set({ affoApplyMap: map }).then(() => {
                    console.log(`applyUnsetSettings: Storage updated successfully`);

                    // Send message to content script to remove fonts from page
                    console.log('Sending resetFonts message to content script for panelId:', panelId);
                    return sendMessageToTargetTab({
                        type: 'resetFonts',
                        panelId: panelId
                    }).then(response => {
                        console.log('Content script response:', response);
                    }).catch(err => {
                        console.warn('Could not send reset message to content script:', err);
                    });
                });
            });
        }
        return Promise.resolve();
    }).catch(error => {
        console.error('Error applying unset settings:', error);
        throw error;
    });
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
