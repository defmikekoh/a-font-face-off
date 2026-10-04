const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');

// Exercise the real detector without constructing the WhatFont overlay UI.
const source = fs.readFileSync(require.resolve('../src/whatfont_core.js'), 'utf8');
let detector;
function collect(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Property' && node.key.name === 'detectVariableAxes') detector = source.slice(node.value.start, node.value.end);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') collect(value);
    }
}
collect(acorn.parse(source, { ecmaVersion: 2022 }));
assert.ok(detector);

function detect(style, variations = 'normal') {
    const properties = { 'font-style': style, 'font-variation-settings': variations, 'font-weight': '400', 'font-stretch': '100%' };
    const context = vm.createContext({ window: { getComputedStyle: () => ({ getPropertyValue: name => properties[name] || '' }) } });
    return JSON.parse(vm.runInContext(`JSON.stringify((${detector}).call({ element: [{}] }))`, context));
}

test('WhatFont converts CSS oblique angles to OpenType slant in both directions', () => {
    assert.deepEqual(detect('oblique 10deg'), { slnt: -10 });
    assert.deepEqual(detect('oblique -8deg'), { slnt: 8 });
});

test('WhatFont preserves explicit slant and upright italic-axis overrides', () => {
    assert.deepEqual(detect('italic', '"slnt" -5, "ital" 0'), { slnt: -5, ital: 0 });
    assert.deepEqual(detect('oblique 10deg', '"slnt" -3'), { slnt: -3 });
});
