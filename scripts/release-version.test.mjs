import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveVersion } from './release-version.mjs'

const identity = {
  base: '1.26.9',
  timestamp: '20261015180000',
  run: '123',
  attempt: '1',
  sha: '1234567890abcdef'
}

test('stable releases accept both tag conventions and reject mismatched source versions', () => {
  for (const tag of ['1.26.9', 'v1.26.9']) {
    assert.deepEqual(resolveVersion({ ...identity, channel: 'stable', tag }), {
      version: '1.26.9',
      tag
    })
  }
  assert.throws(
    () => resolveVersion({ ...identity, channel: 'stable', tag: 'v1.27.0' }),
    /must match/
  )
  assert.throws(
    () => resolveVersion({ ...identity, channel: 'stable', requested: '1.27.0; echo bad' }),
    /Invalid stable/
  )
})

test('manual stable packaging can preview a version without requiring a source tag', () => {
  assert.deepEqual(resolveVersion({ ...identity, channel: 'stable', requested: 'v1.27.0' }), {
    version: '1.27.0',
    tag: 'v1.27.0'
  })
})

test('nightly increments the next patch and distinguishes retries of the same commit', () => {
  const first = resolveVersion({ ...identity, channel: 'nightly' })
  const retry = resolveVersion({ ...identity, channel: 'nightly', attempt: '2' })
  assert.equal(first.tag, 'nightly')
  assert.equal(first.version, '1.26.10-nightly.20261015180000.123.1')
  assert.notEqual(first.version, retry.version)
})

test('rolling keeps the existing version marker and rejects invalid build identities', () => {
  const result = resolveVersion({ ...identity, channel: 'rolling' })
  assert.equal(result.tag, 'rolling')
  assert.ok(result.version.includes('-rolling-12345678'))
  assert.throws(() => resolveVersion({ ...identity, channel: 'unknown' }), /Invalid build channel/)
  assert.throws(
    () => resolveVersion({ ...identity, channel: 'nightly', sha: 'bad' }),
    /build identity/
  )
})
