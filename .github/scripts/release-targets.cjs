const targets = {
    firefox: { tag: 'firefox-test-latest', prefix: 'firefox-build', extension: '.xpi', filename: 'a-font-face-off', title: 'Firefox Android test', maxComponent: 999999999 },
    chromium: { tag: 'chromium-test-latest', prefix: 'chromium-build', extension: '.crx', filename: 'a-font-face-off-chromium-mv3', title: 'Chromium Android test', maxComponent: 65535 }
}
function releaseTarget(name = 'firefox') {
    if (!Object.hasOwn(targets, name)) throw new Error(`Unknown release target: ${name}`)
    return targets[name]
}
module.exports = { releaseTarget }
