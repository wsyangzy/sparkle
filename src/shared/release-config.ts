export const releaseRepository = __SPARKLE_RELEASE_REPOSITORY__
export const prereleaseTag = __SPARKLE_PRERELEASE_TAG__
export const releaseBaseUrl = `https://github.com/${releaseRepository}/releases`
export const updateManifestUrls: Record<AppUpdateChannel, string> = {
  stable: `${releaseBaseUrl}/latest/download/latest.yml`,
  rolling: `${releaseBaseUrl}/download/${prereleaseTag}/latest.yml`
}

export function resolveAppReleaseTag(version: string, tag?: string): string {
  if (tag) return tag
  if (version.includes('-nightly.')) return 'nightly'
  if (version.includes('-rolling-')) return 'rolling'
  return version
}
