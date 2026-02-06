/* config-utils.js — Pure logic functions shared between popup.js and tests.
 *
 * In the browser this file is loaded as a plain <script> before popup.js,
 * so every symbol lands in the global scope exactly as before.
 *
 * In Node (test runner) we export via module.exports so tests can require().
 */

// ── Constants ────────────────────────────────────────────────────────────────

const REGISTERED_AXES = new Set(['wght', 'wdth', 'slnt', 'ital', 'opsz']);

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
    if (rawFontSize != null) config.fontSize = Number(rawFontSize);
    if (raw.lineHeight != null) config.lineHeight = Number(raw.lineHeight);
    if (raw.fontWeight != null) config.fontWeight = Number(raw.fontWeight);
    if (raw.fontColor && raw.fontColor !== 'default') config.fontColor = raw.fontColor;
    if (raw.fontFaceRule) config.fontFaceRule = raw.fontFaceRule;

    // Copy variable axes with Number coercion
    if (raw.variableAxes && typeof raw.variableAxes === 'object') {
        Object.entries(raw.variableAxes).forEach(([axis, value]) => {
            config.variableAxes[axis] = Number(value);
        });
    }
    // Legacy compat: fold wdthVal/slntVal/italVal into variableAxes
    if (raw.wdthVal != null && !('wdth' in config.variableAxes)) config.variableAxes.wdth = Number(raw.wdthVal);
    if (raw.slntVal != null && !('slnt' in config.variableAxes)) config.variableAxes.slnt = Number(raw.slntVal);
    if (raw.italVal != null && !('ital' in config.variableAxes)) config.variableAxes.ital = Number(raw.italVal);

    return config;
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
    if (payload.italVal != null && isFinite(Number(payload.italVal))) return Number(payload.italVal);
    if (payload.variableAxes && payload.variableAxes.ital != null && isFinite(Number(payload.variableAxes.ital))) return Number(payload.variableAxes.ital);
    return null;
}

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
        normalizeConfig,
        determineButtonState,
        getEffectiveWeight,
        getEffectiveWidth,
        getEffectiveSlant,
        getEffectiveItalic,
        buildCustomAxisSettings,
    };
}
