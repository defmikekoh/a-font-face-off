const { execFileSync } = require('node:child_process')
const { releaseTarget } = require('./release-targets.cjs')

function obsoleteAssets(assets, extension = '.xpi') {
    return assets.filter(asset => asset.name.endsWith(extension))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .slice(5)
}

function pruneAssets(repo, gh, platform = 'firefox') {
    const target = releaseTarget(platform)
    const release = JSON.parse(gh(['api', `repos/${repo}/releases/tags/${target.tag}`]))
    const pages = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repo}/releases/${release.id}/assets?per_page=100`]))
    for (const asset of obsoleteAssets(pages.flat(), target.extension)) {
        gh(['api', '--method', 'DELETE', `repos/${repo}/releases/assets/${asset.id}`])
    }
}

if (require.main === module) {
    const repo = process.env.GITHUB_REPOSITORY
    if (!repo) throw new Error('GITHUB_REPOSITORY is required')
    pruneAssets(repo, args => execFileSync('gh', args, { encoding: 'utf8' }), process.env.RELEASE_TARGET || 'firefox')
}

module.exports = { obsoleteAssets, pruneAssets }
