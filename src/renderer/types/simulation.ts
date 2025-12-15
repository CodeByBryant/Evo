export interface GeneticTraits {
  size: number
  movementSpeed: number
  acceleration: number
  turnRate: number
  drag: number
  sensorRayCount: number
  sensorRayLength: number
  sensorPrecision: number
  fieldOfView: number
  colorVision: boolean
  energyEfficiency: number
  digestionRate: number
  maxEnergyCapacity: number
  mutationRate: number
  reproductionThreshold: number
  offspringCount: number
  learningRate: number
  memoryNeurons: number
  aggression: number
  hue: number
  bodyShape: number
}

export interface TraitRanges {
  size: { min: number; max: number; default: number }
  movementSpeed: { min: number; max: number; default: number }
  acceleration: { min: number; max: number; default: number }
  turnRate: { min: number; max: number; default: number }
  drag: { min: number; max: number; default: number }
  sensorRayCount: { min: number; max: number; default: number }
  sensorRayLength: { min: number; max: number; default: number }
  sensorPrecision: { min: number; max: number; default: number }
  fieldOfView: { min: number; max: number; default: number }
  colorVision: { probability: number }
  energyEfficiency: { min: number; max: number; default: number }
  digestionRate: { min: number; max: number; default: number }
  maxEnergyCapacity: { min: number; max: number; default: number }
  mutationRate: { min: number; max: number; default: number }
  reproductionThreshold: { min: number; max: number; default: number }
  offspringCount: { min: number; max: number; default: number }
  learningRate: { min: number; max: number; default: number }
  memoryNeurons: { min: number; max: number; default: number }
  aggression: { min: number; max: number; default: number }
  hue: { min: number; max: number; default: number }
  bodyShape: { min: number; max: number; default: number }
}

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
  ClusterSettings: {
    ClusterCount: number
    ClusterRadius: number
    ClusterSpacing: number
  }
  GeneticTraits?: TraitRanges
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
