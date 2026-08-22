#!/usr/bin/env node

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const serial = process.env.AFFO_ANDROID_EMULATOR_SERIAL || 'emulator-5554';
const packageName = process.env.AFFO_ANDROID_EMULATOR_PACKAGE || 'org.mozilla.fenix';
const reportPath = path.join(ROOT_DIR, 'ztemp', 'android-emulator-smoke.json');
const url = 'https://www.thedeepview.com/articles/for-ai-builders-pixel-11-pro-fold-is-the-phone-to-beat';

const inspectorArgs = [
    'scripts/android-firefox-inspect.js',
    '--serial', serial,
    '--package', packageName,
    '--allow-clear-package-data',
    '--allow-unapproved-target',
    '--skip-bookmarks',
    '--url', url,
    '--expect-affo',
    '--settle', '5000',
    '--selector', 'article',
    '--selector', '#affo-left-toolbar-iframe',
    '--out', reportPath,
];

const result = childProcess.spawnSync(process.execPath, inspectorArgs, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'inherit',
});

if (result.error) throw result.error;
assert.equal(result.status, 0, 'Android inspector should complete successfully');

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
assert.equal(report.devicePreflight.androidVersion, '16', 'Emulator must run Android 16/API 36');
assert.match(report.devicePreflight.packagePath, /org\.mozilla\.fenix/, 'Firefox Nightly must be installed');
assert.equal(report.addonInstall.success, true, 'AFFO XPI must install on the emulator');
assert.equal(report.documentReadyState, 'complete', 'DeepView must reach document ready');
assert.equal(report.inspection.affo.htmlDataAffoBase, 'sans', 'AFFO must classify DeepView as sans');

const article = report.inspection.selectors.find((item) => item.selector === 'article');
const toolbar = report.inspection.selectors.find((item) => item.selector === '#affo-left-toolbar-iframe');
assert.equal(article && article.found, true, 'DeepView article must be present');
assert.equal(toolbar && toolbar.found, true, 'AFFO toolbar iframe must be present');
assert.equal(toolbar.computedStyle.visibility, 'visible', 'AFFO toolbar iframe must be visible');
assert.equal(toolbar.computedStyle.display, 'block', 'AFFO toolbar iframe must be displayed');

console.log(`Android emulator smoke test passed: ${serial} / ${packageName}`);
