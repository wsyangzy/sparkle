/* eslint-disable @typescript-eslint/explicit-function-return-type -- This test runs directly as JavaScript. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function loadConfig(repository, prereleaseTag) {
  const source = readFileSync(new URL('../src/shared/release-config.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    __SPARKLE_RELEASE_REPOSITORY__: repository,
    __SPARKLE_PRERELEASE_TAG__: prereleaseTag
  })
  return exports
}

test('fork builds use one repository for stable, nightly and package release URLs', () => {
  const config = loadConfig('wsyangzy/sparkle', 'nightly')
  assert.equal(
    config.updateManifestUrls.stable,
    'https://github.com/wsyangzy/sparkle/releases/latest/download/latest.yml'
  )
  assert.equal(
    config.updateManifestUrls.rolling,
    'https://github.com/wsyangzy/sparkle/releases/download/nightly/latest.yml'
  )
  assert.equal(config.resolveAppReleaseTag('1.26.10-nightly.20261015180000.1.1'), 'nightly')
  assert.equal(config.resolveAppReleaseTag('1.26.10-rolling-abcd1234'), 'rolling')
  assert.equal(config.resolveAppReleaseTag('1.26.9', 'v1.26.9'), 'v1.26.9')
  assert.equal(config.resolveAppReleaseTag('1.26.9'), '1.26.9')
})

test('local builds retain the upstream rolling update manifest route', () => {
  const config = loadConfig('xishang0128/sparkle', 'rolling')
  assert.equal(
    config.updateManifestUrls.rolling,
    'https://github.com/xishang0128/sparkle/releases/download/rolling/latest.yml'
  )
})
