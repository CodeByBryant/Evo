# EvoSquares - Neural Evolution Simulation

## Overview

EvoSquares is a neural network-based evolutionary simulation where square-shaped agents navigate a 2D environment, sense their surroundings, and make decisions using neural networks. The project features a modern **React + Bootstrap** interface with real-time controls and statistics, while maintaining high-performance canvas rendering through a vanilla TypeScript simulation core.

## Project Architecture

### Technology Stack
- **Frontend Framework**: React 18 with TypeScript
- **UI Library**: Bootstrap 5 with Bootstrap Icons
- **Simulation Core**: Vanilla TypeScript (for performance)
- **Build Tool**: Vite (for web) / Electron-Vite (for desktop)
- **Desktop Framework**: Electron (optional, for local desktop builds)
- **Neural Network**: Custom implementation with multi-layer perceptron

### Directory Structure
```
EvoSquares/
├── src/
│   ├── main/              # Electron main process (desktop only)
│   │   └── index.ts       # Window creation and app lifecycle
│   ├── preload/           # Electron preload scripts (desktop only)
│   │   └── index.ts
│   └── renderer/          # React application
│       ├── components/    # React UI components
│       │   ├── SimulationCanvas.tsx  # Canvas wrapper component
│       │   ├── ControlPanel.tsx      # Pause/speed/reset controls
│       │   ├── StatsDisplay.tsx      # Real-time statistics
│       │   └── ConfigPanel.tsx       # Parameter configuration
│       ├── core/          # Simulation engine (vanilla TypeScript)
│       │   ├── Agent.ts              # Agent and Food classes
│       │   ├── NeuralNetwork.ts      # Neural network implementation
│       │   └── utilities/
│       │       ├── AgentConfig.json  # Default configuration
│       │       └── utilities.ts      # Helper functions
│       ├── types/         # TypeScript type definitions
│       │   └── simulation.ts
│       ├── assets/
│       │   └── main.css   # Custom styles
│       ├── App.tsx        # Main React component
│       ├── main.tsx       # React entry point
│       └── index.html     # HTML template
├── vite.config.ts         # Vite config for web builds
├── electron.vite.config.ts # Electron-Vite config for desktop builds
└── package.json
```

## Running in Replit

### Web Development Mode (Current Workflow)
The project is configured to run as a web application in Replit using Vite:

```bash
npm run dev:web
```

This starts a development server on port 5000 with the following features:
- Hot Module Replacement (HMR) for instant updates
- Canvas-based simulation rendering
- Neural network evolution visualization
- Accessible via Replit's webview

### How It Works
1. **Canvas Setup**: A canvas element is dynamically created and attached to the DOM
2. **Agent Initialization**: Agents are spawned with random positions and rotations
3. **Neural Network**: Each agent has a neural network that processes sensor inputs
4. **Sensors**: Agents use raycasting to detect other agents and food
5. **Animation Loop**: `requestAnimationFrame` drives the continuous simulation

## Running Locally (Desktop Mode)

For local development with Electron desktop features:

### Prerequisites
- Node.js (v18 or later)
- System graphics libraries (automatically handled on most systems)

### Commands
```bash
# Development with Electron window
npm run dev

# Build for production (desktop apps)
npm run build:win   # Windows
npm run build:mac   # macOS
npm run build:linux # Linux
```

## Recent Changes (Replit Setup)

### November 18, 2025
- **Refactored Architecture**: Moved simulation logic from Electron main process to renderer process
  - Created `src/renderer/simulation/` directory with Agent, NeuralNetwork, and utilities
  - Removed DOM API usage from main process (was causing errors)
  
- **Added Web-Only Build Path**: 
  - Created `vite.config.ts` for standalone web builds
  - Added npm scripts: `dev:web`, `build:web`, `preview:web`
  - Configured Vite server to bind to `0.0.0.0:5000` for Replit compatibility

- **Dual-Mode Support**: 
  - Web mode: `npm run dev:web` (for Replit and browser-based development)
  - Desktop mode: `npm run dev` (for local Electron development)

- **System Dependencies**: Installed X11 and graphics libraries for potential VNC support

## Simulation Configuration

Edit `src/renderer/simulation/utilities/AgentConfig.json` to customize:

```json
{
  "AgentCount": 10,                    // Number of agents
  "DefaultAgentSize": { "width": 50, "height": 50 },
  "EnableRotation": true,
  "MovementSpeed": 1,
  "RotationSpeed": 0.1,
  "Sensor": {
    "RayCount": 5,                     // Number of sensor rays
    "RayLength": 150                   // Sensor detection distance
  },
  "FoodSettings": {
    "SpawnCount": 25,                  // Number of food items
    "FoodColor": "#e7e751ce"
  }
}
```

## User Preferences

- **Development Platform**: Replit (web-based)
- **Primary Workflow**: Web development mode (`npm run dev:web`)
- **Port**: 5000 (configured for Replit webview)

## Key Features

1. **Neural Networks**: Each agent has a multi-layer perceptron (8 inputs → 20 → 20 → 20 → 4 outputs)
2. **Raycasting Sensors**: Agents detect other agents using line-of-sight rays for obstacle avoidance
3. **Autonomous Movement**: Neural network outputs control forward/backward movement and rotation
4. **Real-time Rendering**: Canvas-based visualization with configurable colors and stroke widths
5. **Genetic Algorithm Ready**: Architecture supports future evolution through mutation and selection

### Current Limitations (from original design)
- **Food Detection**: Currently, agents' sensors only detect other agents, not food items. Food is rendered for visual purposes but doesn't interact with agent sensors. This is a design limitation inherited from the original codebase.
- **Collision Detection**: No collision detection implemented between agents and food
- **Fitness Evaluation**: No fitness scoring or selection mechanism implemented yet

## Troubleshooting

### Issue: Black screen or no rendering
- Check browser console for errors
- Verify canvas is being created (inspect DOM)
- Ensure window size is valid

### Issue: Agents not moving
- Check `AgentConfig.json` movement/rotation speeds
- Verify neural network is receiving inputs
- Inspect sensor outputs in browser console

### Issue: Desktop build fails in Replit
- Use web mode instead: `npm run dev:web`
- Desktop builds require local system with graphics support

## Future Development Ideas

- **Food Interaction**: Modify sensors to detect food items, not just other agents
- **Collision Detection**: Implement agent-food collision detection and consumption
- **Genetic Algorithm**: Add fitness scoring, selection, and reproduction cycles
- **Evolution Metrics**: Track and display generation number, average fitness, mutations
- **UI Controls**: Add controls for simulation speed, agent spawning, and parameter tuning
- **Statistics Dashboard**: Display real-time stats (generation, fitness, population, etc.)
- **Persistent Storage**: Save best-performing agents and load them for new simulations
