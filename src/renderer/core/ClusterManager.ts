/**
 * ClusterManager - Manages territorial food clusters with geometric positioning
 */

export interface Cluster {
  id: number
  position: { x: number; y: number }
  radius: number
}

export class ClusterManager {
  private clusters: Cluster[] = []
  private clusterCount: number
  private clusterRadius: number
  private clusterSpacing: number

  constructor(clusterCount: number, clusterRadius: number, clusterSpacing: number) {
    this.clusterCount = clusterCount
    this.clusterRadius = clusterRadius
    this.clusterSpacing = clusterSpacing
    this.generateClusters()
  }

  private generateClusters(): void {
    this.clusters = []

    if (this.clusterCount === 1) {
      // Single cluster at origin
      this.clusters.push({
        id: 0,
        position: { x: 0, y: 0 },
        radius: this.clusterRadius
      })
    } else if (this.clusterCount === 2) {
      // Two clusters on opposite sides
      this.clusters.push({
        id: 0,
        position: { x: -this.clusterSpacing / 2, y: 0 },
        radius: this.clusterRadius
      })
      this.clusters.push({
        id: 1,
        position: { x: this.clusterSpacing / 2, y: 0 },
        radius: this.clusterRadius
      })
    } else {
      // N clusters in regular polygon pattern
      // Use clusterSpacing as the distance between cluster centers
      const polygonRadius = this.clusterSpacing / (2 * Math.sin(Math.PI / this.clusterCount))
      
      for (let i = 0; i < this.clusterCount; i++) {
        const angle = (i * 2 * Math.PI) / this.clusterCount
        const x = Math.cos(angle) * polygonRadius
        const y = Math.sin(angle) * polygonRadius

        this.clusters.push({
          id: i,
          position: { x, y },
          radius: this.clusterRadius
        })
      }
    }
  }

  public getClusters(): Cluster[] {
    return this.clusters
  }

  public getCluster(id: number): Cluster | undefined {
    return this.clusters.find(c => c.id === id)
  }

  public getRandomPositionInCluster(clusterId: number): { x: number; y: number } | null {
    const cluster = this.getCluster(clusterId)
    if (!cluster) return null

    // Random position within cluster radius
    const angle = Math.random() * Math.PI * 2
    const distance = Math.random() * cluster.radius
    
    return {
      x: cluster.position.x + Math.cos(angle) * distance,
      y: cluster.position.y + Math.sin(angle) * distance
    }
  }

  public renderClusters(context: CanvasRenderingContext2D): void {
    for (const cluster of this.clusters) {
      // Draw cluster boundary (subtle)
      context.beginPath()
      context.arc(cluster.position.x, cluster.position.y, cluster.radius, 0, 2 * Math.PI)
      context.strokeStyle = '#ffffff'
      context.globalAlpha = 0.15
      context.lineWidth = 2
      context.setLineDash([10, 10])
      context.stroke()
      context.setLineDash([])
      context.globalAlpha = 1.0

      // Draw cluster center marker
      context.beginPath()
      context.arc(cluster.position.x, cluster.position.y, 5, 0, 2 * Math.PI)
      context.fillStyle = '#ffffff'
      context.globalAlpha = 0.3
      context.fill()
      context.globalAlpha = 1.0
    }
  }
}
