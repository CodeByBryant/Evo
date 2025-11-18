export interface SimulationConfig {
  AgentCount: number
  DefaultAgentSize: { width: number; height: number }
  EnableRotation: boolean
  MovementSpeed: number
  RotationSpeed: number
  Rendering: {
    FillColor: string
    StrokeWidth: number
  }
  Sensor: {
    RayCount: number
    RayLength: number
  }
  RenderSensor: boolean
  FoodSettings: {
    SpawnCount: number
    FoodColor: string
  }
}

export interface SimulationStats {
  agentCount: number
  foodCount: number
  fps: number
  running: boolean
}
