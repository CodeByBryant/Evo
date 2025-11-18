export interface SimulationConfig {
  AgentCount: number
  DefaultAgentSize: { width: number; height: number }
  EnableRotation: boolean
  MovementSpeed: number
  RotationSpeed: number
  Rendering: {
    FillColor: string
    StrokeColor: string
    StrokeWidth: number
    ActiveGlow: boolean
  }
  Sensor: {
    RayCount: number
    RayLength: number
    DetectFood: boolean
    DetectAgents: boolean
  }
  RenderSensor: boolean
  NeuralNetwork: {
    HiddenLayers: number[]
    ActivationFunction: string
    InitializationMethod: string
    MutationStrategy: string
  }
  FoodSettings: {
    SpawnCount: number
    FoodColor: string
    FoodRadius: number
    RespawnOnEat: boolean
  }
}

export interface SimulationStats {
  agentCount: number
  foodCount: number
  fps: number
  running: boolean
  generation?: number
  avgFitness?: number
  maxFitness?: number
  speciesCount?: number
}
