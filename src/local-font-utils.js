/* local-font-utils.js — helpers for user-managed local desktop font names.
 *
 * Loaded as a plain script in browser contexts and exported for Node tests.
 */

var AFFO_LOCAL_FONTS_KEY = 'affoLocalFonts';
var AFFO_FONT_SOURCE_LOCAL = 'local';

var AFFO_GENERIC_FONT_FAMILIES = new Set([
    'default',
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'emoji',
    'math',
    'fangsong'
]);

function affoNormalizeFontFamilyName(value) {
    var name = String(value || '').trim();
    if (!name) return '';

    if ((name[0] === '"' && name[name.length - 1] === '"') ||
        (name[0] === "'" && name[name.length - 1] === "'")) {
        name = name.slice(1, -1).trim();
    }

    return name.replace(/\s+/g, ' ');
}

function affoNormalizeLocalFonts(raw) {
    var values = Array.isArray(raw)
        ? raw
        : String(raw || '').split(/\r?\n/);
    var seen = new Set();
    var result = [];

    values.forEach(function (value) {
        var name = affoNormalizeFontFamilyName(value);
        if (!name) return;

        var key = name.toLowerCase();
        if (AFFO_GENERIC_FONT_FAMILIES.has(key)) return;
        if (seen.has(key)) return;

        seen.add(key);
        result.push(name);
    });

    return result;
}

function affoIsLocalFontConfig(config) {
    return !!(config && config.fontSource === AFFO_FONT_SOURCE_LOCAL);
}

var AFFOLocalFontUtils = {
    LOCAL_FONTS_KEY: AFFO_LOCAL_FONTS_KEY,
    FONT_SOURCE_LOCAL: AFFO_FONT_SOURCE_LOCAL,
    normalizeFontFamilyName: affoNormalizeFontFamilyName,
    normalizeLocalFonts: affoNormalizeLocalFonts,
    isLocalFontConfig: affoIsLocalFontConfig
};

if (typeof globalThis !== 'undefined') {
    globalThis.AFFOLocalFontUtils = AFFOLocalFontUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AFFOLocalFontUtils;
}
