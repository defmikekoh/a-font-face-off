const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildFontLoadDescriptors,
    captureViewportAnchor,
    restoreViewportAnchor,
    restoreViewportAnchorAfterLayout,
} = require('../src/font-swap-utils.js');

function makeElement(options = {}) {
    const element = {
        nodeType: 1,
        tagName: options.tagName || 'P',
        textContent: options.textContent || 'Readable article text',
        isConnected: options.isConnected !== false,
        parentElement: options.parentElement || null,
        closest: options.closest || (() => null),
        getBoundingClientRect: () => ({
            top: options.top == null ? 100 : options.top,
            bottom: options.bottom == null ? 140 : options.bottom,
            width: options.width == null ? 300 : options.width,
            height: options.height == null ? 40 : options.height,
        }),
    };
    return element;
}

function makeViewport(overrides = {}) {
    const body = makeElement({ tagName: 'BODY' });
    const documentElement = makeElement({ tagName: 'HTML' });
    const windowObject = {
        innerWidth: 800,
        innerHeight: 600,
        scrollY: 500,
        pageYOffset: 500,
        getComputedStyle: element => element._style || {
            position: 'static',
            display: 'block',
            visibility: 'visible',
        },
        scrollBy() {},
        scrollTo() {},
        requestAnimationFrame: callback => callback(),
        ...overrides.window,
    };
    const documentObject = {
        body,
        documentElement,
        elementsFromPoint: () => [],
        ...overrides.document,
    };
    return { documentObject, windowObject };
}

describe('font-swap-utils font load descriptors', () => {
    it('loads the configured face and a bold face for descendants', () => {
        assert.deepEqual(buildFontLoadDescriptors({
            fontName: 'Source Serif 4',
            fontWeight: 350,
            fontStyle: 'italic',
        }), [
            'italic 350 16px "Source Serif 4"',
            'italic 700 16px "Source Serif 4"',
        ]);
    });

    it('uses a variable weight and does not duplicate 700', () => {
        assert.deepEqual(buildFontLoadDescriptors({
            fontName: 'A "Quoted" Face',
            variableAxes: { wght: 700 },
        }), ['normal 700 16px "A \\"Quoted\\" Face"']);
    });

    it('derives italic readiness from a registered variable axis', () => {
        assert.deepEqual(buildFontLoadDescriptors({
            fontName: 'Variable Italic',
            variableAxes: { ital: 1, wght: 500 },
        }), [
            'italic 500 16px "Variable Italic"',
            'italic 700 16px "Variable Italic"',
        ]);
    });
});

describe('font-swap-utils viewport anchoring', () => {
    it('chooses readable content beneath a fixed overlay', () => {
        const fixedOverlay = makeElement();
        fixedOverlay._style = { position: 'fixed', display: 'block', visibility: 'visible' };
        const paragraph = makeElement({ top: 92 });
        const { documentObject, windowObject } = makeViewport({
            document: { elementsFromPoint: () => [fixedOverlay, paragraph] },
        });

        const snapshot = captureViewportAnchor(documentObject, windowObject);
        assert.equal(snapshot.element, paragraph);
        assert.equal(snapshot.top, 92);
        assert.equal(snapshot.scrollY, 500);
    });

    it('does not anchor a page that is already at the top', () => {
        const { documentObject, windowObject } = makeViewport({
            window: { scrollY: 0, pageYOffset: 0 },
        });
        assert.equal(captureViewportAnchor(documentObject, windowObject), null);
    });

    it('corrects the element top delta after reflow', () => {
        const deltas = [];
        const element = makeElement({ top: 260 });
        const { windowObject } = makeViewport({
            window: { scrollBy: (x, y) => deltas.push([x, y]) },
        });

        assert.equal(restoreViewportAnchor({ element, top: 100, scrollY: 500 }, windowObject), true);
        assert.deepEqual(deltas, [[0, 160]]);
    });

    it('falls back to the captured scroll offset if the anchor was replaced', () => {
        const scrolls = [];
        const element = makeElement({ isConnected: false });
        const { windowObject } = makeViewport({
            window: { scrollTo: (x, y) => scrolls.push([x, y]) },
        });

        assert.equal(restoreViewportAnchor({ element, top: 100, scrollY: 720 }, windowObject), true);
        assert.deepEqual(scrolls, [[0, 720]]);
    });

    it('waits for layout frames before restoring', async () => {
        let frameCount = 0;
        const element = makeElement({ top: 100 });
        const { windowObject } = makeViewport({
            window: { requestAnimationFrame: callback => { frameCount++; callback(); } },
        });

        assert.equal(await restoreViewportAnchorAfterLayout({ element, top: 100, scrollY: 500 }, windowObject), true);
        assert.equal(frameCount, 3);
    });

    it('restores a hidden page without waiting for suspended animation frames', async () => {
        const deltas = [];
        const { windowObject } = makeViewport({
            window: {
                document: { visibilityState: 'hidden' },
                requestAnimationFrame: () => assert.fail('Hidden pages must not wait for animation frames'),
                scrollBy: (x, y) => deltas.push([x, y]),
            },
        });

        const restored = await restoreViewportAnchorAfterLayout({
            element: makeElement({ top: 260 }), top: 100, scrollY: 500,
        }, windowObject);
        assert.equal(restored, true);
        assert.deepEqual(deltas, [[0, 160]]);
    });

    for (const completedFrames of [0, 1, 2]) {
        it(`finishes when the page becomes hidden after ${completedFrames} layout frames`, async () => {
            const documentObject = new globalThis.EventTarget();
            documentObject.visibilityState = 'visible';
            const frames = new Map();
            let frameId = 0;
            let restores = 0;
            const { windowObject } = makeViewport({
                window: {
                    document: documentObject,
                    requestAnimationFrame: callback => {
                        frames.set(++frameId, callback);
                        return frameId;
                    },
                    cancelAnimationFrame: id => frames.delete(id),
                    scrollTo: () => { restores++; },
                },
            });
            let settled = false;
            const restoring = restoreViewportAnchorAfterLayout({ scrollY: 500 }, windowObject)
                .then(result => { settled = true; return result; });
            for (let index = 0; index < completedFrames; index++) {
                const [id, callback] = frames.entries().next().value;
                frames.delete(id);
                callback();
            }
            documentObject.visibilityState = 'hidden';
            documentObject.dispatchEvent(new globalThis.Event('visibilitychange'));
            await Promise.resolve();
            assert.equal(settled, true, 'Apply must finish even if no more frames are delivered');
            assert.equal(await restoring, true);
            assert.equal(frames.size, 0, 'No stale scroll correction should run when returning to the page');
            const restoresAtCompletion = restores;
            documentObject.visibilityState = 'visible';
            documentObject.dispatchEvent(new globalThis.Event('visibilitychange'));
            documentObject.visibilityState = 'hidden';
            documentObject.dispatchEvent(new globalThis.Event('visibilitychange'));
            assert.equal(restores, restoresAtCompletion, 'The visibility listener must be removed');
        });
    }
});
