import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { initDatabase } from './db/index.ts';
import { log, readLogs } from './services/logger.ts';
import { getSettings, updateSettings } from './services/settings.ts';
import {
  listGames,
  getGameDetail,
  scanSources,
  addManualGame,
  toggleFavorite,
  toggleHide,
  launchGame,
  deleteGame,
  searchMetadataForGame,
  applyGameMetadata,
  updateGameTitle
} from './services/gameService.ts';
import { getAssetCacheDir } from './services/metadataService.ts';
import { getControllerBatteryInfo } from './services/batteryService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// Register custom protocol for local image caching before app ready
protocol.registerSchemesAsPrivileged([
  { 
    scheme: 'nexus-media', 
    privileges: { 
      bypassCSP: true, 
      secure: true, 
      supportFetchAPI: true,
      corsEnabled: true 
    } 
  }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 950,
    minHeight: 600,
    title: 'Nexus Play',
    frame: true, // Use system frame for stable close/min buttons, can style inside
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    backgroundColor: '#030712',
  });

  // Remove standard browser menu
  mainWindow.setMenuBarVisibility(false);

  // Development Server URL injected by electron-vite plugin
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  log('main', 'Nexus Play application starting...');
  
  // Register custom protocol handler for safe cached image loading
  protocol.handle('nexus-media', (request) => {
    try {
      const url = new URL(request.url);
      const host = url.host || '';
      const filePath = decodeURIComponent(path.join(host, url.pathname));
      const assetDir = getAssetCacheDir();
      let absolutePath = path.join(assetDir, filePath);
      
      // Auto-resolve missing file extensions
      if (!fs.existsSync(absolutePath)) {
        const extCandidates = ['.jpg', '.png', '.jpeg', '.webp'];
        for (const ext of extCandidates) {
          const candidatePath = absolutePath + ext;
          if (fs.existsSync(candidatePath)) {
            absolutePath = candidatePath;
            break;
          }
        }
      }

      // Directory traversal protection
      const relative = path.relative(assetDir, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        log('main', `Blocked attempt to access path outside assets cache: ${absolutePath}`, 'WARN');
        return new Response('Access Denied', { status: 403 });
      }

      return net.fetch(pathToFileURL(absolutePath).toString());
    } catch (err: any) {
      log('main', `Failed to serve media file: ${err.message}`, 'ERROR');
      return new Response('Error serving media file', { status: 500 });
    }
  });

  // Initialize SQLite database
  initDatabase();

  // --- Register IPC handlers ---
  ipcMain.handle('games:list', async () => {
    return await listGames();
  });

  ipcMain.handle('games:get', async (_, id: string) => {
    return await getGameDetail(id);
  });

  ipcMain.handle('games:scanSources', async () => {
    return await scanSources();
  });

  ipcMain.handle('games:launch', async (_, id: string) => {
    const result = await launchGame(id);
    if (result.success) {
      const settings = await getSettings();
      if (settings.minimizeOnLaunch && mainWindow) {
        mainWindow.minimize();
      }
    }
    return result;
  });

  ipcMain.handle('games:toggleFavorite', async (_, id: string) => {
    return await toggleFavorite(id);
  });

  ipcMain.handle('games:toggleHide', async (_, id: string) => {
    return await toggleHide(id);
  });

  ipcMain.handle('games:addManual', async (_, gameData) => {
    return await addManualGame(gameData);
  });

  ipcMain.handle('settings:get', async () => {
    return await getSettings();
  });

  ipcMain.handle('settings:update', async (_, patch) => {
    return await updateSettings(patch);
  });

  ipcMain.handle('logs:get', async (_, file) => {
    return readLogs(file);
  });

  ipcMain.handle('controllers:getBatteryInfo', async () => {
    return getControllerBatteryInfo();
  });

  ipcMain.handle('games:delete', async (_, id: string) => {
    return deleteGame(id);
  });

  ipcMain.handle('games:searchMetadata', async (_, query: string) => {
    return searchMetadataForGame(query);
  });

  ipcMain.handle('games:applyMetadata', async (_, gameId: string, sgdbGameId: number, gameTitle: string) => {
    return applyGameMetadata(gameId, sgdbGameId, gameTitle);
  });

  ipcMain.handle('games:updateTitle', async (_, id: string, title: string) => {
    return updateGameTitle(id, title);
  });

  createWindow();

  // Run startup operations (e.g. scan on startup)
  getSettings().then((settings) => {
    if (settings.scanOnStartup) {
      log('main', 'Scan on startup is enabled. Triggering library scan...');
      scanSources().catch((err) => {
        log('scanner', `Startup library scan failed: ${err.message}`, 'WARN');
      });
    }
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
