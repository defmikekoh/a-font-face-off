const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../scripts/android-firefox-inspect');
const { restoreNormalProfile } = require('../scripts/android-firefox-normal-profile');

const target = ['--serial', 'RF8M81WSL1V', '--package', 'org.mozilla.fenix'];

test('ordinary reset restores normal Fenix but leaves temporary roulette state unseeded', () => {
    const args = parseArgs([...target, '--allow-clear-package-data']);
    assert.equal(args.seedNormalProfile, true);
    assert.equal(args.seedSubstackRoulette, false);
    assert.equal(args.restoreNormalProfileOnly, false);
});

test('normal-profile-only restoration does not require reset authorization', () => {
    const args = parseArgs([...target, '--restore-normal-profile-only']);
    assert.equal(args.restoreNormalProfileOnly, true);
    assert.equal(args.allowClearPackageData, false);
});

test('temporary seeding and normal-profile restoration have independent controls', () => {
    const args = parseArgs([...target, '--allow-clear-package-data', '--seed-substack-roulette', '--skip-normal-profile-seed']);
    assert.equal(args.seedSubstackRoulette, true);
    assert.equal(args.seedNormalProfile, false);
});

test('no-addon and explicit opt-out restoration never touch the device', async () => {
    for (const overrides of [{ skipAddon: true }, { seedNormalProfile: false }]) {
        const report = {};
        await restoreNormalProfile({ seedNormalProfile: true, ...overrides }, report, () => {
            assert.fail('Skipped restoration must not execute ADB');
        });
        assert.equal(report.normalProfileSeed.skipped, true);
    }
});

test('existing GeckoView config is rejected before device mutations', async () => {
    const args = parseArgs([...target, '--restore-normal-profile-only']);
    // Use an existing source file: only existence is checked before conflict detection.
    args.xpiPath = __filename;
    const calls = [];
    await assert.rejects(restoreNormalProfile(args, {}, (serial, command) => {
        calls.push(command);
        return 'org.mozilla.fenix-geckoview-config.yaml';
    }), /Refusing to replace existing/);
    assert.deepEqual(calls, [['shell', 'ls', '/data/local/tmp']]);
});
