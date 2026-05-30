/* config-utils.js — Pure logic functions shared between popup.js and tests.
 *
 * In the browser this file is loaded as a plain <script> before popup.js,
 * so every symbol lands in the global scope exactly as before.
 *
 * In Node (test runner) we export via module.exports so tests can require().
 */

// ── Constants ────────────────────────────────────────────────────────────────

const REGISTERED_AXES = new Set(['wght', 'wdth', 'slnt', 'ital', 'opsz']);
const AFFO_BROWSER_ACTION_DEFAULT_TITLE = 'A Font Face-off';
const AFFO_BROWSER_ACTION_APPLIED_TITLE_PREFIX = 'AFFO -';
const AFFO_BROWSER_ACTION_FONT_TYPES = [
    { key: 'body', prefix: 'B' },
    { key: 'serif', prefix: 'S' },
    { key: 'sans', prefix: 'SS' },
    { key: 'mono', prefix: 'M' },
];

// ── Config pipeline ──────────────────────────────────────────────────────────

/**
 * Normalize any raw config (storage, favorites, legacy) into canonical form.
 */
function normalizeConfig(raw) {
    if (!raw) return null;

    const config = {
        fontName: raw.fontName || null,
        variableAxes: {}
    };

    // Coerce numeric properties (handles both string and number inputs)
    // Legacy compat: fontSizePx was the old property name
    const rawFontSize = raw.fontSizePx != null ? raw.fontSizePx : raw.fontSize;
    if (raw.fontSizeScale != null) {
        config.fontSizeScale = Number(raw.fontSizeScale);
    } else if (rawFontSize != null) {
        config.fontSize = Number(rawFontSize);
    }
    if (raw.lineHeight != null) config.lineHeight = Number(raw.lineHeight);
    if (raw.letterSpacing != null) config.letterSpacing = Number(raw.letterSpacing);
    if (raw.fontWeight != null) config.fontWeight = Number(raw.fontWeight);
    if (raw.fontStyle === 'italic') config.fontStyle = 'italic';
    if (raw.fontColor && raw.fontColor !== 'default') config.fontColor = raw.fontColor;
    if (raw.fontSource === 'local') config.fontSource = 'local';
    if (raw.fontFaceRule) config.fontFaceRule = raw.fontFaceRule;

    // Copy variable axes with Number coercion
    if (raw.variableAxes && typeof raw.variableAxes === 'object') {
        Object.entries(raw.variableAxes).forEach(([axis, value]) => {
            if (axis === 'ital') {
                const numericValue = Number(value);
                if (numericValue >= 1 && !config.fontStyle) config.fontStyle = 'italic';
                if (numericValue === 0 || numericValue >= 1) return;
            }
            config.variableAxes[axis] = Number(value);
        });
    }
    // Legacy compat: fold wdthVal/slntVal into variableAxes; italVal is now a static style.
    if (raw.wdthVal != null && !('wdth' in config.variableAxes)) config.variableAxes.wdth = Number(raw.wdthVal);
    if (raw.slntVal != null && !('slnt' in config.variableAxes)) config.variableAxes.slnt = Number(raw.slntVal);
    if (raw.italVal != null && Number(raw.italVal) >= 1 && !config.fontStyle) config.fontStyle = 'italic';

    return config;
}

// ── Browser action title formatting ─────────────────────────────────────────

function getAffoTitleFontName(config) {
    if (!config || config.fontName == null) return '';
    const fontName = String(config.fontName).trim();
    return fontName || '';
}

function hasAffoTitleVariableAxes(config) {
    if (!config || !config.variableAxes || typeof config.variableAxes !== 'object') return false;
    return Object.values(config.variableAxes).some(value => value != null && value !== '');
}

function hasAffoAppliedFontSetting(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
    if (getAffoTitleFontName(config)) return true;
    if (config.fontSizeScale != null) return true;
    if (config.fontSize != null) return true;
    if (config.lineHeight != null) return true;
    if (config.letterSpacing != null) return true;
    if (config.fontWeight != null) return true;
    if (config.fontStyle === 'italic') return true;
    if (config.fontColor && config.fontColor !== 'default') return true;
    return hasAffoTitleVariableAxes(config);
}

function isAffoSroulettePool(pool) {
    if (typeof globalThis !== 'undefined' &&
        globalThis.AFFOSroulette &&
        typeof globalThis.AFFOSroulette.isPool === 'function') {
        return globalThis.AFFOSroulette.isPool(pool);
    }
    return pool === 'serif' || pool === 'sans';
}

function getAffoSroulettePoolLabel(pool) {
    if (!isAffoSroulettePool(pool)) return '';
    if (typeof globalThis !== 'undefined' &&
        globalThis.AFFOSroulette &&
        typeof globalThis.AFFOSroulette.getPoolLabel === 'function') {
        return globalThis.AFFOSroulette.getPoolLabel(pool);
    }
    return pool === 'serif' ? 'Sroulette Serif' : 'Sroulette Sans';
}

function getAffoBrowserActionTitleEntries(domainData) {
    if (!domainData || typeof domainData !== 'object' || Array.isArray(domainData)) return [];

    const sroulette = (domainData.sroulette && typeof domainData.sroulette === 'object' && !Array.isArray(domainData.sroulette))
        ? domainData.sroulette
        : {};

    return AFFO_BROWSER_ACTION_FONT_TYPES.reduce((entries, fontType) => {
        const config = domainData[fontType.key];
        if (hasAffoAppliedFontSetting(config)) {
            entries.push({
                key: fontType.key,
                prefix: fontType.prefix,
                fontName: getAffoTitleFontName(config),
            });
        } else if (sroulette[fontType.key] && typeof sroulette[fontType.key] === 'object') {
            const srouletteLabel = getAffoSroulettePoolLabel(sroulette[fontType.key].pool);
            if (!srouletteLabel) return entries;
            entries.push({
                key: fontType.key,
                prefix: fontType.prefix,
                fontName: srouletteLabel,
            });
        }
        return entries;
    }, []);
}

function abbreviateAffoTitleFontName(fontName) {
    return String(fontName || '').trim().slice(0, 4);
}

function formatAffoBrowserActionTitleEntry(entry, abbreviate) {
    const fontName = abbreviate ? abbreviateAffoTitleFontName(entry.fontName) : String(entry.fontName || '').trim();
    return fontName ? `${entry.prefix}: ${fontName}` : `${entry.prefix}:`;
}

function formatAffoBrowserActionTitle(domainData) {
    const entries = getAffoBrowserActionTitleEntries(domainData);
    if (!entries.length) return AFFO_BROWSER_ACTION_DEFAULT_TITLE;

    const abbreviate = entries.length > 2;
    const visibleEntries = abbreviate ? entries.slice(0, 2) : entries;
    return [AFFO_BROWSER_ACTION_APPLIED_TITLE_PREFIX]
        .concat(visibleEntries.map(entry => formatAffoBrowserActionTitleEntry(entry, abbreviate)))
        .join(' ');
}

// ── Button state logic ───────────────────────────────────────────────────────

function determineButtonState(changeCount, allDefaults, domainHasApplied) {
    if (changeCount > 0) {
        return allDefaults
            ? { action: 'reset', changeCount: 0 }
            : { action: 'apply', changeCount };
    }
    return domainHasApplied
        ? { action: 'reset', changeCount: 0 }
        : { action: 'none', changeCount: 0 };
}

// ── Variable-axis helpers ────────────────────────────────────────────────────

function getEffectiveWeight(payload) {
    if (payload.fontWeight != null && isFinite(Number(payload.fontWeight))) return Number(payload.fontWeight);
    if (payload.variableAxes && payload.variableAxes.wght != null && isFinite(Number(payload.variableAxes.wght))) return Number(payload.variableAxes.wght);
    return null;
}

function getEffectiveWidth(payload) {
    if (payload.wdthVal != null && isFinite(Number(payload.wdthVal))) return Number(payload.wdthVal);
    if (payload.variableAxes && payload.variableAxes.wdth != null && isFinite(Number(payload.variableAxes.wdth))) return Number(payload.variableAxes.wdth);
    return null;
}

function getEffectiveSlant(payload) {
    if (payload.slntVal != null && isFinite(Number(payload.slntVal))) return Number(payload.slntVal);
    if (payload.variableAxes && payload.variableAxes.slnt != null && isFinite(Number(payload.variableAxes.slnt))) return Number(payload.variableAxes.slnt);
    return null;
}

function getEffectiveItalic(payload) {
    if (payload.fontStyle === 'italic') return 1;
    if (payload.italVal != null && isFinite(Number(payload.italVal))) return Number(payload.italVal);
    if (payload.variableAxes && payload.variableAxes.ital != null && isFinite(Number(payload.variableAxes.ital))) return Number(payload.variableAxes.ital);
    return null;
}

// Returns '"axis" value' strings for ALL axes (registered + custom).
// Used for font-variation-settings to bypass @font-face descriptor clamping.
function buildAllAxisSettings(payload) {
    const settings = [];
    if (payload.variableAxes) {
        Object.entries(payload.variableAxes).forEach(([axis, value]) => {
            if (isFinite(Number(value))) {
                settings.push(`"${axis}" ${value}`);
            }
        });
    }
    return settings;
}

// Backward-compatible: returns only CUSTOM (unregistered) axes.
function buildCustomAxisSettings(payload) {
    const settings = [];
    if (payload.variableAxes) {
        Object.entries(payload.variableAxes).forEach(([axis, value]) => {
            if (!REGISTERED_AXES.has(axis) && isFinite(Number(value))) {
                settings.push(`"${axis}" ${value}`);
            }
        });
    }
    return settings;
}

// ── Node export (no-op in browser) ───────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        REGISTERED_AXES,
        AFFO_BROWSER_ACTION_DEFAULT_TITLE,
        AFFO_BROWSER_ACTION_APPLIED_TITLE_PREFIX,
        AFFO_BROWSER_ACTION_FONT_TYPES,
        normalizeConfig,
        hasAffoAppliedFontSetting,
        getAffoBrowserActionTitleEntries,
        formatAffoBrowserActionTitle,
        determineButtonState,
        getEffectiveWeight,
        getEffectiveWidth,
        getEffectiveSlant,
        getEffectiveItalic,
        buildAllAxisSettings,
        buildCustomAxisSettings,
    };
}
