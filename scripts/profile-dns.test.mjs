/* eslint-disable @typescript-eslint/explicit-function-return-type -- This test runs directly as JavaScript. */
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)

// Run the real config modules with isolated storage and mocked Electron/network boundaries.
function loadSource(relativePath, dependencies = {}, globals = {}) {
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
  vm.compileFunction(outputText, ['require', 'module', 'exports', ...Object.keys(globals)], {
    filename
  })(localRequire, module, module.exports, ...Object.values(globals))
  return module.exports
}

const yaml = loadSource('../src/main/utils/yaml.ts')
const merge = loadSource('../src/main/utils/merge.ts')
const dnsControl = loadSource('../src/shared/dns-control.ts')
const template = loadSource('../src/main/utils/template.ts', {
  '../../shared/build-flags': { systemCoreOnlyBuild: false }
})
const subscriptionDns = {
  enable: true,
  listen: '127.0.0.1:1053',
  'enhanced-mode': 'fake-ip',
  'fake-ip-filter': ['+.subscription.example', '+.lan'],
  'default-nameserver': ['223.5.5.5'],
  nameserver: ['https://dns.subscription.example/dns-query'],
  'proxy-server-nameserver-policy': { '+.proxy.example': ['223.5.5.5'] },
  fallback: ['tls://dns.fallback.example'],
  'fallback-filter': { geoip: false },
  'use-hosts': true
}
const subscriptionHosts = { 'service.example': '192.0.2.1' }
const subscription = { dns: subscriptionDns, hosts: subscriptionHosts }

function createEnvironment(t, { overrides = [], beforeDownload } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'sparkle-profile-dns-'))
  t.after(() => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      assert.ok(entry.isFile(), 'Test storage must contain only files')
      unlinkSync(join(directory, entry.name))
    }
    rmdirSync(directory)
  })
  const paths = {
    profileConfigPath: () => join(directory, 'profile.yaml'),
    profilePath: (id) => join(directory, `${id}.yaml`),
    controledMihomoConfigPath: () => join(directory, 'mihomo.yaml'),
    mihomoWorkConfigPath: () => join(directory, 'work-config.yaml'),
    mihomoWorkDir: () => directory,
    mihomoProfileWorkDir: () => directory,
    overridePath: (id) => join(directory, `${id}.log`)
  }
  const appConfig = { controlDns: true, controlSniff: true }
  const profileConfig = {
    current: 'custom',
    items: [
      {
        id: 'custom',
        type: 'remote',
        name: 'Custom DNS',
        url: 'https://subscription.example/custom',
        autoUpdate: true,
        disableDnsControl: true,
        override: overrides.filter((item) => !item.global).map((item) => item.id)
      },
      {
        id: 'managed',
        type: 'remote',
        name: 'Managed DNS',
        url: 'https://subscription.example/managed',
        autoUpdate: true
      }
    ]
  }
  const sharedConfig = structuredClone(template.defaultControledMihomoConfig)
  sharedConfig.hosts = { 'service.example': '198.51.100.1' }
  writeFileSync(paths.profileConfigPath(), yaml.stringifyYaml(profileConfig))
  writeFileSync(paths.controledMihomoConfigPath(), yaml.stringifyYaml(sharedConfig))
  for (const item of profileConfig.items) {
    writeFileSync(paths.profilePath(item.id), yaml.stringifyYaml(subscription))
  }

  let factory
  let controlled
  const commonDependencies = {
    '../utils/dirs': paths,
    '../utils/yaml': yaml,
    '../utils/merge': merge,
    '../utils/template': template,
    './app': { getAppConfig: async () => appConfig }
  }
  const profile = loadSource('../src/main/config/profile.ts', {
    ...commonDependencies,
    './controledMihomo': {
      getControledMihomoConfig: () => controlled.getControledMihomoConfig()
    },
    '../core/profileUpdater': {
      addProfileUpdater: async () => {},
      delProfileUpdater: async () => {}
    },
    '@uruhalushia/sparkle-native': {},
    '../core/manager': { restartCore: () => factory.generateProfile() },
    axios: {
      get: async () => {
        await beforeDownload?.()
        return { data: yaml.stringifyYaml(subscription), headers: {} }
      }
    },
    '../resolve/server': {},
    '../utils/userAgent': { getUserAgent: async () => 'profile-dns-test' },
    '../utils/elevation': {},
    '../utils/age': { isAgeEncryptedText: () => false },
    '../utils/url': loadSource('../src/main/utils/url.ts')
  })
  controlled = loadSource('../src/main/config/controledMihomo.ts', {
    ...commonDependencies,
    '../core/factory': { generateProfile: () => factory.generateProfile() },
    '../resolve/webhook': { notifyConfigOperation: () => {} }
  })
  factory = loadSource('../src/main/core/factory.ts', {
    ...commonDependencies,
    '../../shared/dns-control': dnsControl,
    '../config': {
      ...profile,
      ...controlled,
      getAppConfig: async () => appConfig,
      getOverrideConfig: async () => ({ items: overrides }),
      getOverrideItem: async (id) => overrides.find((item) => item.id === id),
      getOverride: async (id) => overrides.find((item) => item.id === id).content
    }
  })

  const generate = async () => {
    await factory.generateProfile()
    const runtime = await factory.getRuntimeConfig()
    assert.deepEqual(yaml.parseYaml(readFileSync(paths.mihomoWorkConfigPath(), 'utf8')), runtime)
    return runtime
  }
  return { appConfig, profile, controlled, factory, generate, sharedConfig, paths }
}

test('DNS control defaults and global precedence apply only to the selected subscription', () => {
  const { isDnsControlled } = dnsControl
  assert.equal(isDnsControlled(undefined, undefined), true)
  const config = {
    current: 'managed',
    items: [{ id: 'custom', disableDnsControl: true }, { id: 'managed' }]
  }
  assert.equal(isDnsControlled({}, config), true)
  assert.equal(isDnsControlled({ controlDns: false }, config), false)
  config.current = 'custom'
  assert.equal(isDnsControlled({}, config), false)
  assert.equal(isDnsControlled({ controlDns: false }, config), false)
  config.current = 'missing'
  assert.equal(isDnsControlled({}, config), true)
  config.current = undefined
  assert.equal(isDnsControlled({}, config), true)
})

test('existing subscriptions retain application DNS merge and cleanup', async (t) => {
  const env = createEnvironment(t)
  await env.profile.changeCurrentProfile('managed')
  const runtime = await env.generate()
  assert.deepEqual(runtime.dns.nameserver, env.sharedConfig.dns.nameserver)
  assert.deepEqual(runtime.dns['fake-ip-filter'], env.sharedConfig.dns['fake-ip-filter'])
  assert.equal(runtime.dns.fallback, undefined)
  assert.equal(runtime.dns['fallback-filter'], undefined)
  assert.equal(runtime.dns['proxy-server-nameserver-policy'], undefined)
  assert.deepEqual(runtime.hosts, env.sharedConfig.hosts)
})

test('opt-out preserves subscription DNS, hosts and cleanup-sensitive fields', async (t) => {
  const env = createEnvironment(t)
  const before = structuredClone(await env.controlled.getControledMihomoConfig())
  const runtime = await env.generate()
  assert.deepEqual(runtime.dns, subscriptionDns)
  assert.deepEqual(runtime.hosts, subscriptionHosts)
  assert.deepEqual(await env.controlled.getControledMihomoConfig(), before)
  assert.deepEqual(
    yaml.parseYaml(readFileSync(env.paths.profilePath('custom'), 'utf8')),
    subscription
  )
})

test('opt-out keeps local DNS scripts after global YAML overrides', async (t) => {
  const scriptDns = { ...subscriptionDns, nameserver: ['https://dns.script.example/dns-query'] }
  const scriptHosts = { 'service.example': '203.0.113.1' }
  const env = createEnvironment(t, {
    overrides: [
      {
        id: 'global-dns',
        global: true,
        ext: 'yaml',
        content: yaml.stringifyYaml({ dns: { nameserver: ['https://dns.global.example'] } })
      },
      {
        id: 'local-dns',
        ext: 'js',
        content: `function main(config) {
          config.dns = ${JSON.stringify(scriptDns)}
          config.hosts = ${JSON.stringify(scriptHosts)}
          return config
        }`
      }
    ]
  })
  const runtime = await env.generate()
  assert.deepEqual(runtime.dns, scriptDns)
  assert.deepEqual(runtime.hosts, scriptHosts)
})

test('opt-out preserves disabled DNS and does not inject missing DNS or hosts', async (t) => {
  const env = createEnvironment(t)
  const disabledDns = { ...subscriptionDns, enable: false }
  await env.profile.setProfileStr('custom', yaml.stringifyYaml({ dns: disabledDns }))
  assert.deepEqual((await env.generate()).dns, disabledDns)
  await env.profile.setProfileStr('custom', '{}')
  const runtime = await env.generate()
  assert.equal(runtime.dns, undefined)
  assert.equal(runtime.hosts, undefined)
})

test('global opt-out remains effective for subscriptions that follow the application', async (t) => {
  const env = createEnvironment(t)
  env.appConfig.controlDns = false
  await env.profile.changeCurrentProfile('managed')
  const runtime = await env.generate()
  assert.deepEqual(runtime.dns, subscriptionDns)
  assert.deepEqual(runtime.hosts, subscriptionHosts)
})

test('switching subscriptions or clearing opt-out restores shared DNS without losing settings', async (t) => {
  const env = createEnvironment(t)
  assert.deepEqual((await env.generate()).dns, subscriptionDns)
  await env.controlled.patchControledMihomoConfig({ mode: 'global' })
  const saved = yaml.parseYaml(readFileSync(env.paths.controledMihomoConfigPath(), 'utf8'))
  assert.deepEqual(saved.dns, env.sharedConfig.dns)
  assert.deepEqual(saved.hosts, env.sharedConfig.hosts)
  await env.profile.changeCurrentProfile('managed')
  assert.deepEqual((await env.generate()).dns.nameserver, env.sharedConfig.dns.nameserver)
  await env.profile.changeCurrentProfile('custom')
  assert.deepEqual((await env.generate()).dns, subscriptionDns)
  await env.profile.updateProfileItem({
    ...(await env.profile.getCurrentProfileItem()),
    disableDnsControl: false
  })
  assert.deepEqual((await env.generate()).dns.nameserver, env.sharedConfig.dns.nameserver)
})

test('remote subscription refresh persists opt-out across configuration reloads', async (t) => {
  const env = createEnvironment(t)
  await env.profile.addProfileItem(await env.profile.getCurrentProfileItem())
  const config = await env.profile.getProfileConfig(true)
  assert.equal(config.items.find((item) => item.id === 'custom').disableDnsControl, true)
  assert.equal(config.items.find((item) => item.id === 'managed').disableDnsControl, undefined)
  assert.deepEqual((await env.generate()).dns, subscriptionDns)
})

test('existing automatic update timers preserve DNS choices saved after scheduling', async (t) => {
  const env = createEnvironment(t)
  const callbacks = []
  const updater = loadSource(
    '../src/main/core/profileUpdater.ts',
    { '../config': env.profile },
    {
      setTimeout: (callback) => {
        callbacks.push(callback)
        return callback
      },
      clearTimeout: () => {}
    }
  )
  for (const item of (await env.profile.getProfileConfig()).items) {
    await env.profile.updateProfileItem({
      ...item,
      interval: 60,
      updated: Date.now(),
      disableDnsControl: false
    })
  }
  await updater.initProfileUpdater()
  assert.equal(callbacks.length, 2, 'Startup must schedule both current and inactive subscriptions')
  for (const item of (await env.profile.getProfileConfig()).items) {
    await env.profile.updateProfileItem({ ...item, disableDnsControl: true })
  }
  for (const callback of callbacks.splice(0)) await callback()
  for (const item of (await env.profile.getProfileConfig(true)).items) {
    assert.equal(
      item.disableDnsControl,
      true,
      `${item.id} lost opt-out during its scheduled update`
    )
  }

  await updater.addProfileUpdater(await env.profile.getCurrentProfileItem())
  assert.equal(callbacks.length, 1)
  await env.profile.updateProfileItem({
    ...(await env.profile.getCurrentProfileItem()),
    disableDnsControl: false
  })
  await callbacks[0]()
  assert.equal((await env.profile.getCurrentProfileItem()).disableDnsControl, false)
})

test('saving a DNS choice during a subscription download wins over the old update data', async (t) => {
  const env = createEnvironment(t, {
    beforeDownload: async () => {
      await env.profile.updateProfileItem({
        ...(await env.profile.getCurrentProfileItem()),
        disableDnsControl: false
      })
    }
  })
  await env.profile.addProfileItem(await env.profile.getCurrentProfileItem())
  assert.equal((await env.profile.getCurrentProfileItem()).disableDnsControl, false)
  assert.deepEqual((await env.generate()).dns.nameserver, env.sharedConfig.dns.nameserver)
})

test('new local subscriptions support opt-out and default to following global settings', async (t) => {
  const env = createEnvironment(t)
  for (const disableDnsControl of [undefined, true]) {
    const id = disableDnsControl ? 'local-custom' : 'local-managed'
    await env.profile.addProfileItem({
      id,
      type: 'local',
      file: yaml.stringifyYaml(subscription),
      disableDnsControl
    })
    assert.equal(
      (await env.profile.getProfileItem(id)).disableDnsControl,
      disableDnsControl ?? false
    )
    await env.profile.changeCurrentProfile(id)
    assert.deepEqual(
      (await env.generate()).dns.nameserver,
      disableDnsControl ? subscriptionDns.nameserver : env.sharedConfig.dns.nameserver
    )
  }
})
