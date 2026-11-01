import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { DEFAULT_RENDER_LAYERS, REGION_TYPES } from '@evo/contracts'
import type { RenderLayers, RenderSnapshot, TerrainSnapshot } from '@evo/contracts'
import { Camera } from '../camera'
import { REGION_COLORS, hexToNumber, resourceColor } from '../colors'
import { GestureTracker } from '../gestures'
import type { GestureAction } from '../gestures'
import { pickOrganism } from '../pick'
import type { Renderer, RendererCallbacks, RendererStats } from '../renderer'
import { TrailBuffer } from '../trails'

/** How long (in ticks) a birth, death or damage marker stays visible. */
const EFFECT_TICKS = 14
const GRID_SPACING = 50
const BACKGROUND = 0x070b14
const FIELD = 0x0e1524

const EFFECT_COLORS = { birth: 0x7dffb0, death: 0xff6b6b, damage: 0xffb347 } as const

type PoolHost = { container: Container; pool: Sprite[] }

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
  private cameraDirty = true
  private fitted = false
  private worldWidth = 500
  private worldHeight = 500

  private world = new Container()
  private gridG = new Graphics()
  private fieldG = new Graphics()
  private terrainSprite = new Sprite()
  private hazardG = new Graphics()
  private trailG = new Graphics()
  private selectionG = new Graphics()
  private resources: PoolHost = { container: new Container(), pool: [] }
  private shadows: PoolHost = { container: new Container(), pool: [] }
  private bodies: PoolHost = { container: new Container(), pool: [] }
  private debugText: Text | null = null
  private dotTexture: Texture | null = null
  private bodyTexture: Texture | null = null
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
    this.bodyTexture = this.makeBodyTexture(app)

    this.terrainSprite.visible = false
    this.world.addChild(
      this.fieldG,
      this.terrainSprite,
      this.gridG,
      this.hazardG,
      this.resources.container,
      this.shadows.container,
      this.bodies.container,
      this.trailG,
      this.selectionG
    )
    app.stage.addChild(this.world)
    this.debugText = new Text({
      text: '',
      style: { fill: 0xa9b8d8, fontSize: 12, fontFamily: 'ui-monospace, monospace' }
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

  setWorld(width: number, height: number, terrain: TerrainSnapshot | null): void {
    this.worldWidth = width
    this.worldHeight = height
    this.camera.setWorld(width, height)
    this.trails.clear()
    this.frame = null
    this.drawnFrame = null
    this.drawBackground()
    this.drawGrid()
    this.buildTerrain(terrain)
    this.camera.fit()
    this.fitted = true
    this.follow = false
    this.cameraDirty = true
    this.sceneDirty = true
  }

  render(frame: RenderSnapshot): void {
    this.frame = frame
    if (frame === this.drawnFrame && !this.cameraDirty && !this.sceneDirty) return
    const started = performance.now()
    if (frame !== this.drawnFrame || this.sceneDirty) {
      if (this.layers.trails) this.trails.record(frame.organisms)
      const sceneStarted = performance.now()
      this.updateScene(frame)
      this.lastSceneMs = performance.now() - sceneStarted
      this.drawnFrame = frame
      this.sceneDirty = false
    }
    this.applyCamera()
    this.app?.render()
    this.cameraDirty = false
    this.frameCount++
    this.lastMs = performance.now() - started
  }

  setLayers(layers: RenderLayers): void {
    this.layers = layers
    if (!layers.trails) this.trails.clear()
    this.gridG.visible = layers.grid
    this.terrainSprite.visible = layers.terrain && this.terrainSprite.texture !== Texture.EMPTY
    this.hazardG.visible = layers.hazards
    this.resources.container.visible = layers.resources
    this.shadows.container.visible = layers.shadows
    this.bodies.container.visible = layers.organisms
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
    this.cameraDirty = true
  }

  destroy(): void {
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
        this.camera.panBy(action.dx, action.dy)
        if (this.follow) {
          this.follow = false
          this.callbacks?.onFollowChange?.(false)
        }
      } else if (action.type === 'zoom') {
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
    if (!this.fitted) {
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
    this.fieldG.rect(0, 0, this.worldWidth, this.worldHeight).fill(FIELD)
  }

  private drawGrid(): void {
    this.gridG.clear()
    for (let x = 0; x <= this.worldWidth; x += GRID_SPACING) {
      this.gridG.moveTo(x, 0).lineTo(x, this.worldHeight)
    }
    for (let y = 0; y <= this.worldHeight; y += GRID_SPACING) {
      this.gridG.moveTo(0, y).lineTo(this.worldWidth, y)
    }
    this.gridG.stroke({ width: 1, color: 0x7f93bf, alpha: 0.08, pixelLine: true })
    this.gridG
      .rect(0, 0, this.worldWidth, this.worldHeight)
      .stroke({ width: 1, color: 0x7f93bf, alpha: 0.35, pixelLine: true })
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
    this.terrainSprite.width = terrain.width
    this.terrainSprite.height = terrain.height
    this.terrainSprite.visible = this.layers.terrain
  }

  private makeDotTexture(app: Application): Texture {
    const g = new Graphics().circle(32, 32, 32).fill(0xffffff)
    return app.renderer.generateTexture(g)
  }

  private makeBodyTexture(app: Application): Texture {
    // A white disc with a dark wedge at the front so the heading is visible; tinting recolors the
    // disc and leaves the wedge dark.
    const g = new Graphics()
      .circle(32, 32, 32)
      .fill(0xffffff)
      .poly([40, 18, 62, 32, 40, 46])
      .fill({ color: 0x000000, alpha: 0.5 })
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

  private updateScene(frame: RenderSnapshot): void {
    this.organismCount = frame.organisms.length
    this.resourceCount = frame.resources.length

    // resources
    this.sync(this.resources, frame.resources.length, this.dotTexture)
    for (let i = 0; i < frame.resources.length; i++) {
      const r = frame.resources[i]!
      const sprite = this.resources.pool[i] as Sprite
      sprite.position.set(r.x, r.y)
      sprite.scale.set((r.radius * 2 * (0.6 + 0.4 * r.remainingRatio)) / 64)
      sprite.tint = this.numberOf(resourceColor(r.kind))
      sprite.alpha = 0.95
    }

    // organisms and their shadows
    this.sync(this.shadows, frame.organisms.length, this.dotTexture)
    this.sync(this.bodies, frame.organisms.length, this.bodyTexture)
    for (let i = 0; i < frame.organisms.length; i++) {
      const o = frame.organisms[i]!
      const scale = (o.radius * 2 * (o.lifeStage === 'juvenile' ? 0.75 : 1)) / 64
      const shadow = this.shadows.pool[i] as Sprite
      shadow.position.set(o.x + o.radius * 0.25, o.y + o.radius * 0.35)
      shadow.scale.set(scale * 1.05)
      shadow.tint = 0x000000
      shadow.alpha = 0.35
      const body = this.bodies.pool[i] as Sprite
      body.position.set(o.x, o.y)
      body.rotation = o.rotation
      body.scale.set(scale)
      body.tint = this.numberOf(o.speciesColor)
      body.alpha = (0.68 + 0.32 * o.energyRatio) * (o.lifeStage === 'senescent' ? 0.85 : 1)
    }

    this.drawHazards(frame)
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
