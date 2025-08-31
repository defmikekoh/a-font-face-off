// Dynamic font axis cache populated from Google Fonts metadata + CSS parsing
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
    const cssInfo = await fetchGoogleCssInfo(fontName, axesFromMetadata);

    // Prefer exact fvar parsing when we can fetch a TTF (or decode WOFF2) and opentype is available
    let fromFvar = null;
    try {
        if (isOpentypeAvailable()) {
            const fontUrl = extractFirstFontUrl(cssInfo.cssText);
            if (fontUrl) {
                const sfntBuffer = await fetchSfntBuffer(fontUrl);
                if (sfntBuffer) fromFvar = parseFvarFromSfnt(sfntBuffer);
            }
        }
    } catch (e) {
        console.warn('fvar parsing failed; falling back to CSS detection', e);
    }

    // Gather CSS hints (for ital, etc.)
    const cssAxisHints = deriveAxisRangesFromCss(cssInfo.cssText);
    // Try to derive registered axis ranges from CSS when fvar unavailable
    const axisRanges = fromFvar?.ranges || cssAxisHints;

    // Compose axes list: registered from CSS + any remaining from metadata
    const combinedAxes = new Set();
    Object.keys(axisRanges || {}).forEach(a => combinedAxes.add(a));
    axesFromMetadata.forEach(a => combinedAxes.add(a));
    // Ensure ital is present when CSS advertises italic faces
    if (cssAxisHints && cssAxisHints.ital) {
        combinedAxes.add('ital');
        if (!axisRanges.ital) {
            axisRanges.ital = { min: 0, max: 1, def: 0 };
        }
    }
    // Remove unknown ital/slnt conflicts: if css shows italic only with no slnt range, keep ital
    if (combinedAxes.has('ital') && combinedAxes.has('slnt') && !('slnt' in axisRanges)) {
        // keep both; users may want oblique vs italic
    }

    // Build defaults, ranges, steps
    const axes = Array.from(combinedAxes);
    const defaults = {};
    const ranges = {};
    const steps = {};

    axes.forEach(axis => {
        if (axisRanges && axisRanges[axis]) {
            ranges[axis] = [axisRanges[axis].min, axisRanges[axis].max];
            defaults[axis] = axisRanges[axis].def;
            steps[axis] = AXIS_STEP_DEFAULTS[axis] || 1;
        } else {
            // Fallbacks for axes present in metadata but not in CSS
            switch (axis) {
                case 'wght':
                    ranges[axis] = [100, 1000];
                    defaults[axis] = AXIS_DEFAULTS.wght;
                    steps[axis] = AXIS_STEP_DEFAULTS.wght;
                    break;
                case 'wdth':
                    ranges[axis] = [75, 125];
                    defaults[axis] = AXIS_DEFAULTS.wdth;
                    steps[axis] = AXIS_STEP_DEFAULTS.wdth;
                    break;
                case 'opsz':
                    ranges[axis] = [8, 144];
                    defaults[axis] = AXIS_DEFAULTS.opsz;
                    steps[axis] = AXIS_STEP_DEFAULTS.opsz;
                    break;
                case 'slnt':
                    ranges[axis] = [-10, 0];
                    defaults[axis] = AXIS_DEFAULTS.slnt;
                    steps[axis] = AXIS_STEP_DEFAULTS.slnt;
                    break;
                case 'ital':
                    ranges[axis] = [0, 1];
                    defaults[axis] = AXIS_DEFAULTS.ital;
                    steps[axis] = AXIS_STEP_DEFAULTS.ital;
                    break;
                default:
                    // Unknown/custom axis: conservative generic fallback
                    ranges[axis] = [0, 1000];
                    defaults[axis] = 0;
                    steps[axis] = AXIS_STEP_DEFAULTS[axis] || 1;
            }
        }
    });

    const def = { axes, defaults, ranges, steps };
    dynamicFontDefinitions[fontName] = def;
    return def;
}

function isOpentypeAvailable() {
    return (typeof window !== 'undefined') && window.opentype && typeof window.opentype.parse === 'function';
}

function extractFirstFontUrl(cssText) {
    try {
        // Choose a normal style face if present; otherwise use first
        const faces = cssText.split('@font-face').slice(1);
        const chosen = faces.find(b => /font-style:\s*normal/.test(b)) || faces[0] || '';
        if (!chosen) return null;

        // Collect url(...) occurrences in the chosen block
        const urlRe = /url\(([^)]+)\)/g;
        let m;
        let best = null;
        function unquote(s) {
            s = s.trim();
            if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                return s.slice(1, -1);
            }
            return s;
        }
        while ((m = urlRe.exec(chosen)) !== null) {
            const raw = m[1];
            const url = unquote(raw);
            // Find format(...) after this url
            const after = chosen.slice(urlRe.lastIndex);
            const fmtMatch = after.match(/format\(([^)]+)\)/i);
            const fmt = fmtMatch ? unquote(fmtMatch[1]).toLowerCase() : '';
            const ext = (url.match(/\.([a-z0-9]+)(?:\?|$)/i) || [,''])[1].toLowerCase();
            let score = 0;
            if (ext === 'ttf' || ext === 'otf' || fmt.includes('truetype') || fmt.includes('opentype')) score = 3;
            else if (ext === 'woff2' || fmt.includes('woff2')) score = 2;
            else if (ext === 'woff' || fmt.includes('woff')) score = 1;
            if (!best || score > best.score) best = { url, score };
            if (score === 3) break; // Best possible
        }
        return best ? best.url : null;
    } catch (e) {
        console.warn('Failed to extract font URL:', e);
        return null;
    }
}

async function fetchSfntBuffer(fontUrl) {
    const res = await fetch(fontUrl, { credentials: 'omit' });
    const buf = await res.arrayBuffer();
    if (/\.(ttf|otf)(\?|$)/i.test(fontUrl)) {
        return buf; // Ready for opentype.js
    }
    if (/\.woff2(\?|$)/i.test(fontUrl)) {
        const input = new Uint8Array(buf);
        try {
            await ensureFonteditorWoff2();
            const mod = window.__fonteditorWoff2Module;
            if (mod && typeof mod.woff2Dec === 'function') {
                const vec = mod.woff2Dec(input, input.byteLength);
                if (vec && typeof vec.size === 'function' && typeof vec.get === 'function') {
                    const len = vec.size();
                    const out = new Uint8Array(len);
                    for (let i = 0; i < len; i++) out[i] = vec.get(i);
                    return out.buffer;
                }
                if (vec && vec.buffer) return vec.buffer;
            }
        } catch (e) {
            console.warn('WOFF2->TTF decode failed; skipping fvar parse', e);
        }
        return null;
    }
    return null;
}

// Lazy-load fonteditor-core woff2 wasm decoder
async function ensureFonteditorWoff2() {
    if (window.__fonteditorWoff2Ready) return true;
    await new Promise((resolve, reject) => {
        try {
            // Configure emscripten module before script loads
            window.Module = {
                locateFile: function(path) {
                    if (path.endsWith('.wasm')) return 'lib/fonteditor-woff2.wasm';
                    return path;
                },
                onRuntimeInitialized: function() {
                    window.__fonteditorWoff2Module = window.Module;
                    window.__fonteditorWoff2Ready = true;
                    resolve(true);
                    // Cleanup global to reduce chance of conflicts
                    try { delete window.Module; } catch (_) {}
                }
            };
            const s = document.createElement('script');
            s.src = 'lib/fonteditor-woff2.js';
            s.onload = function() { /* onRuntimeInitialized resolves */ };
            s.onerror = function(err) { reject(err); };
            document.head.appendChild(s);
        } catch (e) { reject(e); }
    });
    return true;
}

function parseFvarFromSfnt(sfntBuffer) {
    if (!isOpentypeAvailable()) throw new Error('opentype.js not available');
    const font = window.opentype.parse(sfntBuffer);
    const ranges = {};
    const axes = [];
    const defaults = {};
    const steps = {};
    const fvar = font && font.tables && font.tables.fvar;
    if (!fvar || !Array.isArray(fvar.axes) || fvar.axes.length === 0) {
        throw new Error('No fvar axes');
    }
    fvar.axes.forEach(ax => {
        const tag = (ax.tag || ax.axisTag || '').trim();
        if (!tag) return;
        axes.push(tag);
        const min = Number(ax.minValue);
        const max = Number(ax.maxValue);
        const def = Number(ax.defaultValue);
        ranges[tag] = { min, max, def };
        defaults[tag] = def;
        steps[tag] = AXIS_STEP_DEFAULTS[tag] || 1;
    });
    // Italic presence comes from CSS, not fvar; leave to outer logic
    return { axes, ranges, defaults, steps };
}

function getAxesForFamilyFromMetadata(fontName) {
    if (!gfMetadata) return [];
    const fam = gfMetadata.familyMetadata?.find(f => f.family === fontName) || gfMetadata.families?.find(f => f.family === fontName);
    if (!fam) return [];
    // Some metadata shapes: `axes` or `axesTags`
    const axes = fam.axes || fam.axesTags || [];
    // Normalize axes tags
    return Array.from(new Set(axes.map(a => (typeof a === 'string' ? a : a.tag || a.axis || a))));
}

async function ensureGfMetadata() {
    if (gfMetadata) return gfMetadata;
    const url = 'https://fonts.google.com/metadata/fonts';
    const res = await fetch(url, { credentials: 'omit' });
    const text = await res.text();
    // Strip XSSI prefix if present
    const json = text.replace(/^\)\]\}'\n?/, '');
    gfMetadata = JSON.parse(json);
    return gfMetadata;
}

function familyToQuery(fontName) {
    return String(fontName || '').trim().replace(/\s+/g, '+');
}

async function fetchGoogleCssInfo(fontName, axesList) {
    // Build a minimal CSS2 URL; omit axis ranges to keep it simple
    const familyParam = familyToQuery(fontName);
    // Include ital to ensure italic face gets included when present
    const axisParam = axesList && axesList.length ? `:${axesList.join(',')}` : '';
    const cssUrl = `https://fonts.googleapis.com/css2?family=${familyParam}${axisParam}&display=swap`;
    // Fetch CSS to discover the actual @font-face descriptors
    const res = await fetch(cssUrl, { credentials: 'omit' });
    const cssText = await res.text();
    return { cssUrl, cssText };
}

function deriveAxisRangesFromCss(cssText) {
    const ranges = {};
    try {
        // Prefer normal style block
        const blocks = cssText.split('@font-face').slice(1).map(b => b);
        let chosen = blocks.find(b => /font-style:\s*normal/.test(b)) || blocks[0] || '';
        // Weight range
        const wMatch = chosen.match(/font-weight:\s*(\d{1,4})\s+(\d{1,4})/);
        if (wMatch) {
            const min = parseInt(wMatch[1], 10);
            const max = parseInt(wMatch[2], 10);
            ranges.wght = { min, max, def: 400 };
        }
        // Width range via font-stretch: 75% 125%
        const wdthMatch = chosen.match(/font-stretch:\s*(\d{1,3})%\s+(\d{1,3})%/);
        if (wdthMatch) {
            const min = parseInt(wdthMatch[1], 10);
            const max = parseInt(wdthMatch[2], 10);
            ranges.wdth = { min, max, def: 100 };
        }
        // Slant via oblique -10deg 0deg
        const slntMatch = chosen.match(/font-style:\s*oblique\s*(-?\d{1,3})deg\s*(-?\d{1,3})deg/);
        if (slntMatch) {
            const min = parseInt(slntMatch[1], 10);
            const max = parseInt(slntMatch[2], 10);
            ranges.slnt = { min, max, def: 0 };
        }
        // Italic presence
        if (/font-style:\s*italic/.test(cssText)) {
            ranges.ital = { min: 0, max: 1, def: 0 };
        }
    } catch (e) {
        console.warn('Failed to derive axis ranges from CSS', e);
    }
    return ranges;
}

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

// Extension state storage
let extensionState = {
    topFont: null,
    bottomFont: null
};

// Load favorites from localStorage
function loadFavoritesFromStorage() {
    try {
        const stored = localStorage.getItem('fontFaceoffFavorites');
        savedFavorites = stored ? JSON.parse(stored) : {};
    } catch (error) {
        console.error('Error loading favorites:', error);
        savedFavorites = {};
    }
}

// Save favorites to localStorage
function saveFavoritesToStorage() {
    try {
        localStorage.setItem('fontFaceoffFavorites', JSON.stringify(savedFavorites));
    } catch (error) {
        console.error('Error saving favorites:', error);
    }
}

// Load extension state from localStorage
function loadExtensionState() {
    try {
        const stored = localStorage.getItem('fontFaceoffState');
        extensionState = stored ? JSON.parse(stored) : { topFont: null, bottomFont: null };
    } catch (error) {
        console.error('Error loading extension state:', error);
        extensionState = { topFont: null, bottomFont: null };
    }
}

// Save extension state to localStorage
function saveExtensionState() {
    try {
        const topConfig = getCurrentFontConfig('top');
        const bottomConfig = getCurrentFontConfig('bottom');
        
        // Only save if we have valid configurations
        if (topConfig && bottomConfig) {
            extensionState.topFont = topConfig;
            extensionState.bottomFont = bottomConfig;
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
    const fontName = (heading && heading.textContent) ? heading.textContent : fontSelect.value;
    const fontSize = fontSizeControl.value;
    const lineHeight = lineHeightControl.value;
    const fontWeight = fontWeightControl.value;
    const fontColor = fontColorControl.value;
    
    const config = {
        fontName,
        basicControls: {
            fontSize: parseFloat(fontSize),
            lineHeight: parseFloat(lineHeight),
            fontWeight: parseInt(fontWeight),
            fontColor
        },
        activeControls: Array.from(position === 'top' ? topActiveControls : bottomActiveControls),
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
    // Set font family
    document.getElementById(`${position}-font-select`).value = config.fontName;
    loadFont(position, config.fontName);
    
    // Wait for font controls to be generated, then apply settings
    setTimeout(() => {
        // Set basic controls
        document.getElementById(`${position}-font-size`).value = config.basicControls.fontSize;
        document.getElementById(`${position}-line-height`).value = config.basicControls.lineHeight;
        document.getElementById(`${position}-font-weight`).value = config.basicControls.fontWeight;
        document.getElementById(`${position}-font-color`).value = config.basicControls.fontColor;
        
        // Set text input values
        const fontSizeTextInput = document.getElementById(`${position}-font-size-text`);
        const lineHeightTextInput = document.getElementById(`${position}-line-height-text`);
        if (fontSizeTextInput) fontSizeTextInput.value = config.basicControls.fontSize;
        if (lineHeightTextInput) lineHeightTextInput.value = config.basicControls.lineHeight;
        
        // Update display values
        document.getElementById(`${position}-font-size-value`).textContent = config.basicControls.fontSize + 'px';
        document.getElementById(`${position}-line-height-value`).textContent = config.basicControls.lineHeight;
        document.getElementById(`${position}-font-weight-value`).textContent = config.basicControls.fontWeight;
        
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
        titleEl.textContent = `Select ${position === 'top' ? 'Top' : 'Bottom'} Font`;
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
    if (displayEl) displayEl.textContent = name;
    loadFont(currentPosition, name);
    close();
}

    // Listeners
    const triggerOpen = (pos) => () => open(pos);
    topTrigger?.addEventListener('click', triggerOpen('top'));
    bottomTrigger?.addEventListener('click', triggerOpen('bottom'));
    topTrigger?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open('top'); } });
    bottomTrigger?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open('bottom'); } });
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
function loadFont(position, fontName) {
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
    if (fontName === 'ABC Ginto Normal Unlicensed Trial') {
        // Ensure Ginto CSS is present (more robust than relying on @import)
        const id = 'ginto-css-link';
        if (!document.getElementById(id)) {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = 'https://fonts.cdnfonts.com/css/abc-ginto-nord-unlicensed-trial';
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
            applyFont(position);
        }).catch(err => console.warn('Dynamic axis discovery failed', err));
    }
    // Custom fonts are already loaded via CSS @font-face declarations
    
    // Update font name display
    document.getElementById(`${position}-font-name`).textContent = fontName;
    const familyDisplay = document.getElementById(`${position}-font-display`);
    if (familyDisplay) familyDisplay.textContent = fontName;
    
    // Generate controls for this font
    generateFontControls(position, fontName);
    
    // Restore saved settings for this font (if any)
    restoreFontSettings(position, fontName);
    
    // Apply font to text
    applyFont(position);
    
    // Update basic controls
    updateBasicControls(position);
    
    // Save current state
    setTimeout(() => saveExtensionState(), 100);
}

async function loadGoogleFont(fontName) {
    // Check if font is already loaded
    const existingLink = document.querySelector(`link[data-font="${fontName}"]`);
    if (existingLink) return;
    // Use generic Google Fonts URL. Variable axes work without enumerating ranges here.
    const fontUrl = `https://fonts.googleapis.com/css2?family=${familyToQuery(fontName)}&display=swap`;

    // Create and append link element
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontUrl;
    link.setAttribute('data-font', fontName);
    document.head.appendChild(link);
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
    
    textElement.style.fontSize = fontSize;
    textElement.style.lineHeight = lineHeight;
    textElement.style.color = fontColor;
    textElement.style.fontFamily = `"${fontName}"`;
    
    // Only apply font-weight if the weight control has been activated
    if (activeControls.has('weight')) {
        textElement.style.fontWeight = fontWeight;
    } else {
        textElement.style.fontWeight = ''; // Let font's default weight show
    }
    
    headingElement.style.fontSize = Math.max(16, parseFloat(fontSize) + 2) + 'px';
    headingElement.style.color = fontColor;
    headingElement.style.fontFamily = `"${fontName}"`;
    
    // Only apply font-weight to heading if the weight control has been activated
    if (activeControls.has('weight')) {
        headingElement.style.fontWeight = fontWeight;
    } else {
        headingElement.style.fontWeight = ''; // Let font's default weight show
    }
    
    // Apply variable axes if available - only active ones
    if (fontDef && fontDef.axes && fontDef.axes.length > 0) {
        const activeAxes = position === 'top' ? topActiveAxes : bottomActiveAxes;
        const variations = fontDef.axes.map(axis => {
            const control = document.getElementById(`${position}-${axis}`);
            // Only include axis if it's been activated (touched)
            return (control && activeAxes.has(axis)) ? `"${axis}" ${control.value}` : null;
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
    } else {
        // Ensure no leftover variations linger for non-variable fonts
        textElement.style.fontVariationSettings = '';
        headingElement.style.fontVariationSettings = '';
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
            fontSizeValue.textContent = this.value + 'px';
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
                    fontSizeValue.textContent = value + 'px';
                    applyFont(position);
                    this.blur();
                }
            });
            
            fontSizeTextInput.addEventListener('blur', function() {
                const value = Math.min(Math.max(parseFloat(this.value) || 17, 6), 200);
                this.value = value;
                fontSizeControl.value = Math.min(Math.max(value, 10), 72); // Clamp to slider range for display
                fontSizeValue.textContent = value + 'px';
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
                    
                    const value = Math.min(Math.max(parseFloat(this.value) || 1.2, 0.5), 5);
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
                
                const value = Math.min(Math.max(parseFloat(this.value) || 1.2, 0.5), 5);
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
function generateFontConfigName(position) {
    const config = getCurrentFontConfig(position);
    if (!config) return 'Font Configuration';
    
    let name = config.fontName;
    const parts = [];
    
    // Always include font size in name
    parts.push(`${config.basicControls.fontSize}px`);
    if (config.activeControls.includes('weight') && config.basicControls.fontWeight !== 400) {
        parts.push(`${config.basicControls.fontWeight}wt`);
    }
    if (config.activeControls.includes('line-height') && config.basicControls.lineHeight !== 1.2) {
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
    if (config.activeControls.includes('line-height') && config.basicControls.lineHeight !== 1.2) {
        lines.push(`Line Height: ${config.basicControls.lineHeight}`);
    }
    if (config.activeControls.includes('weight') && config.basicControls.fontWeight !== 400) {
        lines.push(`Weight: ${config.basicControls.fontWeight}`);
    }
    
    // Only show active variable axes
    if (config.variableAxes && config.activeAxes) {
        const activeAxesEntries = Object.entries(config.variableAxes)
            .filter(([axis, value]) => {
                const fontDef = fontDefinitions[config.fontName];
                return config.activeAxes.includes(axis) && 
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
    if (Object.keys(savedFavorites).length === 0) {
        noFavorites.style.display = 'block';
        listContainer.style.display = 'none';
    } else {
        noFavorites.style.display = 'none';
        listContainer.style.display = 'flex';
        
        // Populate favorites
        Object.entries(savedFavorites).forEach(([name, config]) => {
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
    if (Object.keys(savedFavorites).length === 0) {
        noFavorites.style.display = 'block';
        listContainer.style.display = 'none';
    } else {
        noFavorites.style.display = 'none';
        listContainer.style.display = 'flex';
        
        // Populate editable favorites
        Object.entries(savedFavorites).forEach(([name, config]) => {
            const item = document.createElement('div');
            item.className = 'edit-favorite-item';
            
            const info = document.createElement('div');
            info.className = 'edit-favorite-info';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'edit-favorite-name';
            nameDiv.textContent = name;
            
            const previewDiv = document.createElement('div');
            previewDiv.className = 'edit-favorite-preview';
            previewDiv.innerHTML = generateDetailedFavoritePreview(config);
            
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
                    saveFavoritesToStorage();
                    showEditFavoritesModal(); // Refresh the modal
                });
            });
            
            actions.appendChild(deleteBtn);
            
            item.appendChild(info);
            item.appendChild(actions);
            listContainer.appendChild(item);
        });
    }
    
    modal.classList.add('visible');
}

function hideEditFavoritesModal() {
    const modal = document.getElementById('edit-favorites-modal');
    modal.classList.remove('visible');
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
    if (config.activeControls && config.activeControls.includes('line-height') && 
        config.basicControls?.lineHeight && config.basicControls.lineHeight !== 1.2) {
        lines.push(`Line Height: ${config.basicControls.lineHeight}`);
    }
    if (config.activeControls && config.activeControls.includes('weight') && 
        config.basicControls?.fontWeight && config.basicControls.fontWeight !== 400) {
        lines.push(`Weight: ${config.basicControls.fontWeight}`);
    }
    
    // Only show active variable axes
    if (config.variableAxes && config.activeAxes) {
        const activeAxesEntries = Object.entries(config.variableAxes)
            .filter(([axis, value]) => {
                const fontDef = getEffectiveFontDefinition(config.fontName);
                return config.activeAxes.includes(axis) && 
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
    
    // Font Picker wiring
    setupFontPicker();

    // Initialize font family displays from current values
    const topSel = document.getElementById('top-font-select');
    const botSel = document.getElementById('bottom-font-select');
    const topDisp = document.getElementById('top-font-display');
    const botDisp = document.getElementById('bottom-font-display');
    if (topSel && topDisp) topDisp.textContent = topSel.value || 'Roboto Flex';
    if (botSel && botDisp) botDisp.textContent = botSel.value || 'Rubik';

    // Add event listeners for buttons
    document.getElementById('reset-top-font').addEventListener('click', function() {
        resetTopFont();
    });
    
    document.getElementById('reset-bottom-font').addEventListener('click', function() {
        resetBottomFont();
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
                lineHeightControl.value = 1.2;
                lineHeightValue.textContent = '1.2';
                if (lineHeightTextInput) {
                    lineHeightTextInput.value = 1.2;
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
    });
    
    // Load saved state and initialize fonts
    loadExtensionState();
    
    if (extensionState.topFont && extensionState.topFont.fontName) {
        // Restore saved top font
        setTimeout(() => {
            applyFontConfig('top', extensionState.topFont);
        }, 100);
    } else {
        // Use default top font
        loadFont('top', 'Roboto Flex');
    }
    
    if (extensionState.bottomFont && extensionState.bottomFont.fontName) {
        // Restore saved bottom font
        setTimeout(() => {
            applyFontConfig('bottom', extensionState.bottomFont);
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
        const topDesired = (extensionState.topFont && extensionState.topFont.fontName) ? resolveFamilyCase(extensionState.topFont.fontName) : undefined;
        const botDesired = (extensionState.bottomFont && extensionState.bottomFont.fontName) ? resolveFamilyCase(extensionState.bottomFont.fontName) : undefined;
        const ok = await initializeGoogleFontsSelects(topDesired, botDesired);
        // Re-apply saved state once more to guarantee selection sticks even if the list was rebuilt
        if (ok && extensionState) {
            const topCfg = extensionState.topFont;
            const botCfg = extensionState.bottomFont;
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
    }, 250);
    
    // Panel state
    let topPanelOpen = false;
    let bottomPanelOpen = false;
    
    function showPanel(panel) {
        if (panel === 'top') {
            topFontControlsPanel.classList.add('visible');
            panelOverlay.classList.add('visible');
            topPanelOpen = true;
        } else if (panel === 'bottom') {
            bottomFontControlsPanel.classList.add('visible');
            panelOverlay.classList.add('visible');
            bottomPanelOpen = true;
        }
        updateFontComparisonLayout();
    }
    
    function hidePanel(panel) {
        if (panel === 'top') {
            topFontControlsPanel.classList.remove('visible');
            topPanelOpen = false;
        } else if (panel === 'bottom') {
            bottomFontControlsPanel.classList.remove('visible');
            bottomPanelOpen = false;
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
    
    // Grip click handlers
    topFontGrip.addEventListener('click', function() {
        if (topPanelOpen) {
            hidePanel('top');
        } else {
            showPanel('top');
        }
    });
    
    bottomFontGrip.addEventListener('click', function() {
        if (bottomPanelOpen) {
            hidePanel('bottom');
        } else {
            showPanel('bottom');
        }
    });
    
    // Close panels when clicking overlay
    panelOverlay.addEventListener('click', hideAllPanels);
    
    // Reference to panel elements  
    const topFontControlsPanel = topFontControls;
    const bottomFontControlsPanel = bottomFontControls;
    
    // Initialize favorites system
    loadFavoritesFromStorage();
    
    // Save favorite functionality
    function setupSaveFavorite(position) {
        const saveBtn = document.getElementById(`${position}-save-favorite`);
        
        saveBtn.addEventListener('click', function() {
            showSaveModal(position);
        });
    }
    
    // Load favorite functionality - now opens popup
    function setupLoadFavorite(position) {
        const loadBtn = document.getElementById(`${position}-load-favorite`);
        
        loadBtn.addEventListener('click', function() {
            showFavoritesPopup(position);
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
    favoritesPopupClose.addEventListener('click', hideFavoritesPopup);
    favoritesPopup.addEventListener('click', function(e) {
        if (e.target === favoritesPopup) {
            hideFavoritesPopup();
        }
    });
    
    // Edit favorites modal handlers
    editModalClose.addEventListener('click', hideEditFavoritesModal);
    editFavoritesModal.addEventListener('click', function(e) {
        if (e.target === editFavoritesModal) {
            hideEditFavoritesModal();
        }
    });
    
    // Edit favorites button
    editFavoritesBtn.addEventListener('click', showEditFavoritesModal);
    
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
    document.getElementById('top-line-height').value = 1.2;
    document.getElementById('top-font-weight').value = 400;
    document.getElementById('top-font-color').value = '#000000';
    
    // Reset display values
    document.getElementById('top-font-size-value').textContent = '17px';
    document.getElementById('top-line-height-value').textContent = '1.2';
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
    document.getElementById('bottom-line-height').value = 1.2;
    document.getElementById('bottom-font-weight').value = 400;
    document.getElementById('bottom-font-color').value = '#000000';
    
    // Reset text input values
    const bottomFontSizeTextInput = document.getElementById('bottom-font-size-text');
    const bottomLineHeightTextInput = document.getElementById('bottom-line-height-text');
    if (bottomFontSizeTextInput) bottomFontSizeTextInput.value = 17;
    if (bottomLineHeightTextInput) bottomLineHeightTextInput.value = 1.2;
    
    // Reset display values
    document.getElementById('bottom-font-size-value').textContent = '17px';
    document.getElementById('bottom-line-height-value').textContent = '1.2';
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
