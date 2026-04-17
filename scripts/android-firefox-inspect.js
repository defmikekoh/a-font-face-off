#!/usr/bin/env node

const { Builder, By, until } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_URL = 'https://en.wikipedia.org/wiki/Typography';
const DEFAULT_PACKAGE = 'org.mozilla.fenix';
const DEFAULT_XPI = path.join(ROOT_DIR, 'web-ext-artifacts', 'latest.xpi');
const DEFAULT_SEED_SERIF = 'Lora';
const DEFAULT_SEED_SANS = 'Inter';
const DEFAULT_SELECTORS = [
    'body',
    'h1',
    'p:not(.mw-empty-elt)',
    'li',
    'a[href]',
    '[data-affo-font-type]',
    '#affo-left-toolbar-iframe',
];

function printUsage() {
    console.log(`Usage: node scripts/android-firefox-inspect.js [options]

Inspect real DOM and computed CSS in Firefox for Android via geckodriver.

Options:
  --url <url>              URL to inspect (default: ${DEFAULT_URL})
  --serial <id>            ADB device serial (default: single connected device)
  --package <name>         Android Firefox package (default: ${DEFAULT_PACKAGE})
  --xpi <path>             Extension XPI to install (default: web-ext-artifacts/latest.xpi)
  --skip-addon             Do not install an extension before navigating
  --allow-addon-failure    Continue inspection if addon installation fails
  --expect-affo            Exit non-zero if the AFFO content script marker is missing
  --seed-substack-roulette Seed extension storage with deterministic Substack Roulette config
  --seed-serif <name>      Serif favorite to seed for Substack Roulette (default: ${DEFAULT_SEED_SERIF})
  --seed-sans <name>       Sans favorite to seed for Substack Roulette (default: ${DEFAULT_SEED_SANS})
  --selector <css>         Selector to inspect; may be repeated
  --out <path>             Write JSON to a file instead of stdout
  --timeout <ms>           Page/script timeout in milliseconds (default: 30000)
  --settle <ms>            Wait after document readiness before inspecting (default: 1000)
  --geckodriver <path>     geckodriver binary path (default: PATH)
  --verbose-geckodriver    Enable geckodriver trace logging
  --help                   Show this help

Examples:
  npm run build:latest
  npm run inspect:android-firefox
  npm run inspect:android-firefox -- --url https://example.com --expect-affo
  npm run inspect:android-firefox -- --url https://scottsumner.substack.com/p/the-odd-disappearance-of-the-business --expect-affo --seed-substack-roulette --seed-serif Lora --seed-sans Inter --settle 15000 --selector html --selector p
  npm run inspect:android-firefox -- --skip-addon --selector article --selector p
`);
}

function parseArgs(argv) {
    const args = {
        url: process.env.AFFO_ANDROID_URL || DEFAULT_URL,
        serial: process.env.AFFO_ANDROID_SERIAL || '',
        packageName: process.env.AFFO_ANDROID_PACKAGE || DEFAULT_PACKAGE,
        xpiPath: process.env.AFFO_ANDROID_XPI || DEFAULT_XPI,
        skipAddon: process.env.AFFO_ANDROID_SKIP_ADDON === '1',
        allowAddonFailure: process.env.AFFO_ANDROID_ALLOW_ADDON_FAILURE === '1',
        expectAffo: process.env.AFFO_ANDROID_EXPECT_AFFO === '1',
        seedSubstackRoulette: process.env.AFFO_ANDROID_SEED_SUBSTACK_ROULETTE === '1',
        seedSerif: process.env.AFFO_ANDROID_SEED_SERIF || DEFAULT_SEED_SERIF,
        seedSans: process.env.AFFO_ANDROID_SEED_SANS || DEFAULT_SEED_SANS,
        selectors: [],
        outPath: process.env.AFFO_ANDROID_OUT || '',
        timeoutMs: Number(process.env.AFFO_ANDROID_TIMEOUT || 30000),
        settleMs: Number(process.env.AFFO_ANDROID_SETTLE || 1000),
        geckodriverPath: process.env.GECKODRIVER_PATH || '',
        verboseGeckodriver: process.env.AFFO_ANDROID_GECKODRIVER_VERBOSE === '1',
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            args.help = true;
        } else if (arg === '--url') {
            args.url = requireValue(argv, ++i, arg);
        } else if (arg === '--serial') {
            args.serial = requireValue(argv, ++i, arg);
        } else if (arg === '--package') {
            args.packageName = requireValue(argv, ++i, arg);
        } else if (arg === '--xpi') {
            args.xpiPath = path.resolve(requireValue(argv, ++i, arg));
        } else if (arg === '--skip-addon') {
            args.skipAddon = true;
        } else if (arg === '--allow-addon-failure') {
            args.allowAddonFailure = true;
        } else if (arg === '--expect-affo') {
            args.expectAffo = true;
        } else if (arg === '--seed-substack-roulette') {
            args.seedSubstackRoulette = true;
        } else if (arg === '--seed-serif') {
            args.seedSerif = requireValue(argv, ++i, arg);
        } else if (arg === '--seed-sans') {
            args.seedSans = requireValue(argv, ++i, arg);
        } else if (arg === '--selector') {
            args.selectors.push(requireValue(argv, ++i, arg));
        } else if (arg === '--out') {
            args.outPath = path.resolve(requireValue(argv, ++i, arg));
        } else if (arg === '--timeout') {
            args.timeoutMs = Number(requireValue(argv, ++i, arg));
        } else if (arg === '--settle') {
            args.settleMs = Number(requireValue(argv, ++i, arg));
        } else if (arg === '--geckodriver') {
            args.geckodriverPath = path.resolve(requireValue(argv, ++i, arg));
        } else if (arg === '--verbose-geckodriver') {
            args.verboseGeckodriver = true;
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }

    if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
        throw new Error('--timeout must be a positive number');
    }
    if (!Number.isFinite(args.settleMs) || args.settleMs < 0) {
        throw new Error('--settle must be zero or a positive number');
    }
    if (!args.seedSerif.trim()) {
        throw new Error('--seed-serif must not be empty');
    }
    if (!args.seedSans.trim()) {
        throw new Error('--seed-sans must not be empty');
    }
    if (args.selectors.length === 0) {
        args.selectors = DEFAULT_SELECTORS.slice();
    }
    return args;
}

function requireValue(argv, index, optionName) {
    const value = argv[index];
    if (!value || value.startsWith('--')) {
        throw new Error(`${optionName} requires a value`);
    }
    return value;
}

function detectSingleDeviceSerial() {
    const output = childProcess.execFileSync('adb', ['devices'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const devices = output
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/))
        .filter((parts) => parts[1] === 'device')
        .map((parts) => parts[0]);

    if (devices.length === 1) return devices[0];
    if (devices.length === 0) {
        throw new Error('No authorized ADB devices found. Connect a device or pass --serial.');
    }
    throw new Error(`Multiple ADB devices found (${devices.join(', ')}). Pass --serial.`);
}

function findExecutableOnPath(name) {
    const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const entry of pathEntries) {
        const candidate = path.join(entry, name);
        if (fs.existsSync(candidate)) return candidate;
    }
    return '';
}

async function createAndroidFirefoxDriver(args) {
    const options = new firefox.Options()
        .enableMobile(args.packageName, null, args.serial);
    const mozOptions = options.get('moz:firefoxOptions');
    if (mozOptions.deviceSerial) {
        mozOptions.androidDeviceSerial = mozOptions.deviceSerial;
        delete mozOptions.deviceSerial;
        options.set('moz:firefoxOptions', mozOptions);
    }

    const geckodriverPath = args.geckodriverPath || findExecutableOnPath('geckodriver');
    if (!geckodriverPath) {
        throw new Error('geckodriver was not found on PATH. Install it or pass --geckodriver.');
    }
    const service = new firefox.ServiceBuilder(geckodriverPath);

    if (args.verboseGeckodriver) {
        service.enableVerboseLogging(true);
    }

    const driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .setFirefoxService(service)
        .build();

    await driver.manage().setTimeouts({
        pageLoad: args.timeoutMs,
        script: args.timeoutMs,
    });

    return driver;
}

async function installAddonIfRequested(driver, args, report) {
    if (args.skipAddon) {
        report.addonInstall = { skipped: true };
        return;
    }

    if (!fs.existsSync(args.xpiPath)) {
        throw new Error(`XPI not found at ${args.xpiPath}. Run npm run build:latest first, or pass --skip-addon.`);
    }

    try {
        const id = await driver.installAddon(args.xpiPath, true);
        report.addonInstall = {
            skipped: false,
            success: true,
            id,
            xpiPath: args.xpiPath,
        };
    } catch (error) {
        report.addonInstall = {
            skipped: false,
            success: false,
            xpiPath: args.xpiPath,
            error: error.message,
        };
        if (!args.allowAddonFailure) {
            throw error;
        }
    }
}

function buildSubstackRouletteSeed(args) {
    const serif = args.seedSerif.trim();
    const sans = args.seedSans.trim();

    return {
        affoSubstackRoulette: true,
        affoSubstackRouletteSerif: [serif],
        affoSubstackRouletteSans: [sans],
        affoFavorites: {
            [serif]: {
                fontName: serif,
                variableAxes: {},
            },
            [sans]: {
                fontName: sans,
                variableAxes: {},
            },
        },
    };
}

async function seedSubstackRouletteIfRequested(driver, args, report) {
    if (!args.seedSubstackRoulette) return false;

    const seed = buildSubstackRouletteSeed(args);
    report.storageSeed = {
        type: 'substackRoulette',
        success: false,
        values: seed,
    };

    try {
        const frame = await driver.wait(
            until.elementLocated(By.css('#affo-left-toolbar-iframe')),
            args.timeoutMs,
        );
        await driver.switchTo().frame(frame);

        const result = await driver.executeAsyncScript(function (seedValues, done) {
            function fail(error) {
                done({
                    ok: false,
                    error: error && error.message ? error.message : String(error),
                });
            }

            try {
                if (typeof browser === 'undefined' || !browser.storage || !browser.storage.local) {
                    done({
                        ok: false,
                        error: 'browser.storage.local is unavailable in the extension frame',
                    });
                    return;
                }

                browser.storage.local.set(seedValues)
                    .then(function () {
                        return browser.storage.local.get(Object.keys(seedValues));
                    })
                    .then(function (values) {
                        done({
                            ok: true,
                            values: values,
                        });
                    }, fail);
            } catch (error) {
                fail(error);
            }
        }, seed);

        if (!result || !result.ok) {
            throw new Error(result && result.error ? result.error : 'Unknown storage seed failure');
        }

        report.storageSeed.success = true;
        report.storageSeed.confirmedValues = result.values;
        return true;
    } catch (error) {
        report.storageSeed.error = error.message;
        throw error;
    } finally {
        try {
            await driver.switchTo().defaultContent();
        } catch (error) {
            report.storageSeed.defaultContentError = error.message;
        }
    }
}

async function waitForDocument(driver, timeoutMs) {
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const readyState = await driver.executeScript('return document.readyState');
            if (readyState === 'interactive' || readyState === 'complete') {
                await driver.sleep(1000);
                return readyState;
            }
        } catch (error) {
            lastError = error;
        }
        await driver.sleep(250);
    }
    const suffix = lastError ? ` Last script error: ${lastError.message}` : '';
    throw new Error(`Timed out waiting for document readiness.${suffix}`);
}

async function collectDomAndCss(driver, selectors) {
    return driver.executeScript(function (selectorList) {
        function textSnippet(el) {
            return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        }

        function inspectElement(selector) {
            var el = document.querySelector(selector);
            if (!el) {
                return { selector: selector, found: false };
            }

            var style = getComputedStyle(el);
            return {
                selector: selector,
                found: true,
                tagName: el.tagName,
                id: el.id || '',
                className: String(el.className || ''),
                text: textSnippet(el),
                attributes: {
                    dataAffoFontType: el.getAttribute('data-affo-font-type'),
                    dataAffoFontName: el.getAttribute('data-affo-font-name'),
                    dataAffoFontWeight: el.getAttribute('data-affo-font-weight'),
                    dataAffoFontVariationSettings: el.getAttribute('data-affo-font-variation-settings'),
                },
                computedStyle: {
                    fontFamily: style.fontFamily,
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    fontStyle: style.fontStyle,
                    fontStretch: style.fontStretch,
                    fontVariationSettings: style.fontVariationSettings,
                    lineHeight: style.lineHeight,
                    letterSpacing: style.letterSpacing,
                    color: style.color,
                    backgroundColor: style.backgroundColor,
                    backgroundImage: style.backgroundImage,
                },
                inlineStyle: el.getAttribute('style') || '',
                outerHTML: el.outerHTML ? el.outerHTML.slice(0, 500) : '',
            };
        }

        var affoStyleIds = [
            'a-font-face-off-style-body',
            'a-font-face-off-style-serif',
            'a-font-face-off-style-sans',
            'a-font-face-off-style-mono',
            'a-font-face-off-style-substack-roulette-beige',
            'a-font-face-off-style-substack-roulette-dimming',
            'affo-left-toolbar-iframe',
            'affo-quick-pick-overlay',
        ];

        return {
            title: document.title,
            url: location.href,
            readyState: document.readyState,
            userAgent: navigator.userAgent,
            affo: {
                htmlDataAffoBase: document.documentElement.getAttribute('data-affo-base'),
                markedElementCount: document.querySelectorAll('[data-affo-font-type]').length,
                protectedElementCount: document.querySelectorAll('[data-affo-protected]').length,
                styleIds: affoStyleIds.map(function (id) {
                    var node = document.getElementById(id);
                    return {
                        id: id,
                        found: !!node,
                        tagName: node ? node.tagName : '',
                        textLength: node && node.textContent ? node.textContent.length : 0,
                    };
                }),
                fontLinks: Array.from(document.querySelectorAll('link[id^="a-font-face-off-style-"]')).map(function (link) {
                    return {
                        id: link.id,
                        href: link.href,
                    };
                }),
            },
            selectors: selectorList.map(inspectElement),
        };
    }, selectors);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printUsage();
        return;
    }

    if (!args.serial) {
        args.serial = detectSingleDeviceSerial();
    }

    const report = {
        inspectedAt: new Date().toISOString(),
        requested: {
            url: args.url,
            serial: args.serial,
            packageName: args.packageName,
            selectors: args.selectors,
            skipAddon: args.skipAddon,
            expectAffo: args.expectAffo,
            seedSubstackRoulette: args.seedSubstackRoulette,
            seedSerif: args.seedSerif,
            seedSans: args.seedSans,
            settleMs: args.settleMs,
        },
    };

    let driver;
    try {
        driver = await createAndroidFirefoxDriver(args);
        await installAddonIfRequested(driver, args, report);
        await driver.get(args.url);
        report.documentReadyState = await waitForDocument(driver, args.timeoutMs);
        if (await seedSubstackRouletteIfRequested(driver, args, report)) {
            await driver.get(args.url);
            report.documentReadyStateAfterSeed = await waitForDocument(driver, args.timeoutMs);
        }
        if (args.settleMs > 0) {
            await driver.sleep(args.settleMs);
        }
        report.inspection = await collectDomAndCss(driver, args.selectors);

        if (args.expectAffo && !report.inspection.affo.htmlDataAffoBase) {
            report.expectAffoFailure = 'Missing documentElement[data-affo-base]; AFFO content script was not observed.';
            throw new Error(report.expectAffoFailure);
        }
    } catch (error) {
        report.error = error.message;
        report.stack = error.stack;
        process.exitCode = 1;
    } finally {
        if (driver) {
            try {
                await driver.quit();
            } catch (error) {
                report.quitError = error.message;
            }
        }
    }

    const json = JSON.stringify(report, null, 2);
    if (args.outPath) {
        fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
        fs.writeFileSync(args.outPath, json + '\n');
        console.log(`Wrote ${args.outPath}`);
    } else {
        console.log(json);
    }
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
