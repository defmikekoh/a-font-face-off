const fs = require('node:fs')
const { releaseTarget } = require('./release-targets.cjs')

function prepareConfig(platform, env, write = fs.writeFileSync) {
    releaseTarget(platform)
    const required = ['GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', ...(platform === 'firefox'
        ? ['AMO_JWT_ISSUER', 'AMO_JWT_SECRET'] : ['CHROMIUM_CRX_PRIVATE_KEY_PEM'])]
    const missing = required.filter(key => !env[key]?.trim())
    if (missing.length) throw new Error(`Missing required secrets: ${missing.join(', ')}`)
    const source = ['GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET']
        .map(key => `const ${key} = ${JSON.stringify(env[key])};`).join('\n') + '\n'
    write('src/gdrive-config.js', source)
    if (platform === 'chromium') {
        write('ztemp/chromium-mv3-key.pem', env.CHROMIUM_CRX_PRIVATE_KEY_PEM, { mode: 0o600 })
    }
}
if (require.main === module) {
    fs.mkdirSync('ztemp', { recursive: true })
    prepareConfig(process.env.RELEASE_TARGET, process.env)
}
module.exports = { prepareConfig }
