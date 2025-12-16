# Development Guide

This guide covers setting up a development environment and contributing to Evo.

## Development Setup

### Prerequisites

- **Node.js** v18 or later ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))
- **VS Code** (recommended) with extensions:
  - ESLint
  - Prettier
  - TypeScript and JavaScript Language Features

### Getting Started

1. **Fork the repository** on GitHub

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Evo.git
   cd Evo
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start development server**
   
   Web version (recommended for development):
   ```bash
   npm run dev:web
   ```
   
   Desktop version:
   ```bash
   npm run dev
   ```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:web` | Start web development server |
| `npm run dev` | Start Electron development app |
| `npm run build:web` | Build web version for production |
| `npm run build` | Build Electron app |
| `npm run build:win` | Build for Windows |
| `npm run build:mac` | Build for macOS |
| `npm run build:linux` | Build for Linux |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Run TypeScript type checking |

## Project Structure

```
src/
├── main/               # Electron main process
├── preload/            # Electron preload scripts
└── renderer/           # React application
    ├── App.tsx         # Root component
    ├── components/     # UI components
    │   ├── SimulationCanvasNew.tsx  # Main canvas
    │   ├── Sidebar.tsx              # Control sidebar
    │   ├── DNAPanel.tsx             # Agent info panel
    │   └── ...
    ├── core/           # Simulation logic
    │   ├── Agent.ts    # Agent class
    │   ├── NeuralNetwork.ts  # Neural network
    │   ├── EvolutionManager.ts  # Evolution logic
    │   └── utilities/  # Helpers
    ├── hooks/          # Custom React hooks
    ├── types/          # TypeScript types
    └── assets/         # CSS and static assets
```

## Code Style

### TypeScript
- Use strict TypeScript with proper typing
- Avoid `any` types when possible
- Use interfaces for object shapes

### React
- Use functional components with hooks
- Keep components small and focused
- Use `useCallback` and `useMemo` appropriately

### Formatting
- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Run `npm run format` before committing

### Linting
- ESLint is configured for the project
- Run `npm run lint` to check for issues
- All lint errors must be resolved before merging

## Making Changes

### Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, well-documented code
   - Follow existing patterns in the codebase

3. **Test your changes**
   - Run the development server
   - Test in both web and Electron modes if applicable
   - Check for console errors

4. **Lint and format**
   ```bash
   npm run lint
   npm run format
   npm run typecheck
   ```

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

6. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then open a Pull Request on GitHub.

### Commit Message Format

Follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `test:` Adding tests
- `chore:` Maintenance tasks

## Architecture Decisions

### Why React?
- Component-based architecture for UI
- Rich ecosystem and tooling
- TypeScript support

### Why Canvas?
- High performance for many moving objects
- Direct control over rendering
- Efficient for 2D simulations

### Why Electron?
- Cross-platform desktop support
- Native OS integration
- File system access for saves

## Common Tasks

### Adding a New Component

1. Create file in `src/renderer/components/`
2. Export from component file
3. Import and use in parent component

Example:
```typescript
// src/renderer/components/MyComponent.tsx
import React from 'react'

interface MyComponentProps {
  value: string;
}

export const MyComponent: React.FC<MyComponentProps> = ({ value }) => {
  return <div>{value}</div>
}
```

### Adding a New Configuration Option

1. Update type in `src/renderer/types/simulation.ts`
2. Add default value in `src/renderer/core/utilities/AgentConfig.json`
3. Add UI control in sidebar
4. Use value in simulation logic

### Modifying Agent Behavior

1. Edit `src/renderer/core/Agent.ts`
2. Update neural network inputs/outputs if needed
3. Test extensively - small changes can have big effects!

### Adding Evolution Features

1. Edit `src/renderer/core/EvolutionManager.ts`
2. Update types if adding new config options
3. Add UI controls if user-configurable

## Debugging

### Browser DevTools
- Use React DevTools for component inspection
- Console logs appear in browser console
- Network tab for any API calls

### Electron DevTools
- DevTools automatically open in development
- Main process logs appear in terminal
- Use `console.log` for debugging

### Common Issues

**TypeScript errors:**
- Run `npm run typecheck` for details
- Check import statements
- Verify type definitions

**Simulation bugs:**
- Add console.log in update loop
- Reduce speed to observe behavior
- Check for NaN values in calculations

## Building Releases

### Web Release
```bash
npm run build:web
# Output in ./dist/
```

### Desktop Release
```bash
# All platforms
npm run build

# Specific platform
npm run build:win
npm run build:mac
npm run build:linux
# Output in ./release/
```

## Getting Help

- **Questions**: Open a GitHub Discussion
- **Bugs**: Open a GitHub Issue
- **Features**: Open a GitHub Issue with proposal

## License

All contributions are subject to the MIT License. See [LICENSE](../LICENSE) for details.
