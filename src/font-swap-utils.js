/* global module */
/* font-swap-utils.js — stable font-swap and viewport-anchor helpers.
 *
 * Loaded as a plain script in content pages and exported for Node tests.
 */

function affoNormalizeSwapWeight(value) {
    var normalized = String(value == null ? '' : value).trim().toLowerCase();
    if (normalized === 'normal') return 400;
    if (normalized === 'bold') return 700;
    var parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 400;
    return Math.max(1, Math.min(1000, parsed));
}

function affoNormalizeSwapStyle(value, variableAxes) {
    var style = String(value || '').trim().toLowerCase();
    if (style !== 'italic' && style !== 'oblique' && variableAxes) {
        if (Object.prototype.hasOwnProperty.call(variableAxes, 'ital') && Number(variableAxes.ital) >= 0.5) {
            style = 'italic';
        } else if (Object.prototype.hasOwnProperty.call(variableAxes, 'slnt') && Number(variableAxes.slnt) !== 0) {
            style = 'oblique';
        }
    }
    return style === 'italic' || style === 'oblique' ? style : 'normal';
}

function affoQuoteFontFamily(value) {
    return '"' + String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"') + '"';
}

function affoBuildFontLoadDescriptors(fontConfig) {
    if (!fontConfig || !fontConfig.fontName) return [];

    var style = affoNormalizeSwapStyle(fontConfig.fontStyle, fontConfig.variableAxes);
    var configuredWeight = affoNormalizeSwapWeight(
        fontConfig.fontWeight != null
            ? fontConfig.fontWeight
            : fontConfig.variableAxes && fontConfig.variableAxes.wght
    );
    var weights = configuredWeight === 700 ? [configuredWeight] : [configuredWeight, 700];
    var family = affoQuoteFontFamily(fontConfig.fontName);

    return weights.map(function (weight) {
        return style + ' ' + weight + ' 16px ' + family;
    });
}

function affoIsUsableAnchorElement(element, documentObject, windowObject) {
    if (!element || element.nodeType !== 1 || !element.isConnected) return false;
    if (element === documentObject.documentElement || element === documentObject.body) return false;
    if (element.closest && element.closest('[data-affo-guard], #affo-left-toolbar-iframe, #affo-unhide-icon')) return false;

    var tagName = String(element.tagName || '').toUpperCase();
    if (['HTML', 'BODY', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH'].includes(tagName)) return false;

    var rect;
    try { rect = element.getBoundingClientRect(); } catch (_) { return false; }
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom <= 0 || rect.top >= windowObject.innerHeight) return false;

    try {
        var style = windowObject.getComputedStyle(element);
        if (style.position === 'fixed' || style.position === 'sticky') return false;
        if (style.display === 'none' || style.visibility === 'hidden') return false;
    } catch (_) { }

    return String(element.textContent || '').trim().length > 0;
}

function affoFindViewportAnchor(documentObject, windowObject) {
    var width = Math.max(1, Number(windowObject.innerWidth) || 1);
    var height = Math.max(1, Number(windowObject.innerHeight) || 1);
    var points = [
        [width * 0.5, Math.min(96, height * 0.2)],
        [width * 0.5, height * 0.33],
        [width * 0.25, height * 0.33],
        [width * 0.75, height * 0.33],
        [width * 0.5, height * 0.55]
    ];

    for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
        var point = points[pointIndex];
        var hitElements = [];
        try {
            if (typeof documentObject.elementsFromPoint === 'function') {
                hitElements = documentObject.elementsFromPoint(point[0], point[1]);
            } else if (typeof documentObject.elementFromPoint === 'function') {
                var hit = documentObject.elementFromPoint(point[0], point[1]);
                if (hit) hitElements = [hit];
            }
        } catch (_) { }

        for (var hitIndex = 0; hitIndex < hitElements.length; hitIndex++) {
            var candidate = hitElements[hitIndex];
            while (candidate && candidate !== documentObject.body) {
                if (affoIsUsableAnchorElement(candidate, documentObject, windowObject)) return candidate;
                candidate = candidate.parentElement;
            }
        }
    }

    return null;
}

function affoCaptureViewportAnchor(documentObject, windowObject) {
    var scrollY = Number(windowObject.scrollY || windowObject.pageYOffset || 0);
    if (scrollY <= 1) return null;

    var element = affoFindViewportAnchor(documentObject, windowObject);
    var top = null;
    if (element) {
        try { top = element.getBoundingClientRect().top; } catch (_) { element = null; }
    }

    return {
        element: element,
        top: top,
        scrollY: scrollY
    };
}

function affoRestoreViewportAnchor(snapshot, windowObject) {
    if (!snapshot) return false;

    if (snapshot.element && snapshot.element.isConnected && Number.isFinite(snapshot.top)) {
        try {
            var currentTop = snapshot.element.getBoundingClientRect().top;
            var delta = currentTop - snapshot.top;
            if (Number.isFinite(delta) && Math.abs(delta) > 0.5) {
                windowObject.scrollBy(0, delta);
            }
            return true;
        } catch (_) { }
    }

    if (Number.isFinite(snapshot.scrollY)) {
        windowObject.scrollTo(0, snapshot.scrollY);
        return true;
    }
    return false;
}

function affoRestoreViewportAnchorAfterLayout(snapshot, windowObject) {
    if (!snapshot) return Promise.resolve(false);
    var requestFrame = typeof windowObject.requestAnimationFrame === 'function'
        ? windowObject.requestAnimationFrame.bind(windowObject)
        : function (callback) { return setTimeout(callback, 0); };

    return new Promise(function (resolve) {
        requestFrame(function () {
            requestFrame(function () {
                affoRestoreViewportAnchor(snapshot, windowObject);
                requestFrame(function () {
                    resolve(affoRestoreViewportAnchor(snapshot, windowObject));
                });
            });
        });
    });
}

var AFFOFontSwapUtils = {
    buildFontLoadDescriptors: affoBuildFontLoadDescriptors,
    captureViewportAnchor: affoCaptureViewportAnchor,
    restoreViewportAnchor: affoRestoreViewportAnchor,
    restoreViewportAnchorAfterLayout: affoRestoreViewportAnchorAfterLayout
};

if (typeof globalThis !== 'undefined') {
    globalThis.AFFOFontSwapUtils = AFFOFontSwapUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AFFOFontSwapUtils;
}
