const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { releaseTarget } = require('./release-targets.cjs')

function parseVersion(version) {
    if (typeof version !== 'string' || !/^(0|[1-9][0-9]{0,8})(\.(0|[1-9][0-9]{0,8})){3}$/.test(version) || version.trim() !== version) {
        throw new Error(`Invalid four-part Firefox version: ${version}`)
    }
    return version.split('.').map(Number)
}

function compare(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i]
    }
    return 0
}

function nextReleaseVersion(current, reservedVersions, revisionFloor = 0) {
    if (!Number.isSafeInteger(revisionFloor) || revisionFloor < 0) throw new Error('Invalid revision floor')
    const source = parseVersion(current.split('.').length === 3 ? `${current}.0` : current)
    let revision = source[3]
    for (const version of reservedVersions) {
        const reserved = parseVersion(version)
        const baseOrder = compare(reserved.slice(0, 3), source.slice(0, 3))
        if (baseOrder > 0) throw new Error('A newer upstream base has already been reserved; run the workflow from the current release branch')
        if (baseOrder === 0) revision = Math.max(revision, reserved[3])
    }
    const next = [...source.slice(0, 3), Math.max(revision + 1, revisionFloor)].join('.')
    parseVersion(next)
    return next
}

function reserveVersion(current, repo, sha, gh, revisionFloor = 0, platform = 'firefox') {
    const target = releaseTarget(platform)
    const tagPrefix = `refs/tags/${target.prefix}/`
    const refs = gh(['api', '--paginate', `repos/${repo}/git/matching-refs/tags/${target.prefix}/`, '--jq', '.[].ref'])
        .trim().split('\n').filter(Boolean)
    const versions = refs.map(ref => {
        if (!ref.startsWith(tagPrefix)) throw new Error(`Unexpected reservation ref: ${ref}`)
        return ref.slice(tagPrefix.length)
    })
    const version = nextReleaseVersion(current, versions, revisionFloor)
    if (parseVersion(version).some(component => component > target.maxComponent)) {
        throw new Error(`Version exceeds ${platform} component limit ${target.maxComponent}`)
    }
    // Persist before submission: a timeout or failed publish must never reuse
    // an AMO version. Creating an existing tag fails rather than overwriting it.
    gh(['api', '--method', 'POST', `repos/${repo}/git/refs`,
        '-f', `ref=${tagPrefix}${version}`, '-f', `sha=${sha}`])
    // Keep the numeric high-water mark, including failed signing attempts.
    // Never prune until the new reservation has been created successfully.
    const obsolete = [...versions, version]
        .sort((a, b) => compare(parseVersion(b), parseVersion(a))).slice(5)
    for (const oldVersion of obsolete) {
        gh(['api', '--method', 'DELETE', `repos/${repo}/git/refs/tags/${target.prefix}/${oldVersion}`])
    }
    return version
}

if (require.main === module) {
    const file = process.argv[2]
    const { GITHUB_REPOSITORY: repo, GITHUB_SHA: sha, GITHUB_ENV: envFile, GITHUB_OUTPUT: outputFile } = process.env
    if (!file || !repo || !sha || !envFile || !outputFile) throw new Error('Staged manifest path and GitHub Actions environment are required')
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
    const platform = process.env.RELEASE_TARGET || 'firefox'
    if (platform === 'firefox' && !manifest.browser_specific_settings?.gecko?.id) throw new Error('The fork Gecko ID is required for signing')
    manifest.version = reserveVersion(manifest.version, repo, sha, args =>
        execFileSync('gh', args, { encoding: 'utf8' }),
        Number(process.env.RELEASE_REVISION_FLOOR || 0), platform)
    fs.writeFileSync(file, JSON.stringify(manifest, null, 4) + '\n')
    fs.appendFileSync(envFile, `RELEASE_VERSION=${manifest.version}\n`)
    fs.appendFileSync(outputFile, `version=${manifest.version}\n`)
    console.log(`Reserved ${platform} version ${manifest.version}`)
}

module.exports = { nextReleaseVersion, reserveVersion }
