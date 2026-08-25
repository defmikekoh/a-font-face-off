/* page-font-face-capture.js — Page-realm FontFace constructor observer.
 *
 * Loaded at document_start by left-toolbar.js. Keep this file standalone: it
 * runs in the page realm, not the extension content-script realm.
 */
(function() {
    'use strict';

    var CAPTURE_FLAG = '__affoPageFontFaceCaptureInstalledV1';
    var CAPTURE_EVENT = '__affo_page_font_face_created_v1__';
    var MAX_SOURCE_LENGTH = 32768;

    if (window[CAPTURE_FLAG] || typeof window.FontFace !== 'function' ||
        typeof window.Proxy !== 'function' || typeof window.Reflect !== 'object') {
        return;
    }

    var NativeFontFace = window.FontFace;
    var NativeCustomEvent = window.CustomEvent;
    var nativeDispatchEvent = window.EventTarget && window.EventTarget.prototype.dispatchEvent;
    if (typeof NativeCustomEvent !== 'function' || typeof nativeDispatchEvent !== 'function') {
        return;
    }

    function readDescriptor(face, name) {
        try {
            var value = face && face[name];
            return typeof value === 'string' ? value : '';
        } catch (_) {
            return '';
        }
    }

    function reportFontFace(face, source) {
        if (typeof source !== 'string' || !source || source.length > MAX_SOURCE_LENGTH) return;

        var record = {
            family: readDescriptor(face, 'family'),
            source: source,
            baseUrl: document.baseURI,
            descriptors: {
                style: readDescriptor(face, 'style'),
                weight: readDescriptor(face, 'weight'),
                stretch: readDescriptor(face, 'stretch'),
                unicodeRange: readDescriptor(face, 'unicodeRange'),
                display: readDescriptor(face, 'display')
            }
        };
        if (!record.family) return;

        try {
            nativeDispatchEvent.call(document, new NativeCustomEvent(CAPTURE_EVENT, {
                detail: JSON.stringify(record)
            }));
        } catch (_) { }
    }

    var CapturingFontFace = new window.Proxy(NativeFontFace, {
        construct: function(target, args, newTarget) {
            var face = window.Reflect.construct(target, args, newTarget);
            reportFontFace(face, args[1]);
            return face;
        }
    });

    try {
        var descriptor = Object.getOwnPropertyDescriptor(window, 'FontFace') || {};
        Object.defineProperty(window, 'FontFace', {
            configurable: descriptor.configurable !== false,
            enumerable: !!descriptor.enumerable,
            writable: descriptor.writable !== false,
            value: CapturingFontFace
        });
        window[CAPTURE_FLAG] = true;
    } catch (_) { }
})();
