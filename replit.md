# Evo - Advanced Neural Evolution Sandbox

## Overview

Evo is a cutting-edge neural network-based evolutionary sandbox featuring **full genetic algorithms**, **infinite scrollable worlds**, **DNA visualization**, and **real-time evolution tracking**. Built with **React + TypeScript**, this project lets you watch AI agents evolve through natural selection in an endless 2D ecosystem.

**Major Version 3.0** - Complete evolution system with genetic algorithms, infinite worlds, DNA visualization, species tracking, and save/load functionality.

## Recent Major Update (November 18, 2025)

### Version 3.1: "Genealogy & Fitness Enhancement" 🧬📊

Latest enhancements to the evolution simulator:

#### New Features (November 18, 2025)
1. **Comprehensive Fitness Function**
   - Minimum baseline fitness of 1.0 for all agents
   - Multi-factor scoring: food consumption (40%), survival time (25%), energy efficiency (20%), exploration (10%)
   - Food efficiency multiplier based on age
   - Energy conservation bonuses
   - Survival bonus for staying alive
   - More meaningful fitness values from birth

2. **Genealogy Viewer Tab**
   - Tab-based interface in DNA Panel (Genome / Genealogy)
   - Complete family tree visualization
   - Parents, grandparents, and great-grandparents display
   - Extinct ancestor tracking with special cards
   - Descendant counting and display
   - Historical agent tracking across all generations
   - Color-coded species identification for ancestors

3. **Agent History System**
   - Persistent tracking of all agents ever created
   - Historical agent lookup for genealogy
   - Extinct agents remain accessible for family tree
   - Automatic history management and cleanup

### Version 3.0: "Evolution Revolution" 🧬

Complete transformation into an advanced evolution simulator:

#### New Features Added
1. **Infinite Scrollable World**
   - Camera system with pan (middle/right mouse, Ctrl+Click)
   - Zoom with mouse wheel (0.1x to 5x)
   - Infinite grid rendering
   - No boundaries - agents exist in endless space
   - Real-time camera position display

2. **DNA Visualization Panel**
   - Tab interface: Genome & Genealogy
   - Animated double helix visualization
   - Shows actual neural network genome
   - Color-coded based on weight values
   - Displays agent information (species, fitness, energy, age)
   - Click any agent to inspect its DNA
   - Family tree with extinct ancestor tracking

3. **Full Genetic Algorithm**
   - Sexual reproduction with crossover from two parents
   - Asexual reproduction with mutations
   - Fitness-based selection
   - Generational evolution cycles
   - Mutation strategies (Gaussian, uniform)

4. **Generation Tracking System**
   - Automatic generation cycles
   - Configurable generation time
   - Population statistics per generation
   - Birth and death tracking
   - Historical data retention

5. **Species System**
   - Unique species IDs for each lineage
   - Color-coded visualization (HSL based on genome)
   - Species population tracking
   - Multiple species coexistence
   - Natural speciation emergence

6. **Enhanced Statistics Dashboard**
   - Real-time population charts
   - Fitness progression graphs
   - Generation tracking
   - Species count
   - Average and maximum fitness
   - Historical trends (50+ generations)

7. **Agent Inspection System**
   - Click to select agents
   - Yellow highlighting for selected agent
   - Detailed information panel
   - Parent tracking
   - Generational lineage

8. **Energy & Lifespan System**
   - Energy depletion over time
   - Food consumption replenishes energy
   - Maximum age limit
   - Death by starvation or old age
   - Reproduction energy cost

9. **Save/Load System**
   - Save populations to browser localStorage
   - Export to JSON files
   - Import from files
   - Multiple save slots
   - Timestamp tracking

10. **Advanced Evolution Controls**
    - Generation time adjustment
    - Selection rate (survival %)
    - Mutation rate
    - Population size target
    - Reproduction threshold
    - Maximum age
    - Help text for each parameter

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **UI**: Bootstrap 5 + Bootstrap Icons
- **Simulation**: Vanilla TypeScript (performance-optimized)
- **Build**: Vite (web) / Electron-Vite (desktop)
- **Evolution**: Custom genetic algorithm
- **Rendering**: HTML5 Canvas with camera transforms
- **Storage**: LocalStorage + JSON export/import

## Architecture

### New Components
```
src/renderer/
├── components/
│   ├── SimulationCanvasNew.tsx    # Infinite world with camera
│   ├── DNAPanel.tsx                # Double helix visualization
│   ├── StatsChart.tsx              # Population/fitness charts
│   ├── SaveLoadPanel.tsx           # Save/load functionality
│   ├── EvolutionControls.tsx      # Evolution parameter controls
│   ├── Sidebar.tsx                 # Main control panel
│   └── [existing components]
├── core/
│   ├── Camera.ts                   # Pan/zoom camera system
│   ├── EvolutionManager.ts         # Genetic algorithm engine
│   ├── Agent.ts                    # Enhanced with species/DNA
│   ├── NeuralNetwork.ts            # With crossover/genome methods
│   └── utilities/
└── types/
    └── simulation.ts               # Extended with evolution stats
```

### Core Systems

1. **Camera System** (`Camera.ts`)
   - Screen-to-world coordinate conversion
   - Zoom-at-point functionality
   - Drag to pan
   - Transform matrix application

2. **Evolution Manager** (`EvolutionManager.ts`)
   - Generational lifecycle
   - Fitness evaluation
   - Selection algorithm
   - Reproduction (sexual/asexual)
   - Mutation application
   - Statistics tracking

3. **Enhanced Agent** (`Agent.ts`)
   - Species identification
   - Parent tracking
   - Generation number
   - Age tracking
   - Unique IDs
   - Species-based coloring

4. **Neural Network Extensions** (`NeuralNetwork.ts`)
   - Crossover method for sexual reproduction
   - Genome extraction (all weights/biases)
   - Clone method for asexual reproduction
   - Mutation with multiple strategies

## Running in Replit

```bash
npm run dev:web
```

Access at `http://localhost:5000`

## How Evolution Works

### Lifecycle
1. **Initialization**: Population spawns with random genomes
2. **Simulation**: Agents move, sense, eat food, gain fitness
3. **Aging**: Energy depletes, agents age, some die
4. **Reproduction**: High-energy agents reproduce
5. **Selection**: At generation end, top % survive
6. **New Generation**: Survivors create offspring via crossover + mutation

### Fitness Metrics
- Food eaten (+1 per food)
- Survival time (longer = fitter)
- Energy management

### Mutation
- Gaussian noise added to weights/biases
- Configurable mutation rate (0-30%)
- Clamped to prevent explosion

### Crossover
- Random selection from each parent's genes
- 50/50 probability per weight/bias
- Creates genetic diversity

## Configuration

All evolution parameters are adjustable in real-time:

```typescript
EvolutionConfig {
  generationTime: 1000,        // Steps per generation
  selectionRate: 0.3,           // Top 30% survive
  mutationRate: 0.05,           // 5% mutation chance
  populationSize: 30,           // Target population
  reproductionThreshold: 80,    // Energy needed to reproduce
  maxAge: 500                   // Maximum lifespan
}
```

## User Interface

### Left Sidebar
- **Controls**: Play/Pause, Reset, Speed
- **Stats**: Agent count, Food count, FPS
- **Evolution Progress**: Generation, Species, Fitness
- **Charts**: Population & Fitness graphs
- **Configuration**: Neural network, sensors, agents
- **Evolution Settings**: All evolution parameters
- **Save/Load**: Persistence system

### DNA Panel (Right Side)
- Appears when agent is selected
- Two tabs: Genome and Genealogy
- **Genome Tab:**
  - Animated double helix
  - Real-time genome visualization
  - Agent statistics
  - Neural network information
- **Genealogy Tab:**
  - Complete family tree
  - Parents, grandparents, great-grandparents
  - Extinct ancestor tracking
  - Descendant listing
  - Species color-coding

### Canvas Controls
- Click: Select agent
- Middle/Right mouse: Pan
- Scroll: Zoom
- Ctrl+Click: Pan (alternative)

## Key Features Explained

### Infinite World
- No wrap-around at edges
- Agents can move indefinitely
- Food spawns in large area
- Camera follows your view
- Grid extends infinitely

### DNA Visualization
- Double helix represents genome
- Colors based on weight values
- Animates rotation
- Shows genome length
- Real neural network data

### Species Colors
- HSL color from species ID
- Consistent per species
- Visual species differentiation
- Selected agents glow yellow

### Save/Load
- Browser localStorage for quick saves
- JSON export for sharing
- Import from files
- Multiple save slots
- Timestamp tracking

## Performance Optimizations

1. **Efficient Rendering**
   - Only draw visible grid
   - Camera transform once per frame
   - Agent culling (future)

2. **Smart Updates**
   - React memoization
   - Callback optimization
   - Ref-based state for high-frequency data

3. **Evolution Efficiency**
   - Fast array operations
   - Minimal allocations
   - Optimized selection sort

## Development Workflow

### Replit (Primary)
```bash
npm run dev:web  # Hot reload on port 5000
```

### Local Desktop
```bash
npm run dev      # Electron window
```

## Future Enhancements

- [ ] Predator/prey dynamics
- [ ] Multiple food types with different nutrients
- [ ] Environmental hazards
- [ ] Pheromone trails
- [ ] Agent-agent communication
- [ ] Evolutionary tree visualization
- [ ] Time-lapse replay
- [ ] Challenges/scenarios
- [ ] Leaderboards
- [ ] Community sharing

## Troubleshooting

### Canvas Issues
- Clear browser cache
- Check console for errors
- Verify WebGL support
- Try different browser

### Performance
- Reduce population size
- Lower generation time
- Disable sensor rendering
- Close other tabs

### Evolution Not Working
- Check selection rate (not 0)
- Verify mutation rate (not 0)
- Ensure food is available
- Check reproduction threshold

## User Preferences

- **Platform**: Replit
- **Mode**: Web development
- **Port**: 5000
- **Framework**: React + TypeScript
- **Theme**: Dark mode
- **Controls**: Mouse-based

## Version History

- **v3.0**: Full evolution system, infinite world, DNA viz
- **v2.0**: Evo rebranding, dark theme, enhanced UI
- **v1.0**: Initial neural network sandbox

---

**Experience evolution in action!** 🧬
