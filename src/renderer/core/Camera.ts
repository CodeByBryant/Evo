/**
 * Camera system for infinite scrollable world with pan and zoom
 */

export class Camera {
  public x: number = 0
  public y: number = 0
  public zoom: number = 1
  private isDragging: boolean = false
  private lastMouseX: number = 0
  private lastMouseY: number = 0

  constructor() {
    this.x = 0
    this.y = 0
    this.zoom = 1
  }

  public startDrag(mouseX: number, mouseY: number): void {
    this.isDragging = true
    this.lastMouseX = mouseX
    this.lastMouseY = mouseY
  }

  public drag(mouseX: number, mouseY: number): void {
    if (this.isDragging) {
      const dx = mouseX - this.lastMouseX
      const dy = mouseY - this.lastMouseY
      this.x -= dx / this.zoom
      this.y -= dy / this.zoom
      this.lastMouseX = mouseX
      this.lastMouseY = mouseY
    }
  }

  public stopDrag(): void {
    this.isDragging = false
  }

  public zoomAt(
    mouseX: number,
    mouseY: number,
    delta: number,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    const zoomFactor = delta > 0 ? 1.1 : 0.9
    const newZoom = Math.max(0.1, Math.min(5, this.zoom * zoomFactor))

    // Zoom towards mouse position
    const worldX = (mouseX - canvasWidth / 2) / this.zoom + this.x
    const worldY = (mouseY - canvasHeight / 2) / this.zoom + this.y

    this.zoom = newZoom

    this.x = worldX - (mouseX - canvasWidth / 2) / this.zoom
    this.y = worldY - (mouseY - canvasHeight / 2) / this.zoom
  }

  public applyTransform(
    context: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    context.translate(canvasWidth / 2, canvasHeight / 2)
    context.scale(this.zoom, this.zoom)
    context.translate(-this.x, -this.y)
  }

  public screenToWorld(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number
  ): { x: number; y: number } {
    return {
      x: (screenX - canvasWidth / 2) / this.zoom + this.x,
      y: (screenY - canvasHeight / 2) / this.zoom + this.y
    }
  }

  public worldToScreen(
    worldX: number,
    worldY: number,
    canvasWidth: number,
    canvasHeight: number
  ): { x: number; y: number } {
    return {
      x: (worldX - this.x) * this.zoom + canvasWidth / 2,
      y: (worldY - this.y) * this.zoom + canvasHeight / 2
    }
  }
}
