# Evo

**Evo** is an advanced neural network-based evolutionary sandbox where AI agents evolve through natural selection. Agents navigate an **infinite 2D world**, sense their environment using raycasting, and make autonomous decisions using neural networks. Watch species emerge, compete for resources, and evolve over generations in real-time!

Built with **React**, **TypeScript**, and inspired by **Cell Lab**, **Thrive**, **The Life Engine**, and **Bionic Chaos Evolution**.

## ✨ Features

### 🧬 Evolution & Genetics
- **Full Genetic Algorithm**: Reproduction, crossover, mutation, and natural selection
- **Generational Evolution**: Watch populations evolve over hundreds of generations
- **DNA Visualization**: Beautiful animated double helix showing agent genomes
- **Species Tracking**: Automatic species identification with color coding
- **Fitness-Based Selection**: Only the fittest agents reproduce
- **Configurable Evolution**: Adjust mutation rates, selection pressure, population size, and more

### 🌍 Infinite World
- **Infinite Scrollable Map**: Pan and zoom through an endless 2D world
- **Camera Controls**: Middle/Right mouse to pan, scroll to zoom, Ctrl+Click to pan
- **Smooth Navigation**: Explore the ecosystem from different perspectives
- **Dynamic Grid**: Visual grid that adapts to zoom level

### 🧠 Advanced Neural Networks
- **Multi-Layer Perceptron**: Configurable architecture with modern activation functions
- **Crossover Reproduction**: Genetic combination from two parents
- **Adaptive Mutation**: Gaussian and uniform mutation strategies
- **Weight Initialization**: Xavier and He initialization methods
- **Activation Functions**: Swish, ELU, Leaky ReLU, Tanh

### 👁️ Smart Sensors
- **Dual Detection**: Agents sense both other agents and food
- **Intelligent Raycasting**: Line-of-sight detection system
- **Configurable Sensors**: Adjust ray count, length, and detection types

### 📊 Evolution Tracking
- **Real-Time Charts**: Population and fitness graphs over generations
- **Live Statistics**: Generation, species count, avg/max fitness, population
- **Performance Metrics**: FPS counter and simulation status
- **Historical Data**: Track evolution progress over 50+ generations

### 🎮 Interactive Features
- **Agent Inspection**: Click any agent to view its DNA and information
- **Evolution Controls**: Fine-tune mutation rate, selection rate, generation time
- **Save/Load System**: Save best organisms and load them later
- **Export/Import**: Share your evolved populations as JSON files
- **Speed Control**: Adjust simulation speed from 0.1x to 3x

### 🎨 Modern UI
- **Sleek Dark Theme**: Modern grey/black aesthetic
- **Species Colors**: Each species has a unique color based on its genome
- **Selection Highlighting**: Selected agents glow yellow
- **Responsive Design**: Adapts to any screen size
- **Collapsible Sidebar**: Maximize canvas space when needed

### ⚡ Performance
- **Optimized Rendering**: Efficient canvas drawing and camera transforms
- **Smart Updates**: Only redraws what changed
- **React Optimization**: Memoized callbacks and proper state management
- **60 FPS Target**: Smooth animations even with many agents

## 🚀 Getting Started

### Replit (Recommended)

This project is optimized for Replit:

```bash
npm run dev:web
```

Access the sandbox at `http://localhost:5000`

### Local Development

#### Prerequisites
- Node.js (v18 or later)
- npm or yarn

#### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/CodeByBryant/Evo.git
   cd Evo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the web development server:
   ```bash
   npm run dev:web
   ```

4. (Optional) Run as Electron desktop app:
   ```bash
   npm run dev
   ```

## 🎮 How to Use

### Mouse Controls
- **Click Agent**: Select and view DNA in double helix visualization
- **Middle Mouse / Right Mouse**: Pan camera around infinite world
- **Ctrl + Left Click**: Alternative pan method
- **Mouse Wheel**: Zoom in/out
- **Left Click (empty space)**: Deselect agent

### Simulation Controls
- **Start/Pause**: Toggle simulation execution
- **Reset**: Start fresh with new random population
- **Speed Slider**: Adjust simulation speed (0.1x - 3.0x)

### Evolution Settings
- **Generation Time**: How long each generation lasts (steps)
- **Selection Rate**: Percentage of top performers that survive
- **Mutation Rate**: Probability of genetic mutations
- **Population Size**: Target number of agents
- **Reproduction Threshold**: Energy needed to reproduce
- **Max Age**: Maximum lifespan before death

### Configuration Panel
Adjust agent and neural network parameters:
- Agent count, size, movement speed, rotation speed
- Sensor ray count, ray length, detection types
- Neural network architecture and activation functions
- Food settings, colors, spawn rates

### Save/Load
- **Save Current**: Save your current population to browser storage
- **Export**: Download population as JSON file
- **Import**: Load a saved JSON file
- **Load Save**: Restore a previously saved population

## 🧬 How Evolution Works

### 1. **Life Cycle**
Each agent lives, consumes food, and either survives or dies based on:
- **Energy**: Depletes over time, replenished by eating food
- **Age**: Agents die when they reach maximum age
- **Fitness**: Increases by eating food and surviving

### 2. **Reproduction**
Agents with enough energy can reproduce:
- **Sexual Reproduction**: Two parents create offspring through crossover
- **Asexual Reproduction**: Single parent clones with mutations
- **Mutation**: Random changes to neural network weights and biases

### 3. **Natural Selection**
At the end of each generation:
- Agents are ranked by fitness (food eaten, survival time)
- Top performers (selection rate %) survive
- Survivors create the next generation
- Weak performers are eliminated

### 4. **Species Formation**
- Each agent has a unique species ID
- Species are colored based on their genome
- Track multiple species competing in the ecosystem
- Watch speciation emerge naturally

## 📊 Statistics Dashboard

### Evolution Progress
- **Generation**: Current generation number
- **Species**: Number of distinct species
- **Avg Fitness**: Average fitness across all agents
- **Max Fitness**: Highest fitness in current generation

### Real-Time Charts
- **Population Graph**: Track population changes over time
- **Fitness Graph**: Monitor evolution of fitness
- **Historical Data**: View trends across generations

### Agent Information (DNA Panel)
When you click an agent, view:
- **Animated Double Helix**: Visual representation of genome
- **Genome Length**: Number of neural network parameters
- **Species ID**: Unique identifier
- **Fitness Score**: Performance metric
- **Energy Level**: Current energy
- **Age**: Steps lived
- **Position**: World coordinates
- **Generation**: When the agent was born
- **Parents**: Number of parent agents

## 🛠️ Available Scripts

```bash
# Web development (Replit)
npm run dev:web      # Start Vite dev server
npm run build:web    # Build for production
npm run preview:web  # Preview production build

# Desktop development (Local only)
npm run dev          # Start Electron app
npm run build        # Build Electron app
npm run build:win    # Build for Windows
npm run build:mac    # Build for macOS
npm run build:linux  # Build for Linux

# Code quality
npm run lint         # Lint code
npm run format       # Format code with Prettier
npm run typecheck    # TypeScript type checking
```

## 🔮 What Makes This Special

### Inspired by the Best
- **Cell Lab**: Genome editing and species design
- **Thrive**: Scientific accuracy and evolutionary stages
- **The Life Engine**: Visual organism details and community sharing
- **Bionic Chaos Evolution**: Neural network visualization and generational tracking

### Key Innovations
1. **Infinite World**: Unlike bounded simulations, agents exist in endless space
2. **Visual DNA**: Double helix animation shows actual neural network weights
3. **Real Genetics**: True crossover and mutation, not simplified rules
4. **Species Emergence**: Natural speciation without manual intervention
5. **Full Evolution Cycle**: Birth, life, death, and reproduction
6. **Performance**: Handles 100+ agents at 60 FPS

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs via GitHub Issues
- Submit feature requests
- Create pull requests with improvements
- Share your evolved populations

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

## 👨‍💻 Author

Developed with ❤️ by **Bryant Ejorh** ([CodeByBryant](https://github.com/CodeByBryant))

---

**Watch evolution in action! 🧬✨**

Experience the emergence of complex behaviors from simple rules, just like nature intended.
