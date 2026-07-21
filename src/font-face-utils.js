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

function parseFontFaceWeightDescriptor(block) {
    var rawWeight = getDescriptorValue(block, 'font-weight') || '400';
    var normalized = rawWeight.toLowerCase();
    if (normalized === 'normal') return { descriptor: '400', min: 400, max: 400 };
    if (normalized === 'bold') return { descriptor: '700', min: 700, max: 700 };

    var numericWeights = rawWeight.match(/\d+/g);
    if (!numericWeights || numericWeights.length === 0) {
        return { descriptor: '400', min: 400, max: 400 };
    }

    var min = Number(numericWeights[0]);
    var max = Number(numericWeights[numericWeights.length > 1 ? 1 : 0]);
    if (!isFinite(min) || !isFinite(max)) {
        return { descriptor: '400', min: 400, max: 400 };
    }
    if (max < min) {
        var swap = min;
        min = max;
        max = swap;
    }
    return {
        descriptor: numericWeights.length > 1 ? min + ' ' + max : String(min),
        min: min,
        max: max,
    };
}

function parseUnicodeRanges(rangeText) {
    if (!rangeText) return [];
    return String(rangeText).split(',').map(function(part) {
        var cleaned = part.trim().replace(/u\+/i, '');
        if (!cleaned) return null;
        if (cleaned.indexOf('?') !== -1 && cleaned.indexOf('-') === -1) {
            return [
                parseInt(cleaned.replace(/\?/g, '0'), 16),
                parseInt(cleaned.replace(/\?/g, 'F'), 16),
            ];
        }
        if (cleaned.indexOf('-') !== -1) {
            var parts = cleaned.split('-');
            return [parseInt(parts[0], 16), parseInt(parts[1], 16)];
        }
        var value = parseInt(cleaned, 16);
        return [value, value];
    }).filter(function(range) {
        return range && isFinite(range[0]) && isFinite(range[1]);
    });
}

function extractFontFaceEntries(cssText) {
    var entries = [];
    var faceRegex = /@font-face\s*{[^}]*}/gi;
    var match;
    while ((match = faceRegex.exec(String(cssText || ''))) !== null) {
        var block = match[0];
        var url = extractFontFaceSrcUrl(block);
        if (!/\.woff2(?:[?#]|$)/i.test(url)) continue;
        var unicodeRange = getDescriptorValue(block, 'unicode-range');
        entries.push({
            url: url,
            ranges: parseUnicodeRanges(unicodeRange),
            unicodeRange: unicodeRange,
            weightInfo: parseFontFaceWeightDescriptor(block),
            style: (getDescriptorValue(block, 'font-style') || 'normal').toLowerCase(),
            stretch: getDescriptorValue(block, 'font-stretch'),
        });
    }
    return entries;
}

function getConfiguredFontFaceWeight(fontConfig) {
    var config = fontConfig || {};
    if (config.fontWeight != null && isFinite(Number(config.fontWeight))) {
        return Number(config.fontWeight);
    }
    if (config.variableAxes && config.variableAxes.wght != null && isFinite(Number(config.variableAxes.wght))) {
        return Number(config.variableAxes.wght);
    }
    return 400;
}

function getConfiguredFontFaceStyle(fontConfig) {
    var config = fontConfig || {};
    if (config.fontStyle === 'italic') return 'italic';
    if (config.italVal != null && Number(config.italVal) >= 1) return 'italic';
    if (config.variableAxes && config.variableAxes.ital != null && Number(config.variableAxes.ital) >= 1) return 'italic';
    return 'normal';
}

function weightRangeContains(weightInfo, weight) {
    return !!(weightInfo && weight >= weightInfo.min && weight <= weightInfo.max);
}

function styleMatchesConfigured(entryStyle, configuredStyle) {
    var style = entryStyle || 'normal';
    if (style === configuredStyle) return true;
    return configuredStyle === 'italic' && style.indexOf('oblique') === 0;
}

function rangesOverlapTargets(ranges, targets) {
    if (!ranges || ranges.length === 0) return true;
    return ranges.some(function(range) {
        return targets.some(function(target) {
            return range[0] <= target[1] && range[1] >= target[0];
        });
    });
}

function getFontFaceEntryPriority(entry, fontConfig) {
    var configuredWeight = getConfiguredFontFaceWeight(fontConfig);
    var configuredStyle = getConfiguredFontFaceStyle(fontConfig);
    var stylePriority = styleMatchesConfigured(entry.style, configuredStyle) ? 0 : 10;
    var weightPriority = weightRangeContains(entry.weightInfo, configuredWeight) ? 0 :
        (weightRangeContains(entry.weightInfo, 700) ? 1 : 2);
    return stylePriority + weightPriority;
}

function sortFontFaceUrlsForConfig(urls, entries, fontConfig) {
    var entriesByUrl = {};
    (entries || []).forEach(function(entry) {
        if (!entriesByUrl[entry.url]) entriesByUrl[entry.url] = [];
        entriesByUrl[entry.url].push(entry);
    });
    return (urls || []).map(function(url, index) {
        var urlEntries = entriesByUrl[url] || [];
        var priority = urlEntries.length ? Math.min.apply(null, urlEntries.map(function(entry) {
            return getFontFaceEntryPriority(entry, fontConfig);
        })) : 99;
        return { url: url, index: index, priority: priority };
    }).sort(function(a, b) {
        return a.priority - b.priority || a.index - b.index;
    }).map(function(item) {
        return item.url;
    });
}

function selectFontFaceWarmUrl(cssText, fontConfig) {
    var entries = extractFontFaceEntries(cssText);
    if (entries.length === 0) return { url: '' };
    var configuredWeight = getConfiguredFontFaceWeight(fontConfig);
    var configuredStyle = getConfiguredFontFaceStyle(fontConfig);
    var matching = entries.filter(function(entry) {
        return styleMatchesConfigured(entry.style, configuredStyle) &&
            weightRangeContains(entry.weightInfo, configuredWeight);
    });
    if (matching.length === 0) {
        matching = entries.filter(function(entry) {
            return weightRangeContains(entry.weightInfo, configuredWeight);
        });
    }
    if (matching.length === 0) matching = entries.slice();

    var latinCoreRanges = [[0x0000, 0x00FF], [0x2000, 0x206F], [0x20A0, 0x20CF]];
    var latin = matching.filter(function(entry) {
        return rangesOverlapTargets(entry.ranges, latinCoreRanges);
    });
    var candidates = latin.length ? latin : matching;
    var orderedUrls = sortFontFaceUrlsForConfig(candidates.map(function(entry) {
        return entry.url;
    }), candidates, fontConfig);
    var selectedUrl = orderedUrls[0] || '';
    var selected = candidates.find(function(entry) { return entry.url === selectedUrl; });
    return {
        url: selectedUrl,
        weight: selected && selected.weightInfo ? selected.weightInfo.descriptor : '',
        style: selected ? selected.style : '',
        unicodeRange: selected ? selected.unicodeRange : '',
    };
}

var AFFOFontFaceUtils = {
    extractFontFaceEntries: extractFontFaceEntries,
    getDescriptorValue: getDescriptorValue,
    extractFontFaceSrcUrl: extractFontFaceSrcUrl,
    getConfiguredFontFaceStyle: getConfiguredFontFaceStyle,
    getConfiguredFontFaceWeight: getConfiguredFontFaceWeight,
    parseFontFaceWeightDescriptor: parseFontFaceWeightDescriptor,
    parseUnicodeRanges: parseUnicodeRanges,
    selectFontFaceWarmUrl: selectFontFaceWarmUrl,
    sortFontFaceUrlsForConfig: sortFontFaceUrlsForConfig,
};

if (typeof globalThis !== 'undefined') {
    globalThis.AFFOFontFaceUtils = AFFOFontFaceUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AFFOFontFaceUtils;
}
