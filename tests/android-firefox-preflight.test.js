const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const scratch = path.join(root, 'ztemp');

test('Android inspector rejects out-of-scope identities before changing device state', t => {
    fs.mkdirSync(scratch, { recursive: true });
    const dir = fs.mkdtempSync(path.join(scratch, 'preflight-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    // Only the read-only commands needed to establish identity are available.
    fs.writeFileSync(path.join(dir, 'adb'), `#!/bin/sh
shift 2
case "$*" in
    get-state) echo device ;;
    'shell am get-current-user') echo "$TEST_USER" ;;
    'emu avd name') echo "$TEST_AVD"; echo OK ;;
    'shell getprop ro.build.version.release') echo "$TEST_VERSION" ;;
    *) echo "Unexpected ADB operation: $*" >&2; exit 2 ;;
esac
`, { mode: 0o755 });

    for (const [serial, pkg, user, avd, version] of [
        ['emulator-5554', 'org.mozilla.fenix', '0', 'Another_AVD', '16'],
        ['emulator-5554', 'org.mozilla.fenix', '0', 'AFFO_Pixel_API36', '15'],
        ['RF8M81WSL1V', 'org.mozilla.fenix', '10', '', '12'],
        ['A06B4A57AA34353', 'org.mozilla.firefox', '0', '', '15'],
        ['unknown', 'org.mozilla.fenix', '0', '', '16'],
    ]) {
        const result = spawnSync(process.execPath, [
            'scripts/android-firefox-inspect.js', '--serial', serial, '--package', pkg,
            '--allow-clear-package-data', '--skip-bookmarks',
        ], {
            cwd: root, encoding: 'utf8',
            env: { ...process.env, PATH: dir, AFFO_ANDROID_ALLOW_UNAPPROVED_TARGET: '0',
                TEST_USER: user, TEST_AVD: avd, TEST_VERSION: version, AFFO_ANDROID_OUT: '' },
        });
        assert.equal(result.status, 1, result.stderr);
        const report = JSON.parse(result.stdout);
        assert.match(report.error, /Target outside standing approval/);
        assert.equal(report.addonInstall, undefined);
    }
});

test('the emulator runner refuses target overrides before launching its inspector', () => {
    for (const override of [
        { AFFO_ANDROID_EMULATOR_SERIAL: 'RF8M81WSL1V' },
        { AFFO_ANDROID_EMULATOR_PACKAGE: 'org.mozilla.firefox' },
    ]) {
        const result = spawnSync(process.execPath, ['scripts/android-emulator-test.js'], {
            cwd: root, encoding: 'utf8',
            env: { ...process.env, PATH: '', AFFO_ANDROID_ALLOW_UNAPPROVED_TARGET: '1', ...override },
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /The emulator suite targets/);
    }
});
