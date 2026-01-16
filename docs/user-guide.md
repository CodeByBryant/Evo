# User Guide

Learn how to use all of Evo's features to create and observe evolving AI agents.

## Interface Overview

The interface consists of:

- **Main Canvas**: Where the simulation runs
- **Sidebar**: Controls and statistics
- **DNA Panel**: Agent information (appears when selecting an agent)

## Controls

### Mouse Controls

| Action                         | Effect                 |
| ------------------------------ | ---------------------- |
| **Left Click** (on agent)      | Select agent, view DNA |
| **Left Click** (empty space)   | Deselect agent         |
| **Middle Mouse / Right Mouse** | Pan camera             |
| **Ctrl + Left Click**          | Alternative pan        |
| **Mouse Wheel**                | Zoom in/out            |

### Keyboard Shortcuts

| Key        | Action                  |
| ---------- | ----------------------- |
| **Space**  | Pause/Resume simulation |
| **Escape** | Close DNA panel         |
| **R**      | Toggle agent trails     |

## Sidebar Panels

### Simulation Controls

- **Start/Pause**: Toggle simulation execution
- **Reset**: Start fresh with new random population
- **Speed Slider**: Adjust simulation speed (0.1x - 3.0x)

### Evolution Statistics

- **Generation**: Current generation number
- **Species**: Number of distinct species
- **Avg Fitness**: Average fitness across all agents
- **Max Fitness**: Highest fitness in current generation

### Configuration Options

Adjust simulation parameters:

**Agent Settings:**

- Agent count
- Agent size
- Movement speed
- Rotation speed

**Sensor Settings:**

- Ray count
- Ray length
- Detection types (food, agents)

**Neural Network:**

- Architecture (layer sizes)
- Activation function

**Food Settings:**

- Spawn count
- Spawn rate
- Energy value

### Evolution Settings

- **Generation Time**: Steps per generation
- **Selection Rate**: % of top performers that survive
- **Mutation Rate**: Probability of genetic mutations
- **Population Size**: Target number of agents
- **Reproduction Threshold**: Energy needed to reproduce
- **Max Age**: Maximum lifespan

## Understanding Evolution

### How Agents Evolve

1. **Birth**: Agents are created with random or inherited neural networks
2. **Life**: Agents sense their environment and make decisions
3. **Survival**: Successful agents find food and gain energy
4. **Reproduction**: High-energy agents create offspring
5. **Death**: Agents die from old age or starvation
6. **Selection**: End of generation, top performers are selected
7. **New Generation**: Offspring are created through crossover and mutation

### Fitness Factors

Agents gain fitness by:

- Eating food (+energy, +fitness)
- Surviving longer (+fitness over time)
- Reproducing successfully

### Species Formation

- Each unique genome creates a new species
- Species are color-coded for easy identification
- Watch different species compete and evolve

## DNA Panel

When you click an agent, the DNA panel shows:

### Visual Elements

- **Double Helix Animation**: Visual representation of the genome
- **Species Color**: Unique color based on genome

### Statistics

- **Genome Length**: Number of neural network parameters
- **Species ID**: Unique identifier
- **Fitness Score**: Performance metric
- **Energy Level**: Current energy
- **Age**: Steps lived
- **Position**: World coordinates
- **Generation**: When the agent was born
- **Parents**: Number of parent agents

## Creating Custom Agents

Click **"Create Agent"** in the sidebar to open the Agent Builder:

1. **Set Traits**: Customize genetic traits
2. **Preview**: See how your agent will look
3. **Place**: Click on the canvas to spawn
4. **Multi-place Mode**: Create multiple agents of the same species

## Save & Load

### Saving

- **Save Current**: Save population to browser storage
- **Export**: Download population as JSON file

### Loading

- **Load Save**: Restore a previously saved population
- **Import**: Load a JSON file

### Sharing

Export your evolved populations and share them with others!

## Tips for Interesting Evolutions

### Getting Started

1. Start with default settings
2. Watch for 10-20 generations
3. Note which behaviors emerge

### Encouraging Diversity

- Increase mutation rate (0.1 - 0.3)
- Lower selection rate (0.1 - 0.2)
- Increase generation time

### Fast Evolution

- Higher selection pressure (selection rate 0.3+)
- Smaller population
- More food available

### Complex Behaviors

- More sensor rays
- Longer ray length
- Larger neural networks (more hidden layers)

### Observing Speciation

- Run for 50+ generations
- Keep population moderate (50-100)
- Watch the species count in statistics

## Performance Tips

### For Smooth Experience

- Keep agent count under 100
- Reduce sensor ray count if laggy
- Lower simulation speed if FPS drops

### For Longer Runs

- Use desktop app (better performance)
- Save periodically
- Export interesting populations

## Troubleshooting

### Simulation is Slow

- Reduce agent count
- Decrease sensor ray count
- Close other browser tabs

### Agents Not Evolving

- Increase mutation rate
- Ensure food is spawning
- Check generation time isn't too short

### All Agents Die

- Increase food spawn rate
- Lower energy consumption
- Reduce max age initially

### Species Count Stays at 1

- Increase mutation rate
- Run for more generations
- Ensure reproduction is occurring
