import { Button, Input, Tooltip, Switch, Tabs } from '@heroui/react'

import BasePage from '@renderer/components/base/base-page'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import EditableList from '@renderer/components/base/base-list-editor'
import AdvancedDnsSetting from '@renderer/components/dns/advanced-dns-setting'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { isDnsControlled } from '../../../shared/dns-control'
import { getRuntimeConfig, restartCore } from '@renderer/utils/ipc'
import React, { Key, useEffect, useState } from 'react'
import useSWR from 'swr'
import { notify } from '@renderer/utils/notification'
import {
  isValidIPv4Cidr,
  isValidIPv6Cidr,
  isValidDomainWildcard,
  isValidDnsServer
} from '@renderer/utils/validate'

interface DNSSettingsProps {
  config: Partial<MihomoConfig>
  hosts?: IHost[]
  readOnly?: boolean
}

const DNSSettings: React.FC<DNSSettingsProps> = ({ config, hosts, readOnly = false }) => {
  const { patchControledMihomoConfig } = useControledMihomoConfig()
  const { patchAppConfig } = useAppConfig()
  const { dns } = config
  const {
    ipv6 = false,
    'fake-ip-range': fakeIPRange = readOnly ? '' : '198.18.0.1/16',
    'fake-ip-range6': fakeIPRange6 = '',
    'fake-ip-filter': fakeIPFilter = readOnly
      ? []
      : ['*', '+.lan', '+.local', 'time.*.com', 'ntp.*.com', '+.market.xiaomi.com'],
    'enhanced-mode': enhancedMode = readOnly ? 'normal' : 'fake-ip',
    'use-hosts': useHosts = false,
    'use-system-hosts': useSystemHosts = false,
    'respect-rules': respectRules = false,
    'default-nameserver': defaultNameserver = readOnly ? [] : ['tls://223.5.5.5'],
    nameserver = readOnly ? [] : ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
    'proxy-server-nameserver': proxyServerNameserver = [],
    'direct-nameserver': directNameserver = [],
    'nameserver-policy': nameserverPolicy = {},
    'proxy-server-nameserver-policy': proxyServerNameserverPolicy = {}
  } = dns || {}
  const [changed, setChanged] = useState(false)
  const [values, originSetValues] = useState({
    ipv6,
    useHosts,
    enhancedMode,
    fakeIPRange,
    fakeIPRange6,
    fakeIPFilter,
    useSystemHosts,
    respectRules,
    defaultNameserver,
    nameserver,
    proxyServerNameserver,
    directNameserver,
    nameserverPolicy,
    proxyServerNameserverPolicy,
    hosts: useHosts ? hosts : undefined
  })
  const [fakeIPRangeError, setFakeIPRangeError] = useState<string | null>(() => {
    const r = isValidIPv4Cidr(fakeIPRange)
    return r.ok ? null : (r.error ?? '格式错误')
  })
  const [fakeIPRange6Error, setFakeIPRange6Error] = useState<string | null>(() => {
    const r = isValidIPv6Cidr(fakeIPRange6)
    return r.ok ? null : (r.error ?? '格式错误')
  })
  const [fakeIPFilterError, setFakeIPFilterError] = useState<string | null>(() => {
    if (!Array.isArray(fakeIPFilter)) return null
    const firstInvalid = fakeIPFilter.find((f) => !isValidDomainWildcard(f).ok)
    return firstInvalid ? (isValidDomainWildcard(firstInvalid).error ?? '格式错误') : null
  })
  const [defaultNameserverError, setDefaultNameserverError] = useState<string | null>(() => {
    if (!Array.isArray(defaultNameserver)) return null
    const firstInvalid = defaultNameserver.find((f) => !isValidDnsServer(f, true).ok)
    return firstInvalid ? (isValidDnsServer(firstInvalid, true).error ?? '格式错误') : null
  })
  const [nameserverError, setNameserverError] = useState<string | null>(() => {
    if (!Array.isArray(nameserver)) return null
    const firstInvalid = nameserver.find((f) => !isValidDnsServer(f).ok)
    return firstInvalid ? (isValidDnsServer(firstInvalid).error ?? '格式错误') : null
  })
  const [advancedDnsError, setAdvancedDnsError] = useState(false)
  const hasDnsErrors = Boolean(defaultNameserverError || nameserverError || advancedDnsError)

  const setValues = (v: typeof values): void => {
    if (readOnly) return
    originSetValues(v)
    setChanged(true)
  }

  const onSave = async (patch: Partial<MihomoConfig>): Promise<void> => {
    if (readOnly) return
    await patchAppConfig({
      hosts: values.hosts
    })
    try {
      setChanged(false)
      await patchControledMihomoConfig(patch)
      await restartCore()
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  return (
    <BasePage
      title="DNS 设置"
      contentClassName="no-scrollbar"
      header={
        !readOnly &&
        changed && (
          <Button
            size="sm"
            onPress={() => {
              const hostsObject =
                values.useHosts && values.hosts && values.hosts.length > 0
                  ? Object.fromEntries(values.hosts.map(({ domain, value }) => [domain, value]))
                  : undefined
              const dnsConfig = {
                ipv6: values.ipv6,
                'fake-ip-range': values.fakeIPRange,
                'fake-ip-range6': values.fakeIPRange6,
                'fake-ip-filter': values.fakeIPFilter,
                'enhanced-mode': values.enhancedMode,
                'use-hosts': values.useHosts,
                'use-system-hosts': values.useSystemHosts,
                'respect-rules': values.respectRules,
                'default-nameserver': values.defaultNameserver,
                nameserver: values.nameserver,
                'proxy-server-nameserver': values.proxyServerNameserver,
                'direct-nameserver': values.directNameserver,
                'nameserver-policy': values.nameserverPolicy,
                'proxy-server-nameserver-policy': values.proxyServerNameserverPolicy
              }
              onSave({
                dns: dnsConfig,
                hosts: hostsObject
              })
            }}
            variant="primary"
            data-color="primary"
            className="app-nodrag"
            isDisabled={
              values && values.enhancedMode === 'fake-ip'
                ? Boolean(fakeIPRangeError) ||
                  (values.ipv6 && Boolean(fakeIPRange6Error)) ||
                  Boolean(fakeIPFilterError) ||
                  hasDnsErrors
                : hasDnsErrors
            }
          >
            保存
          </Button>
        )
      }
    >
      <SettingCard>
        <SettingItem compatKey="legacy" title="IPv6" divider>
          <Switch
            size="sm"
            isSelected={values.ipv6}
            isDisabled={readOnly}
            onChange={(v) => {
              setValues({ ...values, ipv6: v })
            }}
            aria-label="IPv6"
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <SettingItem compatKey="legacy" title="域名映射模式" divider>
          <Tabs
            isDisabled={readOnly}
            selectedKey={values.enhancedMode}
            onSelectionChange={(key: Key) => setValues({ ...values, enhancedMode: key as DnsMode })}
            data-color="primary"
            data-size="sm"
            data-full-width={false}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="选项">
                <Tabs.Tab key="fake-ip" id="fake-ip">
                  虚假 IP
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab key="redir-host" id="redir-host">
                  真实 IP
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab key="normal" id="normal">
                  取消映射
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </SettingItem>
        {values.enhancedMode === 'fake-ip' && (
          <>
            <SettingItem compatKey="legacy" title="虚假 IP 范围 (IPv4)" divider>
              <Tooltip isOpen={!readOnly && !!fakeIPRangeError} delay={0}>
                <Tooltip.Trigger className="block w-[40%]">
                  <Input
                    readOnly={readOnly}
                    placeholder="例：198.18.0.1/16"
                    value={values.fakeIPRange}
                    onChange={(event) => {
                      const v = event.target.value
                      setValues({ ...values, fakeIPRange: v })
                      const r = isValidIPv4Cidr(v)
                      setFakeIPRangeError(r.ok ? null : (r.error ?? '格式错误'))
                    }}
                    className={
                      !readOnly && fakeIPRangeError
                        ? 'border-red-500 ring-1 ring-red-500 rounded-lg'
                        : ''
                    }
                    fullWidth
                  />
                </Tooltip.Trigger>
                <Tooltip.Content placement="right" showArrow={true} offset={15} data-color="danger">
                  <Tooltip.Arrow />
                  {fakeIPRangeError}
                </Tooltip.Content>
              </Tooltip>
            </SettingItem>
            {values.ipv6 && (
              <SettingItem compatKey="legacy" title="虚假 IP 范围 (IPv6)" divider>
                <Tooltip isOpen={!readOnly && !!fakeIPRange6Error} delay={0}>
                  <Tooltip.Trigger className="block w-[40%]">
                    <Input
                      readOnly={readOnly}
                      placeholder="例：fc00::/18"
                      value={values.fakeIPRange6}
                      onChange={(event) => {
                        const v = event.target.value
                        setValues({ ...values, fakeIPRange6: v })
                        const r = isValidIPv6Cidr(v)
                        setFakeIPRange6Error(r.ok ? null : (r.error ?? '格式错误'))
                      }}
                      className={
                        !readOnly && fakeIPRange6Error
                          ? 'border-red-500 ring-1 ring-red-500 rounded-lg'
                          : ''
                      }
                      fullWidth
                    />
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    placement="right"
                    showArrow={true}
                    offset={10}
                    data-color="danger"
                  >
                    <Tooltip.Arrow />
                    {fakeIPRange6Error}
                  </Tooltip.Content>
                </Tooltip>
              </SettingItem>
            )}
            <EditableList
              readOnly={readOnly}
              title="虚假 IP 过滤器"
              items={values.fakeIPFilter}
              validate={(part) => isValidDomainWildcard(part as string)}
              onChange={(list) => {
                const arr = list as string[]
                setValues({ ...values, fakeIPFilter: arr })
                const firstInvalid = arr.find((f) => !isValidDomainWildcard(f).ok)
                setFakeIPFilterError(
                  firstInvalid ? (isValidDomainWildcard(firstInvalid).error ?? '格式错误') : null
                )
              }}
              placeholder="例：+.lan"
            />
          </>
        )}
        <EditableList
          readOnly={readOnly}
          title="基础服务器"
          items={values.defaultNameserver}
          validate={(part) => isValidDnsServer(part as string, true)}
          onChange={(list) => {
            const arr = list as string[]
            setValues({ ...values, defaultNameserver: arr })
            const firstInvalid = arr.find((f) => !isValidDnsServer(f, true).ok)
            setDefaultNameserverError(
              firstInvalid ? (isValidDnsServer(firstInvalid, true).error ?? '格式错误') : null
            )
          }}
          placeholder="例：223.5.5.5"
        />
        <EditableList
          readOnly={readOnly}
          title="默认解析服务器"
          items={values.nameserver}
          validate={(part) => isValidDnsServer(part as string)}
          onChange={(list) => {
            const arr = list as string[]
            setValues({ ...values, nameserver: arr })
            const firstInvalid = arr.find((f) => !isValidDnsServer(f).ok)
            setNameserverError(
              firstInvalid ? (isValidDnsServer(firstInvalid).error ?? '格式错误') : null
            )
          }}
          placeholder="例：tls://dns.alidns.com"
          divider={false}
        />
      </SettingCard>
      <AdvancedDnsSetting
        readOnly={readOnly}
        respectRules={values.respectRules}
        directNameserver={values.directNameserver}
        proxyServerNameserver={values.proxyServerNameserver}
        nameserverPolicy={values.nameserverPolicy}
        proxyServerNameserverPolicy={values.proxyServerNameserverPolicy}
        hosts={values.hosts}
        useHosts={values.useHosts}
        useSystemHosts={values.useSystemHosts}
        onRespectRulesChange={(v) => {
          setValues({
            ...values,
            respectRules: values.proxyServerNameserver.length === 0 ? false : v
          })
        }}
        onDirectNameserverChange={(arr) => {
          setValues({ ...values, directNameserver: arr })
        }}
        onProxyNameserverChange={(arr) => {
          setValues({
            ...values,
            proxyServerNameserver: arr,
            respectRules: arr.length === 0 ? false : values.respectRules,
            proxyServerNameserverPolicy: arr.length === 0 ? {} : values.proxyServerNameserverPolicy
          })
        }}
        onNameserverPolicyChange={(newValue) => {
          setValues({ ...values, nameserverPolicy: newValue })
        }}
        onProxyServerNameserverPolicyChange={(newValue) => {
          setValues({ ...values, proxyServerNameserverPolicy: newValue })
        }}
        onUseSystemHostsChange={(v) => setValues({ ...values, useSystemHosts: v })}
        onUseHostsChange={(v) => setValues({ ...values, useHosts: v })}
        onHostsChange={(hostArr) => setValues({ ...values, hosts: hostArr })}
        onErrorChange={setAdvancedDnsError}
      />
    </BasePage>
  )
}

const ReadOnlyDNS: React.FC = () => {
  const { appConfig } = useAppConfig()
  const { profileConfig } = useProfileConfig()
  const {
    data: config,
    error,
    isLoading,
    mutate
  } = useSWR(['dnsRuntimeConfig', profileConfig, appConfig], getRuntimeConfig)

  useEffect(() => {
    return window.electron.ipcRenderer.on('core-started', () => {
      void mutate()
    })
  }, [mutate])

  if (isLoading || error || !config) {
    return (
      <BasePage title="DNS 设置">
        <SettingCard>
          <div role="status" className="space-y-2 px-2 py-3 text-sm">
            {isLoading ? '正在读取当前 DNS 配置...' : '当前 DNS 配置读取失败，请重试。'}
            {!isLoading && (
              <Button size="sm" onPress={() => void mutate()}>
                重试
              </Button>
            )}
          </div>
        </SettingCard>
      </BasePage>
    )
  }

  // Recreate form state when the subscription or its generated DNS configuration changes.
  return (
    <DNSSettings
      key={JSON.stringify({ dns: config.dns, hosts: config.hosts })}
      config={config}
      hosts={Object.entries(config.hosts ?? {}).map(([domain, value]) => ({ domain, value }))}
      readOnly
    />
  )
}

const DNS: React.FC = () => {
  const { appConfig } = useAppConfig()
  const { profileConfig } = useProfileConfig()
  const { controledMihomoConfig } = useControledMihomoConfig()

  return isDnsControlled(appConfig, profileConfig) ? (
    <DNSSettings config={controledMihomoConfig ?? {}} hosts={appConfig?.hosts} />
  ) : (
    <ReadOnlyDNS />
  )
}

export default DNS
