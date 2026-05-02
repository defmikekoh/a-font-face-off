/* font-face-utils.js — helpers for parsing @font-face descriptors.
 *
 * Loaded as a plain script in browser contexts and exported for Node tests.
 */

function getDescriptorValue(cssText, descriptorName) {
    var source = String(cssText || '');
    var pattern = new RegExp('(^|[;{\\s])' + descriptorName + '\\s*:', 'i');
    var match = pattern.exec(source);
    if (!match) return '';

    var index = match.index + match[0].length;
    var start = index;
    var quote = '';
    var parenDepth = 0;
    var escaped = false;

    for (; index < source.length; index++) {
        var ch = source[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (ch === '\\') {
            escaped = true;
            continue;
        }

        if (quote) {
            if (ch === quote) quote = '';
            continue;
        }

        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }

        if (ch === '(') {
            parenDepth++;
            continue;
        }

        if (ch === ')' && parenDepth > 0) {
            parenDepth--;
            continue;
        }

        if (ch === ';' && parenDepth === 0) {
            break;
        }
    }

    return source.slice(start, index).trim();
}

function extractFontFaceSrcUrl(block) {
    var src = getDescriptorValue(block, 'src');
    if (!src) return '';

    var urlMatch = src.match(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/i);
    if (!urlMatch) return '';

    return (urlMatch[1] || urlMatch[2] || urlMatch[3] || '').trim();
}

var AFFOFontFaceUtils = {
    getDescriptorValue: getDescriptorValue,
    extractFontFaceSrcUrl: extractFontFaceSrcUrl
};

if (typeof globalThis !== 'undefined') {
    globalThis.AFFOFontFaceUtils = AFFOFontFaceUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AFFOFontFaceUtils;
}
