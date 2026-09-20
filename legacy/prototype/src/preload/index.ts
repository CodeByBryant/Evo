import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  setFullscreen: (fullscreen: boolean): Promise<unknown> =>
    ipcRenderer.invoke('set-fullscreen', fullscreen),
  getFullscreenState: (): Promise<unknown> => ipcRenderer.invoke('get-fullscreen-state'),
  toggleFullscreen: (): Promise<unknown> => ipcRenderer.invoke('toggle-fullscreen'),
  maximizeWindow: (): Promise<unknown> => ipcRenderer.invoke('maximize-window'),
  minimizeWindow: (): Promise<unknown> => ipcRenderer.invoke('minimize-window'),
  closeWindow: (): Promise<unknown> => ipcRenderer.invoke('close-window')
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
