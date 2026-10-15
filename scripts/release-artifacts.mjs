/* eslint-disable @typescript-eslint/explicit-function-return-type -- This script runs directly as JavaScript. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringify } from 'yaml'

export function expectedArtifacts(version) {
  return [
    ...['x64', 'arm64'].flatMap((arch) => [
      `sparkle-windows-${version}-${arch}-setup.exe`,
      `sparkle-windows-${version}-${arch}-portable.7z`,
      `sparkle-macos-${version}-${arch}.pkg`
    ]),
    ...[
      ['amd64', 'x86_64', 'x64'],
      ['arm64', 'aarch64', 'aarch64'],
      ['loong64', 'loongarch64', 'loong64']
    ].flatMap(([deb, rpm, pacman]) => [
      `sparkle-linux-${version}-${deb}.deb`,
      `sparkle-linux-${version}-${rpm}.rpm`,
      `sparkle-linux-${version}-${pacman}.pkg.tar.zst`
    ])
  ].sort()
}

export async function assembleRelease(
  directory,
  { version, tag, repository, channel, commit, notes }
) {
  if (!/^\d+\.\d+\.\d+(?:-(?:rolling|nightly)[.-][\da-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`)
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid release repository')
  const expected = expectedArtifacts(version)
  const entries = await readdir(directory)
  const unexpected = entries.filter((name) => !expected.includes(name))
  const missing = expected.filter((name) => !entries.includes(name))
  if (missing.length || unexpected.length) {
    throw new Error(
      `Incomplete artifact set. Missing: ${missing.join(', ')}; unexpected: ${unexpected.join(', ')}`
    )
  }
  for (const name of expected) {
    const info = await stat(path.join(directory, name))
    if (!info.isFile() || info.size === 0) throw new Error(`Empty or invalid artifact: ${name}`)
  }

  const url = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}`
  const link = (name, label) => `[${label}](${url}/${name})`
  const rows = [
    '| 平台 | 架构 | 下载 |',
    '| --- | --- | --- |',
    ...expected.map((name) => {
      const [, platform, , arch] = name.replace(`-${version}-`, '-VERSION-').split('-')
      const format = name.endsWith('setup.exe')
        ? 'Installer'
        : name.endsWith('portable.7z')
          ? 'Portable 7z'
          : name.endsWith('pkg.tar.zst')
            ? 'Pacman'
            : path.extname(name).slice(1).toUpperCase()
      return `| ${platform} | ${arch.split('.')[0]} | ${link(name, format)} |`
    })
  ]
  const changelog =
    [
      notes.trim(),
      `源码：[${commit.slice(0, 12)}](https://github.com/${repository}/commit/${commit})`,
      rows.join('\n'),
      `SHA-256：[checksums.txt](${url}/checksums.txt)`
    ].join('\n\n') + '\n'
  await writeFile(path.join(directory, 'latest.yml'), stringify({ version, tag, changelog }))
  await writeFile(
    path.join(directory, 'release.json'),
    JSON.stringify({ version, tag, channel, commit }, null, 2) + '\n'
  )

  const checksums = []
  for (const name of [...expected, 'latest.yml', 'release.json'].sort()) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path.join(directory, name))) hash.update(chunk)
    checksums.push(`${hash.digest('hex')}  ${name}`)
  }
  await writeFile(path.join(directory, 'checksums.txt'), checksums.join('\n') + '\n')
  return changelog
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const notes = await readFile('changelog.md', 'utf8')
  const changelog = await assembleRelease('release-assets', {
    version: process.env.RELEASE_VERSION,
    tag: process.env.RELEASE_TAG,
    repository: process.env.GITHUB_REPOSITORY,
    channel: process.env.BUILD_CHANNEL,
    commit: process.env.GITHUB_SHA,
    notes
  })
  await writeFile('release-notes.md', changelog)
}
