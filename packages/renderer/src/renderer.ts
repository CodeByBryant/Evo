import type { EntityId, RenderLayers, RenderSnapshot, TerrainSnapshot } from '@evo/contracts'

export interface RendererCallbacks {
  /** The user clicked an organism, or empty space (`null`). */
  onSelect(id: EntityId | null): void
}

/** Counters the debug overlay and the performance checks read. */
export interface RendererStats {
  /** Frames drawn since mount. */
  readonly frames: number
  /** Milliseconds the last `render` call took (building the scene, not GPU time). */
  readonly lastFrameMs: number
  readonly organisms: number
  readonly resources: number
}

/**
 * What the application needs from a renderer (docs/decisions/0011). `PixiRenderer` is the
 * implementation; the interface exists so a Canvas fallback stays possible and the application
 * can be tested with a fake. A renderer only ever receives snapshots and never reaches the engine.
 */
export interface Renderer {
  /** Creates the canvas inside `container` and starts listening for pointer input. */
  mount(container: HTMLElement, callbacks: RendererCallbacks): Promise<void>
  /** Sets the world size and, when regions are on, the region map (static for a world's life). */
  setWorld(width: number, height: number, terrain: TerrainSnapshot | null): void
  /** Draws a frame. Cheap to call every animation frame. */
  render(frame: RenderSnapshot): void
  setLayers(layers: RenderLayers): void
  /** Centres on the selected organism, if there is one. */
  focusSelected(): void
  /** Keeps the selected organism centred as it moves. */
  setFollow(follow: boolean): void
  fitWorld(): void
  readonly stats: RendererStats
  destroy(): void
}
