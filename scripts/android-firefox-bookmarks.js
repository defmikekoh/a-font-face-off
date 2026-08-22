const fs = require('node:fs');

function decodeXmlAttribute(value) {
    return value
        .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function parseUiNodes(xml) {
    return Array.from(xml.matchAll(/<node\b[^>]*>/g), (nodeMatch) => {
        const attributes = {};
        for (const attributeMatch of nodeMatch[0].matchAll(/([\w-]+)="([^"]*)"/g)) {
            attributes[attributeMatch[1]] = decodeXmlAttribute(attributeMatch[2]);
        }
        const boundsMatch = (attributes.bounds || '').match(
            /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/,
        );
        return {
            ...attributes,
            bounds: boundsMatch ? {
                left: Number(boundsMatch[1]),
                top: Number(boundsMatch[2]),
                right: Number(boundsMatch[3]),
                bottom: Number(boundsMatch[4]),
            } : null,
        };
    });
}

function loadBookmarkList(bookmarkFile) {
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(bookmarkFile, 'utf8'));
    } catch (error) {
        throw new Error(`Unable to read Android Firefox bookmark list ${bookmarkFile}: ${error.message}`);
    }

    return normalizeBookmarkList(parsed, bookmarkFile);
}

function normalizeBookmarkList(parsed, source = 'bookmark list') {
    if (!Array.isArray(parsed)) {
        throw new Error(`Android Firefox bookmark list ${source} must be a JSON array.`);
    }
    const seenUrls = new Set();
    return parsed.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Bookmark entry ${index + 1} in ${source} must be an object.`);
        }

        const title = typeof entry.title === 'string' ? entry.title.trim() : '';
        const url = typeof entry.url === 'string' ? entry.url.trim() : '';
        if (!title) {
            throw new Error(`Bookmark entry ${index + 1} in ${source} must have a non-empty title.`);
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch (_error) {
            throw new Error(`Bookmark entry ${index + 1} in ${source} has an invalid URL: ${url || '(empty)'}`);
        }
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error(`Bookmark entry ${index + 1} in ${source} must use http or https.`);
        }
        if (seenUrls.has(parsedUrl.href)) {
            throw new Error(`Android Firefox bookmark list ${source} contains duplicate URL ${parsedUrl.href}.`);
        }
        seenUrls.add(parsedUrl.href);

        return {
            title,
            url: parsedUrl.href,
        };
    });
}

module.exports = {
    loadBookmarkList,
    normalizeBookmarkList,
    parseUiNodes,
};
