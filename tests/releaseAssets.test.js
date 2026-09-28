const assert = require('node:assert/strict')
const test = require('node:test')
const { obsoleteAssets, pruneAssets } = require('../.github/scripts/prune-release-assets.cjs')

const assets = Array.from({ length: 7 }, (_, i) => ({
    id: i + 1, name: i % 2 ? `uuid-${i}.xpi` : `readable-${i}.xpi`,
    created_at: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z`
}))

test('keeps newest five XPIs, handles old UUID names and leaves unrelated assets', () => {
    assert.deepEqual(obsoleteAssets([...assets, { id: 99, name: 'notes.txt' }]).map(a => a.id), [2, 1])
    assert.deepEqual(obsoleteAssets(assets.slice(0, 5)), [])
})

test('prunes across API pages only after listing succeeds', () => {
    const deletes = []
    pruneAssets('owner/repo', args => {
        if (args.includes('DELETE')) { deletes.push(args.at(-1)); return '' }
        if (args.includes('--slurp')) return JSON.stringify([assets.slice(0, 3), assets.slice(3)])
        return JSON.stringify({ id: 123 })
    })
    assert.deepEqual(deletes, ['repos/owner/repo/releases/assets/2', 'repos/owner/repo/releases/assets/1'])
    assert.throws(() => pruneAssets('owner/repo', () => { throw new Error('API failure') }), /API failure/)
})

test('Chromium cleanup retains five CRXs and preserves its QR image', () => {
    const crxs = assets.map(asset => ({ ...asset, name: asset.name.replace('.xpi', '.crx') }))
    const calls = []
    pruneAssets('owner/repo', args => {
        calls.push(args)
        if (args.includes('DELETE')) return ''
        if (args.includes('--slurp')) return JSON.stringify([[...crxs, { id: 90, name: 'download-qr.png' }]])
        return JSON.stringify({ id: 123 })
    }, 'chromium')
    assert.equal(calls[0][1], 'repos/owner/repo/releases/tags/chromium-test-latest')
    assert.deepEqual(calls.filter(c => c.includes('DELETE')).map(c => c.at(-1)), [
        'repos/owner/repo/releases/assets/2', 'repos/owner/repo/releases/assets/1'
    ])
})
