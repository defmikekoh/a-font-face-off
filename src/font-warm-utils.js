/* global module */
/* font-warm-utils.js — selection helpers for document-start font warming.
 *
 * Loaded as a plain script in content pages and exported for Node tests.
 */

function affoHasWarmableStoredConfig(entry, fontType) {
    return !!(entry && entry[fontType] && entry[fontType].fontName);
}

function affoNormalizeAppliedMode(value) {
    return value === 'body-contact' || value === 'third-man-in' ? value : '';
}

function affoGetStoredFontTypesToWarm(entry, currentView, currentMode) {
    if (!entry || typeof entry !== 'object') return [];

    var bodyTypes = affoHasWarmableStoredConfig(entry, 'body') ? ['body'] : [];
    var tmiTypes = ['serif', 'sans', 'mono'].filter(function (fontType) {
        return affoHasWarmableStoredConfig(entry, fontType);
    });

    // Normal saved domain state belongs to one applied mode. Trust that shape
    // even if an older global mode value is stale.
    if (bodyTypes.length === 0) return tmiTypes;
    if (tmiTypes.length === 0) return bodyTypes;

    // Mixed entries can arrive through legacy or synced data. Prefer the
    // currently visible applied mode, with the legacy mode as a fallback.
    var appliedMode = affoNormalizeAppliedMode(currentView) ||
        affoNormalizeAppliedMode(currentMode);
    if (appliedMode === 'body-contact') return bodyTypes;
    if (appliedMode === 'third-man-in') return tmiTypes;

    // Preserve existing behavior when mixed data has no trustworthy mode.
    return bodyTypes.concat(tmiTypes);
}

var AFFOFontWarmUtils = {
    getStoredFontTypesToWarm: affoGetStoredFontTypesToWarm
};

if (typeof globalThis !== 'undefined') {
    globalThis.AFFOFontWarmUtils = AFFOFontWarmUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AFFOFontWarmUtils;
}
