/* font-url-utils.js — Google Fonts CSS2 URL derivation helpers.
 *
 * These helpers are pure. Runtime scripts provide metadata and decide whether
 * to fall back to a plain css2 URL when a family is not present in metadata.
 */

function affoParseGfMetadataText(text) {
    const jsonText = String(text || '').replace(/^\)\]\}'\n?/, '');
    return JSON.parse(jsonText);
}

function affoFamilyToCss2Query(fontName) {
    return String(fontName || '').trim().replace(/\s+/g, '+');
}

function affoBuildPlainCss2Url(fontName) {
    const familyParam = affoFamilyToCss2Query(fontName);
    return familyParam ? `https://fonts.googleapis.com/css2?family=${familyParam}&display=swap` : '';
}

function affoGetMetadataFamilies(metadata) {
    if (!metadata) return [];
    return metadata.familyMetadataList || metadata.familyMetadata || metadata.families || [];
}

function affoFindFamilyMetadata(metadata, fontName) {
    const list = affoGetMetadataFamilies(metadata);
    const target = String(fontName || '').trim();
    if (!target) return null;

    let fam = list.find(f => (f.family || f.name) === target);
    if (fam) return fam;

    const lowerTarget = target.toLowerCase();
    return list.find(f => String(f.family || f.name || '').toLowerCase() === lowerTarget) || null;
}

function affoBuildStaticCss2Url(familyParam, staticWeights, italicWeights) {
    const normalWeights = Array.isArray(staticWeights) ? staticWeights : [];
    const italicOnlyWeights = Array.isArray(italicWeights) ? italicWeights : [];
    if (italicOnlyWeights.length > 0) {
        const tuples = [
            ...normalWeights.map(weight => `0,${weight}`),
            ...italicOnlyWeights.map(weight => `1,${weight}`)
        ];
        if (tuples.length > 0) {
            return `https://fonts.googleapis.com/css2?family=${familyParam}:ital,wght@${tuples.join(';')}&display=swap`;
        }
        return `https://fonts.googleapis.com/css2?family=${familyParam}:ital@0;1&display=swap`;
    }
    if (normalWeights.length > 0) {
        return `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${normalWeights.join(';')}&display=swap`;
    }
    return '';
}

function affoBuildCss2EntryFromFamily(fam) {
    const axes = Array.isArray(fam && fam.axes) ? fam.axes : [];
    const tagsSet = new Set();
    const variableTagsSet = new Set();
    const ranges = {};
    const defaults = {};

    axes.forEach(ax => {
        const tag = String((ax && (ax.tag || ax.axis)) || '').trim();
        if (!tag) return;
        tagsSet.add(tag === 'ital' ? 'ital' : tag);
        variableTagsSet.add(tag === 'ital' ? 'ital' : tag);

        const min = ax.min;
        const max = ax.max;
        if (typeof min === 'number' && typeof max === 'number') {
            ranges[tag] = [
                Number.isInteger(min) ? min : +min,
                Number.isInteger(max) ? max : +max
            ];
        }

        const def = ax.defaultValue;
        if (typeof def === 'number' && !Number.isNaN(def)) {
            defaults[tag] = Number.isInteger(def) ? def : +def;
        }
    });

    const fontsMap = (fam && fam.fonts) || {};
    const staticWeights = Object.keys(fontsMap)
        .filter(key => /^\d+$/.test(key))
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    const italicWeights = Object.keys(fontsMap)
        .filter(key => /^(\d+)i$/.test(key))
        .map(key => Number(key.replace(/i$/, '')))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

    if (italicWeights.length > 0) tagsSet.add('ital');

    const allTags = Array.from(tagsSet);
    const lower = allTags.filter(tag => /^[a-z]+$/.test(tag)).sort();
    const upper = allTags.filter(tag => /^[A-Z]+$/.test(tag)).sort();
    const variableTags = Array.from(variableTagsSet);
    const variableLower = variableTags.filter(tag => /^[a-z]+$/.test(tag)).sort();
    const variableUpper = variableTags.filter(tag => /^[A-Z]+$/.test(tag)).sort();

    return {
        tags: [...lower, ...upper],
        variableTags: [...variableLower, ...variableUpper],
        ranges,
        defaults,
        staticWeights,
        italicWeights
    };
}

function affoBuildCss2AxisRangesFromMetadata(metadata) {
    const out = {};
    affoGetMetadataFamilies(metadata).forEach(fam => {
        const name = fam && (fam.family || fam.name);
        if (!name) return;
        const entry = affoBuildCss2EntryFromFamily(fam);
        if (!entry.tags.length && !entry.staticWeights.length && !entry.italicWeights.length) return;
        out[name] = entry;
    });
    return out;
}

function affoBuildCss2UrlFromEntry(fontName, entry) {
    const familyParam = affoFamilyToCss2Query(fontName);
    if (!familyParam) return '';

    if (entry && entry.tags && entry.tags.length) {
        const hasVariableTags = Array.isArray(entry.variableTags)
            ? entry.variableTags.length > 0
            : entry.tags.some(tag => Array.isArray(entry.ranges && entry.ranges[tag]));

        if (!hasVariableTags && (entry.staticWeights || entry.italicWeights)) {
            const staticUrl = affoBuildStaticCss2Url(familyParam, entry.staticWeights, entry.italicWeights);
            if (staticUrl) return staticUrl;
        }

        const filtered = entry.tags.filter(tag => {
            if (tag === 'ital') return true;
            const range = entry.ranges && entry.ranges[tag];
            return Array.isArray(range) && range.length === 2 && isFinite(range[0]) && isFinite(range[1]);
        });
        const lower = filtered.filter(tag => /^[a-z]+$/.test(tag)).sort();
        const upper = filtered.filter(tag => /^[A-Z]+$/.test(tag)).sort();
        const orderedTags = [...lower, ...upper];
        const hasItal = orderedTags.includes('ital');
        const makeTuple = italVal => orderedTags.map(tag => {
            if (tag === 'ital') return String(italVal);
            const range = entry.ranges[tag];
            return `${range[0]}..${range[1]}`;
        }).join(',');
        const tuples = hasItal ? [makeTuple(0), makeTuple(1)] : [makeTuple('')];

        return orderedTags.length
            ? `https://fonts.googleapis.com/css2?family=${familyParam}:${orderedTags.join(',')}@${tuples.join(';')}&display=swap`
            : affoBuildPlainCss2Url(fontName);
    }

    if (entry && (entry.staticWeights || entry.italicWeights)) {
        const staticUrl = affoBuildStaticCss2Url(familyParam, entry.staticWeights, entry.italicWeights);
        if (staticUrl) return staticUrl;
    }

    return affoBuildPlainCss2Url(fontName);
}

function affoBuildCss2UrlFromMetadata(fontName, metadata, options) {
    const opts = options || {};
    const normalizedName = String(fontName || '').trim();
    if (!normalizedName || normalizedName.toLowerCase() === 'default') return '';

    const families = affoGetMetadataFamilies(metadata);
    if (!families.length) {
        return opts.fallbackWhenMetadataEmpty === false ? '' : affoBuildPlainCss2Url(normalizedName);
    }

    const fam = affoFindFamilyMetadata(metadata, normalizedName);
    if (!fam) {
        return opts.fallbackWhenMissing ? affoBuildPlainCss2Url(normalizedName) : '';
    }

    return affoBuildCss2UrlFromEntry(normalizedName, affoBuildCss2EntryFromFamily(fam));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        affoParseGfMetadataText,
        affoFamilyToCss2Query,
        affoBuildPlainCss2Url,
        affoGetMetadataFamilies,
        affoFindFamilyMetadata,
        affoBuildStaticCss2Url,
        affoBuildCss2EntryFromFamily,
        affoBuildCss2AxisRangesFromMetadata,
        affoBuildCss2UrlFromEntry,
        affoBuildCss2UrlFromMetadata
    };
}
