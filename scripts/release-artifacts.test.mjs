/* eslint-disable @typescript-eslint/explicit-function-return-type -- This test runs directly as JavaScript. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { parse } from 'yaml'
import { assembleRelease, expectedArtifacts } from './release-artifacts.mjs'

const options = {
  version: '1.27.0-nightly.202610151800.1',
  tag: 'nightly',
  repository: 'wsyangzy/sparkle',
  channel: 'nightly',
  commit: '1234567890abcdef',
  notes: 'Changes in this build'
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sparkle-release-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const name of expectedArtifacts(options.version)) {
    await writeFile(path.join(directory, name), `test package: ${name}`)
  }
  return directory
}

test('release assembly verifies all platforms, generates fork URLs and hashes every published asset', async (t) => {
  const directory = await fixture(t)
  const notes = await assembleRelease(directory, options)
  const metadata = parse(await readFile(path.join(directory, 'latest.yml'), 'utf8'))
  assert.equal(metadata.version, options.version)
  assert.equal(metadata.tag, options.tag)
  assert.equal(metadata.changelog, notes)
  assert.ok(notes.includes('wsyangzy/sparkle/releases/download/nightly/'))
  assert.ok(notes.includes('Portable 7z'))
  assert.ok(notes.includes('| linux | loongarch64 |'))
  const checksums = (await readFile(path.join(directory, 'checksums.txt'), 'utf8'))
    .trim()
    .split('\n')
  assert.equal(checksums.length, 17)
  for (const line of checksums) {
    const [digest, name] = line.split('  ')
    const content = await readFile(path.join(directory, name))
    assert.equal(digest, createHash('sha256').update(content).digest('hex'))
  }
})

test('release assembly rejects a missing platform before writing update metadata', async (t) => {
  const directory = await fixture(t)
  await rm(path.join(directory, expectedArtifacts(options.version)[0]))
  await assert.rejects(assembleRelease(directory, options), /Incomplete artifact set/)
  await assert.rejects(readFile(path.join(directory, 'latest.yml')), { code: 'ENOENT' })
})

test('release assembly rejects empty packages and unexpected files', async (t) => {
  const directory = await fixture(t)
  await writeFile(path.join(directory, expectedArtifacts(options.version)[0]), '')
  await assert.rejects(assembleRelease(directory, options), /Empty or invalid artifact/)
  await writeFile(path.join(directory, 'unexpected.txt'), 'unexpected')
  await assert.rejects(assembleRelease(directory, options), /unexpected.txt/)
})
