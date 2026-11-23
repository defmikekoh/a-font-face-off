// Restore test favorites in normal Fenix, never in geckodriver's disposable profile.
// GeckoView config enables Marionette without the Remote debugging via USB UI.
const { Builder } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function buildNormalProfileSeed(serif = 'Charis', sans = 'Andika') {
    return {
        affoFavorites: {
            [serif]: { fontName: serif === 'Charis' ? 'Charis SIL' : serif, variableAxes: {} },
            [sans]: { fontName: sans, variableAxes: {} },
        },
        affoSubstackRoulette: true,
        affoSubstackRouletteSerif: [serif],
        affoSubstackRouletteSans: [sans],
    };
}

async function restoreNormalProfile(args, report, runAdb) {
    const result = report.normalProfileSeed = { success: false };
    if (!args.seedNormalProfile || args.skipAddon) {
        Object.assign(result, { skipped: true, reason: args.skipAddon ? 'no addon' : 'disabled' });
        return;
    }
    if (!fs.existsSync(args.xpiPath)) throw new Error(`XPI not found: ${args.xpiPath}`);
    const adb = (...parts) => runAdb(args.serial, parts);
    const configPath = `/data/local/tmp/${args.packageName}-geckoview-config.yaml`;
    const existingConfig = adb('shell', 'ls', '/data/local/tmp');
    if (existingConfig.split(/\s+/).includes(path.basename(configPath))) {
        throw new Error(`Refusing to replace existing GeckoView configuration: ${configPath}`);
    }
    const previousDebugApp = adb('shell', 'settings', 'get', 'global', 'debug_app');
    const previousWait = adb('shell', 'settings', 'get', 'global', 'wait_for_debugger');
    const previousPower = adb('shell', 'settings', 'get', 'global', 'stay_on_while_plugged_in');
    const outputDir = path.join(__dirname, '..', 'ztemp');
    fs.mkdirSync(outputDir, { recursive: true });
    const localConfig = path.join(outputDir, `normal-fenix-${Date.now()}.yaml`);
    fs.writeFileSync(localConfig, 'env:\n  MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1"\nargs:\n  - --marionette\n');
    let configInstalled = false;
    let debugChanged = false;
    let forwardedPort;
    const seed = buildNormalProfileSeed(args.seedSerif.trim(), args.seedSans.trim());
    result.values = seed;
    const restart = () => {
        adb('shell', 'am', 'force-stop', args.packageName);
        adb('shell', 'am', 'start', '-W', '-n', `${args.packageName}/.IntentReceiverActivity`,
            '-a', 'android.intent.action.VIEW', '-d', 'about:blank', '--ez', 'automationtest', 'true');
    };
    const cleanupErrors = [];
    const clean = (fn) => { try { fn(); } catch (error) { cleanupErrors.push(error.message); } };
    try {
        if (args.serial === 'RF8M81WSL1V') adb('shell', 'svc', 'power', 'stayon', 'usb');
        adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
        adb('shell', 'wm', 'dismiss-keyguard');
        adb('push', localConfig, configPath);
        configInstalled = true;
        adb('shell', 'am', 'set-debug-app', '--persistent', args.packageName);
        debugChanged = true;
        forwardedPort = Number(adb('forward', 'tcp:0', 'tcp:2828'));
        assert.ok(forwardedPort > 0, 'ADB must allocate a Marionette forward');

        // Attach without Android capabilities: geckodriver must not launch/reset Fenix.
        async function session(write) {
            restart();
            const logPath = path.join(outputDir, `normal-fenix-${Date.now()}.log`);
            const logFd = fs.openSync(logPath, 'w');
            (result.logs ||= []).push(logPath);
            const service = new firefox.ServiceBuilder(args.geckodriverPath || undefined)
                .addArguments('--connect-existing', '--marionette-port', String(forwardedPort), '--allow-system-access')
                .setStdio(['ignore', logFd, logFd]);
            let driver;
            try {
                driver = await new Builder().forBrowser('firefox').setFirefoxService(service).build();
                await driver.manage().setTimeouts({ script: args.timeoutMs, pageLoad: args.timeoutMs });
                await driver.setContext(firefox.Context.CHROME);
                const profile = await driver.executeScript('return Services.dirsvc.get("ProfD", Ci.nsIFile).path');
                assert.match(profile, new RegExp(`/files/mozilla/[^/]+$`), 'Must use normal Fenix profile');
                if (result.profile) assert.equal(profile, result.profile, 'Restart must retain the same profile');
                result.profile = profile;
                await driver.setContext(firefox.Context.CONTENT);
                await driver.installAddon(args.xpiPath, true);
                await driver.setContext(firefox.Context.CHROME);
                const url = await driver.executeScript('return WebExtensionPolicy.getByID("a-font-face-off@example.com").getURL("left-toolbar-iframe.html")');
                await driver.setContext(firefox.Context.CONTENT);
                const original = await driver.getWindowHandle();
                await driver.switchTo().newWindow('tab');
                try {
                    await driver.get(url);
                    const values = await driver.executeAsyncScript(function (seedValues, shouldWrite, done) {
                        (async () => {
                            const old = await browser.storage.local.get(Object.keys(seedValues));
                            if (shouldWrite) {
                                await browser.storage.local.set({
                                    ...seedValues,
                                    affoFavorites: { ...old.affoFavorites, ...seedValues.affoFavorites },
                                });
                            }
                            return browser.storage.local.get(Object.keys(seedValues));
                        })().then(values => done({ values }), error => done({ error: error.message }));
                    }, seed, write);
                    if (values.error) throw new Error(values.error);
                    for (const key of Object.keys(seed)) {
                        if (key === 'affoFavorites') {
                            for (const name of Object.keys(seed.affoFavorites)) {
                                assert.deepEqual(values.values[key][name], seed.affoFavorites[name]);
                            }
                        } else assert.deepEqual(values.values[key], seed[key]);
                    }
                    return values.values;
                } finally {
                    await driver.close();
                    await driver.switchTo().window(original);
                }
            } finally {
                try { if (driver) await driver.quit(); }
                finally { fs.closeSync(logFd); }
            }
        }
        result.confirmedValues = await session(true);
        result.afterRestart = await session(false);
        result.success = true;
    } catch (error) {
        result.error = error.message;
        throw error;
    } finally {
        // Stop the automation-enabled process before removing its launch configuration.
        if (configInstalled) clean(() => adb('shell', 'am', 'force-stop', args.packageName));
        if (configInstalled) clean(() => adb('shell', 'rm', configPath));
        if (debugChanged) clean(() => {
            if (!previousDebugApp || previousDebugApp === 'null') adb('shell', 'am', 'clear-debug-app');
            else adb('shell', 'am', 'set-debug-app', ...(previousWait === '1' ? ['-w'] : []), '--persistent', previousDebugApp);
        });
        if (forwardedPort) clean(() => adb('forward', '--remove', `tcp:${forwardedPort}`));
        if (args.serial === 'RF8M81WSL1V') clean(() => {
            if (previousPower === 'null') adb('shell', 'settings', 'delete', 'global', 'stay_on_while_plugged_in');
            else adb('shell', 'settings', 'put', 'global', 'stay_on_while_plugged_in', previousPower);
        });
        if (cleanupErrors.length) {
            result.success = false;
            result.cleanupErrors = cleanupErrors;
            throw new Error(`Normal-profile cleanup failed: ${cleanupErrors.join('; ')}`);
        }
    }
}

module.exports = { buildNormalProfileSeed, restoreNormalProfile };
