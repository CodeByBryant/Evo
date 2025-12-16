import { useState, useCallback, useEffect } from 'react'

interface ElectronAPI {
  ipcRenderer?: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    on: (channel: string, listener: (...args: unknown[]) => void) => void
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => void
  }
}

const getElectronAPI = (): ElectronAPI | undefined => {
  if (typeof window !== 'undefined') {
    return (window as unknown as { electron?: ElectronAPI }).electron
  }
  return undefined
}

export interface UseFullscreenResult {
  isFullscreen: boolean
  toggleFullscreen: () => Promise<void>
  enterFullscreen: () => Promise<void>
  exitFullscreen: () => Promise<void>
  isElectron: boolean
}

export const useFullscreen = (): UseFullscreenResult => {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const electronAPI = getElectronAPI()
  const isElectron = electronAPI?.ipcRenderer !== undefined

  const checkFullscreen = useCallback(() => {
    if (isElectron) {
      return
    }
    const doc = document as Document & {
      webkitFullscreenElement?: Element
      mozFullScreenElement?: Element
      msFullscreenElement?: Element
    }
    const isFs = !!(
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    )
    setIsFullscreen(isFs)
  }, [isElectron])

  useEffect(() => {
    const electron = getElectronAPI()

    if (isElectron && electron?.ipcRenderer) {
      const handleFullscreenChange = (_event: unknown, fullscreen: unknown) => {
        setIsFullscreen(fullscreen as boolean)
      }

      electron.ipcRenderer.on('fullscreen-changed', handleFullscreenChange)

      electron.ipcRenderer
        .invoke('get-fullscreen-state')
        .then((state) => {
          setIsFullscreen(state as boolean)
        })
        .catch(() => {})

      return () => {
        electron.ipcRenderer?.removeListener('fullscreen-changed', handleFullscreenChange)
      }
    } else {
      document.addEventListener('fullscreenchange', checkFullscreen)
      document.addEventListener('webkitfullscreenchange', checkFullscreen)
      document.addEventListener('mozfullscreenchange', checkFullscreen)
      document.addEventListener('MSFullscreenChange', checkFullscreen)

      checkFullscreen()

      return () => {
        document.removeEventListener('fullscreenchange', checkFullscreen)
        document.removeEventListener('webkitfullscreenchange', checkFullscreen)
        document.removeEventListener('mozfullscreenchange', checkFullscreen)
        document.removeEventListener('MSFullscreenChange', checkFullscreen)
      }
    }
  }, [isElectron, checkFullscreen])

  const enterFullscreen = useCallback(async () => {
    try {
      const electron = getElectronAPI()
      if (isElectron && electron?.ipcRenderer) {
        await electron.ipcRenderer.invoke('set-fullscreen', true)
      } else {
        const elem = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>
          mozRequestFullScreen?: () => Promise<void>
          msRequestFullscreen?: () => Promise<void>
        }

        if (elem.requestFullscreen) {
          await elem.requestFullscreen()
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen()
        } else if (elem.mozRequestFullScreen) {
          await elem.mozRequestFullScreen()
        } else if (elem.msRequestFullscreen) {
          await elem.msRequestFullscreen()
        }
      }
      setIsFullscreen(true)
    } catch (error) {
      console.error('Failed to enter fullscreen:', error)
    }
  }, [isElectron])

  const exitFullscreen = useCallback(async () => {
    try {
      const electron = getElectronAPI()
      if (isElectron && electron?.ipcRenderer) {
        await electron.ipcRenderer.invoke('set-fullscreen', false)
      } else {
        const doc = document as Document & {
          webkitExitFullscreen?: () => Promise<void>
          mozCancelFullScreen?: () => Promise<void>
          msExitFullscreen?: () => Promise<void>
        }

        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen()
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen()
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen()
        }
      }
      setIsFullscreen(false)
    } catch (error) {
      console.error('Failed to exit fullscreen:', error)
    }
  }, [isElectron])

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      await exitFullscreen()
    } else {
      await enterFullscreen()
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen])

  return {
    isFullscreen,
    toggleFullscreen,
    enterFullscreen,
    exitFullscreen,
    isElectron
  }
}
