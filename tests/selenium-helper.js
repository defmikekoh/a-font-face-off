const { Builder } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const XPI_PATH = path.join(__dirname, '..', 'web-ext-artifacts', 'latest.xpi');

// Firefox Developer Edition binary location (macOS)
const FIREFOX_BINARY = '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox';

// Default page to navigate to for real-domain context
const TEST_PAGE = 'https://en.wikipedia.org/wiki/Typography';

// Extension ID from manifest.json → toolbar button IDs
const EXTENSION_ID = 'a-font-face-off@example.com';
const TOOLBAR_WIDGET_ID = EXTENSION_ID.replace(/@/g, '_').replace(/\./g, '_') + '-browser-action';
// The actual clickable toolbarbutton inside the widget (BAP = Browser Action Popup)
const TOOLBAR_BUTTON_ID = EXTENSION_ID.replace(/@/g, '_').replace(/\./g, '_') + '-BAP';

/**
 * Launch Firefox Developer Edition, install the extension,
 * and navigate to a real web page.
 *
 * Returns { driver, profileDir }.
 */
async function setup() {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'affo-test-'));

    const options = new firefox.Options();
    options.setBinary(FIREFOX_BINARY);
    options.setPreference('xpinstall.signatures.required', false);
    // Run extensions in-process so popupExec can access contentWindow via Cu.Sandbox
    options.setPreference('extensions.webextensions.remote', false);
    options.addArguments('-profile', profileDir);
    options.addArguments('-remote-allow-system-access');

    const driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .build();

    // Install the extension
    await driver.installAddon(XPI_PATH, true);

    // Ensure the extension button is in the toolbar (fresh profiles may not show it)
    await driver.setContext(firefox.Context.CHROME);
    await driver.executeScript(`
        try {
            CustomizableUI.addWidgetToArea("${TOOLBAR_WIDGET_ID}", CustomizableUI.AREA_NAVBAR);
        } catch(e) {}
    `);
    await driver.setContext(firefox.Context.CONTENT);

    // Navigate to a real web page so the content script runs
    await driver.get(TEST_PAGE);
    await driver.sleep(2000);

    return { driver, profileDir };
}

/**
 * Open the browser action popup by clicking the toolbar button.
 * The popup opens as a real panel attached to the toolbar, with the
 * current page's domain context.
 */
async function openPopup(driver) {
    await driver.setContext(firefox.Context.CHROME);
    await driver.executeScript(`
        document.getElementById("${TOOLBAR_BUTTON_ID}").click();
    `);
    // Wait for popup to load and initialize
    await driver.sleep(1500);
    await driver.setContext(firefox.Context.CONTENT);
}

/**
 * Close the popup panel.
 */
async function closePopup(driver) {
    await driver.setContext(firefox.Context.CHROME);
    await driver.executeScript(`
        // Close the customization widget panel that hosts the popup
        const panel = document.getElementById('customizationui-widget-panel');
        if (panel && panel.hidePopup) panel.hidePopup();
    `);
    await driver.sleep(300);
    await driver.setContext(firefox.Context.CONTENT);
}

/**
 * Execute a script inside the popup panel's content.
 * Requires extensions.webextensions.remote=false so contentWindow is in-process.
 * Uses Cu.Sandbox to eval in the popup's window context, so `document`,
 * `window`, and page globals like `togglePanel` work naturally.
 *
 * @param {WebDriver} driver
 * @param {string} script - JS to execute (has access to popup's document/window)
 * @returns {*} serializable return value
 */
async function popupExec(driver, script) {
    await driver.setContext(firefox.Context.CHROME);
    const result = await driver.executeScript(`
        const errors = [];
        for (const b of document.querySelectorAll('browser')) {
            try {
                const uri = b.currentURI ? b.currentURI.spec : '';
                if (uri.includes('popup.html')) {
                    const cw = b.contentWindow;
                    if (!cw) {
                        errors.push('contentWindow is null');
                        continue;
                    }
                    const sb = Cu.Sandbox(cw, {
                        sandboxPrototype: cw,
                        wantXrays: false
                    });
                    return Cu.evalInSandbox('(function(){' + ${JSON.stringify(script)} + '})()', sb);
                }
            } catch(e) {
                errors.push(e.message);
                continue;
            }
        }
        if (errors.length) throw new Error('popupExec failed: ' + errors.join('; '));
        return null;
    `);
    await driver.setContext(firefox.Context.CONTENT);
    return result;
}

/**
 * Quit the browser and clean up the temporary profile.
 */
async function teardown(driver, profileDir) {
    if (driver) {
        await driver.quit();
    }
    if (profileDir) {
        fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

module.exports = { setup, teardown, openPopup, closePopup, popupExec, TEST_PAGE };
