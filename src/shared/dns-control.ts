export function isDnsControlled(
  appConfig: Pick<AppConfig, 'controlDns'> | undefined,
  profileConfig: ProfileConfig | undefined
): boolean {
  const currentProfile = profileConfig?.items?.find((item) => item.id === profileConfig.current)
  return (appConfig?.controlDns ?? true) && !currentProfile?.disableDnsControl
}
