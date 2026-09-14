const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, openPopup, popupExec } = require('./selenium-helper');

test('font picker reuses rows, filters sections and rail, and refreshes favorites on reopening', async () => {
    const { driver, profileDir } = await setup();
    try {
        await openPopup(driver);
        await popupExec(driver, `
            return browser.storage.local.set({
                affoFavorites: { 'Picker favorite': { fontName: 'Lora', variableAxes: {} } },
                affoFavoritesOrder: ['Picker favorite']
            });
        `);
        await popupExec(driver, `document.getElementById('top-font-display').click();`);
        await driver.wait(async () => popupExec(driver, `
            return document.getElementById('font-picker-modal').classList.contains('visible') &&
                document.querySelectorAll('.font-picker-item').length > 1000;
        `), 15000);
        const initial = await popupExec(driver, `
            window.__pickerOriginalRows = Array.from(document.querySelectorAll('.font-picker-item'));
            return window.__pickerOriginalRows.map(node => node.textContent);
        `);
        for (const query of ['r', 'ro', 'roboto', 'NO MATCH FOR THIS FONT', '']) {
            const result = await popupExec(driver, `
                const input = document.getElementById('font-picker-search');
                input.value = ${JSON.stringify(query)};
                input.dispatchEvent(new Event('input', { bubbles: true }));
                const rows = Array.from(document.querySelectorAll('.font-picker-item'));
                return {
                    sameNodes: rows.every((node, index) => node === window.__pickerOriginalRows[index]),
                    visible: rows.filter(node => !node.hidden).map(node => node.textContent),
                    titles: Array.from(document.querySelectorAll('.font-picker-section-title:not([hidden])')).map(n => n.textContent),
                    letters: Array.from(document.querySelectorAll('.rail-letter:not([hidden])')).map(n => n.textContent)
                };
            `);
            assert.equal(result.sameNodes, true);
            assert.deepEqual(result.visible, initial.filter(name => name.toLowerCase().includes(query.toLowerCase())));
            if (query.startsWith('NO MATCH')) {
                assert.deepEqual(result.titles, []);
                assert.deepEqual(result.letters, []);
            }
        }
        const jump = await popupExec(driver, `
            const letter = Array.from(document.querySelectorAll('.rail-letter')).find(n => n.textContent === 'R');
            letter.click();
            return { scroll: document.getElementById('font-picker-list').scrollTop,
                anchor: document.getElementById('fp-section-R').offsetTop };
        `);
        assert.ok(jump.scroll > 0);
        assert.ok(Math.abs(jump.scroll - jump.anchor) <= 1);

        // Exercise the shared click listener with a real selectable row.
        await popupExec(driver, `
            const item = Array.from(document.querySelectorAll('.font-picker-item')).find(n => n.textContent === 'Lora');
            item.click();
        `);
        await driver.wait(async () => popupExec(driver, `
            return document.getElementById('top-font-display').textContent === 'Lora' &&
                !document.getElementById('font-picker-modal').classList.contains('visible');
        `), 30000);
        await popupExec(driver, `
            return browser.storage.local.set({
                affoFavorites: { 'New favorite': { fontName: 'Inter', variableAxes: {} } },
                affoFavoritesOrder: ['New favorite']
            });
        `);
        await popupExec(driver, `document.getElementById('top-font-display').click();`);
        await driver.wait(async () => popupExec(driver, `
            return document.getElementById('font-picker-modal').classList.contains('visible') &&
                document.getElementById('fp-section-Favorites').nextElementSibling.textContent === 'Inter';
        `), 15000);
        assert.equal(await popupExec(driver, `
            return Array.from(document.querySelectorAll('.font-picker-item')).filter(n => n.textContent === 'Inter').length;
        `), 1, 'Favorites should not also appear in alphabetical sections');
    } finally {
        await teardown(driver, profileDir);
    }
});
