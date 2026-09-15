const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');

const source = fs.readFileSync(require.resolve('../src/popup.js'), 'utf8');
const names = new Set(['flushSliderEffects', 'updateSliderEffects', 'cancelSliderEffects']);
const functions = acorn.parse(source, { ecmaVersion: 2022 }).body
    .filter(node => node.type === 'FunctionDeclaration' && names.has(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n');

function harness() {
    const frames = new Map(), saves = [], previews = [], buttons = [];
    let id = 0;
    const context = vm.createContext({
        currentViewMode: 'faceoff', suppressUiStateSave: false, pendingSliderEffects: new Map(), value: 0,
        requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
        cancelAnimationFrame(key) { frames.delete(key); },
        saveExtensionState() { saves.push(context.value); },
        applyFont(position, options) { previews.push({ position, value: context.value, saveState: options.saveState }); },
        getPositionCallbacks(position) { return { buttons: () => buttons.push(position) }; }
    });
    vm.runInContext(functions, context);
    return { context, frames, saves, previews, buttons,
        render() { for (const fn of [...frames.values()]) fn(); } };
}

test('slider bursts persist each value immediately but render only the latest value per panel', () => {
    const h = harness();
    for (let i = 1; i <= 120; i++) {
        h.context.value = i;
        h.context.updateSliderEffects('top');
    }
    assert.equal(h.saves.length, 120);
    assert.equal(h.saves.at(-1), 120, 'Final value is sent even if the popup never renders again');
    assert.equal(h.previews.length, 0);
    assert.equal(h.frames.size, 1);
    h.context.updateSliderEffects('bottom');
    h.render();
    assert.deepEqual(h.previews, [
        { position: 'top', value: 120, saveState: false },
        { position: 'bottom', value: 120, saveState: false }
    ]);
    assert.deepEqual(h.buttons, ['top', 'bottom']);
    assert.equal(h.frames.size, 0);
});

test('commit flushes once and mode changes discard pending visual work', () => {
    const h = harness();
    h.context.updateSliderEffects('top');
    h.context.flushSliderEffects('top');
    h.context.flushSliderEffects('top');
    assert.equal(h.previews.length, 1);
    assert.equal(h.saves.length, 1, 'Change does not write the same input again');
    h.context.updateSliderEffects('bottom');
    h.context.currentViewMode = 'body-contact';
    h.render();
    assert.equal(h.previews.length, 1);
    h.context.updateSliderEffects('body');
    h.context.cancelSliderEffects();
    h.render();
    assert.equal(h.previews.length, 1);
    assert.equal(h.frames.size, 0);
});

test('an immediate text/reset update replaces pending drag visuals and respects restoration save suppression', () => {
    const h = harness();
    h.context.value = 4;
    h.context.updateSliderEffects('top');
    h.context.value = 0;
    h.context.suppressUiStateSave = true;
    h.context.updateSliderEffects('top', true);
    assert.deepEqual(h.saves, [4]);
    assert.deepEqual(h.previews, [{ position: 'top', value: 0, saveState: false }]);
    assert.equal(h.frames.size, 0);
});
