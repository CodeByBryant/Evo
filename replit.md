# Evo - Advanced Neural Evolution Sandbox

## Overview
Evo is a cutting-edge neural network-based evolutionary sandbox, leveraging full genetic algorithms and infinite scrollable worlds. Built with React + TypeScript, its primary purpose is to allow users to observe AI agents evolve through natural selection in an endless 2D ecosystem. Key capabilities include real-time evolution tracking, DNA visualization, and dynamic species management. The project aims to provide a rich, interactive platform for understanding complex evolutionary processes.

## User Preferences
- **Platform**: Replit
- **Mode**: Web development
- **Port**: 5000
- **Framework**: React + TypeScript
- **Theme**: Dark mode
- **Controls**: Mouse-based

## System Architecture
The system is built on React 18 with TypeScript for the frontend, utilizing Bootstrap 5 for UI components. The core simulation logic is implemented in vanilla TypeScript for performance. Rendering is handled via HTML5 Canvas with camera transforms.

**UI/UX Decisions:**
- **Infinite Scrollable World:** A camera system allows for panning and zooming across an endless grid, displaying real-time camera position.
- **DNA Visualization Panel:** Features an animated double helix representing the neural network genome, color-coded by weight values, and displays agent information. The panel supports three size modes (normal, expanded, maximized) with manual resize capability via drag handles.
- **Genealogy Viewer:** A canvas-based family tree with three view modes (tree, radial, timeline), animated particle backgrounds, gradient nodes with glowing effects, and interactive lineage tracing that highlights ancestry chains on hover.
- **Fullscreen Mode:** Cross-platform fullscreen support via a custom hook (`useFullscreen.ts`) that handles both Web Fullscreen API and Electron IPC integration.
- **Species Visualization:** Agents are color-coded based on their species ID using HSL for clear differentiation.
- **Interactive Controls:** A left sidebar provides play/pause, reset, speed controls, statistics, and configurable evolution parameters. A right DNA panel appears upon agent selection.

**Technical Implementations & Feature Specifications:**
- **Continuous Evolution System:** Agents reproduce individually based on age and energy thresholds, eliminating generation cycles and fostering continuous evolution.
- **Age-Based Reproduction & Visual Growth:** Agents must reach 50% of their max age to reproduce and visually grow from 30% to 100% scale, indicating maturity.
- **Territorial Food Clusters:** Configurable isolated circular zones for food spawning, promoting territorial evolution and migration based on energy levels.
- **Genetic Algorithm:** Implements sexual reproduction with crossover, asexual reproduction with mutations, and fitness-based selection.
- **Species System:** Manages unique species IDs, tracks populations, and allows for multiple species coexistence with randomized baseline genetic traits.
- **Comprehensive Fitness Function:** Calculates fitness based on food consumption (40%), survival time (25%), energy efficiency (20%), and exploration (10%), with a minimum baseline of 1.0.
- **Agent History System:** Persistently tracks all created agents for genealogy, including extinct ancestors.
- **Energy & Lifespan System:** Agents have energy that depletes, can be replenished by food, and have a maximum age, leading to death by starvation or old age.
- **Save/Load System:** Allows saving populations to browser localStorage, and exporting/importing to/from JSON files.

**System Design Choices:**
- **Modular Components:** The application is structured with distinct components for rendering (`SimulationCanvasNew.tsx`), DNA visualization (`DNAPanel.tsx`), statistics (`StatsChart.tsx`), and controls (`EvolutionControls.tsx`, `Sidebar.tsx`).
- **Core Logic Separation:** Key systems like `Camera.ts`, `EvolutionManager.ts`, `Agent.ts`, and `NeuralNetwork.ts` are designed as independent modules for clarity and maintainability.
- **Performance Optimizations:** Focus on efficient canvas rendering, smart React updates (memoization, callbacks), and optimized array operations for evolution calculations.

## External Dependencies
- **Build Tool:** Vite (for web), Electron-Vite (for desktop)
- **UI Framework:** Bootstrap 5
- **Icons:** Bootstrap Icons
- **Storage:** Browser LocalStorage (for save/load functionality)