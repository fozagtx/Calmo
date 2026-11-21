import '@smartspectra/node-sdk/preload'
import { contextBridge, ipcRenderer } from 'electron'
import type { AskRequest, CalmoBridge, KeyUpdate } from '../src/lib/coach-types'

const bridge: CalmoBridge = {
  config: () => ipcRenderer.invoke('calmo:config'),
  smartspectraKey: () => ipcRenderer.invoke('calmo:smartspectra-key'),
  saveKeys: (update: KeyUpdate) => ipcRenderer.invoke('calmo:save-keys', update),
  askCoach: (request: AskRequest) => ipcRenderer.invoke('calmo:ask-coach', request),
  models: () => ipcRenderer.invoke('calmo:models'),
}

contextBridge.exposeInMainWorld('calmo', bridge)
