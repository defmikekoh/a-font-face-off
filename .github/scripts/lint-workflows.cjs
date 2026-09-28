const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const version = '1.7.12'
const checksums = {
    'linux-x64': '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
    'darwin-arm64': 'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f',
    'darwin-x64': '5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644'
}
const key = `${process.platform}-${process.arch}`
if (!checksums[key]) throw new Error(`Unsupported actionlint platform: ${key}`)
const directory = path.resolve('ztemp', `actionlint-${version}-${key}`)
const archive = path.join(directory, 'actionlint.tar.gz')
fs.mkdirSync(directory, { recursive: true })
if (!fs.existsSync(archive)) {
    const platform = key.replace('-x64', '_amd64').replace('-arm64', '_arm64')
    execFileSync('curl', ['--fail', '--location', '--silent', '--show-error',
        `https://github.com/rhysd/actionlint/releases/download/v${version}/actionlint_${version}_${platform}.tar.gz`,
        '--output', archive], { stdio: 'inherit' })
}
const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
if (digest !== checksums[key]) throw new Error(`actionlint checksum mismatch: ${archive}`)
execFileSync('tar', ['-xzf', archive, '-C', directory, 'actionlint'])
execFileSync(path.join(directory, 'actionlint'), ['-color', ...process.argv.slice(2)], { stdio: 'inherit' })
