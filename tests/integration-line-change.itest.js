const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setup, teardown, openPopup, closePopup, popupExec } = require('./selenium-helper');

test('Line Change updates the line box of paragraphs whose text is nested', async () => {
    const { driver, profileDir } = await setup();
    const popup = script => popupExec(driver, script);
    try {
        await driver.executeScript(`document.body.innerHTML = '<article style="font:20px/1.6 Georgia">' +
            '<p id="nested"><span>Some prose </span><a href="#">linked text</a><em id="matching">italic text</em>' +
            '<em style="font-family:Verdana">different family</em></p></article>'`);
        await openPopup(driver);
        await driver.wait(() => popup("return !!document.querySelector('#line-source button') && !document.querySelector('#line-apply').disabled"), 15000);
        await popup("Array.from(document.querySelectorAll('#line-source button')).find(button => button.textContent === 'Georgia').click()");
        await driver.wait(() => popup("return !document.querySelector('#line-apply').disabled"), 10000);
        await popup("return AFFOLineChangePopup.selectFont({fontName:'Arial',fontSource:'local',lineHeight:1.3})");
        await popup("document.querySelector('#line-apply').click()");
        await driver.wait(() => driver.executeScript("return getComputedStyle(document.querySelector('#nested')).fontFamily === 'Arial'"), 10000, 'Paragraph font was not replaced');
        assert.equal(await driver.executeScript("return getComputedStyle(document.querySelector('#nested')).lineHeight"), '26px');
        assert.equal(await driver.executeScript("return getComputedStyle(document.querySelector('#matching')).lineHeight"), '26px');
        assert.equal(await driver.executeScript("return getComputedStyle(document.querySelector('#nested em:not(#matching)')).fontFamily"), 'Verdana');
        await driver.wait(() => popup("return !!document.querySelector('#line-rules button[aria-label=\"Remove substitution for Georgia\"]')"), 10000);
        await popup("document.querySelector('#line-rules button[aria-label=\"Remove substitution for Georgia\"]').click()");
        await driver.wait(() => driver.executeScript("return getComputedStyle(document.querySelector('#nested')).fontFamily.includes('Georgia')"), 10000, 'Paragraph font was not restored');
        assert.equal(await driver.executeScript("return getComputedStyle(document.querySelector('#nested')).lineHeight"), '32px');
    } finally {
        await teardown(driver, profileDir);
    }
});

test('native popup highlights original families and removes each scoped substitution independently', async () => {
    const { driver, profileDir } = await setup();
    const popup = script => popupExec(driver, script);
    const page = script => driver.executeScript('return ' + script);
    const ready = () => driver.wait(() => popup("return !!document.querySelector('#line-source button:not(:disabled)')"), 15000);
    const marks = () => page("Array.from(CSS.highlights.get('affo-line-change') || [], range => range.startContainer.parentElement.id)");
    const family = id => page(`getComputedStyle(document.getElementById('${id}')).fontFamily`);
    try {
        await driver.executeScript(`document.body.innerHTML =
            '<p id="first" style="font-family:Arial,sans-serif">First</p>' +
            '<p id="fallback" style="font-family:Georgia,Arial,serif">Fallback</p>'`);
        await openPopup(driver);
        await ready();
        await popup("Array.from(document.querySelectorAll('#line-source button')).find(button => button.textContent === 'Arial').click()");
        await ready();
        await popup("document.querySelector('#line-highlight').click()");
        await driver.wait(async () => (await marks()).length > 0, 10000);
        assert.deepEqual(await marks(), ['first']);
        await ready();
        await popup("document.querySelector('#line-apply').click()");
        await driver.wait(async () => await family('first') === 'Georgia', 10000);
        await ready();
        await popup("Array.from(document.querySelectorAll('#line-source button')).find(button => button.textContent === 'Georgia').click()");
        await driver.wait(async () => (await marks()).includes('fallback'), 10000);
        assert.deepEqual(await marks(), ['fallback']);
        await ready();
        await popup("return applyFontConfig('line',{fontName:'Arial',fontSource:'local',fontSize:27}).then(() => document.querySelector('#line-apply').click())");
        await driver.wait(async () => await family('fallback') === 'Arial', 10000);
        assert.equal(await page("getComputedStyle(document.querySelector('#fallback')).fontSize"), '27px');
        await ready();
        const trash = '#line-rules button[aria-label="Remove substitution for Arial"]';
        assert.equal(await popup(`return document.querySelector('${trash}').textContent`), '🗑️');
        await popup(`document.querySelector('${trash}').click()`);
        await driver.wait(async () => (await family('first')).startsWith('Arial,'), 10000);
        assert.equal(await family('fallback'), 'Arial');
        assert.equal(await popup("return document.querySelectorAll('#line-rules li').length"), 1);
    } finally {
        await teardown(driver, profileDir);
    }
});

test('loading a Line Change favorite clears the default Sroulette target and keeps controls active', async () => {
    const { driver, profileDir } = await setup();
    const popup = script => popupExec(driver, script);
    try {
        await driver.executeScript("document.body.innerHTML = '<p style=\"font-family:Arial,sans-serif\">Favorite target</p>'");
        await openPopup(driver);
        await driver.wait(() => popup("return !!document.querySelector('#line-source button') && !document.querySelector('#line-apply').disabled"), 15000);
        await popup(`
            return browser.storage.local.set({
                affoFavorites: { 'Chosen favorite': { fontName: 'Lora', variableAxes: {} } },
                affoFavoritesOrder: ['Chosen favorite'],
                affoSubstackRouletteSerif: ['Chosen favorite']
            });
        `);
        await closePopup(driver);
        await openPopup(driver);
        await driver.wait(() => popup("return document.getElementById('line-font-display').dataset.affoSroulettePool === 'serif' && !document.getElementById('line-apply').disabled"), 15000);
        await popup("document.getElementById('line-apply').click()");
        await driver.wait(() => popup(`
            const apply = document.getElementById('line-apply');
            return apply.disabled && apply.textContent === 'No Sub' &&
                !document.querySelector('#line-source button').disabled;
        `), 10000);
        await popup(`
            document.getElementById('line-in-grip').click();
            document.getElementById('line-load-favorite-bar').click();
        `);
        await driver.wait(() => popup("return document.querySelector('#favorites-popup').classList.contains('visible')"), 5000);
        await popup("document.querySelector('[data-favorite-name=\"Chosen favorite\"]')?.click()");
        await driver.wait(() => popup(`
            return !document.getElementById('favorites-popup').classList.contains('visible') &&
                document.getElementById('line-font-display').textContent === 'Lora' &&
                !document.getElementById('line-font-controls').classList.contains('sroulette-applied');
        `), 10000);
        assert.equal(await popup("return document.getElementById('line-font-size').disabled"), false);
        assert.equal(await popup("return document.getElementById('line-apply').textContent"), 'Replace Sub ↓');
        await popup("document.getElementById('line-apply').click()");
        await driver.wait(() => popup(`
            return getActiveOrigin().then(scope => browser.storage.local.get('affoApplyMap').then(({affoApplyMap}) =>
                affoApplyMap?.[scope]?.lineChange?.[0]?.target?.fontName === 'Lora'));
        `), 10000);
    } finally {
        await teardown(driver, profileDir);
    }
});

test('parameter-only Line Change follows visible text through page edits and restores original sizes', async () => {
    const { driver, profileDir } = await setup();
    const popup = script => popupExec(driver, script);
    const sizes = () => driver.executeScript(`
        return ['story', 'aside-font', 'heading', 'detail'].map(id =>
            getComputedStyle(document.getElementById(id)).fontSize);
    `);
    try {
        await driver.executeScript(`
            document.body.innerHTML = '<article style="font:20px Georgia,serif">' +
                '<p id="story" style="font-size:20px!important">The predominant family owns this long paragraph.' +
                '<span id="aside-font" style="font-family:Arial">Aside</span></p>' +
                '<p id="detail" style="font-size:12px">Details</p>' +
                '<h2 id="heading" style="font:20px Verdana">Excluded heading</h2>' +
                '<span hidden style="font-family:Verdana">Hidden text</span></article>';
        `);
        await openPopup(driver);
        await driver.wait(() => popup("return !!document.querySelector('#line-source button') && !document.querySelector('#line-apply').disabled"), 15000);
        assert.equal(await popup("return document.querySelector('#line-source-name').textContent"), 'Georgia');
        assert.deepEqual(await popup("return Array.from(document.querySelectorAll('#line-source button'), b => b.textContent)"), ['Arial', 'Georgia']);

        await popup("return AFFOLineChangePopup.selectFont({})");
        await popup("document.querySelector('#line-apply').click()");
        await driver.wait(() => popup("return document.querySelector('#line-status').textContent.includes('Choose a font or parameter')"), 5000);
        await popup("return AFFOLineChangePopup.selectFont({fontSizeScale:150})");
        await popup("document.querySelector('#line-apply').click()");
        await driver.wait(async () => (await sizes())[0] === '30px', 10000);
        assert.deepEqual(await sizes(), ['30px', '20px', '20px', '18px']);
        assert.equal(await driver.executeScript("return getComputedStyle(document.querySelector('#story')).fontFamily"), 'Georgia, serif');
        await driver.wait(() => popup("return document.querySelector('#line-rules li')?.textContent.includes('Default (parameters only)')"), 10000);

        await driver.executeScript(`
            const extra = document.createElement('p');
            extra.id = 'added';
            extra.textContent = 'New paragraph';
            document.querySelector('article').append(extra);
            document.querySelector('#detail').style.fontSize = '16px';
        `);
        await driver.wait(() => driver.executeScript("return getComputedStyle(document.querySelector('#added')).fontSize === '30px'"), 10000);
        assert.deepEqual(await sizes(), ['30px', '20px', '20px', '24px']);
        await popup("document.querySelector('#line-rules button').click()");
        await driver.wait(async () => (await sizes())[0] === '20px', 10000);
        assert.deepEqual(await sizes(), ['20px', '20px', '20px', '16px']);
        assert.equal(await driver.executeScript("return document.querySelector('#story').style.getPropertyPriority('font-size')"), 'important');
    } finally {
        await teardown(driver, profileDir);
    }
});

test('Substack defaults sample both pools while a saved directory uses its own substitutions', async t => {
    const server = http.createServer((_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><meta name="generator" content="Substack"><article>
            <p style="font-family:Spectral">Story</p>
            <p style="font-family:'Roboto Slab'">Second paragraph</p>
            <p style="font-family:'SF Pro Display'">Third paragraph</p>
        </article>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const { driver, profileDir } = await setup();
    const base = 'http://127.0.0.1:' + server.address().port;
    const map = { '127.0.0.1/saved/': { lineChange: [
        { source: 'Spectral', target: { fontName: 'Verdana', fontSource: 'local' } },
    ] } };
    const waitForFamilies = async expected => {
        let families;
        await driver.wait(async () => {
            families = await driver.executeScript(`
                return Array.from(document.querySelectorAll('article p'), p => getComputedStyle(p).fontFamily.replace(/^['"]|['"]$/g, ''));
            `);
            return families.length === expected.length && families.every((name, index) => name === expected[index]);
        }, 10000, () => 'Expected ' + expected.join(', ') + ', observed ' + families.join(', '));
    };
    try {
        await openPopup(driver);
        await popupExec(driver, `return browser.storage.local.set({
            affoApplyMap: ${JSON.stringify(map)},
            affoFavorites: {
                Book: {fontName:'Georgia', fontSource:'local'},
                News: {fontName:'Arial', fontSource:'local'}
            },
            affoSubstackRouletteSerif: ['Book'],
            affoSubstackRouletteSans: ['News']
        })`);
        await closePopup(driver);
        await driver.get(base + '/story');
        await waitForFamilies(['Georgia', 'Georgia', 'Arial']);
        await driver.get(base + '/saved/story');
        await waitForFamilies(['Verdana', 'Roboto Slab', 'SF Pro Display']);
        await openPopup(driver);
        assert.deepEqual(await popupExec(driver, "return browser.storage.local.get('affoApplyMap').then(data => data.affoApplyMap)"), map);
    } finally {
        await teardown(driver, profileDir);
    }
});
