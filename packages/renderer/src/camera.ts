export interface Point {
  readonly x: number
  readonly y: number
}

export interface CameraState {
  /** The world point shown at the centre of the viewport. */
  readonly x: number
  readonly y: number
  /** Screen pixels per world unit. */
  readonly zoom: number
}

export interface CameraOptions {
  readonly worldWidth: number
  readonly worldHeight: number
  readonly minZoom?: number
  readonly maxZoom?: number
}

const DEFAULT_MIN_ZOOM = 0.15
const DEFAULT_MAX_ZOOM = 40

/**
 * A 2D camera over a rectangular world (roadmap 7.3). Pure arithmetic: no DOM, no Pixi, so every
 * rule here is unit-tested. The centre is clamped to the world so the view cannot be lost.
 */
export class Camera {
  private cx: number
  private cy: number
  private z = 1
  private viewWidth = 1
  private viewHeight = 1
  private worldWidth: number
  private worldHeight: number
  /** The top-left corner of the world: `(0, 0)` for the field, the layout's bounds for clusters. */
  private originX = 0
  private originY = 0
  private minZoom: number
  private readonly maxZoom: number

  constructor(options: CameraOptions) {
    this.worldWidth = options.worldWidth
    this.worldHeight = options.worldHeight
    this.minZoom = options.minZoom ?? DEFAULT_MIN_ZOOM
    this.maxZoom = options.maxZoom ?? DEFAULT_MAX_ZOOM
    this.cx = options.worldWidth / 2
    this.cy = options.worldHeight / 2
  }

  get state(): CameraState {
    return { x: this.cx, y: this.cy, zoom: this.z }
  }

  get viewport(): { width: number; height: number } {
    return { width: this.viewWidth, height: this.viewHeight }
  }

  setWorld(worldWidth: number, worldHeight: number, originX = 0, originY = 0): void {
    this.worldWidth = worldWidth
    this.worldHeight = worldHeight
    this.originX = originX
    this.originY = originY
    this.clampCentre()
  }

  /** Lets the camera zoom out further, for a world much larger than the field (the cluster layout). */
  setMinZoom(zoom: number): void {
    this.minZoom = zoom
    this.z = clamp(this.z, this.minZoom, this.maxZoom)
  }

  setViewport(width: number, height: number): void {
    this.viewWidth = Math.max(1, width)
    this.viewHeight = Math.max(1, height)
  }

  worldToScreen(wx: number, wy: number): Point {
    return {
      x: (wx - this.cx) * this.z + this.viewWidth / 2,
      y: (wy - this.cy) * this.z + this.viewHeight / 2
    }
  }

  screenToWorld(sx: number, sy: number): Point {
    return {
      x: (sx - this.viewWidth / 2) / this.z + this.cx,
      y: (sy - this.viewHeight / 2) / this.z + this.cy
    }
  }

  /** Drags the world by a screen-space delta (the content follows the pointer). */
  panBy(screenDx: number, screenDy: number): void {
    this.cx -= screenDx / this.z
    this.cy -= screenDy / this.z
    this.clampCentre()
  }

  /** Multiplies the zoom, keeping the world point under the given screen point where it is. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy)
    this.z = clamp(this.z * factor, this.minZoom, this.maxZoom)
    const after = this.screenToWorld(sx, sy)
    this.cx += before.x - after.x
    this.cy += before.y - after.y
    this.clampCentre()
  }

  /** Centres on a world point, optionally at a given zoom. */
  focus(wx: number, wy: number, zoom?: number): void {
    this.cx = wx
    this.cy = wy
    if (zoom !== undefined) this.z = clamp(zoom, this.minZoom, this.maxZoom)
    this.clampCentre()
  }

  /** Shows the whole world, with a margin as a fraction of the viewport. */
  fit(margin = 0.04): void {
    const usableWidth = this.viewWidth * (1 - 2 * margin)
    const usableHeight = this.viewHeight * (1 - 2 * margin)
    this.z = clamp(
      Math.min(usableWidth / this.worldWidth, usableHeight / this.worldHeight),
      this.minZoom,
      this.maxZoom
    )
    this.cx = this.originX + this.worldWidth / 2
    this.cy = this.originY + this.worldHeight / 2
  }

  /** The visible part of the world. */
  visibleBounds(): { left: number; top: number; right: number; bottom: number } {
    const halfWidth = this.viewWidth / 2 / this.z
    const halfHeight = this.viewHeight / 2 / this.z
    return {
      left: this.cx - halfWidth,
      top: this.cy - halfHeight,
      right: this.cx + halfWidth,
      bottom: this.cy + halfHeight
    }
  }

  private clampCentre(): void {
    this.cx = clamp(this.cx, this.originX, this.originX + this.worldWidth)
    this.cy = clamp(this.cy, this.originY, this.originY + this.worldHeight)
  }
}

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}
