export type HeatmapType = 'births' | 'deaths' | 'activity' | 'all'

interface HeatmapCell {
  births: number
  deaths: number
  activity: number
}

export class HeatmapManager {
  private grid: Map<string, HeatmapCell>
  private cellSize: number
  private maxIntensity: number
  private decayRate: number
  public enabled: boolean
  public currentType: HeatmapType
  public opacity: number

  constructor(cellSize: number = 50) {
    this.grid = new Map()
    this.cellSize = cellSize
    this.maxIntensity = 100
    this.decayRate = 0.995
    this.enabled = false
    this.currentType = 'all'
    this.opacity = 0.4
  }

  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize)
    const cellY = Math.floor(y / this.cellSize)
    return `${cellX},${cellY}`
  }

  private getOrCreateCell(key: string): HeatmapCell {
    if (!this.grid.has(key)) {
      this.grid.set(key, { births: 0, deaths: 0, activity: 0 })
    }
    return this.grid.get(key)!
  }

  public recordBirth(x: number, y: number): void {
    const key = this.getCellKey(x, y)
    const cell = this.getOrCreateCell(key)
    cell.births = Math.min(this.maxIntensity, cell.births + 5)
  }

  public recordDeath(x: number, y: number): void {
    const key = this.getCellKey(x, y)
    const cell = this.getOrCreateCell(key)
    cell.deaths = Math.min(this.maxIntensity, cell.deaths + 5)
  }

  public recordActivity(x: number, y: number, intensity: number = 1): void {
    const key = this.getCellKey(x, y)
    const cell = this.getOrCreateCell(key)
    cell.activity = Math.min(this.maxIntensity, cell.activity + intensity * 0.1)
  }

  public update(): void {
    for (const [key, cell] of this.grid.entries()) {
      cell.births *= this.decayRate
      cell.deaths *= this.decayRate
      cell.activity *= this.decayRate
      
      if (cell.births < 0.1 && cell.deaths < 0.1 && cell.activity < 0.1) {
        this.grid.delete(key)
      }
    }
  }

  public render(
    context: CanvasRenderingContext2D, 
    camera: { x: number; y: number; zoom: number },
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (!this.enabled) return

    context.save()
    context.globalAlpha = this.opacity

    const viewLeft = camera.x - (canvasWidth / 2) / camera.zoom
    const viewRight = camera.x + (canvasWidth / 2) / camera.zoom
    const viewTop = camera.y - (canvasHeight / 2) / camera.zoom
    const viewBottom = camera.y + (canvasHeight / 2) / camera.zoom

    for (const [key, cell] of this.grid.entries()) {
      const [cellX, cellY] = key.split(',').map(Number)
      const worldX = cellX * this.cellSize
      const worldY = cellY * this.cellSize

      if (worldX + this.cellSize < viewLeft || worldX > viewRight ||
          worldY + this.cellSize < viewTop || worldY > viewBottom) {
        continue
      }

      let color: string | null = null
      let intensity = 0

      switch (this.currentType) {
        case 'births':
          intensity = cell.births / this.maxIntensity
          if (intensity > 0.01) {
            color = `rgba(74, 222, 128, ${intensity})`
          }
          break
        case 'deaths':
          intensity = cell.deaths / this.maxIntensity
          if (intensity > 0.01) {
            color = `rgba(248, 113, 113, ${intensity})`
          }
          break
        case 'activity':
          intensity = cell.activity / this.maxIntensity
          if (intensity > 0.01) {
            color = `rgba(96, 165, 250, ${intensity})`
          }
          break
        case 'all':
          const birthIntensity = cell.births / this.maxIntensity
          const deathIntensity = cell.deaths / this.maxIntensity
          const activityIntensity = cell.activity / this.maxIntensity
          
          const r = Math.min(255, Math.floor(deathIntensity * 248 + activityIntensity * 50))
          const g = Math.min(255, Math.floor(birthIntensity * 222 + activityIntensity * 100))
          const b = Math.min(255, Math.floor(activityIntensity * 250))
          intensity = Math.max(birthIntensity, deathIntensity, activityIntensity)
          
          if (intensity > 0.01) {
            color = `rgba(${r}, ${g}, ${b}, ${intensity * 0.7})`
          }
          break
      }

      if (color) {
        context.fillStyle = color
        context.fillRect(worldX, worldY, this.cellSize, this.cellSize)
      }
    }

    context.restore()
  }

  public clear(): void {
    this.grid.clear()
  }

  public toggle(): void {
    this.enabled = !this.enabled
  }

  public setType(type: HeatmapType): void {
    this.currentType = type
  }

  public cycleType(): void {
    const types: HeatmapType[] = ['all', 'births', 'deaths', 'activity']
    const currentIndex = types.indexOf(this.currentType)
    this.currentType = types[(currentIndex + 1) % types.length]
  }

  public getStats(): { births: number; deaths: number; activity: number } {
    let totalBirths = 0
    let totalDeaths = 0
    let totalActivity = 0

    for (const cell of this.grid.values()) {
      totalBirths += cell.births
      totalDeaths += cell.deaths
      totalActivity += cell.activity
    }

    return { births: totalBirths, deaths: totalDeaths, activity: totalActivity }
  }
}
