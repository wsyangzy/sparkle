/* eslint-disable @typescript-eslint/explicit-function-return-type -- This script runs directly as JavaScript. */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function resolveVersion({ channel, base, requested, tag, timestamp, run, attempt, sha }) {
  if (!stableVersion.test(base)) throw new Error(`Invalid package version: ${base}`)
  if (channel === 'stable') {
    const version = requested?.replace(/^v/, '') || base
    if (!stableVersion.test(version)) throw new Error(`Invalid stable version: ${version}`)
    if (tag && (tag.replace(/^v/, '') !== version || version !== base)) {
      throw new Error('The stable tag, requested version and package.json version must match')
    }
    return { version, tag: tag || `v${version}` }
  }
  if (!['nightly', 'rolling'].includes(channel))
    throw new Error(`Invalid build channel: ${channel}`)
  if (
    !/^\d{14}$/.test(timestamp) ||
    !/^\d+$/.test(run) ||
    !/^\d+$/.test(attempt) ||
    !/^[\da-f]{7,40}$/.test(sha)
  ) {
    throw new Error('Invalid prerelease build identity')
  }
  const parts = base.split('.')
  parts[2] = String(Number(parts[2]) + 1)
  // Keep -rolling- recognizable by existing installations and AUR consumers.
  const suffix =
    channel === 'rolling'
      ? `rolling-${sha.slice(0, 8)}.${timestamp}.${run}.${attempt}`
      : `nightly.${timestamp}.${run}.${attempt}`
  return { version: `${parts.join('.')}-${suffix}`, tag: channel }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  if (process.argv[2] === 'stamp') {
    const version = process.env.RELEASE_VERSION
    if (!/^\d+\.\d+\.\d+(?:-(?:rolling|nightly)[.-][\da-z.-]+)?$/.test(version || '')) {
      throw new Error(`Invalid release version: ${version}`)
    }
    pkg.version = version
    writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
  } else {
    const result = resolveVersion({
      channel: process.env.BUILD_CHANNEL,
      base: pkg.version,
      requested: process.env.INPUT_VERSION,
      tag: process.env.SOURCE_TAG,
      timestamp: new Date().toISOString().replace(/\D/g, '').slice(0, 14),
      run: process.env.GITHUB_RUN_NUMBER,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
      sha: process.env.GITHUB_SHA
    })
    for (const [key, value] of Object.entries(result)) {
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
    }
    console.log(JSON.stringify(result))
  }
}
