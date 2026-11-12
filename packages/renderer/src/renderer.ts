import type {
  ClusterLayoutSnapshot,
  EntityId,
  ObstacleSnapshot,
  RenderLayers,
  RenderSnapshot,
  TerrainSnapshot
} from '@evo/contracts'
import type { ViewInsets } from './camera'

export interface RendererCallbacks {
  /** The user clicked an organism, or empty space (`null`). */
  onSelect(id: EntityId | null): void
  /** Following stopped because the user dragged the view. */
  onFollowChange?(follow: boolean): void
}

/** Counters the debug overlay and the performance checks read. */
export interface RendererStats {
  /** Frames drawn since mount. */
  readonly frames: number
  /** Milliseconds the last `render` call took in total, including handing the frame to the GPU. */
  readonly lastFrameMs: number
  /** Milliseconds the last scene update took (positions, tints, pools): the CPU cost of a frame. */
  readonly lastSceneMs: number
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
  /**
   * Sets the world size and, when regions are on, the region map (static for a world's life). In
   * the cluster layout `clusters` describes the unbounded world and `width` and `height` are the
   * size of its bounds. `obstacles` is the static obstacle field (ADR 0022), drawn once.
   */
  setWorld(
    width: number,
    height: number,
    terrain: TerrainSnapshot | null,
    clusters?: ClusterLayoutSnapshot | null,
    obstacles?: readonly ObstacleSnapshot[]
  ): void
  /** Draws a frame. Cheap to call every animation frame. */
  render(frame: RenderSnapshot): void
  setLayers(layers: RenderLayers): void
  /** Centres on the selected organism, if there is one. */
  focusSelected(): void
  /** Keeps the selected organism centred as it moves. */
  setFollow(follow: boolean): void
  fitWorld(): void
  /**
   * Tells the renderer which edges of the viewport floating interface covers. The whole world is
   * kept clear of them when it is fitted, and a view the user has not moved is refitted at once.
   */
  setInsets(insets: ViewInsets): void
  readonly stats: RendererStats
  destroy(): void
}
