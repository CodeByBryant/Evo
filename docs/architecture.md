# Architecture Overview

This document provides a technical overview of Evo's architecture and codebase structure.

## Technology Stack

- **Frontend Framework**: React 19 with TypeScript
- **Build Tools**: Vite (web), electron-vite (desktop)
- **Desktop Runtime**: Electron
- **UI Components**: Bootstrap 5
- **Styling**: CSS with custom theming

## Project Structure

```
Evo/
├── src/
│   ├── main/                 # Electron main process
│   │   └── index.ts          # Main entry point for Electron
│   ├── preload/              # Electron preload scripts
│   └── renderer/             # React application (runs in browser/Electron renderer)
│       ├── App.tsx           # Root React component
│       ├── main.tsx          # React entry point
│       ├── components/       # React UI components
│       ├── core/             # Core simulation logic
│       │   ├── Agent.ts      # Agent class (AI creatures)
│       │   ├── NeuralNetwork.ts  # Neural network implementation
│       │   ├── EvolutionManager.ts  # Handles evolution/genetics
│       │   └── utilities/    # Helper utilities and configs
│       ├── hooks/            # Custom React hooks
│       ├── types/            # TypeScript type definitions
│       └── assets/           # Static assets (CSS, images)
├── build/                    # Build resources (icons, entitlements)
├── resources/                # Application resources
├── docs/                     # Documentation
└── .github/                  # GitHub configurations
    └── workflows/            # CI/CD workflows
```

## Core Components

### Simulation Engine

The simulation runs in a continuous loop, updating all agents and food entities each frame:

```
┌─────────────────────────────────────────────────┐
│                  Game Loop                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Update  │→ │ Physics │→ │ Render  │         │
│  │ Agents  │  │  Check  │  │  Frame  │         │
│  └─────────┘  └─────────┘  └─────────┘         │
└─────────────────────────────────────────────────┘
```

### Agent System

Each agent contains:

- **Neural Network**: Multi-layer perceptron for decision making
- **Sensors**: Raycasting system for environment perception
- **Genetic Information**: DNA that encodes traits and behaviors
- **State**: Position, velocity, energy, age, fitness

```typescript
interface Agent {
  id: string
  species: string
  position: { x: number; y: number }
  velocity: { x: number; y: number }
  energy: number
  age: number
  fitness: number
  neuralNetwork: NeuralNetwork
  genome: number[]
}
```

### Neural Network Architecture

Agents use a configurable multi-layer perceptron:

```
Input Layer         Hidden Layers         Output Layer
(Sensor Data)       (Configurable)        (Actions)
    ○                    ○                    ○ (Move Forward)
    ○ ───────────→       ○ ───────────→       ○ (Turn Left)
    ○                    ○                    ○ (Turn Right)
    ○                    ○                    ○ (Eat)
```

**Supported Activation Functions:**

- Swish
- ELU
- Leaky ReLU
- Tanh

### Evolution System

The evolution process follows a generational model:

1. **Evaluation**: Each agent accumulates fitness based on survival and food consumption
2. **Selection**: Top performers are selected based on `selectionRate`
3. **Reproduction**: Selected agents create offspring through:
   - **Crossover**: Combining genes from two parents
   - **Mutation**: Random modifications to neural network weights
4. **Population Reset**: New generation begins

### Rendering Pipeline

Evo uses HTML Canvas for efficient 2D rendering:

```
┌──────────────────────────────────────────────────┐
│                  Canvas Rendering                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │ Clear   │→ │ Draw    │→ │ Draw    │→ ...    │
│  │ Canvas  │  │  Grid   │  │ Agents  │          │
│  └─────────┘  └─────────┘  └─────────┘          │
└──────────────────────────────────────────────────┘
```

Features:

- Camera transformation for infinite world navigation
- Efficient redraw with dirty region tracking
- Selection highlighting and agent trails

## Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Config    │ ──→ │  Simulation  │ ──→ │   Render    │
│   Panel     │     │    Engine    │     │   Canvas    │
└─────────────┘     └──────────────┘     └─────────────┘
       ↑                   │                    │
       │                   ↓                    │
       │           ┌──────────────┐             │
       └───────────│    Stats     │←────────────┘
                   │   Updates    │
                   └──────────────┘
```

## State Management

Evo uses React's built-in state management with `useState` and `useCallback`:

- **Simulation Config**: User-adjustable parameters
- **Simulation Stats**: Real-time metrics (FPS, generation, fitness)
- **Agent State**: Current population and selection
- **Evolution History**: Generational tracking data

## Configuration Files

### Simulation Config (`AgentConfig.json`)

Controls agent behavior, neural network structure, and simulation parameters.

### Evolution Config

Runtime-adjustable evolution parameters:

- Generation time
- Selection rate
- Mutation rate
- Population size

### Build Config

- `vite.config.ts` - Web build configuration
- `electron.vite.config.ts` - Electron build configuration
- `electron-builder.yml` - Desktop app packaging

## Performance Considerations

- **Canvas Optimization**: Minimal redraws, efficient transforms
- **React Optimization**: Memoized callbacks, minimal re-renders
- **Agent Limit**: Configurable max population to maintain 60 FPS
- **Spatial Partitioning**: Efficient collision detection (future enhancement)

## Extending Evo

### Adding New Activation Functions

Edit `src/renderer/core/NeuralNetwork.ts`:

```typescript
export function yourActivation(x: number): number {
  // Your implementation
  return x
}
```

### Adding New Sensor Types

Extend the sensor system in `src/renderer/core/Agent.ts` to detect new entity types or implement different sensing patterns.

### Custom Agent Behaviors

Modify the neural network output interpretation in the agent update loop to add new actions or behaviors.
