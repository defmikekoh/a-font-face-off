const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCaptureScript() {
    const events = [];

    class TestFontFace {
        constructor(family, source, descriptors = {}) {
            this.family = family;
            this.source = source;
            this.style = descriptors.style || 'normal';
            this.weight = descriptors.weight || 'normal';
            this.stretch = descriptors.stretch || 'normal';
            this.unicodeRange = descriptors.unicodeRange || 'U+0-10FFFF';
            this.display = descriptors.display || 'auto';
        }
    }

    class TestCustomEvent {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    }

    function TestEventTarget() {}
    TestEventTarget.prototype.dispatchEvent = function(event) {
        events.push(event);
        return true;
    };

    const document = Object.assign(new TestEventTarget(), {
        baseURI: 'https://example.com/articles/page'
    });
    const window = {
        FontFace: TestFontFace,
        Proxy,
        Reflect,
        CustomEvent: TestCustomEvent,
        EventTarget: TestEventTarget
    };
    const context = vm.createContext({ window, document, Object, JSON });
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'page-font-face-capture.js'),
        'utf8'
    );
    vm.runInContext(source, context, { filename: 'page-font-face-capture.js' });
    return { events, NativeFontFace: TestFontFace, window };
}

describe('page FontFace capture', () => {
    it('records string-backed FontFace construction without changing instanceof behavior', () => {
        const { events, NativeFontFace, window } = loadCaptureScript();
        const face = new window.FontFace('IvarText', 'url("fonts/ivar.woff2")', {
            weight: '400',
            style: 'normal',
            display: 'swap'
        });

        assert.equal(face instanceof NativeFontFace, true);
        assert.equal(events.length, 1);
        assert.deepEqual(JSON.parse(events[0].detail), {
            family: 'IvarText',
            source: 'url("fonts/ivar.woff2")',
            baseUrl: 'https://example.com/articles/page',
            descriptors: {
                style: 'normal',
                weight: '400',
                stretch: 'normal',
                unicodeRange: 'U+0-10FFFF',
                display: 'swap'
            }
        });
    });

    it('does not copy binary FontFace sources', () => {
        const { events, window } = loadCaptureScript();
        new window.FontFace('Binary Font', new ArrayBuffer(8));
        assert.equal(events.length, 0);
    });
});
