# Evo

**Evo** is a neural network-based evolutionary sandbox where AI agents navigate a 2D environment, sense their surroundings, and make autonomous decisions using neural networks. Built with **React**, **TypeScript**, and **Bootstrap** for a modern, sleek dark-themed experience.

## ✨ Features

- **🧠 Advanced Neural Networks**: Enhanced multi-layer perceptron with configurable architecture and modern activation functions
- **👁️ Smart Sensors**: Agents detect both other agents and food using intelligent raycasting
- **🎮 Interactive Sandbox**: Real-time pause/resume, speed adjustment, and reset controls
- **📊 Live Statistics**: Monitor agent count, food count, FPS, and sandbox status
- **⚙️ Fully Configurable**: Adjust agent behavior, sensors, and rendering parameters dynamically
- **🎨 Modern Dark UI**: Sleek grey/black theme with responsive design
- **⚡ Optimized Performance**: Spatial partitioning, efficient rendering, and React optimization patterns

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

## 📁 Project Structure

```
Evo/
├── src/
│   ├── main/                 # Electron main process (desktop only)
│   └── renderer/             # React application
│       ├── components/       # React components
│       │   ├── SimulationCanvas.tsx
│       │   ├── ControlPanel.tsx
│       │   ├── StatsDisplay.tsx
│       │   └── ConfigPanel.tsx
│       ├── core/             # Sandbox engine (vanilla TS)
│       │   ├── Agent.ts
│       │   ├── NeuralNetwork.ts
│       │   └── utilities/
│       ├── types/            # TypeScript type definitions
│       ├── App.tsx           # Main React app
│       └── main.tsx          # React entry point
├── vite.config.ts            # Vite configuration
└── package.json
```

## 🎮 How to Use

### Controls
- **Start/Pause**: Toggle simulation execution
- **Reset**: Restart simulation with new random agents
- **Speed Slider**: Adjust simulation speed (0.1x - 3.0x)

### Configuration
Click the **Configuration** panel to adjust:
- **Agent Count**: Number of agents (1-50)
- **Movement Speed**: How fast agents move
- **Rotation Speed**: How quickly agents turn
- **Sensor Rays**: Number of detection rays (3-15)
- **Sensor Length**: Detection range (50-300)
- **Show Sensors**: Toggle sensor ray visualization
- **Enable Rotation**: Allow/prevent agent rotation

## 🧬 How It Works

### Neural Networks
Each agent has a neural network with:
- **Inputs**: Position (x, y), rotation, and 5 sensor ray offsets (8 total)
- **Hidden Layers**: Three layers of 20 neurons each
- **Outputs**: Forward, backward, clockwise rotation, counter-clockwise rotation (4 total)
- **Activation**: Leaky ReLU

### Sensors
Agents use raycasting to detect other agents:
- 5 rays spread in a forward arc
- Yellow rays show detection distance
- Normalized values (0-1) feed into the neural network

### Movement
The neural network outputs control:
- **Forward/Backward**: Linear movement
- **Rotation**: Angular movement
- Agents move autonomously based on their perceptions

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

## 🔮 Future Development

- **Food Interaction**: Agents sense and consume food
- **Genetic Algorithm**: Evolution through selection and reproduction
- **Fitness Scoring**: Evaluate agent performance
- **Generation Tracking**: Monitor evolutionary progress
- **Persistent Storage**: Save and load best-performing agents
- **Advanced Statistics**: Detailed analytics dashboard

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

## 👨‍💻 Author

Developed with ❤️ by **Bryant Ejorh** ([CodeByBryant](https://github.com/CodeByBryant))

---

**Enjoy watching evolution in action!** 🧬✨
