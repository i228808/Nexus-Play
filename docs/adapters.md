# Launch Adapters & Plugins

Nexus Play implements a plugin-based architecture for game discovery and launching.

## Plugin Contract
All launch plugins must implement the `LibraryPlugin` interface defined in `packages/plugins/src/index.ts`:

```typescript
export interface LibraryPlugin {
  id: string; // Unique identifier (e.g. 'steam')
  name: string; // User-facing name (e.g. 'Steam')
  detectInstallation(): Promise<boolean>; // Returns true if launcher CLI or folder is detected on the OS
  scan(): Promise<DetectedGame[]>; // Discovers installed games on the system
  launch(game: Game, profile?: LaunchProfile): Promise<LaunchResult>; // Spawns the game
}
```

## Built-in Adapters

### 1. Steam Adapter
- **Detection**: Checks standard symlink `~/.steam/steam` and Flatpak directory `~/.var/app/com.valvesoftware.Steam/`.
- **Scanning**: Reads `libraryfolders.vdf` to parse library folders, then iterates over `steamapps/appmanifest_*.acf` files. Uses a custom regex VDF parser to extract game names and App IDs.
- **Launching**: Spawns `steam steam://rungameid/<appid>`, delegating authentication and loading to the running Steam daemon.
- **Tracking**: Checks active processes for instances containing the installation directory name in their CLI string using `pgrep -f`.

### 2. Legendary (Epic Games) Adapter
- **Detection**: Checks if `legendary --version` command is available.
- **Scanning**: Directly reads `~/.config/legendary/installed.json` (for maximum speed and offline-first usage), falling back to `legendary list-installed --json` if needed.
- **Launching**: Spawns `legendary launch <app_name>` as a background child process.
- **Tracking**: Since Legendary CLI blocks until the game process exits, Nexus Play tracks the spawned PID directly using `process.kill(pid, 0)`.

### 3. Manual Games Adapter
- **Detection**: Always returns `true`.
- **Scanning**: Returns an empty array (manual games are added by user in the UI).
- **Launching**: Spawns the user-configured command in the system shell (`shell: true`). This supports environment prefixes such as `mangohud`, `gamemoderun`, and Proton variables.
- **Tracking**: Monitors the PID of the spawned shell process, which exits when the underlying command finishes execution.
