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
  </style>
</head>
<body>
  <main id="content">
    <p id="s1" class="serif-text">Initial serif paragraph with more than enough text to qualify as body content.</p>
    <p id="n1" class="sans-text">Initial sans paragraph with more than enough text to qualify as body content.</p>
  </main>
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
                    sans: { fontName: 'Inter', variableAxes: {} }
                }
            }
        });

        await driver.get(baseUrl);
        await driver.sleep(2500); // allow the chunked walker to finish

        assert.equal(await getMarker('s1'), 'serif', 'initial serif paragraph should be marked serif');
        assert.equal(await getMarker('n1'), 'sans', 'initial sans paragraph should be marked sans');
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
        `);

        // The shared observer debounces ~250ms before scoped-marking the added
        // subtrees; poll until the new serif node picks up its marker.
        await driver.wait(async () => (await getMarker('dyn-serif')) === 'serif',
            5000, 'dynamically added serif content should be marked by the shared observer');

        assert.equal(await getMarker('dyn-serif'), 'serif', 'dynamic serif paragraph should be marked serif');
        assert.equal(await getMarker('dyn-sans'), 'sans', 'nested dynamic sans paragraph should be marked sans');
    });
});
