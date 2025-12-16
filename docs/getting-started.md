# Getting Started with Evo

This guide will help you get Evo up and running on your system.

## Quick Start

### Play Online

The easiest way to try Evo is through the web version:

👉 **[Play Evo Online](https://codebybryant.github.io/Evo/)**

No installation required!

### Download Desktop App

For the best experience with full features, download the desktop app:

| Platform | Download |
|----------|----------|
| Windows | [Download .exe](https://github.com/CodeByBryant/Evo/releases/latest) |
| macOS | [Download .dmg](https://github.com/CodeByBryant/Evo/releases/latest) |
| Linux | [Download .AppImage](https://github.com/CodeByBryant/Evo/releases/latest) |

## Installation from Source

### Prerequisites

- **Node.js** v18 or later
- **npm** or **yarn**
- **Git**

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/CodeByBryant/Evo.git
   cd Evo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**

   For web version:
   ```bash
   npm run dev:web
   ```

   For desktop (Electron) version:
   ```bash
   npm run dev
   ```

4. **Access the app**
   - Web: Open `http://localhost:5000` in your browser
   - Desktop: The Electron app will open automatically

## Building for Production

### Web Build
```bash
npm run build:web
npm run preview:web  # Preview the build
```

### Desktop Builds
```bash
# Build for your current platform
npm run build

# Platform-specific builds
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## First Steps

Once Evo is running:

1. **Watch the simulation** - Agents will start evolving automatically
2. **Click on an agent** - View its DNA in the double helix visualization
3. **Adjust settings** - Use the sidebar to modify simulation parameters
4. **Create your own agent** - Use the "Create Agent" button to design custom creatures

See the [User Guide](./user-guide.md) for detailed instructions on all features.

## Troubleshooting

### Common Issues

**Port 5000 already in use**
```bash
# Kill the process using port 5000 or change the port in vite.config.ts
```

**Build fails on Windows**
```bash
# Make sure you have Windows Build Tools installed
npm install --global windows-build-tools
```

**Electron app doesn't start**
```bash
# Try rebuilding native modules
npm run postinstall
```

For more help, [open an issue](https://github.com/CodeByBryant/Evo/issues) on GitHub.
