const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    loadBookmarkList,
    normalizeBookmarkList,
    parseUiNodes,
} = require('../scripts/android-firefox-bookmarks');

const BOOKMARK_FILE = path.join(
    __dirname,
    '..',
    '.agents',
    'skills',
    'desktop-testing',
    'references',
    'android-firefox-bookmarks.json',
);

test('Android Firefox bookmark list contains the Deep View regression page', () => {
    assert.deepEqual(loadBookmarkList(BOOKMARK_FILE), [{
        title: 'For AI builders, Pixel 11 Pro Fold is the phone to beat',
        url: 'https://www.thedeepview.com/articles/for-ai-builders-pixel-11-pro-fold-is-the-phone-to-beat',
    }]);
});

test('Android Firefox bookmark list normalization rejects duplicates', () => {
    assert.throws(() => normalizeBookmarkList([
        { title: 'First', url: 'https://example.com' },
        { title: 'Second', url: 'https://example.com/' },
    ], 'test bookmarks'), /duplicate URL https:\/\/example\.com\//);
});

test('Android UI dump parsing exposes semantic selectors and tap bounds', () => {
    const [node] = parseUiNodes(
        '<node text="Saved in &#8220;Bookmarks&#8221;" content-desc="Bookmark page" bounds="[28,1045][1412,1227]" />',
    );

    assert.equal(node.text, 'Saved in “Bookmarks”');
    assert.equal(node['content-desc'], 'Bookmark page');
    assert.deepEqual(node.bounds, {
        left: 28,
        top: 1045,
        right: 1412,
        bottom: 1227,
    });
});
