import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  setFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('set-fullscreen', fullscreen),
  getFullscreenState: () => ipcRenderer.invoke('get-fullscreen-state'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
