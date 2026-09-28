const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const QRCode = require('qrcode')
const { releaseTarget } = require('./release-targets.cjs')

async function publishRelease({ platform, repo, sha, version, file, summaryFile }, gh, qr = QRCode.toFile) {
    const target = releaseTarget(platform)
    const name = `${target.filename}-${version}${target.extension}`
    if (path.basename(file) !== name || !fs.statSync(file).isFile()) throw new Error('Release artifact filename does not match version and target')
    const baseUrl = `https://github.com/${repo}/releases/download/${target.tag}`
    const url = `${baseUrl}/${name}`
    const qrPath = path.join(path.dirname(file), 'download-qr.png')
    await qr(qrPath, url, { width: 320, margin: 4 })
    const notesPath = path.join(path.dirname(file), 'release-notes.md')
    const summary = `Version: ${version}\n\nCommit: [${sha}](https://github.com/${repo}/commit/${sha})\n\n[Download ${target.extension.slice(1).toUpperCase()}](${url})\n\n![Scan to download](${baseUrl}/download-qr.png)\n`
    fs.writeFileSync(notesPath, `${target.title}\n\n${summary}\nThe five newest signed packages are retained.\n`)
    // Listing must succeed; a network failure is never treated as a missing release.
    const releases = gh(['api', '--paginate', `repos/${repo}/releases`, '--jq', '.[].tag_name']).trim().split('\n')
    const common = ['--title', `${target.title} ${version}`, '--notes-file', notesPath, '--prerelease', '--latest=false']
    if (releases.includes(target.tag)) {
        gh(['release', 'upload', target.tag, file, qrPath, '--clobber', '--repo', repo])
        gh(['release', 'edit', target.tag, ...common, '--repo', repo])
    } else {
        gh(['release', 'create', target.tag, file, qrPath, '--target', sha, ...common, '--repo', repo])
    }
    // Move the rolling source tag only after publishing the package succeeds.
    gh(['api', '--method', 'PATCH', `repos/${repo}/git/refs/tags/${target.tag}`, '-f', `sha=${sha}`, '-F', 'force=true'])
    fs.appendFileSync(summaryFile, summary)
    return url
}
if (require.main === module) {
    const env = process.env
    publishRelease({ platform: env.RELEASE_TARGET, repo: env.GITHUB_REPOSITORY, sha: env.GITHUB_SHA,
        version: env.RELEASE_VERSION, file: process.argv[2], summaryFile: env.GITHUB_STEP_SUMMARY },
    args => execFileSync('gh', args, { encoding: 'utf8' })).catch(error => {
        console.error(error.message)
        process.exitCode = 1
    })
}
module.exports = { publishRelease }
