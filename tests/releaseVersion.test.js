const assert = require('node:assert/strict')
const test = require('node:test')
const { nextReleaseVersion, reserveVersion } = require('../.github/scripts/prepare-release.cjs')

test('starts after source version and increments numerically across reserved builds', () => {
    assert.equal(nextReleaseVersion('1.9.5.8', []), '1.9.5.9')
    assert.equal(nextReleaseVersion('1.9.5.8', ['1.9.5.9', '1.9.5.10']), '1.9.5.11')
    assert.equal(nextReleaseVersion('1.9.5.20', ['1.9.5.10']), '1.9.5.21')
    assert.equal(nextReleaseVersion('1.9.6.0', ['1.9.5.99']), '1.9.6.1')
})

test('refuses older upstream bases, invalid versions and exhausted components', () => {
    assert.throws(() => nextReleaseVersion('1.9.5.8', ['1.10.0.1']), /newer upstream/)
    assert.throws(() => nextReleaseVersion('1.9.5.999999999', []), /Invalid/)
    for (const version of ['1.9.5-fork.9', '1.9.5.09', '../x', '1.9.5.9\n']) {
        assert.throws(() => nextReleaseVersion(version, []), /Invalid/)
        assert.throws(() => nextReleaseVersion('1.9.5.8', [version]), /Invalid/)
    }
})

test('reserves before signing, so reruns advance even without a published release', () => {
    const refs = []
    const gh = args => {
        if (!args.includes('POST')) return refs.join('\n')
        const ref = args.find(arg => arg.startsWith('ref=')).slice(4)
        assert.ok(!refs.includes(ref))
        assert.ok(args.includes('sha=commit'))
        refs.push(ref)
        return '{}'
    }
    assert.equal(reserveVersion('1.9.5.8', 'owner/repo', 'commit', gh), '1.9.5.9')
    assert.equal(reserveVersion('1.9.5.8', 'owner/repo', 'commit', gh), '1.9.5.10')
})

test('API failures or reservation conflicts abort instead of issuing a version', () => {
    assert.throws(() => reserveVersion('1.9.5.8', 'owner/repo', 'commit', () => {
        throw new Error('network failure')
    }), /network failure/)
    assert.throws(() => reserveVersion('1.9.5.8', 'owner/repo', 'commit', args => {
        if (args.includes('POST')) throw new Error('tag already exists')
        return ''
    }), /tag already exists/)
})

test('AFFO accepts a three-part base and preserves its historical run-number floor', () => {
    assert.equal(nextReleaseVersion('1.0.0', [], 251), '1.0.0.251')
    assert.equal(nextReleaseVersion('1.0.0', ['1.0.0.251'], 251), '1.0.0.252')
    assert.throws(() => nextReleaseVersion('1.0.0', [], NaN), /floor/)
})

test('keeps five highest reservations and advances after repeated failed builds', () => {
    const prefix = 'refs/tags/firefox-build/'
    const refs = ['1.9.5.8', '1.9.5.9', '1.9.5.10', '1.9.5.11', '1.9.5.12'].map(v => prefix + v)
    const operations = []
    const gh = args => {
        operations.push(args)
        if (args.includes('POST')) {
            refs.push(args.find(a => a.startsWith('ref=')).slice(4))
        } else if (args.includes('DELETE')) {
            const version = args.at(-1).split('/').at(-1)
            refs.splice(refs.indexOf(prefix + version), 1)
        } else return refs.join('\n')
        return '{}'
    }
    assert.equal(reserveVersion('1.9.5.8', 'owner/repo', 'commit', gh), '1.9.5.13')
    assert.ok(operations[1].includes('POST'))
    assert.ok(operations[2].includes('DELETE'))
    assert.deepEqual(refs.map(r => r.slice(prefix.length)), ['1.9.5.9', '1.9.5.10', '1.9.5.11', '1.9.5.12', '1.9.5.13'])
    assert.equal(reserveVersion('1.9.5.8', 'owner/repo', 'commit', gh), '1.9.5.14')
    assert.equal(refs.length, 5)
})

test('a failed reservation never deletes historical version records', () => {
    const operations = []
    assert.throws(() => reserveVersion('1.9.5.8', 'owner/repo', 'commit', args => {
        operations.push(args)
        if (args.includes('POST')) throw new Error('conflict')
        return [9, 10, 11, 12, 13].map(n => `refs/tags/firefox-build/1.9.5.${n}`).join('\n')
    }), /conflict/)
    assert.ok(!operations.some(args => args.includes('DELETE')))
})

test('Chromium reservations use a separate namespace and enforce its component limit', () => {
    const calls = []
    const gh = args => {
        calls.push(args)
        return args.includes('POST') ? '{}' : 'refs/tags/chromium-build/1.0.0.400'
    }
    assert.equal(reserveVersion('1.0.0', 'owner/repo', 'commit', gh, 301, 'chromium'), '1.0.0.401')
    assert.ok(calls[0].some(arg => arg.includes('tags/chromium-build/')))
    assert.ok(calls[1].includes('ref=refs/tags/chromium-build/1.0.0.401'))
    let writes = 0
    assert.throws(() => reserveVersion('1.0.0.65535', 'owner/repo', 'commit', args => {
        if (args.includes('POST')) writes++
        return ''
    }, 0, 'chromium'), /component limit/)
    assert.equal(writes, 0)
})
