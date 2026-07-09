<div align="center">
  <img src="https://raw.githubusercontent.com/i228808/Nexus-Play/master/apps/desktop/build/icon.png" width="128" alt="Nexus Play Logo">
  
  # Nexus Play

  **The Ultimate Unified Game Command Center for Linux.**

  Bring your Steam library, Epic Games, Emulators, and custom local files together into one beautifully designed, controller-first interface.

  [![Release](https://img.shields.io/github/v/release/i228808/Nexus-Play?style=flat-square)](https://github.com/i228808/Nexus-Play/releases/latest)
  [![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
</div>

---

## 🎮 Features

- 🌌 **Big Picture Console Mode**: Sit back on the couch. Full gamepad support transforms your PC into a premium console experience.
- 📚 **Unified Library**: Automatically syncs your games from Steam and Legendary (Epic Games). Add custom games or Emulators manually.
- 🎨 **Automated Metadata**: Integrated SteamGridDB support instantly fetches gorgeous covers, hero artwork, and descriptions for all your games.
- ⏱️ **Playtime Tracking**: Accurately tracks your playtime and last played dates across all platforms.
- 🕹️ **Controller Support**: Seamless navigation using Xbox and PlayStation controllers.
- ⚡ **Auto-Updates**: Built-in background auto-updater via `electron-updater` keeps your launcher fresh.

## 🚀 Installation

The easiest way to get Nexus Play is to download the latest AppImage release.

1. Go to the [Releases page](https://github.com/i228808/Nexus-Play/releases/latest)
2. Download the `Nexus Play-0.1.0.AppImage` (or whatever the latest version is).
3. Make it executable and run it:
   ```bash
   chmod +x Nexus\ Play-*.AppImage
   ./Nexus\ Play-*.AppImage
   ```

## 🛠️ Development & Building Locally

Nexus Play is a modern monorepo built with Electron, React (Vite), TypeScript, Drizzle ORM, and TailwindCSS.

### Prerequisites
- Node.js (v18+)
- npm (v9+)
- Python, `make`, and `g++` (for native sqlite3 bindings)

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/i228808/Nexus-Play.git
   cd Nexus-Play
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate and push the SQLite database schema:
   ```bash
   npm run db:generate
   npm run db:push
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

### Packaging
To build the AppImage and other distribution formats for your system:
```bash
npm run package
```
The output binaries will be placed in `apps/desktop/dist/`.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](https://github.com/i228808/Nexus-Play/issues).

## 📄 License

This project is [MIT](LICENSE) licensed.
