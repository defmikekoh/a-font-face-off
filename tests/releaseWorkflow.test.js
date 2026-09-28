const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { prepareConfig } = require('../.github/scripts/prepare-release-config.cjs')
const { publishRelease } = require('../.github/scripts/publish-release.cjs')

test('config generation escapes quoted multiline values and keeps missing secrets out of errors', () => {
    const writes = []
    const env = { GDRIVE_CLIENT_ID: "id'\\\nline", GDRIVE_CLIENT_SECRET: 'secret"\\\nline', AMO_JWT_ISSUER: 'issuer', AMO_JWT_SECRET: 'jwt' }
    prepareConfig('firefox', env, (...args) => writes.push(args))
    const context = vm.createContext({})
    assert.deepEqual(Array.from(vm.runInContext(writes[0][1] + '[GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET]', context)), [env.GDRIVE_CLIENT_ID, env.GDRIVE_CLIENT_SECRET])
    assert.throws(() => prepareConfig('firefox', { ...env, AMO_JWT_SECRET: '' }, () => {
        assert.fail('Must not write incomplete configuration')
    }), { message: 'Missing required secrets: AMO_JWT_SECRET' })
    prepareConfig('chromium', { ...env, CHROMIUM_CRX_PRIVATE_KEY_PEM: 'pem' }, (...args) => writes.push(args))
    assert.equal(writes.at(-1)[2].mode, 0o600)
})

for (const exists of [false, true]) {
    test(`publishing ${exists ? 'existing' : 'new'} prerelease uses exact package link and moves tag after upload`, async () => {
        fs.mkdirSync('ztemp', { recursive: true })
        const directory = fs.mkdtempSync('ztemp/release-test-')
        try {
            const file = path.join(directory, 'a-font-face-off-1.0.0.401.xpi')
            const summary = path.join(directory, 'summary.md')
            fs.writeFileSync(file, 'test package')
            const calls = []
            const url = await publishRelease({ platform: 'firefox', repo: 'owner/repo', sha: 'commit', version: '1.0.0.401', file, summaryFile: summary }, args => {
                calls.push(args)
                return args.includes('--paginate') ? (exists ? 'firefox-test-latest\n' : '') : '{}'
            })
            assert.equal(url, 'https://github.com/owner/repo/releases/download/firefox-test-latest/a-font-face-off-1.0.0.401.xpi')
            assert.ok(fs.readFileSync(summary, 'utf8').includes(url))
            assert.equal(fs.readFileSync(path.join(directory, 'download-qr.png')).subarray(1, 4).toString(), 'PNG')
            assert.ok(calls[1].includes(exists ? 'upload' : 'create'))
            assert.ok(calls.at(-1).includes('PATCH'))
        } finally {
            fs.rmSync(directory, { recursive: true, force: true })
        }
    })
}

test('failed release upload never moves rolling tag or reports success', async () => {
    fs.mkdirSync('ztemp', { recursive: true })
    const directory = fs.mkdtempSync('ztemp/release-test-')
    try {
        const file = path.join(directory, 'a-font-face-off-chromium-mv3-1.0.0.402.crx')
        const summary = path.join(directory, 'summary.md')
        fs.writeFileSync(file, 'test CRX')
        const calls = []
        await assert.rejects(publishRelease({ platform: 'chromium', repo: 'owner/repo', sha: 'commit', version: '1.0.0.402', file, summaryFile: summary }, args => {
            calls.push(args)
            if (args.includes('upload')) throw new Error('upload failed')
            return 'chromium-test-latest'
        }, async () => {}), /upload failed/)
        assert.ok(!calls.some(args => args.includes('PATCH')))
        assert.ok(!fs.existsSync(summary))
    } finally {
        fs.rmSync(directory, { recursive: true, force: true })
    }
})
