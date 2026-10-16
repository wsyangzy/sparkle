/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node tests run as plain JavaScript. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import AdmZip from 'adm-zip'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function loadSource(relativePath, dependencies = {}) {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url))
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true
    }
  })
  const module = { exports: {} }
  const localRequire = (id) => (Object.hasOwn(dependencies, id) ? dependencies[id] : require(id))
  vm.compileFunction(outputText, ['require', 'module', 'exports'], { filename })(
    localRequire,
    module,
    module.exports
  )
  return module.exports
}

const yaml = loadSource('../src/main/utils/yaml.ts')
const configs = {
  'config.yaml': 'controlDns: true\nwebdavPassword: saved-password\n',
  'mihomo.yaml': 'dns:\n  nameserver:\n    - https://dns.example/dns-query\n',
  'profile.yaml': 'current: custom\nitems:\n  - id: custom\n    disableDnsControl: true\n',
  'override.yaml': 'items:\n  - id: custom-dns\n    ext: js\n'
}
const dataFiles = {
  'profiles/custom.yaml': 'dns:\n  enable: true\n',
  'override/custom-dns.js': 'function main(config) { return config }',
  'themes/custom.css': ':root { color: red; }',
  'substore/data.json': '{"subscriptions":[]}'
}

function createEnvironment(t) {
  const directory = mkdtempSync(join(tmpdir(), 'sparkle-backup-test-'))
  t.after(() => {
    assert.ok(directory.startsWith(join(tmpdir(), 'sparkle-backup-test-')))
    rmSync(directory, { recursive: true, force: true })
  })
  const storage = join(directory, 'data')
  mkdirSync(storage)
  for (const folder of ['profiles', 'override', 'themes', 'substore']) {
    mkdirSync(join(storage, folder))
  }
  for (const [name, content] of Object.entries({ ...configs, ...dataFiles })) {
    writeFileSync(join(storage, name), content)
  }
  const backupPath = join(directory, 'backup.zip')
  const dialogs = {
    save: { canceled: false, filePath: backupPath },
    open: { canceled: false, filePaths: [backupPath] },
    confirm: { response: 1 },
    confirmations: []
  }
  const remote = { data: undefined, uploadedPath: undefined, clients: 0 }
  const backup = loadSource('../src/main/resolve/backup.ts', {
    electron: {
      app: { getPath: () => directory },
      dialog: {
        showSaveDialog: async () => dialogs.save,
        showOpenDialog: async () => dialogs.open,
        showMessageBox: async (options) => {
          dialogs.confirmations.push(options)
          return dialogs.confirm
        }
      }
    },
    '../config': { getAppConfig: async () => ({ webdavUrl: 'https://backup.example' }) },
    '../utils/yaml': yaml,
    '../utils/dirs': {
      dataDir: () => storage,
      appConfigPath: () => join(storage, 'config.yaml'),
      controledMihomoConfigPath: () => join(storage, 'mihomo.yaml'),
      profileConfigPath: () => join(storage, 'profile.yaml'),
      overrideConfigPath: () => join(storage, 'override.yaml'),
      profilesDir: () => join(storage, 'profiles'),
      overrideDir: () => join(storage, 'override'),
      themesDir: () => join(storage, 'themes'),
      subStoreDir: () => join(storage, 'substore')
    },
    'webdav/dist/node/index.js': {
      createClient: () => {
        remote.clients++
        return {
          createDirectory: async () => {},
          putFileContents: async (name, data) => {
            remote.uploadedPath = name
            remote.data = data
            return true
          },
          getFileContents: async () => remote.data
        }
      }
    }
  })
  return { backup, backupPath, storage, dialogs, remote }
}

test('local ZIP backup contains every application configuration and data folder without WebDAV', async (t) => {
  const env = createEnvironment(t)
  assert.equal(await env.backup.localBackup(), env.backupPath)
  const zip = new AdmZip(env.backupPath)
  for (const [name, content] of Object.entries({ ...configs, ...dataFiles })) {
    assert.equal(zip.readAsText(name), content, `${name} must round-trip unchanged`)
  }
  assert.equal(env.remote.clients, 0)
})

test('canceling save or file selection produces no backup or restore', async (t) => {
  const env = createEnvironment(t)
  env.dialogs.save = { canceled: true }
  assert.equal(await env.backup.localBackup(), undefined)
  assert.equal(existsSync(env.backupPath), false)
  env.dialogs.open = { canceled: true, filePaths: [] }
  assert.equal(await env.backup.localRestore(), false)
  assert.equal(env.dialogs.confirmations.length, 0)
})

test('local restore preserves subscription DNS choices and replaces same-name files after confirmation', async (t) => {
  const env = createEnvironment(t)
  await env.backup.localBackup()
  writeFileSync(join(env.storage, 'profile.yaml'), 'items: []\n')
  writeFileSync(join(env.storage, 'themes/custom.css'), 'changed')
  writeFileSync(join(env.storage, 'unrelated.txt'), 'keep')
  assert.equal(await env.backup.localRestore(), true)
  for (const [name, content] of Object.entries({ ...configs, ...dataFiles })) {
    assert.equal(readFileSync(join(env.storage, name), 'utf8'), content)
  }
  assert.equal(readFileSync(join(env.storage, 'unrelated.txt'), 'utf8'), 'keep')
  assert.equal(env.dialogs.confirmations.length, 1)
  assert.equal(env.dialogs.confirmations[0].defaultId, 0)
})

test('canceling overwrite confirmation leaves current settings intact', async (t) => {
  const env = createEnvironment(t)
  await env.backup.localBackup()
  writeFileSync(join(env.storage, 'config.yaml'), 'current: keep\n')
  env.dialogs.confirm = { response: 0 }
  assert.equal(await env.backup.localRestore(), false)
  assert.equal(readFileSync(join(env.storage, 'config.yaml'), 'utf8'), 'current: keep\n')
})

for (const [name, edit, error] of [
  ['missing main config', (zip) => zip.deleteFile('config.yaml'), /缺少 config.yaml/],
  ['invalid YAML', (zip) => zip.addFile('profile.yaml', Buffer.from('items: [')), /./],
  ['invalid config shape', (zip) => zip.addFile('mihomo.yaml', Buffer.from('- array')), /格式无效/],
  [
    'unsupported root file',
    (zip) => zip.addFile('service-auth.json', Buffer.from('{}')),
    /不支持的路径/
  ],
  [
    'path traversal',
    (zip) => zip.addFile('profiles/../../escape.yaml', Buffer.from('{}')),
    /不支持的路径/
  ]
]) {
  test(`restore rejects ${name} before confirmation or configuration writes`, async (t) => {
    const env = createEnvironment(t)
    await env.backup.localBackup()
    const zip = new AdmZip(env.backupPath)
    edit(zip)
    writeFileSync(env.backupPath, zip.toBuffer())
    writeFileSync(join(env.storage, 'config.yaml'), 'current: keep\n')
    await assert.rejects(env.backup.localRestore(), error)
    assert.equal(readFileSync(join(env.storage, 'config.yaml'), 'utf8'), 'current: keep\n')
    assert.equal(env.dialogs.confirmations.length, 0)
  })
}

test('restore rejects a damaged ZIP before overwriting current configuration', async (t) => {
  const env = createEnvironment(t)
  await env.backup.localBackup()
  const data = readFileSync(env.backupPath)
  const header = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  assert.ok(header >= 0)
  const localHeader = data.readUInt32LE(header + 42)
  const contentOffset =
    localHeader + 30 + data.readUInt16LE(localHeader + 26) + data.readUInt16LE(localHeader + 28)
  data[contentOffset] ^= 0xff
  writeFileSync(env.backupPath, data)
  await assert.rejects(env.backup.localRestore())
  assert.equal(env.dialogs.confirmations.length, 0)
  assert.equal(readFileSync(join(env.storage, 'config.yaml'), 'utf8'), configs['config.yaml'])
})

test('local and WebDAV backups use mutually compatible ZIP archives', async (t) => {
  const env = createEnvironment(t)
  assert.equal(await env.backup.webdavBackup(), true)
  assert.match(env.remote.uploadedPath, /^sparkle\/\w+_\d{4}-.*\.zip$/)
  writeFileSync(env.backupPath, env.remote.data)
  writeFileSync(join(env.storage, 'profile.yaml'), 'items: []\n')
  assert.equal(await env.backup.localRestore(), true)
  assert.equal(readFileSync(join(env.storage, 'profile.yaml'), 'utf8'), configs['profile.yaml'])
  await env.backup.localBackup()
  env.remote.data = readFileSync(env.backupPath)
  writeFileSync(join(env.storage, 'config.yaml'), 'changed: true\n')
  await env.backup.webdavRestore('existing.zip')
  assert.equal(readFileSync(join(env.storage, 'config.yaml'), 'utf8'), configs['config.yaml'])
})
