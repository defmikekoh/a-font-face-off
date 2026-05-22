const test = require('node:test');
const assert = require('node:assert/strict');

const {
    favoriteMatchesSearch,
    getAvailableSrouletteFavoriteEntriesFromData,
    getValidSroulettePoolInfoFromData,
    normalizeFavoriteSearch,
    srouletteFavoriteMatchesSearch,
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

test('getAvailableSrouletteFavoriteEntriesFromData returns configured Sroulette pseudo-favorites', () => {
    const data = {
        affoSubstackRoulette: true,
        affoSubstackRouletteSerif: ['Serif One', 'Missing Serif'],
        affoSubstackRouletteSans: ['Sans One'],
        affoFavorites: {
            'Serif One': { fontName: 'Lora' },
            'Sans One': { fontName: 'Inter' },
        }
    };

    assert.deepEqual(getValidSroulettePoolInfoFromData(data, 'serif'), {
        available: true,
        count: 1,
    });

    assert.deepEqual(getAvailableSrouletteFavoriteEntriesFromData(data), [
        {
            kind: 'sroulette',
            pool: 'serif',
            name: 'Sroulette Serif',
            preview: '1 Substack Roulette font',
        },
        {
            kind: 'sroulette',
            pool: 'sans',
            name: 'Sroulette Sans',
            preview: '1 Substack Roulette font',
        },
    ]);
});

test('getAvailableSrouletteFavoriteEntriesFromData hides disabled or empty pools', () => {
    assert.deepEqual(getAvailableSrouletteFavoriteEntriesFromData({
        affoSubstackRoulette: false,
        affoSubstackRouletteSerif: ['Serif One'],
        affoFavorites: { 'Serif One': { fontName: 'Lora' } }
    }), []);

    assert.deepEqual(getAvailableSrouletteFavoriteEntriesFromData({
        affoSubstackRouletteSerif: ['Missing Serif'],
        affoSubstackRouletteSans: [],
        affoFavorites: {}
    }), []);
});

test('srouletteFavoriteMatchesSearch matches labels and roulette terms', () => {
    const entry = {
        kind: 'sroulette',
        pool: 'serif',
        name: 'Sroulette Serif',
        preview: '2 Substack Roulette fonts',
    };

    assert.equal(srouletteFavoriteMatchesSearch(entry, 'sroulette'), true);
    assert.equal(srouletteFavoriteMatchesSearch(entry, 'substack'), true);
    assert.equal(srouletteFavoriteMatchesSearch(entry, 'sans'), false);
});
