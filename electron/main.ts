import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import path from 'node:path'
import { AskSchema, type AppConfig, type KeyUpdate } from '../src/lib/coach-types'
import { askCoach, listModels } from '../server/coach'
import { readKeys, saveKeys } from './keys'

const NATIVE_LIB: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'libsmartspectra_capi.dylib',
  win32: 'smartspectra_capi.dll',
  linux: 'libsmartspectra_capi.so',
}

if (app.isPackaged) {
  const lib = NATIVE_LIB[process.platform]
  if (lib) process.env.SMARTSPECTRA_CAPI_PATH = path.join(process.resourcesPath, 'smartspectra', lib)
}

const DEV_URL = process.env.CALMO_DEV_URL ?? ''

function config(): AppConfig {
  const keys = readKeys()
  return { vitalsReady: !!keys.smartspectra, coachReady: !!keys.serv, model: keys.model }
}

function trustedUrl(url: string): boolean {
  if (url.startsWith('file://')) return true
  return !!DEV_URL && url.startsWith(DEV_URL)
}

async function createWindow(): Promise<void> {
  const { bindSmartSpectraIpc } = await import('@smartspectra/node-sdk/main')
  const win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    title: 'Calmo',
    backgroundColor: '#FFFFFF',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  bindSmartSpectraIpc(win)
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!trustedUrl(url)) event.preventDefault()
  })
  if (DEV_URL) await win.loadURL(DEV_URL)
  else await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('calmo:config', () => config())

ipcMain.handle('calmo:smartspectra-key', () => readKeys().smartspectra)

ipcMain.handle('calmo:save-keys', (_event, update: KeyUpdate) => {
  const clean: KeyUpdate = {}
  if (typeof update?.smartspectra === 'string') clean.smartspectra = update.smartspectra.slice(0, 512)
  if (typeof update?.serv === 'string') clean.serv = update.serv.slice(0, 512)
  if (typeof update?.model === 'string') clean.model = update.model.slice(0, 80)
  saveKeys(clean)
  return config()
})

ipcMain.handle('calmo:ask-coach', async (_event, payload: unknown) => {
  const parsed = AskSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: 'The coach request was not valid.' }
  const keys = readKeys()
  try {
    return { ok: true, text: await askCoach(keys.serv, parsed.data.model || keys.model, parsed.data) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
})

ipcMain.handle('calmo:models', async () => {
  try {
    return { ok: true, models: await listModels(readKeys().serv) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
})

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = (details && 'requestingUrl' in details && details.requestingUrl) || wc?.getURL() || ''
    const mediaTypes = (details && 'mediaTypes' in details && details.mediaTypes) || []
    const cameraOnly = mediaTypes.length === 1 && mediaTypes[0] === 'video'
    callback(permission === 'media' && cameraOnly && trustedUrl(url))
  })
  void createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
