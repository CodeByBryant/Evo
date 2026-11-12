import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { DEFAULT_RENDER_LAYERS, REGION_TYPES } from '@evo/contracts'
import type {
  RenderResource,
  ClusterLayoutSnapshot,
  ObstacleSnapshot,
  RenderLayers,
  RenderOrganism,
  RenderSnapshot,
  TerrainSnapshot
} from '@evo/contracts'
import { Camera } from '../camera'
import type { ViewInsets } from '../camera'
import { OBSTACLE_COLORS, REGION_COLORS, hexToNumber, resourceColor } from '../colors'
import { GestureTracker } from '../gestures'
import type { GestureAction } from '../gestures'
import { pickOrganism } from '../pick'
import type { Renderer, RendererCallbacks, RendererStats } from '../renderer'
import { TrailBuffer } from '../trails'
import { drawParts, paintBodyArt, paletteOf } from './organismArt'

/** How long (in ticks) a birth, death or damage marker stays visible. */
const EFFECT_TICKS = 14
const GRID_SPACING = 50
/**
 * When zoomed far out (the cluster layout's world is thousands of units across) a creature or a
 * piece of food would shrink below a pixel and vanish. They are drawn no smaller than this many
 * screen pixels in radius, so the world stays readable; close up nothing changes.
 */
const MIN_ORGANISM_PX = 2.6
const MIN_FOOD_PX = 1.3
/** How much larger than a free food item a plant's hub is drawn, and how much smaller its nodes. */
const HUB_SCALE = 1.7
const NODE_SCALE = 0.8
/** The grid of the cluster layout is coarser: its world is about a hundred times wider than the field. */
const CLUSTER_GRID_SPACING = 250
/** The camera's lowest zoom in the field and in the (far larger) cluster layout. */
const DEFAULT_MIN_ZOOM = 0.15
const CLUSTER_MIN_ZOOM = 0.01
/** From this zoom (screen pixels per world unit) each creature's parts are drawn over its body. */
const PARTS_ZOOM = 3
/** Creatures animated at once; beyond this the nearest-to-the-front ones animate and the rest hold a pose. */
const MAX_ANIMATED = 220
/** The shortest gap, in milliseconds, between two animation frames drawn by the renderer's own loop. */
const ANIMATION_GAP_MS = 14
/** How far the cluster layout's grid runs past the clusters, in world units. */
const CLUSTER_GRID_PAD = 8000
/** Pixels per side of a cluster's biome picture. */
const CLUSTER_TEXTURE = 512
/** Flat black page and a barely lighter world (docs/architecture/interface-design.md). */
const BACKGROUND = 0x000000
const FIELD = 0x050505
/** The grid, the world's edge and the cluster rims: white lines at low strength, so one pixel hairlines. */
const LINE = 0xffffff

const EFFECT_COLORS = {
  birth: 0x7dffb0,
  death: 0xff6b6b,
  damage: 0xffb347,
  bite: 0xe0524a
} as const

type PoolHost = { container: Container; pool: Sprite[] }

/** One creature's drawn body: its shape never changes, so it is built once and only moved afterwards. */
interface BodyDrawing {
  /** Moves, turns and fades the whole creature; holds the body and, near, its moving parts. */
  readonly container: Container
  readonly graphics: Graphics
  /** What the picture depends on besides the outline; a change rebuilds it. */
  key: string
  seen: number
  /** Tails and halo, behind the body; built the first time the camera is close enough to need them. */
  back: Graphics | null
  /** Plates, gut, cilia, feelers, mouth and eyes, over the body. */
  front: Graphics | null
  /** The creature as of the latest scene, so an animation frame can redraw its parts. */
  organism: RenderOrganism | null
  /** The scene stamp its parts were last drawn at, so a creature past the animation budget is still drawn once per scene. */
  partsStamp: number
}

/**
 * The Pixi implementation of `Renderer` (docs/decisions/0011). It owns the canvas, a camera, the
 * pointer handling and a pooled scene; it draws `RenderSnapshot`s and nothing else. Anything that
 * is logic (camera arithmetic, picking, colors, gestures, trails) lives in pure modules and is
 * unit-tested; this file is the thin drawing layer and is verified in a real browser.
 */
export class PixiRenderer implements Renderer {
  private app: Application | null = null
  private host: HTMLElement | null = null
  private callbacks: RendererCallbacks | null = null
  private resizeObserver: ResizeObserver | null = null
  private removeListeners: (() => void) | null = null

  private readonly camera = new Camera({ worldWidth: 500, worldHeight: 500 })
  private readonly gestures = new GestureTracker()
  private readonly trails = new TrailBuffer()
  private layers: RenderLayers = DEFAULT_RENDER_LAYERS
  private frame: RenderSnapshot | null = null
  private drawnFrame: RenderSnapshot | null = null
  private follow = false
  private sceneDirty = true
  private partsVisible = false
  /** The zoom the scene was last sized for (minimum screen sizes depend on it). */
  private sceneZoom = 1
  private cameraDirty = true
  private fitted = false
  /** True once the user has panned or zoomed, so a layout change must not move their view. */
  private userMoved = false
  private worldWidth = 500
  private worldHeight = 500

  private world = new Container()
  private gridG = new Graphics()
  private fieldG = new Graphics()
  private terrainSprite = new Sprite()
  /** One biome picture per cluster (the cluster layout), under the same layer switch as the field's terrain. */
  private clusterTerrain = new Container()
  private clusters: ClusterLayoutSnapshot | null = null
  private hazardG = new Graphics()
  /** The static obstacle field (ADR 0022), drawn once per world. */
  private obstacleG = new Graphics()
  /** One flat line from each plant's hub to each of its nodes, and the buds growing back. */
  private stemG = new Graphics()
  private trailG = new Graphics()
  private selectionG = new Graphics()
  private resources: PoolHost = { container: new Container(), pool: [] }
  private bodies: PoolHost = { container: new Container(), pool: [] }
  private readonly bodyDrawings = new Map<number, BodyDrawing>()
  /** Counts scene updates, so a creature missing from the latest one can be recognized. */
  private sceneStamp = 0
  private debugText: Text | null = null
  private dotTexture: Texture | null = null
  /** Whether creatures move: the Motion layer, unless the viewer asked their system for less motion. */
  private motionOn = true
  private reducedMotion = false
  private animationFrame = 0
  private lastRenderAt = 0
  private readonly colorCache = new Map<string, number>()

  private frameCount = 0
  private lastMs = 0
  private lastSceneMs = 0
  private organismCount = 0
  private resourceCount = 0

  get stats(): RendererStats {
    return {
      frames: this.frameCount,
      lastFrameMs: this.lastMs,
      lastSceneMs: this.lastSceneMs,
      organisms: this.organismCount,
      resources: this.resourceCount
    }
  }

  async mount(container: HTMLElement, callbacks: RendererCallbacks): Promise<void> {
    const app = new Application()
    await app.init({
      background: BACKGROUND,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
      autoStart: false,
      preference: 'webgl'
    })
    this.app = app
    this.host = container
    this.callbacks = callbacks
    container.appendChild(app.canvas)
    app.canvas.style.display = 'block'
    app.canvas.style.width = '100%'
    app.canvas.style.height = '100%'
    app.canvas.style.touchAction = 'none'

    this.dotTexture = this.makeDotTexture(app)
    this.reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    this.terrainSprite.visible = false
    this.world.addChild(
      this.fieldG,
      this.terrainSprite,
      this.clusterTerrain,
      this.gridG,
      this.hazardG,
      this.obstacleG,
      this.stemG,
      this.resources.container,
      this.bodies.container,
      this.trailG,
      this.selectionG
    )
    app.stage.addChild(this.world)
    this.debugText = new Text({
      text: '',
      style: { fill: 0x9a9a9a, fontSize: 12, fontFamily: 'ui-monospace, monospace' }
    })
    this.debugText.position.set(10, 10)
    app.stage.addChild(this.debugText)

    this.attachInput(app.canvas)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.drawBackground()
    this.drawGrid()
  }

  setWorld(
    width: number,
    height: number,
    terrain: TerrainSnapshot | null,
    clusters: ClusterLayoutSnapshot | null = null,
    obstacles: readonly ObstacleSnapshot[] = []
  ): void {
    this.clusters = clusters
    this.worldWidth = width
    this.worldHeight = height
    // The cluster layout has no walls; the camera works inside its bounds plus a margin.
    this.camera.setMinZoom(clusters === null ? DEFAULT_MIN_ZOOM : CLUSTER_MIN_ZOOM)
    this.camera.setWorld(width, height, clusters?.bounds.minX ?? 0, clusters?.bounds.minY ?? 0)
    this.trails.clear()
    this.frame = null
    this.drawnFrame = null
    this.drawBackground()
    this.drawGrid()
    this.buildTerrain(terrain)
    this.buildClusterTerrain(clusters)
    this.drawObstacles(obstacles)
    this.camera.fit()
    this.fitted = true
    this.userMoved = false
    this.follow = false
    this.cameraDirty = true
    this.sceneDirty = true
  }

  render(frame: RenderSnapshot): void {
    this.frame = frame
    const near = this.camera.state.zoom >= PARTS_ZOOM
    if (near !== this.partsVisible) {
      this.partsVisible = near
      this.sceneDirty = true
    }
    const zoom = this.camera.state.zoom
    if (Math.abs(zoom / this.sceneZoom - 1) > 0.04) this.sceneDirty = true
    const animating = this.isAnimating()
    if (frame === this.drawnFrame && !this.cameraDirty && !this.sceneDirty && !animating) return
    const started = performance.now()
    if (frame !== this.drawnFrame || this.sceneDirty) {
      if (this.layers.trails) this.trails.record(frame.organisms)
      const sceneStarted = performance.now()
      this.updateScene(frame)
      this.lastSceneMs = performance.now() - sceneStarted
      this.drawnFrame = frame
      this.sceneDirty = false
    }
    if (this.partsVisible) this.animateParts(started)
    this.applyCamera()
    this.app?.render()
    this.cameraDirty = false
    this.frameCount++
    this.lastRenderAt = started
    this.lastMs = performance.now() - started
    if (animating) this.keepAnimating()
  }

  /** Whether creatures are being drawn moving: close enough to see parts, with Motion on. */
  private isAnimating(): boolean {
    return this.partsVisible && this.motionOn && !this.reducedMotion && this.frame !== null
  }

  /**
   * While creatures animate the picture changes every frame even when the world is paused, so the
   * renderer keeps its own animation loop going, and stops it as soon as nothing needs it.
   */
  private keepAnimating(): void {
    if (this.animationFrame !== 0) return
    const step = (): void => {
      this.animationFrame = 0
      const frame = this.frame
      if (frame === null || !this.isAnimating()) return
      if (performance.now() - this.lastRenderAt >= ANIMATION_GAP_MS) this.render(frame)
      this.animationFrame = requestAnimationFrame(step)
    }
    this.animationFrame = requestAnimationFrame(step)
  }

  /**
   * Redraws the moving parts of every creature in view at the current time. At most `MAX_ANIMATED`
   * creatures move; the rest in view are drawn once per scene at rest (time 0), so a crowd never
   * shows creatures without their parts.
   */
  private animateParts(now: number): void {
    const bounds = this.camera.visibleBounds()
    const animate = this.isAnimating()
    const time = animate ? now / 1000 : 0
    const selectedId = this.frame?.selectedEntityId ?? null
    let animated = 0
    for (const drawing of this.bodyDrawings.values()) {
      const o = drawing.organism
      if (o === null || drawing.back === null || drawing.front === null) continue
      const pad = o.radius * 4
      const visible =
        o.x >= bounds.left - pad &&
        o.x <= bounds.right + pad &&
        o.y >= bounds.top - pad &&
        o.y <= bounds.bottom + pad
      if (!visible) continue
      const sight = o.id === selectedId
      if (animated >= MAX_ANIMATED && !sight) {
        // Past the budget: hold the rest pose, drawn once for this scene.
        if (drawing.partsStamp !== this.sceneStamp) {
          drawParts(drawing.back, drawing.front, o, paletteOf(o.hue), 0)
          drawing.partsStamp = this.sceneStamp
        }
        continue
      }
      animated++
      drawParts(drawing.back, drawing.front, o, paletteOf(o.hue), time, sight)
      drawing.partsStamp = this.sceneStamp
    }
  }

  setLayers(layers: RenderLayers): void {
    this.layers = layers
    if (!layers.trails) this.trails.clear()
    this.gridG.visible = layers.grid
    this.terrainSprite.visible = layers.terrain && this.terrainSprite.texture !== Texture.EMPTY
    this.clusterTerrain.visible = layers.terrain
    this.hazardG.visible = layers.hazards
    this.obstacleG.visible = layers.obstacles
    this.resources.container.visible = layers.resources
    this.bodies.container.visible = layers.organisms
    this.motionOn = layers.motion
    this.trailG.visible = layers.trails
    this.selectionG.visible = layers.selection
    if (this.debugText) this.debugText.visible = layers.debug
    this.sceneDirty = true
  }

  focusSelected(): void {
    const selected = this.selectedOrganism()
    if (selected === undefined) return
    this.camera.focus(selected.x, selected.y, Math.max(this.camera.state.zoom, 3))
    this.cameraDirty = true
  }

  setFollow(follow: boolean): void {
    this.follow = follow
    if (follow) this.focusSelected()
    this.cameraDirty = true
  }

  fitWorld(): void {
    this.camera.fit()
    this.userMoved = false
    this.cameraDirty = true
  }

  setInsets(insets: ViewInsets): void {
    this.camera.setInsets(insets)
    if (!this.userMoved && !this.follow && this.fitted) {
      this.camera.fit()
      this.cameraDirty = true
    }
  }

  destroy(): void {
    if (this.animationFrame !== 0) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = 0
    this.removeListeners?.()
    this.removeListeners = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (this.app !== null) {
      const canvas = this.app.canvas
      this.app.destroy(true, { children: true, texture: true })
      canvas.remove()
      this.app = null
    }
    this.frame = null
    this.drawnFrame = null
  }

  // ---- input ----------------------------------------------------------------------------

  private attachInput(canvas: HTMLCanvasElement): void {
    const local = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const down = (event: PointerEvent): void => {
      const p = local(event)
      canvas.setPointerCapture?.(event.pointerId)
      this.gestures.pointerDown(event.pointerId, p.x, p.y, event.pointerType === 'touch')
    }
    const move = (event: PointerEvent): void => {
      const p = local(event)
      this.handle(this.gestures.pointerMove(event.pointerId, p.x, p.y))
    }
    const up = (event: PointerEvent): void => {
      const p = local(event)
      this.handle(this.gestures.pointerUp(event.pointerId, p.x, p.y))
    }
    const cancel = (event: PointerEvent): void => this.gestures.pointerCancel(event.pointerId)
    const wheel = (event: WheelEvent): void => {
      event.preventDefault()
      const p = local(event)
      this.handle(this.gestures.wheel(event.deltaY, p.x, p.y))
    }
    const context = (event: Event): void => event.preventDefault()
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('contextmenu', context)
    this.removeListeners = () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('contextmenu', context)
    }
  }

  private handle(actions: readonly GestureAction[]): void {
    for (const action of actions) {
      if (action.type === 'pan') {
        this.userMoved = true
        this.camera.panBy(action.dx, action.dy)
        if (this.follow) {
          this.follow = false
          this.callbacks?.onFollowChange?.(false)
        }
      } else if (action.type === 'zoom') {
        this.userMoved = true
        this.camera.zoomAt(action.factor, action.x, action.y)
      } else if (this.frame !== null) {
        const world = this.camera.screenToWorld(action.x, action.y)
        const id = pickOrganism(
          this.frame.organisms,
          world.x,
          world.y,
          this.camera.state.zoom,
          action.touch ? 18 : 8
        )
        this.callbacks?.onSelect(id)
      }
      this.cameraDirty = true
    }
    // Draw straight away so dragging feels immediate even while the simulation is paused.
    if (this.frame !== null) this.render(this.frame)
  }

  // ---- drawing --------------------------------------------------------------------------

  private resize(): void {
    if (this.app === null || this.host === null) return
    const width = Math.max(1, this.host.clientWidth)
    const height = Math.max(1, this.host.clientHeight)
    this.app.renderer.resize(width, height)
    this.camera.setViewport(width, height)
    // The first size fits the world; so does every later one while the viewer has not taken the
    // camera (panned, zoomed or followed), so a docked panel opening or a window resize keeps the
    // whole world in view instead of leaving it off-centre.
    if (!this.fitted || (!this.userMoved && !this.follow)) {
      this.camera.fit()
      this.fitted = true
    }
    this.cameraDirty = true
    if (this.frame !== null) this.render(this.frame)
  }

  private applyCamera(): void {
    const { x, y, zoom } = this.camera.state
    const { width, height } = this.camera.viewport
    this.world.position.set(width / 2 - x * zoom, height / 2 - y * zoom)
    this.world.scale.set(zoom)
  }

  private drawBackground(): void {
    this.fieldG.clear()
    const clusters = this.clusters
    if (clusters === null) {
      this.fieldG.rect(0, 0, this.worldWidth, this.worldHeight).fill(FIELD)
      return
    }
    // Each cluster is a disc with a faint ring; everything else is void.
    for (const cluster of clusters.clusters) {
      this.fieldG.circle(cluster.x, cluster.y, clusters.radius).fill(FIELD)
    }
    for (const cluster of clusters.clusters) {
      this.fieldG
        .circle(cluster.x, cluster.y, clusters.radius)
        .stroke({ width: 1, color: LINE, alpha: 0.12, pixelLine: true })
    }
  }

  private drawGrid(): void {
    this.gridG.clear()
    const clusters = this.clusters
    if (clusters !== null) {
      // A grid that runs well past the clusters, so the world reads as unbounded.
      const { minX, minY, maxX, maxY } = clusters.bounds
      const left =
        Math.floor((minX - CLUSTER_GRID_PAD) / CLUSTER_GRID_SPACING) * CLUSTER_GRID_SPACING
      const top =
        Math.floor((minY - CLUSTER_GRID_PAD) / CLUSTER_GRID_SPACING) * CLUSTER_GRID_SPACING
      const right = maxX + CLUSTER_GRID_PAD
      const bottom = maxY + CLUSTER_GRID_PAD
      for (let x = left; x <= right; x += CLUSTER_GRID_SPACING)
        this.gridG.moveTo(x, top).lineTo(x, bottom)
      for (let y = top; y <= bottom; y += CLUSTER_GRID_SPACING)
        this.gridG.moveTo(left, y).lineTo(right, y)
      this.gridG.stroke({ width: 1, color: LINE, alpha: 0.04, pixelLine: true })
      return
    }
    for (let x = 0; x <= this.worldWidth; x += GRID_SPACING) {
      this.gridG.moveTo(x, 0).lineTo(x, this.worldHeight)
    }
    for (let y = 0; y <= this.worldHeight; y += GRID_SPACING) {
      this.gridG.moveTo(0, y).lineTo(this.worldWidth, y)
    }
    this.gridG.stroke({ width: 1, color: LINE, alpha: 0.06, pixelLine: true })
    this.gridG
      .rect(0, 0, this.worldWidth, this.worldHeight)
      .stroke({ width: 1, color: LINE, alpha: 0.12, pixelLine: true })
  }

  /** Paints each cluster's biome patches (nearest patch wins) inside its circle; outside it stays clear. */
  private buildClusterTerrain(clusters: ClusterLayoutSnapshot | null): void {
    for (const child of this.clusterTerrain.removeChildren()) child.destroy({ texture: true })
    if (clusters === null) return
    const palette = REGION_TYPES.map((type) => hexToNumber(REGION_COLORS[type]))
    const size = CLUSTER_TEXTURE
    const diameter = clusters.radius * 2
    for (const cluster of clusters.clusters) {
      if (cluster.patches.length === 0) continue
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (context === null) continue
      const image = context.createImageData(size, size)
      for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
          const dx = ((column + 0.5) / size) * diameter - clusters.radius
          const dy = ((row + 0.5) / size) * diameter - clusters.radius
          const edge = clusters.radius - Math.sqrt(dx * dx + dy * dy)
          if (edge < 0) continue
          let best = 0
          let bestDistance = Infinity
          for (let i = 0; i < cluster.patches.length; i++) {
            const patch = cluster.patches[i] as { x: number; y: number }
            const px = patch.x - cluster.x - dx
            const py = patch.y - cluster.y - dy
            const distance = px * px + py * py
            if (distance < bestDistance) {
              bestDistance = distance
              best = i
            }
          }
          const type = (cluster.patches[best] as { type: (typeof REGION_TYPES)[number] }).type
          const rgb = palette[REGION_TYPES.indexOf(type)] as number
          const at = (row * size + column) * 4
          image.data[at] = (rgb >> 16) & 255
          image.data[at + 1] = (rgb >> 8) & 255
          image.data[at + 2] = rgb & 255
          // A soft edge (about two texture pixels) so the circle does not look stair-stepped.
          image.data[at + 3] = Math.round(255 * Math.min(1, edge / ((diameter / size) * 2)))
        }
      }
      context.putImageData(image, 0, 0)
      const sprite = new Sprite(Texture.from(canvas))
      sprite.position.set(cluster.x - clusters.radius, cluster.y - clusters.radius)
      sprite.width = diameter
      sprite.height = diameter
      this.clusterTerrain.addChild(sprite)
    }
    this.clusterTerrain.visible = this.layers.terrain
  }

  private buildTerrain(terrain: TerrainSnapshot | null): void {
    if (terrain === null) {
      this.terrainSprite.visible = false
      this.terrainSprite.texture = Texture.EMPTY
      return
    }
    const size = terrain.gridSize
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (context === null) return
    const image = context.createImageData(size, size)
    const palette = REGION_TYPES.map((type) => hexToNumber(REGION_COLORS[type]))
    for (let i = 0; i < terrain.cells.length; i++) {
      const region = terrain.regions[terrain.cells[i] as number]
      const rgb = palette[REGION_TYPES.indexOf(region?.type ?? 'meadow')] as number
      image.data[i * 4] = (rgb >> 16) & 255
      image.data[i * 4 + 1] = (rgb >> 8) & 255
      image.data[i * 4 + 2] = rgb & 255
      image.data[i * 4 + 3] = 255
    }
    context.putImageData(image, 0, 0)
    this.terrainSprite.texture = Texture.from(canvas)
    // Cells stay crisp squares when scaled up: a smoothed blend would read as a gradient.
    this.terrainSprite.texture.source.scaleMode = 'nearest'
    this.terrainSprite.width = terrain.width
    this.terrainSprite.height = terrain.height
    this.terrainSprite.visible = this.layers.terrain
  }

  private makeDotTexture(app: Application): Texture {
    const g = new Graphics().circle(32, 32, 32).fill(0xffffff)
    return app.renderer.generateTexture(g)
  }

  private numberOf(hex: string): number {
    let value = this.colorCache.get(hex)
    if (value === undefined) {
      value = hexToNumber(hex)
      this.colorCache.set(hex, value)
    }
    return value
  }

  private selectedOrganism(): RenderSnapshot['organisms'][number] | undefined {
    const frame = this.frame
    if (frame === null || frame.selectedEntityId === null) return undefined
    return frame.organisms.find((o) => o.id === frame.selectedEntityId)
  }

  private sync(host: PoolHost, count: number, texture: Texture | null): void {
    while (host.pool.length < count) {
      const sprite = new Sprite(texture ?? Texture.EMPTY)
      sprite.anchor.set(0.5)
      host.container.addChild(sprite)
      host.pool.push(sprite)
    }
    for (let i = 0; i < host.pool.length; i++) (host.pool[i] as Sprite).visible = i < count
  }

  /** The graphics of a creature, built the first time it is seen and again only if its colors change. */
  private bodyOf(o: RenderOrganism): BodyDrawing {
    const key = `${Math.round(o.hue)}|${o.accentColor}|${o.pattern}`
    let drawing = this.bodyDrawings.get(o.id)
    if (drawing === undefined) {
      const container = new Container()
      const graphics = new Graphics()
      container.addChild(graphics)
      this.bodies.container.addChild(container)
      drawing = {
        container,
        graphics,
        key: '',
        seen: 0,
        back: null,
        front: null,
        organism: null,
        partsStamp: -1
      }
      this.bodyDrawings.set(o.id, drawing)
    }
    drawing.seen = this.sceneStamp
    drawing.organism = o
    if (drawing.key !== key) {
      drawing.key = key
      paintBodyArt(drawing.graphics, o, paletteOf(o.hue))
    }
    return drawing
  }

  /** Gives a creature the layers its parts are drawn into, behind and over its body. */
  private ensurePartLayers(drawing: BodyDrawing): void {
    if (drawing.back !== null) return
    drawing.back = new Graphics()
    drawing.front = new Graphics()
    drawing.container.addChildAt(drawing.back, 0)
    drawing.container.addChild(drawing.front)
  }

  /** Removes the graphics of creatures that are no longer in the frame. */
  private dropGoneBodies(): void {
    for (const [id, drawing] of this.bodyDrawings) {
      if (drawing.seen === this.sceneStamp) continue
      drawing.container.destroy({ children: true })
      this.bodyDrawings.delete(id)
    }
  }

  private updateScene(frame: RenderSnapshot): void {
    this.sceneStamp++
    this.organismCount = frame.organisms.length
    this.resourceCount = frame.resources.length

    const zoom = this.camera.state.zoom
    this.sceneZoom = zoom
    // resources
    this.sync(this.resources, frame.resources.length, this.dotTexture)
    for (let i = 0; i < frame.resources.length; i++) {
      const r = frame.resources[i]!
      const sprite = this.resources.pool[i] as Sprite
      sprite.position.set(r.x, r.y)
      // A plant's hub is drawn larger than its nodes (ADR 0021); free food is as before.
      const part = r.slot === 0 ? HUB_SCALE : r.slot !== undefined && r.slot < 255 ? NODE_SCALE : 1
      sprite.scale.set(
        Math.max(r.radius * 2 * part * (0.4 + 0.6 * r.remainingRatio), (MIN_FOOD_PX * 2) / zoom) /
          64
      )
      sprite.tint = this.numberOf(resourceColor(r.kind))
      sprite.alpha = 0.95
    }

    // organisms: flat bodies
    for (let i = 0; i < frame.organisms.length; i++) {
      const o = frame.organisms[i]!
      // Far out, a creature is drawn at least MIN_ORGANISM_PX wide; close up the boost is 1.
      const boost = Math.max(1, MIN_ORGANISM_PX / (zoom * o.radius))
      const drawing = this.bodyOf(o)
      if (this.partsVisible && o.parts.length > 0) this.ensurePartLayers(drawing)
      if (drawing.back !== null) drawing.back.visible = this.partsVisible
      if (drawing.front !== null) drawing.front.visible = this.partsVisible
      const body = drawing.container
      body.position.set(o.x, o.y)
      body.rotation = o.rotation
      body.scale.set((o.lifeStage === 'juvenile' ? 0.75 : 1) * boost)
      body.alpha = (0.68 + 0.32 * o.energyRatio) * (o.lifeStage === 'senescent' ? 0.85 : 1)
    }
    this.dropGoneBodies()

    this.drawHazards(frame)
    this.drawStems(frame)
    this.drawTrails(frame)
    this.drawSelection(frame)

    if (this.follow) {
      const selected = this.selectedOrganism()
      if (selected !== undefined) {
        this.camera.focus(selected.x, selected.y)
        this.cameraDirty = true
      }
    }
    if (this.debugText !== null && this.layers.debug) {
      const { zoom } = this.camera.state
      this.debugText.text = [
        `tick ${frame.tick}  organisms ${frame.organisms.length}  food ${frame.resources.length}`,
        `zoom ${zoom.toFixed(2)}  scene ${this.lastMs.toFixed(1)} ms  frames ${this.frameCount}`
      ].join('\n')
    }
  }

  /**
   * Plants (ADR 0021): one flat 1 px line from a hub to each of its nodes, and a small ring where a
   * node is growing back, as large as the share of it already grown. Flat, no fill, no glow.
   */
  private drawStems(frame: RenderSnapshot): void {
    this.stemG.clear()
    const hubs = new Map<number, RenderResource>()
    for (const r of frame.resources) if (r.slot === 0) hubs.set(r.id, r)
    if (hubs.size === 0) return
    const zoom = this.camera.state.zoom
    for (const r of frame.resources) {
      if (r.slot === undefined || r.slot < 1 || r.slot === 255) continue
      const hub = hubs.get(r.parent ?? 0)
      if (hub === undefined) continue
      this.stemG
        .moveTo(hub.x, hub.y)
        .lineTo(r.x, r.y)
        .stroke({ width: 1, color: 0x7aa588, alpha: 0.9, pixelLine: true })
    }
    for (const hub of hubs.values()) {
      const bud = hub.bud
      if (bud === null || bud === undefined) continue
      this.stemG
        .moveTo(hub.x, hub.y)
        .lineTo(bud.x, bud.y)
        .stroke({ width: 1, color: 0x7aa588, alpha: 0.4, pixelLine: true })
      const radius = Math.max(NODE_SCALE * hub.radius * bud.progress, 0.8 / zoom)
      this.stemG.circle(bud.x, bud.y, radius).stroke({
        width: 1,
        color: this.numberOf(resourceColor(hub.kind)),
        alpha: 0.7,
        pixelLine: true
      })
    }
  }

  /**
   * Draws the obstacle field once: a flat filled circle with a thin edge per circle, in the colour of
   * its kind. A ridge or a cluster is several overlapping circles, so it reads as one shape.
   */
  private drawObstacles(obstacles: readonly ObstacleSnapshot[]): void {
    this.obstacleG.clear()
    for (const o of obstacles) {
      const colors = OBSTACLE_COLORS[o.kind]
      this.obstacleG
        .circle(o.x, o.y, o.radius)
        .fill({ color: hexToNumber(colors.fill), alpha: colors.alpha })
        .stroke({
          width: 1,
          color: hexToNumber(colors.edge),
          alpha: Math.min(1, colors.alpha + 0.3),
          pixelLine: true
        })
    }
  }

  private drawHazards(frame: RenderSnapshot): void {
    this.hazardG.clear()
    for (const hazard of frame.hazards) {
      const storm = hazard.kind === 'storm'
      this.hazardG
        .circle(hazard.x, hazard.y, hazard.radius)
        .fill({ color: storm ? 0x6aa8ff : 0xff5a3c, alpha: storm ? 0.14 : 0.2 })
        .stroke({
          width: 1,
          color: storm ? 0x8fbcff : 0xff7a5c,
          alpha: 0.6,
          pixelLine: true
        })
    }
  }

  private drawTrails(frame: RenderSnapshot): void {
    this.trailG.clear()
    if (!this.layers.trails) return
    for (const organism of frame.organisms) {
      const points = this.trails.pointsOf(organism.id)
      if (points.length < 2) continue
      this.trailG.moveTo((points[0] as { x: number }).x, (points[0] as { y: number }).y)
      for (let i = 1; i < points.length; i++) {
        const p = points[i] as { x: number; y: number }
        this.trailG.lineTo(p.x, p.y)
      }
      this.trailG.stroke({
        width: 1,
        color: this.numberOf(organism.speciesColor),
        alpha: 0.45,
        pixelLine: true
      })
    }
  }

  private drawSelection(frame: RenderSnapshot): void {
    this.selectionG.clear()
    const zoom = this.camera.state.zoom
    for (const effect of frame.effects) {
      const t = (frame.tick - effect.tick) / EFFECT_TICKS
      if (t < 0 || t >= 1) continue
      this.selectionG
        .circle(effect.x, effect.y, 3 + t * 16)
        .stroke({ width: 1.5 / zoom, color: EFFECT_COLORS[effect.kind], alpha: 1 - t })
    }
    const selected = this.selectedOrganism()
    if (selected !== undefined) {
      this.selectionG
        .circle(selected.x, selected.y, selected.radius + 5 / zoom)
        .stroke({ width: 2 / zoom, color: 0xffffff, alpha: 0.95 })
    }
  }
}
