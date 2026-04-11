const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    affoBuildCss2UrlFromMetadata,
    affoBuildCss2AxisRangesFromMetadata,
} = require('../src/font-url-utils');

describe('font-url-utils', () => {
    const metadata = {
        familyMetadataList: [
            {
                family: 'Roboto Slab',
                axes: [{ tag: 'wght', min: 100, max: 900, defaultValue: 400 }],
                fonts: { 400: {}, 700: {} },
            },
            {
                family: 'Static Serif',
                axes: [],
                fonts: { 400: {}, 700: {}, '400i': {} },
            },
            {
                family: 'Recursive',
                axes: [
                    { tag: 'CASL', min: 0, max: 1, defaultValue: 0 },
                    { tag: 'MONO', min: 0, max: 1, defaultValue: 0 },
                    { tag: 'wght', min: 300, max: 1000, defaultValue: 400 },
                ],
                fonts: { 400: {} },
            },
        ],
    };

    it('builds variable axis-tag css2 URLs from metadata', () => {
        assert.equal(
            affoBuildCss2UrlFromMetadata('Roboto Slab', metadata),
            'https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@100..900&display=swap'
        );
    });

    it('builds static italic css2 URLs from metadata', () => {
        assert.equal(
            affoBuildCss2UrlFromMetadata('Static Serif', metadata),
            'https://fonts.googleapis.com/css2?family=Static+Serif:ital,wght@0,400;0,700;1,400&display=swap'
        );
    });

    it('orders lowercase axes before uppercase axes', () => {
        assert.equal(
            affoBuildCss2UrlFromMetadata('Recursive', metadata),
            'https://fonts.googleapis.com/css2?family=Recursive:wght,CASL,MONO@300..1000,0..1,0..1&display=swap'
        );
    });

    it('can decline fallback URLs for families missing from metadata', () => {
        assert.equal(
            affoBuildCss2UrlFromMetadata('Custom Local Font', metadata, { fallbackWhenMissing: false }),
            ''
        );
    });

    it('keeps axis-range entries available for popup slider metadata', () => {
        assert.deepEqual(
            affoBuildCss2AxisRangesFromMetadata(metadata).Recursive.variableTags,
            ['wght', 'CASL', 'MONO']
        );
    });
});
