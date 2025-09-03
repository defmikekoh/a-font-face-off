// View mode: 'facade' (Serif/Sans Serif) or 'faceoff' (Top/Bottom)
let currentViewMode = 'facade';

function getPanelLabel(position) {
    if (currentViewMode === 'facade') return position === 'top' ? 'Serif' : 'Sans Serif';
    return position === 'top' ? 'Top Font' : 'Bottom Font';
}

function applyViewMode(forceView) {
    if (forceView) currentViewMode = forceView;
    try { localStorage.setItem('fontFaceoffView', currentViewMode); } catch (_) {}
    // Toggle body classes so CSS can react (e.g., show Apply buttons in Facade)
    try {
        document.body.classList.toggle('view-facade', currentViewMode === 'facade');
        document.body.classList.toggle('view-faceoff', currentViewMode === 'faceoff');
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
        }
    } catch (_) {}
    // Load settings for the current mode
    loadModeSettings();
}

// Load settings for the current view mode
function loadModeSettings() {
    const modeState = extensionState[currentViewMode];
    
    // Load top font if exists
    if (modeState.topFont && modeState.topFont.fontName) {
        setTimeout(() => {
            applyFontConfig('top', modeState.topFont);
        }, 50);
    } else {
        // Use default font for this mode
        loadFont('top', currentViewMode === 'facade' ? 'Roboto Flex' : 'Roboto Flex');
    }
    
    // Load bottom font if exists  
    if (modeState.bottomFont && modeState.bottomFont.fontName) {
        setTimeout(() => {
            applyFontConfig('bottom', modeState.bottomFont);
        }, 50);
    } else {
        // Use default font for this mode
        loadFont('bottom', currentViewMode === 'facade' ? 'Rubik' : 'Rubik');
    }
}

// Helper: get current active tab's origin without requiring 'tabs' permission
async function getActiveOrigin() {
    try {
        const res = await browser.tabs.executeScript({ code: 'location.origin' });
        if (Array.isArray(res) && res.length) return String(res[0]);
    } catch (_) {}
    return null;
}

// Reset facade for a panel: remove stored per-origin data, remove injected CSS, and unset controls (keep family)
async function resetFacadeFor(position) {
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
                const data = await browser.storage.local.get('affoApplyMap');
                const applyMap = (data && data.affoApplyMap) ? data.affoApplyMap : {};
                if (applyMap[origin]) {
                    delete applyMap[origin][genericKey];
                    if (!applyMap[origin].serif && !applyMap[origin].sans) delete applyMap[origin];
                }
                await browser.storage.local.set({ affoApplyMap: applyMap });
            } catch (_) {}
        }
        // Unset controls (keep family)
        if (position === 'top') resetTopFont(); else resetBottomFont();
        // Reflect buttons
        try { await syncApplyButtonsForOrigin(); } catch (_) {}
    } catch (_) {}
}

// Dynamic font axis cache populated from Google Fonts metadata + CSS parsing
// Track last applied CSS for the active tab to avoid 'tabs' permission
const appliedCssActive = { serif: null, sans: null };
const dynamicFontDefinitions = {};

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

// Track which axes are actively set (not dimmed)
let topActiveAxes = new Set();
let bottomActiveAxes = new Set();

// Track which basic controls are actively set
let topActiveControls = new Set();
let bottomActiveControls = new Set();

// Font settings memory - stores settings for each font
let topFontMemory = {};
let bottomFontMemory = {};

// Favorites storage
let savedFavorites = {};
let savedFavoritesOrder = [];

// Extension state storage - separate for each mode
let extensionState = {
    facade: {
        topFont: null,
        bottomFont: null
    },
    faceoff: {
        topFont: null,
        bottomFont: null
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
        if (stored) {
            const parsed = JSON.parse(stored);
            // Handle migration from old format
            if (parsed.topFont && parsed.bottomFont && !parsed.facade && !parsed.faceoff) {
                extensionState = {
                    facade: { topFont: null, bottomFont: null },
                    faceoff: { topFont: parsed.topFont, bottomFont: parsed.bottomFont }
                };
            } else {
                extensionState = parsed;
            }
        } else {
            extensionState = {
                facade: { topFont: null, bottomFont: null },
                faceoff: { topFont: null, bottomFont: null }
            };
        }
    } catch (error) {
        console.error('Error loading extension state:', error);
        extensionState = {
            facade: { topFont: null, bottomFont: null },
            faceoff: { topFont: null, bottomFont: null }
        };
    }
}

// Save extension state to localStorage
function saveExtensionState() {
    try {
        const topConfig = getCurrentFontConfig('top');
        const bottomConfig = getCurrentFontConfig('bottom');
        
        // Only save if we have valid configurations
        if (topConfig && bottomConfig) {
            extensionState[currentViewMode].topFont = topConfig;
            extensionState[currentViewMode].bottomFont = bottomConfig;
            localStorage.setItem('fontFaceoffState', JSON.stringify(extensionState));
        }
    } catch (error) {
        console.error('Error saving extension state:', error);
    }
}

// Get current font configuration
function getCurrentFontConfig(position) {
    // Safety check - ensure elements exist
    const fontSelect = document.getElementById(`${position}-font-select`);
    const fontSizeControl = document.getElementById(`${position}-font-size`);
    const lineHeightControl = document.getElementById(`${position}-line-height`);
    const fontWeightControl = document.getElementById(`${position}-font-weight`);
    const fontColorControl = document.getElementById(`${position}-font-color`);
    
    if (!fontSelect || !fontSizeControl || !lineHeightControl || !fontWeightControl || !fontColorControl) {
        return null;
    }
    
    const heading = document.getElementById(`${position}-font-name`);
    const rawFontName = (heading && heading.textContent) ? heading.textContent : fontSelect.value;
    const fontName = (rawFontName && String(rawFontName).toLowerCase() !== 'default') ? rawFontName : null;
    const fontSize = fontSizeControl.value;
    const lineHeight = lineHeightControl.value;
    const fontWeight = fontWeightControl.value;
    const fontColor = fontColorControl.value;
    
    const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
    const config = {
        fontName,
        basicControls: {
            fontSize: activeControls.has('font-size') ? parseFloat(fontSize) : null,
            lineHeight: activeControls.has('line-height') ? parseFloat(lineHeight) : null,
            fontWeight: activeControls.has('weight') ? parseInt(fontWeight) : null,
            fontColor
        },
        activeControls: Array.from(activeControls),
        activeAxes: Array.from(position === 'top' ? topActiveAxes : bottomActiveAxes),
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

// Apply font configuration
function applyFontConfig(position, config) {
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
        const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
        const activeAxes = position === 'top' ? topActiveAxes : bottomActiveAxes;
        
        activeControls.clear();
        activeAxes.clear();
        
        // Add active controls back from arrays
        if (config.activeControls && Array.isArray(config.activeControls)) {
            config.activeControls.forEach(control => activeControls.add(control));
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
    }, 100);
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
    loadFont(currentPosition, name);
    close();
    // Reflect Apply/Update state immediately after changing family
    try { setTimeout(() => { try { refreshApplyButtonsDirtyState(); } catch (_) {} }, 0); } catch (_) {}
}

    // Listeners
    const triggerOpen = (pos) => () => open(pos);
    topTrigger?.addEventListener('click', triggerOpen('top'));
    bottomTrigger?.addEventListener('click', triggerOpen('bottom'));
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
    const currentFontName = document.getElementById(`${position}-font-name`).textContent;
    if (currentFontName && currentFontName !== fontName) {
        saveFontSettings(position, currentFontName);
    }
    
    // Clear active axes tracking when switching fonts
    if (position === 'top') {
        topActiveAxes.clear();
    } else {
        bottomActiveAxes.clear();
    }
    
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
    document.getElementById(`${position}-font-name`).textContent = fontName;
    const familyDisplay = document.getElementById(`${position}-font-display`);
    if (familyDisplay) {
        familyDisplay.textContent = fontName;
        familyDisplay.classList.remove('placeholder');
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
    
    // Update basic controls
    updateBasicControls(position);
    
    // Save current state unless explicitly suppressed (restores will save after values are applied)
    if (!suppressImmediateSave) {
        setTimeout(() => saveExtensionState(), 100);
    }
    // Update Apply/Applied/Update buttons to reflect new UI vs saved state
    try { setTimeout(() => { try { refreshApplyButtonsDirtyState(); } catch (_) {} }, 0); } catch (_) {}
}

async function loadGoogleFont(fontName) {
    // Check if font is already loaded
    const existingLink = document.querySelector(`link[data-font="${fontName}"]`);
    if (existingLink) return;
    // Prefer axis-tag form to guarantee variable family + axes are served
    const fontUrl = await buildCss2Url(fontName);

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
    const axesSection = document.getElementById(`${position}-axes-section`);
    // Pull dynamic defs when available
    const fontDef = dynamicFontDefinitions[fontName] || fontDefinitions[fontName];
    
    // Clear existing axes controls
    axesSection.innerHTML = '<h3>Variable Axes</h3>';
    
    if (!fontDef || fontDef.axes.length === 0) {
        axesSection.innerHTML += '<p class="no-axes">This font has no variable axes.</p>';
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
        axesSection.appendChild(controlGroup);
        
        // Add event listeners for both slider and text input
        function activateAxis() {
            const activeAxes = position === 'top' ? topActiveAxes : bottomActiveAxes;
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
            const activeAxes = position === 'top' ? topActiveAxes : bottomActiveAxes;
            activeAxes.delete(axis);
            controlGroup.classList.add('unset');
            applyFont(position);
        });
    });
    
    // Store controls reference
    if (position === 'top') {
        topFontControlsVars = {};
        topFontControlsVars.fontSize = document.getElementById('top-font-size');
        topFontControlsVars.lineHeight = document.getElementById('top-line-height');
        topFontControlsVars.fontWeight = document.getElementById('top-font-weight');
        topFontControlsVars.fontColor = document.getElementById('top-font-color');
        fontDef.axes.forEach(axis => {
            topFontControlsVars[axis] = document.getElementById(`top-${axis}`);
        });
    } else {
        bottomFontControlsVars = {};
        bottomFontControlsVars.fontSize = document.getElementById('bottom-font-size');
        bottomFontControlsVars.lineHeight = document.getElementById('bottom-line-height');
        bottomFontControlsVars.fontWeight = document.getElementById('bottom-font-weight');
        bottomFontControlsVars.fontColor = document.getElementById('bottom-font-color');
        fontDef.axes.forEach(axis => {
            bottomFontControlsVars[axis] = document.getElementById(`bottom-${axis}`);
        });
    }
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
    const genericKey = (position === 'top') ? 'serif' : 'sans';
    try {
        const origin = await getActiveOrigin();
        const host = origin ? (new URL(origin)).hostname : '';
        // Determine saved state for this origin/role
        let savedEntry = null;
        if (origin) {
            try {
                const data = await browser.storage.local.get('affoApplyMap');
                const applyMap = (data && data.affoApplyMap) ? data.affoApplyMap : {};
                savedEntry = applyMap[origin] ? applyMap[origin][genericKey] : null;
            } catch (_) { savedEntry = null; }
        }
        
        // If there is a saved entry and current UI matches it, treat this click as Unapply
        if (savedEntry) {
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
        const cfg = getCurrentFontConfig(position);
        if (!cfg) return false;
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
        if (sizeActive && fontSizePx !== null && !isNaN(fontSizePx)) decl.push('font-size: ' + fontSizePx + 'px !important');
        if (lineActive && lineHeight !== null && !isNaN(lineHeight)) decl.push('line-height: ' + lineHeight + ' !important');
        if (wdthVal !== null) decl.push('font-stretch: ' + wdthVal + '% !important');
        if (italVal !== null && italVal >= 1) decl.push('font-style: italic !important');
        else if (slntVal !== null && slntVal !== 0) decl.push('font-style: oblique ' + slntVal + 'deg !important');
        if (varParts.length) decl.push('font-variation-settings: ' + varParts.join(', ') + ' !important');
        // High-specificity guard: :not(#affo-guard) boosts specificity without excluding elements
        const guardNeg = ":not(#affo-guard):not(.affo-guard):not([data-affo-guard])";
        const baseSel = "body" + guardNeg + ", " +
                        "body" + guardNeg + " :not(#affo-guard):not(.affo-guard):not([data-affo-guard])" +
                        ":not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(pre):not(code):not(kbd):not(samp):not(tt):not(button):not(input):not(select):not(textarea):not(header):not(nav):not(footer):not(aside):not(label):not([role=\\\"navigation\\\"]):not([role=\\\"banner\\\"]):not([role=\\\"contentinfo\\\"]):not([role=\\\"complementary\\\"]):not(.code):not(.hljs):not(.token):not(.monospace):not(.mono):not(.terminal):not([class^=\\\"language-\\\"]):not([class*=\\\" language-\\\"]):not(.prettyprint):not(.prettyprinted):not(.sourceCode):not(.wp-block-code):not(.wp-block-preformatted):not(.small-caps):not(.smallcaps):not(.smcp):not(.sc):not(.site-header):not(.sidebar):not(.toc)";
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
        if (!fontFaceOnly && !inlineApply) {
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

function saveFontSettings(position, fontName) {
    const memory = position === 'top' ? topFontMemory : bottomFontMemory;
    const activeAxes = position === 'top' ? topActiveAxes : bottomActiveAxes;
    const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
    const fontDef = getEffectiveFontDefinition(fontName);
    
    const settings = {
        basicControls: {
            fontSize: document.getElementById(`${position}-font-size`).value,
            lineHeight: document.getElementById(`${position}-line-height`).value,
            fontWeight: document.getElementById(`${position}-font-weight`).value,
            fontColor: document.getElementById(`${position}-font-color`).value
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
    const memory = position === 'top' ? topFontMemory : bottomFontMemory;
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
    
    // Prefer the last loaded name (heading text) to avoid races with select rebuilds
    const headingEl = document.getElementById(`${position}-font-name`);
    const fontName = (headingEl && headingEl.textContent) ? headingEl.textContent : document.getElementById(`${position}-font-select`).value;
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
    const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
    
    if (activeControls.has('font-size')) { textElement.style.fontSize = fontSize; } else { textElement.style.fontSize = ''; }
    if (activeControls.has('line-height')) { textElement.style.lineHeight = lineHeight; } else { textElement.style.lineHeight = ''; }
    textElement.style.color = fontColor;
    if (isUnsetFont && currentViewMode === 'facade') {
        textElement.style.fontFamily = '';
        textElement.style.display = 'none'; // Hide Gettysburg Address when font is unset
    } else {
        textElement.style.fontFamily = `"${fontName}"`;
        textElement.style.display = ''; // Show Gettysburg Address when font is set
    }
    
    // Only apply font-weight if the weight control has been activated
    if (activeControls.has('weight')) {
        textElement.style.fontWeight = fontWeight;
    } else {
        textElement.style.fontWeight = ''; // Let font's default weight show
    }
    
    headingElement.style.fontSize = Math.max(16, parseFloat(fontSize) + 2) + 'px';
    headingElement.style.color = fontColor;
    if (isUnsetFont && currentViewMode === 'facade') {
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
    
    // Apply variable axes if available - only active ones
    if (fontDef && fontDef.axes && fontDef.axes.length > 0) {
        const activeAxes = position === 'top' ? topActiveAxes : bottomActiveAxes;
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
            textElement.style.fontVariationSettings = variations;
            headingElement.style.fontVariationSettings = variations;
        } else {
            // Clear font variation settings if no active axes
            textElement.style.fontVariationSettings = '';
            headingElement.style.fontVariationSettings = '';
        }

        // For registered axes, map to high-level CSS properties (which take precedence)
        if (wdthVal !== null) {
            const pct = Math.max(1, Math.min(1000, wdthVal));
            textElement.style.fontStretch = pct + '%';
            headingElement.style.fontStretch = pct + '%';
        } else {
            textElement.style.fontStretch = '';
            headingElement.style.fontStretch = '';
        }

        if (italVal !== null && italVal >= 1) {
            textElement.style.fontStyle = 'italic';
            headingElement.style.fontStyle = 'italic';
        } else if (slntVal !== null && slntVal !== 0) {
            textElement.style.fontStyle = `oblique ${slntVal}deg`;
            headingElement.style.fontStyle = `oblique ${slntVal}deg`;
        } else {
            textElement.style.fontStyle = '';
            headingElement.style.fontStyle = '';
        }
    } else {
        // Ensure no leftover variations linger for non-variable fonts
        textElement.style.fontVariationSettings = '';
        headingElement.style.fontVariationSettings = '';
        textElement.style.fontStretch = '';
        headingElement.style.fontStretch = '';
        textElement.style.fontStyle = '';
        headingElement.style.fontStyle = '';
    }
    
    // Save state after applying font changes
    setTimeout(() => saveExtensionState(), 50);
}

function updateBasicControls(position) {
    const fontSizeValue = document.getElementById(`${position}-font-size-value`);
    const lineHeightValue = document.getElementById(`${position}-line-height-value`);
    const fontWeightValue = document.getElementById(`${position}-font-weight-value`);
    const fontSizeControl = document.getElementById(`${position}-font-size`);
    const lineHeightControl = document.getElementById(`${position}-line-height`);
    const fontWeightControl = document.getElementById(`${position}-font-weight`);
    const fontColorControl = document.getElementById(`${position}-font-color`);
    
    // Add event listeners for basic controls if not already added
    if (fontSizeControl && !fontSizeControl.hasListener) {
        fontSizeControl.addEventListener('input', function() {
            if (fontSizeValue) fontSizeValue.textContent = this.value + 'px';
            const fontSizeTextInput = document.getElementById(`${position}-font-size-text`);
            if (fontSizeTextInput) {
                fontSizeTextInput.value = this.value;
            }
            applyFont(position);
        });
        fontSizeControl.hasListener = true;
        
        // Add text input handler for font size
        const fontSizeTextInput = document.getElementById(`${position}-font-size-text`);
        if (fontSizeTextInput && !fontSizeTextInput.hasListener) {
            fontSizeTextInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    const value = Math.min(Math.max(parseFloat(this.value) || 17, 6), 200);
                    this.value = value;
                    fontSizeControl.value = Math.min(Math.max(value, 10), 72); // Clamp to slider range for display
                    if (fontSizeValue) fontSizeValue.textContent = value + 'px';
                    applyFont(position);
                    this.blur();
                }
            });
            
            fontSizeTextInput.addEventListener('blur', function() {
                const value = Math.min(Math.max(parseFloat(this.value) || 17, 6), 200);
                this.value = value;
                fontSizeControl.value = Math.min(Math.max(value, 10), 72); // Clamp to slider range for display
                if (fontSizeValue) fontSizeValue.textContent = value + 'px';
                applyFont(position);
            });
            fontSizeTextInput.hasListener = true;
        }
    }
    
    if (lineHeightControl && !lineHeightControl.hasListener) {
        lineHeightControl.addEventListener('input', function() {
            const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
            const controlGroup = this.closest('.control-group');
            
            // Activate the control when user interacts with it
            activeControls.add('line-height');
            if (controlGroup) {
                controlGroup.classList.remove('unset');
            }
            
            lineHeightValue.textContent = this.value;
            const lineHeightTextInput = document.getElementById(`${position}-line-height-text`);
            if (lineHeightTextInput) {
                lineHeightTextInput.value = this.value;
            }
            applyFont(position);
            setTimeout(() => saveExtensionState(), 50);
        });
        lineHeightControl.hasListener = true;
        
        // Add text input handler for line height
        const lineHeightTextInput = document.getElementById(`${position}-line-height-text`);
        if (lineHeightTextInput && !lineHeightTextInput.hasListener) {
            lineHeightTextInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
                    const controlGroup = this.closest('.control-group');
                    
                    // Activate the control when user interacts with it
                    activeControls.add('line-height');
                    if (controlGroup) {
                        controlGroup.classList.remove('unset');
                    }
                    
                    const value = Math.min(Math.max(parseFloat(this.value) || 1.6, 0.5), 5);
                    this.value = value;
                    lineHeightControl.value = Math.min(Math.max(value, 1), 3); // Clamp to slider range for display
                    lineHeightValue.textContent = value;
                    applyFont(position);
                    setTimeout(() => saveExtensionState(), 50);
                    this.blur();
                }
            });
            
            lineHeightTextInput.addEventListener('blur', function() {
                const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
                const controlGroup = this.closest('.control-group');
                
                // Activate the control when user interacts with it
                activeControls.add('line-height');
                if (controlGroup) {
                    controlGroup.classList.remove('unset');
                }
                
                const value = Math.min(Math.max(parseFloat(this.value) || 1.6, 0.5), 5);
                this.value = value;
                lineHeightControl.value = Math.min(Math.max(value, 1), 3); // Clamp to slider range for display
                lineHeightValue.textContent = value;
                applyFont(position);
                setTimeout(() => saveExtensionState(), 50);
            });
            lineHeightTextInput.hasListener = true;
        }
    }
    
    if (fontWeightControl && !fontWeightControl.hasListener) {
        fontWeightControl.addEventListener('input', function() {
            const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
            const controlGroup = this.closest('.control-group');
            
            // Activate weight control on first touch
            if (!activeControls.has('weight')) {
                activeControls.add('weight');
                controlGroup.classList.remove('unset');
            }
            
            fontWeightValue.textContent = this.value;
            applyFont(position);
        });
        fontWeightControl.hasListener = true;
    }
    
    if (fontColorControl && !fontColorControl.hasListener) {
        fontColorControl.addEventListener('change', function() {
            applyFont(position);
        });
        fontColorControl.hasListener = true;
    }
    
    // Update display values
    if (fontSizeValue) fontSizeValue.textContent = fontSizeControl.value + 'px';
    if (lineHeightValue) lineHeightValue.textContent = lineHeightControl.value;
    if (fontWeightValue) fontWeightValue.textContent = fontWeightControl.value;
}

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
    const config = getCurrentFontConfig(position);
    if (!config) return 'Font Configuration';
    
    let name = config.fontName;
    const parts = [];
    
    // Always include font size in name
    parts.push(`${config.basicControls.fontSize}px`);
    if (hasInCollection(config.activeControls, 'weight') && config.basicControls.fontWeight !== 400) {
        parts.push(`${config.basicControls.fontWeight}wt`);
    }
    if (hasInCollection(config.activeControls, 'line-height') && config.basicControls.lineHeight !== 1.6) {
        parts.push(`${config.basicControls.lineHeight}lh`);
    }
    
    // Add variable axes that are active
    if (config.variableAxes && config.activeAxes) {
        Object.entries(config.variableAxes).forEach(([axis, value]) => {
            const fontDef = fontDefinitions[config.fontName];
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
    const config = getCurrentFontConfig(position);
    if (!config) return 'No configuration available';
    
    const lines = [];
    lines.push(`Font: ${config.fontName}`);
    
    // Always show font size
    lines.push(`Size: ${config.basicControls.fontSize}px`);
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
                const fontDef = fontDefinitions[config.fontName];
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
    
    // View mode init: always start in 'facade' on popup open
    currentViewMode = 'facade';
    try { localStorage.setItem('fontFaceoffView', currentViewMode); } catch (_) {}
    applyViewMode();

    // Hook view toggle
    const viewToggleBtn = document.getElementById('toggle-view');
    if (viewToggleBtn) {
        viewToggleBtn.addEventListener('click', function() {
            currentViewMode = (currentViewMode === 'facade') ? 'faceoff' : 'facade';
            applyViewMode();
        });
    }

    // Apply-to-page buttons (Facade mode)
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

    // Track changes to mark buttons as Update when UI differs from saved
    const debouncedRefresh = debounce(refreshApplyButtonsDirtyState, 200);
    document.addEventListener('input', debouncedRefresh, true);
    document.addEventListener('change', debouncedRefresh, true);




    const topSizeSlider = document.getElementById('top-font-size');
    const bottomSizeSlider = document.getElementById('bottom-font-size');
    const topSizeText = document.getElementById('top-font-size-text');
    const bottomSizeText = document.getElementById('bottom-font-size-text');
    const topSizeGroup = document.querySelector('#top-font-controls .control-group[data-control="font-size"]');
    const bottomSizeGroup = document.querySelector('#bottom-font-controls .control-group[data-control="font-size"]');
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

    // Font Picker wiring
    setupFontPicker();

    // Initialize font family displays from current values
    const topSel = document.getElementById('top-font-select');
    const botSel = document.getElementById('bottom-font-select');
    const topDisp = document.getElementById('top-font-display');
    const botDisp = document.getElementById('bottom-font-display');
    if (topSel && topDisp) topDisp.textContent = topSel.value || 'Roboto Flex';
    if (botSel && botDisp) botDisp.textContent = botSel.value || 'Rubik';

    // Family reset handlers (Facade only)
    function handleFamilyReset(position) {
        if (currentViewMode !== 'facade') return;
        const disp = document.getElementById(`${position}-font-display`);
        const group = disp && disp.closest('.control-group');
        if (disp) { disp.textContent = 'Default'; disp.classList.add('placeholder'); }
        if (group) group.classList.add('unset');
        const heading = document.getElementById(`${position}-font-name`);
        if (heading) heading.textContent = 'Default';
        applyFont(position); // Update preview to reflect unset state
        try { refreshApplyButtonsDirtyState(); } catch (_) {}
    }
    const topFamReset = document.getElementById('top-family-reset');
    if (topFamReset) topFamReset.addEventListener('click', () => handleFamilyReset('top'));
    const botFamReset = document.getElementById('bottom-family-reset');
    if (botFamReset) botFamReset.addEventListener('click', () => handleFamilyReset('bottom'));

    // Add event listeners for footer Reset buttons
    const resetTopBtn = document.getElementById('reset-top');
    if (resetTopBtn) resetTopBtn.addEventListener('click', async function() {
        if (currentViewMode === 'facade') { await resetFacadeFor('top'); }
        else { await (async () => { try { resetTopFont(); setTimeout(() => saveExtensionState(), 50); } catch (_) {} })(); }
    });
    const resetBottomBtn = document.getElementById('reset-bottom');
    if (resetBottomBtn) resetBottomBtn.addEventListener('click', async function() {
        if (currentViewMode === 'facade') { await resetFacadeFor('bottom'); }
        else { await (async () => { try { resetBottomFont(); setTimeout(() => saveExtensionState(), 50); } catch (_) {} })(); }
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
            const position = e.target.closest('.controls-panel').id.includes('top') ? 'top' : 'bottom';
            const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
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
            const position = e.target.closest('.controls-panel').id.includes('top') ? 'top' : 'bottom';
            const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
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
            const position = e.target.closest('.controls-panel').id.includes('top') ? 'top' : 'bottom';
            const activeControls = position === 'top' ? topActiveControls : bottomActiveControls;
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
    });
    
    // Load saved state and initialize fonts
    loadExtensionState();
    
    const currentModeState = extensionState[currentViewMode];
    if (currentModeState.topFont && currentModeState.topFont.fontName) {
        // Restore saved top font for current mode
        setTimeout(() => {
            applyFontConfig('top', currentModeState.topFont);
        }, 100);
    } else {
        // Use default top font
        loadFont('top', 'Roboto Flex');
    }
    
    if (currentModeState.bottomFont && currentModeState.bottomFont.fontName) {
        // Restore saved bottom font for current mode
        setTimeout(() => {
            applyFontConfig('bottom', currentModeState.bottomFont);
        }, 100);
    } else {
        // Use default bottom font
        loadFont('bottom', 'Rubik');
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
        const currentModeState = extensionState[currentViewMode];
        const topDesired = (currentModeState.topFont && currentModeState.topFont.fontName) ? resolveFamilyCase(currentModeState.topFont.fontName) : undefined;
        const botDesired = (currentModeState.bottomFont && currentModeState.bottomFont.fontName) ? resolveFamilyCase(currentModeState.bottomFont.fontName) : undefined;
        const ok = await initializeGoogleFontsSelects(topDesired, botDesired);
        // Re-apply saved state once more to guarantee selection sticks even if the list was rebuilt
        if (ok && extensionState) {
            const currentModeState = extensionState[currentViewMode];
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
        // Sync visible displays again after list rebuild to the resolved values
        const topSel2 = document.getElementById('top-font-select');
        const botSel2 = document.getElementById('bottom-font-select');
        const topDisp2 = document.getElementById('top-font-display');
        const botDisp2 = document.getElementById('bottom-font-display');
        if (topSel2 && topDisp2) topDisp2.textContent = topSel2.value;
        if (botSel2 && botDisp2) botDisp2.textContent = botSel2.value;
        // Persist any canonicalized names
        saveExtensionState();
        // In Facade mode, prepopulate from saved per-origin settings (if any)
        try { await prepopulateFacadeFromSavedOrigin(); } catch (_) {}
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
        
        const config = getCurrentFontConfig(position);
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
    
    // Edit favorites button
    if (editFavoritesBtn) {
        editFavoritesBtn.addEventListener('click', showEditFavoritesModal);
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
    
    // Setup favorites for both panels
    setupSaveFavorite('top');
    setupLoadFavorite('top');
    setupSaveFavorite('bottom');
    setupLoadFavorite('bottom');
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
    const base = getCurrentFontConfig(position) || {
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
                : base.basicControls.fontSize,
            lineHeight: (payload.lineHeight !== null && payload.lineHeight !== undefined)
                ? Number(payload.lineHeight)
                : base.basicControls.lineHeight,
            fontWeight: (payload.fontWeight !== null && payload.fontWeight !== undefined)
                ? Number(payload.fontWeight)
                : base.basicControls.fontWeight,
            fontColor: base.basicControls.fontColor
        },
        activeControls: [],
        activeAxes: [],
        variableAxes: {}
    };
    const hasWeight = (payload.fontWeight !== null && payload.fontWeight !== undefined);
    const hasSize = (payload.fontSizePx !== null && payload.fontSizePx !== undefined);
    const hasLine = (payload.lineHeight !== null && payload.lineHeight !== undefined);
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
    const tags = new Set();
    (payload.varPairs || []).forEach(p => { if (p && p.tag) { tags.add(p.tag); config.variableAxes[p.tag] = Number(p.value); } });
    // Don't convert between traditional weight and variable axis - they're independent
    if (payload.wdthVal !== null && payload.wdthVal !== undefined && !tags.has('wdth')) { tags.add('wdth'); config.variableAxes.wdth = Number(payload.wdthVal); }
    if (payload.slntVal !== null && payload.slntVal !== undefined && !tags.has('slnt')) { tags.add('slnt'); config.variableAxes.slnt = Number(payload.slntVal); }
    if (payload.italVal !== null && payload.italVal !== undefined && !tags.has('ital')) { tags.add('ital'); config.variableAxes.ital = Number(payload.italVal); }
    config.activeAxes = Array.from(tags);
    return config;
}

// Prepopulate Serif/Sans controls from saved per-origin settings (Facade mode)
async function prepopulateFacadeFromSavedOrigin() {
    if (currentViewMode !== 'facade') return;
    try {
        const origin = await getActiveOrigin();
        if (!origin) return;
        const data = await browser.storage.local.get('affoApplyMap');
        const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
        const entry = map[origin];
        if (!entry) return;
        if (entry.serif) {
            const cfgTop = buildConfigFromPayload('top', entry.serif);
            applyFontConfig('top', cfgTop);
        }
        if (entry.sans) {
            const cfgBottom = buildConfigFromPayload('bottom', entry.sans);
            applyFontConfig('bottom', cfgBottom);
        }
    } catch (_) {}
}


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

// Build a payload from current UI config (used to detect dirty state)
function buildCurrentPayload(position) {
    const genericKey = (position === 'top') ? 'serif' : 'sans';
    const cfg = getCurrentFontConfig(position);
    if (!cfg) return null;
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
    const weightActive = (cfg.activeControls || []).indexOf('weight') !== -1;
    const fontWeight = weightActive ? Number(cfg.basicControls && cfg.basicControls.fontWeight) : null;
    const fontSizeActive = (cfg.activeControls || []).indexOf('font-size') !== -1;
    const fontSizePx = fontSizeActive && cfg.basicControls && cfg.basicControls.fontSize !== null ? Number(cfg.basicControls.fontSize) : null;
    const lineHeightActive = (cfg.activeControls || []).indexOf('line-height') !== -1;
    const lineHeight = lineHeightActive && cfg.basicControls && cfg.basicControls.lineHeight !== null ? Number(cfg.basicControls.lineHeight) : null;
    return {
        fontName: cfg.fontName,
        generic: (genericKey === 'serif' ? 'serif' : 'sans-serif'),
        varPairs,
        wdthVal,
        slntVal,
        italVal,
        fontWeight,
        fontSizePx,
        lineHeight
    };
}

// Reflect button labels based on saved vs current (Applied/Update/Apply)
async function refreshApplyButtonsDirtyState() {
    try {
        const origin = await getActiveOrigin();
        const data = await browser.storage.local.get('affoApplyMap');
        const map = (data && data.affoApplyMap) ? data.affoApplyMap : {};
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

// Debounce helper
function debounce(fn, wait) {
    let t = null; return function(...args){ clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
}
