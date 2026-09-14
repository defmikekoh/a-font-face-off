const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../src/font-picker.js');

test('font picker resolves families through live metadata getters', () => {
    let families = ['Lora'];
    const picker = create({ get gfFamilyList() { return families; } });
    assert.equal(picker.resolveFamilyCase('lora'), 'Lora');
    families = ['Inter'];
    assert.equal(picker.resolveFamilyCase('inter'), 'Inter');
    assert.equal(picker.resolveFamilyCase('lora'), 'lora');
});
