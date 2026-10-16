import { getAppConfig } from '../config'
import dayjs from 'dayjs'
import AdmZip from 'adm-zip'
import { app, dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { parseYaml } from '../utils/yaml'
import {
  appConfigPath,
  controledMihomoConfigPath,
  dataDir,
  overrideConfigPath,
  overrideDir,
  profileConfigPath,
  profilesDir,
  subStoreDir,
  themesDir
} from '../utils/dirs'

const backupConfigFiles = ['config.yaml', 'mihomo.yaml', 'profile.yaml', 'override.yaml']
const backupDirectories = ['themes', 'profiles', 'override', 'substore']

function backupFileName(): string {
  return `${process.platform}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.zip`
}

function createBackup(): Buffer {
  const zip = new AdmZip()

  zip.addLocalFile(appConfigPath())
  zip.addLocalFile(controledMihomoConfigPath())
  zip.addLocalFile(profileConfigPath())
  zip.addLocalFile(overrideConfigPath())
  zip.addLocalFolder(themesDir(), 'themes')
  zip.addLocalFolder(profilesDir(), 'profiles')
  zip.addLocalFolder(overrideDir(), 'override')
  zip.addLocalFolder(subStoreDir(), 'substore')
  return zip.toBuffer()
}

function readBackup(data: Buffer): AdmZip {
  const zip = new AdmZip(data)
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/\\/g, '/')
    const parts = name.replace(/\/$/, '').split('/')
    const isConfig = !entry.isDirectory && parts.length === 1 && backupConfigFiles.includes(name)
    const isData = backupDirectories.includes(parts[0]) && (entry.isDirectory || parts.length > 1)
    if (
      parts.some((part) => !part || part === '.' || part === '..' || part.includes(':')) ||
      (!isConfig && !isData)
    ) {
      throw new Error(`备份包含不支持的路径：${entry.entryName}`)
    }
  }
  if (!zip.test()) throw new Error('备份文件已损坏，请选择有效的 Sparkle 备份。')
  for (const file of backupConfigFiles) {
    const entry = zip.getEntry(file)
    if (!entry || entry.isDirectory) throw new Error(`不是完整的 Sparkle 备份，缺少 ${file}。`)
    const config = parseYaml(entry.getData().toString('utf8'))
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      throw new Error(`备份中的 ${file} 格式无效。`)
    }
  }
  return zip
}

export async function localBackup(): Promise<string | undefined> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '备份到本地文件',
    defaultPath: path.join(app.getPath('documents'), backupFileName()),
    filters: [{ name: 'Sparkle 备份', extensions: ['zip'] }]
  })
  if (canceled || !filePath) return undefined
  await writeFile(filePath, createBackup())
  return filePath
}

export async function localRestore(): Promise<boolean> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '选择本地备份',
    filters: [{ name: 'Sparkle 备份', extensions: ['zip'] }],
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return false
  const zip = readBackup(await readFile(filePaths[0]))
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: '恢复本地备份',
    message: '确定恢复此备份吗？',
    detail: '恢复将覆盖现有应用设置、订阅、覆写、主题和 Sub-Store 数据，完成后将自动重启应用。',
    buttons: ['取消', '恢复并重启'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  if (response !== 1) return false
  zip.extractAllTo(dataDir(), true)
  return true
}

export async function webdavBackup(): Promise<boolean> {
  const { createClient } = await import('webdav/dist/node/index.js')
  const {
    webdavUrl = '',
    webdavUsername = '',
    webdavPassword = '',
    webdavDir = 'sparkle'
  } = await getAppConfig()
  const zipData = createBackup()
  const zipFileName = backupFileName()

  const client = createClient(webdavUrl, {
    username: webdavUsername,
    password: webdavPassword
  })
  try {
    await client.createDirectory(webdavDir)
  } catch {
    // ignore
  }

  return await client.putFileContents(`${webdavDir}/${zipFileName}`, zipData)
}

export async function webdavRestore(filename: string): Promise<void> {
  const { createClient } = await import('webdav/dist/node/index.js')
  const {
    webdavUrl = '',
    webdavUsername = '',
    webdavPassword = '',
    webdavDir = 'sparkle'
  } = await getAppConfig()

  const client = createClient(webdavUrl, {
    username: webdavUsername,
    password: webdavPassword
  })
  const zipData = await client.getFileContents(`${webdavDir}/${filename}`)
  const zip = readBackup(zipData as Buffer)
  zip.extractAllTo(dataDir(), true)
}

export async function listWebdavBackups(): Promise<string[]> {
  const { createClient } = await import('webdav/dist/node/index.js')
  const {
    webdavUrl = '',
    webdavUsername = '',
    webdavPassword = '',
    webdavDir = 'sparkle'
  } = await getAppConfig()

  const client = createClient(webdavUrl, {
    username: webdavUsername,
    password: webdavPassword
  })
  const files = await client.getDirectoryContents(webdavDir, { glob: '*.zip' })
  return files.map((file) => file.basename)
}

export async function webdavDelete(filename: string): Promise<void> {
  const { createClient } = await import('webdav/dist/node/index.js')
  const {
    webdavUrl = '',
    webdavUsername = '',
    webdavPassword = '',
    webdavDir = 'sparkle'
  } = await getAppConfig()

  const client = createClient(webdavUrl, {
    username: webdavUsername,
    password: webdavPassword
  })
  await client.deleteFile(`${webdavDir}/${filename}`)
}
