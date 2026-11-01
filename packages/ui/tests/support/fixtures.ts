import { DEFAULT_RENDER_LAYERS } from '@evo/contracts'
import type { InspectorView, SimulationControls, ViewState } from '@evo/contracts'

export function view(overrides: Partial<ViewState> = {}): ViewState {
  return {
    status: 'running',
    seed: 7,
    preset: 'balanced',
    presets: [
      { name: 'balanced', label: 'Balanced', description: 'The default world.' },
      { name: 'harsh', label: 'Harsh', description: 'Scarce food.' }
    ],
    speed: 25,
    achievedTicksPerSecond: 248.6,
    tick: 12_345,
    time: 1234.5,
    season: 'autumn',
    population: 31,
    resources: 120,
    extinctionTick: null,
    metrics: {
      organismsBorn: 400,
      deathsByStarvation: 200,
      deathsByAge: 100,
      deathsByDamage: 50,
      resourcesSpawned: 0,
      resourcesConsumed: 0,
      reproductionAttempts: 1000,
      reproductionSuccesses: 250,
      reproductionFailures: 750,
      energyConsumed: 0,
      energyWasted: 0,
      damageTaken: 0
    },
    populationHistory: [
      { tick: 0, count: 20 },
      { tick: 50, count: 24 },
      { tick: 100, count: 31 }
    ],
    species: [
      {
        id: 0,
        color: '#5ad1ff',
        members: 20,
        createdAtTick: 0,
        extinctAtTick: null,
        ancestorId: null,
        history: [10, 15, 20]
      },
      {
        id: 3,
        color: '#ff7ab8',
        members: 11,
        createdAtTick: 900,
        extinctAtTick: null,
        ancestorId: 0,
        history: [1, 4, 11]
      }
    ],
    activeSpecies: 2,
    extinctSpecies: 1,
    layers: DEFAULT_RENDER_LAYERS,
    following: false,
    selected: null,
    selectedId: null,
    ...overrides
  }
}

export function inspector(overrides: Partial<InspectorView> = {}): InspectorView {
  return {
    id: 42,
    speciesId: 3,
    speciesColor: '#ff7ab8',
    overview: {
      lifeStage: 'mature',
      age: 120,
      maxAge: 600,
      energy: 55,
      maxEnergy: 100,
      health: 80,
      maxHealth: 100,
      x: 100.4,
      y: 200.6,
      cooldown: 0
    },
    genome: [
      { group: 'physical', name: 'radius', value: 5.2 },
      { group: 'physical', name: 'maxSpeed', value: 20 },
      { group: 'sensory', name: 'sensorRadius', value: 60 }
    ],
    brain: {
      inputs: [
        { label: 'energy', value: 0.55 },
        { label: 'foodPresent', value: 1 }
      ],
      outputs: [{ label: 'thrust', value: 0.5 }],
      actions: [
        { label: 'thrust', value: 0.5 },
        { label: 'turn', value: -0.25 }
      ],
      value: 0.1234,
      reward: [{ label: 'feeding', value: 0.2 }],
      rewardTotal: 0.2,
      updates: 1500,
      weightChange: 3.21
    },
    lineage: {
      parentIds: [10, 11],
      genomeId: 99,
      ancestorGenomes: 120,
      descendantGenomes: 3,
      speciesAncestry: [0]
    },
    environment: {
      regionType: 'forest',
      season: 'autumn',
      migration: {
        homeRegion: 1,
        homeType: 'meadow',
        currentRegion: 4,
        currentType: 'forest',
        crossings: 3,
        distanceOutsideHome: 210.4,
        migrated: true
      }
    },
    ...overrides
  }
}

/** Controls that record what was called. */
export function recorder(): { controls: SimulationControls; calls: string[] } {
  const calls: string[] = []
  const controls: SimulationControls = {
    start: () => calls.push('start'),
    pause: () => calls.push('pause'),
    toggle: () => calls.push('toggle'),
    step: (ticks) => calls.push(`step:${ticks ?? 1}`),
    reset: () => calls.push('reset'),
    newWorld: (seed) => calls.push(`newWorld:${seed ?? ''}`),
    setSpeed: (speed) => calls.push(`speed:${speed}`),
    setPreset: (name) => calls.push(`preset:${name}`),
    select: (id) => calls.push(`select:${id}`),
    setLayer: (layer, on) => calls.push(`layer:${layer}:${on}`),
    focusSelected: () => calls.push('focus'),
    toggleFollow: () => calls.push('follow'),
    fitWorld: () => calls.push('fit')
  }
  return { controls, calls }
}
