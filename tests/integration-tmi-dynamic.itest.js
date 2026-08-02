const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setup, teardown, openPopup, closePopup, popupExec } = require('./selenium-helper');

// Controlled fixture served over local HTTP. Content scripts match http://*/*,
// so 127.0.0.1 gets the extension injected (data:/file: URLs would not). This
// lets us exercise Third Man In marking — including the incremental, scoped
// marking of dynamically added DOM — without depending on a live external SPA.
const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AFFO TMI fixture</title>
  <style>
    .serif-text { font-family: Georgia, "Times New Roman", serif; }
    .sans-text { font-family: Arial, Helvetica, sans-serif; }
    .site-overlay { position: fixed; inset: 1rem; }
  </style>
</head>
<body>
  <nav id="site-nav">
    <span id="nav-text" class="sans-text">Navigation text should retain the website typography.</span>
  </nav>
  <main id="content">
    <p id="s1" class="serif-text">Initial serif paragraph with more than enough text to qualify as body content.</p>
    <p id="n1" class="sans-text">Initial sans paragraph with more than enough text to qualify as body content.</p>
  </main>
  <form id="composer">
    <p id="composer-text" class="sans-text">Composer text should retain the website typography.</p>
  </form>
  <section id="fixed-overlay" class="site-overlay">
    <div>
      <p id="fixed-overlay-text" class="sans-text">Fixed overlay text should retain the website typography and size.</p>
    </div>
  </section>
</body>
</html>`;

let driver;
let profileDir;
let server;
let baseUrl;
const ORIGIN = '127.0.0.1';

function startFixtureServer() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(FIXTURE_HTML);
        });
        srv.listen(0, ORIGIN, () => {
            const { port } = srv.address();
            resolve({ srv, url: `http://${ORIGIN}:${port}/` });
        });
    });
}

async function writeExtensionStorage(values) {
    await openPopup(driver);
    await popupExec(driver, `
        return browser.storage.local.set(${JSON.stringify(values)}).then(() => true);
    `);
    await closePopup(driver);
    await driver.sleep(300);
}

async function getMarker(id) {
    return driver.executeScript(
        `return document.getElementById(${JSON.stringify(id)})?.getAttribute('data-affo-font-type') || null;`
    );
}

describe('TMI dynamic-content incremental marking', { concurrency: false }, () => {
    before(async () => {
        const fixture = await startFixtureServer();
        server = fixture.srv;
        baseUrl = fixture.url;
        const ctx = await setup();
        driver = ctx.driver;
        profileDir = ctx.profileDir;
    });

    after(async () => {
        await teardown(driver, profileDir);
        if (server) await new Promise((resolve) => server.close(resolve));
    });

    it('marks serif/sans content present at page load', async () => {
        await driver.get(baseUrl);
        await driver.sleep(1500);

        // Seed a Third Man In config for this origin, then reload so the
        // content script applies it via its page-init reapply path.
        await writeExtensionStorage({
            affoApplyMap: {
                [ORIGIN]: {
                    serif: { fontName: 'Lora', variableAxes: {} },
                    sans: { fontName: 'Sora', fontSize: 20, variableAxes: {} }
                }
            }
        });

        await driver.get(baseUrl);
        await driver.sleep(2500); // allow the chunked walker to finish

        assert.equal(await getMarker('s1'), 'serif', 'initial serif paragraph should be marked serif');
        assert.equal(await getMarker('n1'), 'sans', 'initial sans paragraph should be marked sans');
        assert.equal(await getMarker('fixed-overlay-text'), null,
            'text nested below a fixed-position UI ancestor should not be marked');
        assert.equal(await getMarker('nav-text'), null,
            'text nested below a navigation landmark should not be marked');
        assert.equal(await getMarker('composer-text'), null,
            'text nested below a form should not be marked');

        const overlayTypography = await driver.executeScript(`
            const cs = getComputedStyle(document.getElementById('fixed-overlay-text'));
            return { fontFamily: cs.fontFamily, fontSize: cs.fontSize };
        `);
        assert.match(overlayTypography.fontFamily, /Arial/i,
            'fixed overlay text should retain the website font family');
        assert.equal(overlayTypography.fontSize, '16px',
            'fixed overlay text should retain the website font size');
    });

    it('incrementally marks dynamically added content via the unified observer', async () => {
        // Inject (a) a direct text-owning serif paragraph and (b) a wrapper div
        // containing a nested sans paragraph. The wrapper exercises the scoped
        // walker's subtree descent (the added root itself owns no text).
        await driver.executeScript(`
            const main = document.getElementById('content');

            const serif = document.createElement('p');
            serif.id = 'dyn-serif';
            serif.className = 'serif-text';
            serif.textContent = 'Dynamically added serif paragraph with sufficient text length to qualify.';
            main.appendChild(serif);

            const wrapper = document.createElement('div');
            wrapper.id = 'dyn-wrapper';
            const sans = document.createElement('p');
            sans.id = 'dyn-sans';
            sans.className = 'sans-text';
            sans.textContent = 'Dynamically added sans paragraph with sufficient text length to qualify.';
            wrapper.appendChild(sans);
            main.appendChild(wrapper);

            const fixedOverlay = document.createElement('section');
            fixedOverlay.id = 'dyn-fixed-overlay';
            fixedOverlay.className = 'site-overlay';
            const fixedText = document.createElement('p');
            fixedText.id = 'dyn-fixed-text';
            fixedText.className = 'sans-text';
            fixedText.textContent = 'Dynamically added fixed overlay text should not be marked.';
            fixedOverlay.appendChild(fixedText);
            document.body.appendChild(fixedOverlay);

            const dynamicNav = document.createElement('span');
            dynamicNav.id = 'dyn-nav-text';
            dynamicNav.className = 'sans-text';
            dynamicNav.textContent = 'Dynamically added navigation text should not be marked.';
            document.getElementById('site-nav').appendChild(dynamicNav);
        `);

        // The shared observer debounces ~250ms before scoped-marking the added
        // subtrees; poll until the new serif node picks up its marker.
        await driver.wait(async () => (await getMarker('dyn-serif')) === 'serif',
            5000, 'dynamically added serif content should be marked by the shared observer');

        assert.equal(await getMarker('dyn-serif'), 'serif', 'dynamic serif paragraph should be marked serif');
        assert.equal(await getMarker('dyn-sans'), 'sans', 'nested dynamic sans paragraph should be marked sans');
        assert.equal(await getMarker('dyn-fixed-text'), null,
            'dynamic text below a fixed-position UI ancestor should not be marked');
        assert.equal(await getMarker('dyn-nav-text'), null,
            'dynamic text below a navigation landmark should not be marked');
    });

    it('scales only newly added roots during dynamic body updates', async () => {
        await writeExtensionStorage({
            affoApplyMap: {
                [ORIGIN]: {
                    body: { fontSizeScale: 110, variableAxes: {} }
                }
            }
        });

        await driver.get(baseUrl);
        await driver.wait(async () => driver.executeScript(
            `return document.getElementById('s1')?.hasAttribute('data-affo-scaled-font-size-body') || false;`
        ), 5000, 'initial body scale should be applied');

        const initialTypography = await driver.executeScript(`
            const initial = document.getElementById('s1');
            const nav = document.getElementById('nav-text');
            const composer = document.getElementById('composer-text');
            return {
                initialSize: getComputedStyle(initial).fontSize,
                navScaled: nav.hasAttribute('data-affo-scaled-font-size-body'),
                composerScaled: composer.hasAttribute('data-affo-scaled-font-size-body')
            };
        `);
        assert.ok(Math.abs(parseFloat(initialTypography.initialSize) - 17.6) < 0.05,
            `initial body size should be approximately 17.6px, got ${initialTypography.initialSize}`);
        assert.equal(initialTypography.navScaled, false, 'body scaling should exclude navigation subtrees');
        assert.equal(initialTypography.composerScaled, false, 'body scaling should exclude form subtrees');

        await driver.executeScript(`
            window.__affoExistingScaleStyleMutations = 0;
            window.__affoExistingScaleObserver = new MutationObserver((records) => {
                window.__affoExistingScaleStyleMutations += records.length;
            });
            window.__affoExistingScaleObserver.observe(document.getElementById('s1'), {
                attributes: true,
                attributeFilter: ['style']
            });

            const dynamic = document.createElement('p');
            dynamic.id = 'dyn-scale';
            dynamic.className = 'sans-text';
            dynamic.textContent = 'Dynamically added text should be scaled without rewriting existing text.';
            document.getElementById('content').appendChild(dynamic);
        `);

        await driver.wait(async () => driver.executeScript(
            `return document.getElementById('dyn-scale')?.hasAttribute('data-affo-scaled-font-size-body') || false;`
        ), 5000, 'dynamic body text should be scaled by the shared observer');

        const dynamicTypography = await driver.executeScript(`
            window.__affoExistingScaleObserver.disconnect();
            return {
                dynamicSize: getComputedStyle(document.getElementById('dyn-scale')).fontSize,
                existingStyleMutations: window.__affoExistingScaleStyleMutations
            };
        `);
        assert.ok(Math.abs(parseFloat(dynamicTypography.dynamicSize) - 17.6) < 0.05,
            `dynamic body size should be approximately 17.6px, got ${dynamicTypography.dynamicSize}`);
        assert.equal(dynamicTypography.existingStyleMutations, 0,
            'dynamic scaling should not rewrite existing scaled elements');
    });
});
