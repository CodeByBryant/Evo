import { useEffect, useRef, useState } from 'react'
import type { RenderLayers } from '@evo/contracts'
import type { Renderer } from '@evo/renderer'
import type { SimulationHost } from './host/SimulationHost'

/**
 * The canvas. It is wired to the host imperatively: the host calls the renderer every time the
 * world has moved, so React does not re-render for frames (docs/decisions/0011). Pixi is loaded
 * with a dynamic import, so the page's first paint does not wait for it.
 */
export function Viewport({
  host,
  layers
}: {
  host: SimulationHost
  layers: RenderLayers
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const renderer = useRef<Renderer | null>(null)
  const latestLayers = useRef(layers)
  latestLayers.current = layers
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    const cleanups: Array<() => void> = []

    void (async () => {
      try {
        const { PixiRenderer } = await import('@evo/renderer/pixi')
        const element = container.current
        if (disposed || element === null) return
        const instance = new PixiRenderer()
        await instance.mount(element, {
          onSelect: (id) => host.select(id),
          onFollowChange: (follow) => {
            if (!follow) host.notifyFollowStopped()
          }
        })
        if (disposed) {
          instance.destroy()
          return
        }
        renderer.current = instance
        const info = host.getWorldInfo()
        instance.setWorld(info.width, info.height, info.terrain)
        instance.setLayers(latestLayers.current)
        instance.render(host.getFrame())
        cleanups.push(
          host.onWorld((next) => instance.setWorld(next.width, next.height, next.terrain)),
          host.onFrame((frame) => instance.render(frame))
        )
        host.attachViewport({
          focusSelected: () => instance.focusSelected(),
          setFollow: (follow) => instance.setFollow(follow),
          fitWorld: () => instance.fitWorld()
        })
        if (new URLSearchParams(window.location.search).has('debug')) {
          ;(window as unknown as { __evo?: unknown }).__evo = { host, renderer: instance }
        }
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()

    return () => {
      disposed = true
      for (const cleanup of cleanups) cleanup()
      host.attachViewport(null)
      renderer.current?.destroy()
      renderer.current = null
    }
  }, [host])

  useEffect(() => {
    renderer.current?.setLayers(layers)
  }, [layers])

  return (
    <div ref={container} className="viewport" role="img" aria-label="Simulation viewport">
      {error !== null && (
        <p className="viewport-error">
          The viewport could not start ({error}). Evo needs WebGL; try a current browser.
        </p>
      )}
    </div>
  )
}
