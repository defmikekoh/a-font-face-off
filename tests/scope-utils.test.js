const { test } = require('node:test');
const assert = require('node:assert/strict');
const scopes = require('../src/scope-utils');

test('directory matching chooses the longest segment prefix with hostname fallback', () => {
    const map = { 'foodomain.com': { body: { fontName: 'Georgia' } }, 'foodomain.com/wiki/': {}, 'foodomain.com/wiki/admin/': {}, 'foodomain.com/jira/': {} };
    for (const [path, key] of [
        ['/', 'foodomain.com'], ['/other/', 'foodomain.com'], ['/wikipedia/', 'foodomain.com'],
        ['/wiki', 'foodomain.com/wiki/'], ['/wiki/', 'foodomain.com/wiki/'], ['/wiki/page?x=1#part', 'foodomain.com/wiki/'],
        ['/wiki/admin/users', 'foodomain.com/wiki/admin/'], ['/jira/123', 'foodomain.com/jira/'],
        ['/Wiki/', 'foodomain.com'], ['/wiki%2Fadmin/', 'foodomain.com'],
    ]) assert.equal(scopes.resolveKey(map, 'https://foodomain.com' + path), key, path);
    assert.equal(scopes.resolveKey(map, 'https://other.foodomain.com/wiki/'), 'other.foodomain.com');
    assert.equal(scopes.resolveKey(map, 'http://foodomain.com:8080/wiki/'), 'foodomain.com/wiki/');
    assert.deepEqual(scopes.getEntry(map, 'https://foodomain.com/wiki/'), {}, 'Empty directory scope overrides domain');
});

test('directory input normalizes host and slash while preserving path case', () => {
    assert.equal(scopes.normalizePathScope(' FOODOMAIN.com/Wiki '), 'foodomain.com/Wiki/');
    assert.equal(scopes.normalizePathScope('https://foodomain.com/wiki///'), 'foodomain.com/wiki/');
    for (const value of ['foodomain.com', 'foodomain.com/', 'foodomain.com/wiki/?x=1', 'foodomain.com/wiki/#x', 'ftp://foodomain.com/wiki/', 'https://user@foodomain.com/wiki/', 'foodomain.com:8080/wiki/']) {
        assert.throws(() => scopes.normalizePathScope(value), undefined, value);
    }
});

test('editing directories preserves configs, snapshots inheritance, and removes deleted scopes', () => {
    const original = { 'foodomain.com': { body: { fontName: 'Georgia' } }, 'foodomain.com/wiki/': { serif: { fontName: 'Arial' } } };
    const next = scopes.updatePathScopes(original, ['foodomain.com/wiki/', 'foodomain.com/wiki/admin', 'foodomain.com/jira/', 'foodomain.com/jira']);
    assert.deepEqual(next['foodomain.com/wiki/admin/'], original['foodomain.com/wiki/']);
    assert.deepEqual(next['foodomain.com/jira/'], original['foodomain.com']);
    next['foodomain.com/jira/'].body.fontName = 'Verdana';
    assert.equal(original['foodomain.com'].body.fontName, 'Georgia');
    const removed = scopes.updatePathScopes(next, ['foodomain.com/jira/']);
    assert.equal(scopes.resolveKey(removed, 'https://foodomain.com/wiki/'), 'foodomain.com');
    assert.throws(() => scopes.updatePathScopes(original, ['foodomain.com/jira/', 'bad/']));
    assert.equal(Object.keys(original).length, 2);
});
