const test = require('node:test');
const assert = require('node:assert/strict');

const {
    favoriteMatchesSearch,
    normalizeFavoriteSearch,
} = require('../src/favorites.js');

test('normalizeFavoriteSearch trims and lowercases queries', () => {
    assert.equal(normalizeFavoriteSearch('  Roboto  '), 'roboto');
    assert.equal(normalizeFavoriteSearch(null), '');
});

test('favoriteMatchesSearch matches favorite name, font name, and preview text', () => {
    const config = {
        fontName: 'Roboto Flex',
        fontSize: 18,
        fontWeight: 650,
        fontStyle: 'italic',
    };

    assert.equal(favoriteMatchesSearch('Article Body', config, 'article'), true);
    assert.equal(favoriteMatchesSearch('Article Body', config, 'roboto'), true);
    assert.equal(favoriteMatchesSearch('Article Body', config, '650wt'), true);
    assert.equal(favoriteMatchesSearch('Article Body', config, 'mono'), false);
});
