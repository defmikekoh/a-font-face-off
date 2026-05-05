const { Builder } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const remote = require('selenium-webdriver/remote');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const REPO_ROOT = path.join(__dirname, '..');
const XPI_PATH = path.join(REPO_ROOT, 'web-ext-artifacts', 'latest.xpi');
const ZTEMP_DIR = path.join(REPO_ROOT, 'ztemp');

// Firefox Developer Edition binary location (macOS)
const FIREFOX_BINARY = '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox';
const FIREFOX_UPDATE_CACHE_DIR = path.join(os.homedir(), 'Library', 'Caches', 'Mozilla', 'updates', 'Applications', 'Firefox Developer Edition');

// Default page to navigate to for real-domain context
const TEST_PAGE = 'https://en.wikipedia.org/wiki/Typography';

// Extension ID from manifest.json → toolbar button IDs
const EXTENSION_ID = 'a-font-face-off@example.com';
const TOOLBAR_WIDGET_ID = EXTENSION_ID.replace(/@/g, '_').replace(/\./g, '_') + '-browser-action';
// The actual clickable toolbarbutton inside the widget (BAP = Browser Action Popup)
const TOOLBAR_BUTTON_ID = EXTENSION_ID.replace(/@/g, '_').replace(/\./g, '_') + '-BAP';

function readFileIfPresent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (_) {
        return '';
    }
}

function findExecutableOnPath(name) {
    const pathValue = process.env.PATH || '';
    const dirs = pathValue.split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
        const candidate = path.join(dir, name);
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            return candidate;
        } catch (_) { }
    }
    return '';
}

function getDefaultWebDriverPort(offset) {
    const base = Number(process.env.AFFO_WEBDRIVER_PORT_BASE) || (20000 + ((process.pid % 20000) * 2));
    return base + offset;
}

class FixedPortFirefoxServiceBuilder extends firefox.ServiceBuilder {
    constructor(exe) {
        super(exe);
        this.websocketPort_ = 0;
    }

    setWebSocketPort(port) {
        if (port < 0) {
            throw Error(`websocket port must be >= 0: ${port}`);
        }
        this.websocketPort_ = port;
        return this;
    }

    build() {
        const port = this.options_.port || getDefaultWebDriverPort(0);
        const websocketPort = this.websocketPort_ || getDefaultWebDriverPort(1);
        const args = this.options_.args.slice();

        if (!args.some((arg) => String(arg).indexOf('--host=') === 0)) {
            args.push('--host=127.0.0.1');
        }
        args.push(`--port=${port}`);

        if (!args.some((arg) => arg === '--connect-existing') &&
            !args.some((arg) => String(arg).indexOf('--websocket-port=') === 0)) {
            args.push(`--websocket-port=${websocketPort}`);
        }

        const options = Object.assign({}, this.options_, {
            args: Promise.resolve(args),
            port
        });
        return new remote.DriverService(this.exe_, options);
    }
}

function getFirefoxPendingUpdateInfo() {
    const activeUpdatePath = path.join(FIREFOX_UPDATE_CACHE_DIR, 'active-update.xml');
    const updateStatusPath = path.join(FIREFOX_UPDATE_CACHE_DIR, 'updates', '0', 'update.status');
    const activeUpdateXml = readFileIfPresent(activeUpdatePath);
    if (!activeUpdateXml) return null;

    const statusTextMatch = activeUpdateXml.match(/statusText="([^"]+)"/);
    const nameMatch = activeUpdateXml.match(/name="([^"]+)"/);
    const selectedPatchMatch = activeUpdateXml.match(/<patch\b[^>]*\bselected="true"[^>]*>/);
    const selectedStateMatch = selectedPatchMatch && selectedPatchMatch[0].match(/\bstate="([^"]+)"/);

    return {
        activeUpdatePath,
        updateStatusPath,
        name: nameMatch ? nameMatch[1] : '',
        statusText: statusTextMatch ? statusTextMatch[1] : '',
        selectedPatchState: selectedStateMatch ? selectedStateMatch[1] : '',
        updateStatus: readFileIfPresent(updateStatusPath).trim()
    };
}

function assertFirefoxDeveloperEditionReady() {
    if (process.env.AFFO_SKIP_FIREFOX_UPDATE_PREFLIGHT === '1') return;

    const info = getFirefoxPendingUpdateInfo();
    if (!info || !/install pending/i.test(info.statusText || '')) return;

    throw new Error([
        'Firefox Developer Edition has a pending updater record. Launching it through Selenium is likely to trigger the macOS "Install Helper" password prompt.',
        `Update: ${info.name || '(unknown)'}`,
        `statusText=${info.statusText || '(missing)'}, selectedPatchState=${info.selectedPatchState || '(missing)'}, update.status=${info.updateStatus || '(missing)'}`,
        `active-update.xml: ${info.activeUpdatePath}`,
        'Quit Firefox Developer Edition, launch it manually once to finish update cleanup, then rerun automation. Set AFFO_SKIP_FIREFOX_UPDATE_PREFLIGHT=1 only when intentionally bypassing this guard.'
    ].join('\n'));
}

function createProfileDir(prefix) {
    fs.mkdirSync(ZTEMP_DIR, { recursive: true });
    return fs.mkdtempSync(path.join(ZTEMP_DIR, prefix));
}

function buildFirefoxService() {
    const geckodriverPath = process.env.GECKODRIVER_PATH || findExecutableOnPath('geckodriver');
    if (!geckodriverPath) {
        throw new Error('geckodriver was not found on PATH. Install it with `brew install geckodriver` or set GECKODRIVER_PATH.');
    }
    return new FixedPortFirefoxServiceBuilder(geckodriverPath)
        .setPort(Number(process.env.AFFO_GECKODRIVER_PORT) || getDefaultWebDriverPort(0))
        .setWebSocketPort(Number(process.env.AFFO_FIREFOX_WEBSOCKET_PORT) || getDefaultWebDriverPort(1));
}

function applyFirefoxAutomationPrefs(options) {
    const prefs = {
        'xpinstall.signatures.required': false,
        // Run extensions in-process so popupExec can access contentWindow via Cu.Sandbox
        'extensions.webextensions.remote': false,
        // Prevent update/helper and first-run prompts from interrupting automation.
        'app.update.auto': false,
        'app.update.enabled': false,
        'app.update.background.enabled': false,
        'app.update.service.enabled': false,
        'app.update.staging.enabled': false,
        'app.update.disabledForTesting': true,
        'browser.shell.checkDefaultBrowser': false,
        'browser.startup.homepage_override.mstone': 'ignore',
        'startup.homepage_welcome_url': '',
        'startup.homepage_welcome_url.additional': '',
        'datareporting.policy.dataSubmissionEnabled': false,
        'datareporting.policy.firstRunURL': '',
    };
    Object.entries(prefs).forEach(function ([key, value]) {
        options.setPreference(key, value);
    });
}

/**
 * Launch Firefox Developer Edition, install the extension,
 * and navigate to a real web page.
 *
 * Returns { driver, profileDir }.
 */
async function setup() {
    assertFirefoxDeveloperEditionReady();
    const profileDir = createProfileDir('affo-test-');

    const options = new firefox.Options();
    options.setBinary(FIREFOX_BINARY);
    applyFirefoxAutomationPrefs(options);
    options.addArguments('-profile', profileDir);
    options.addArguments('-remote-allow-system-access');

    const driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .setFirefoxService(buildFirefoxService())
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
    const clicked = await driver.executeScript(`
        const button = document.getElementById("${TOOLBAR_BUTTON_ID}");
        if (!button) return false;
        button.click();
        return true;
    `);
    if (!clicked) {
        await driver.setContext(firefox.Context.CONTENT);
        throw new Error(`Firefox toolbar button not found: ${TOOLBAR_BUTTON_ID}`);
    }
    await waitForPopupReady(driver);
    await driver.setContext(firefox.Context.CONTENT);
}

async function waitForPopupReady(driver, timeoutMs = 7000) {
    await driver.wait(async () => {
        return driver.executeScript(`
            for (const b of document.querySelectorAll('browser')) {
                try {
                    const uri = b.currentURI ? b.currentURI.spec : '';
                    if (!uri.includes('popup.html')) continue;
                    const cw = b.contentWindow;
                    if (!cw || !cw.document) return false;
                    if (cw.document.readyState === 'loading') return false;
                    return !!cw.document.querySelector('[data-mode]');
                } catch (_) { }
            }
            return false;
        `);
    }, timeoutMs, 'Timed out waiting for AFFO popup to load');
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
    await waitForPopupReady(driver);
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
        throw new Error('popupExec failed: popup.html browser not found' + (errors.length ? ': ' + errors.join('; ') : ''));
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

module.exports = {
    setup,
    teardown,
    openPopup,
    closePopup,
    popupExec,
    TEST_PAGE,
    applyFirefoxAutomationPrefs,
    assertFirefoxDeveloperEditionReady,
    buildFirefoxService,
    createProfileDir,
    getFirefoxPendingUpdateInfo
};
