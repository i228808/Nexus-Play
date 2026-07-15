import { getDb } from '../db/index.ts';
import { games, gameMetadata, launchProfiles } from '../db/schema.ts';
import { eq, sql, and, notInArray } from 'drizzle-orm';
import { SteamPlugin, LegendaryPlugin, ManualPlugin, EmulatorPlugin } from '@nexus-play/plugins';
import { Game, LaunchProfile, normalizeTitle } from '@nexus-play/core';
import { log } from './logger.ts';
import { exec, execFile } from 'node:child_process';
import { fetchAndCacheMetadata } from './metadataService.ts';
import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getSettings } from './settings.ts';
import { setPlayingPresence, setIdlePresence } from './discordRpc.ts';
import { applyMetadataFromSgdbId } from './metadataService.ts';
import { configureControllers } from './controllerService.ts';

const steamPlugin = new SteamPlugin();
const legendaryPlugin = new LegendaryPlugin();
const manualPlugin = new ManualPlugin();

// Map of game IDs that are currently running and tracked
const runningGames = new Map<string, { startTime: number; timer: NodeJS.Timeout; pid?: number; processTarget: string }>();

/** Notify all renderer windows that a game stopped automatically */
function notifyGameStopped(gameId: string) {
  log('launcher', `Game ${gameId} stopped — notifying UI`);
  setIdlePresence();
  try {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('game:stopped', gameId);
    }
  } catch (e) {
    // Window may already be closed
  }
}

function getProcessTarget(game: Game): string {
  const candidate = game.executablePath || game.installPath || game.title;
  return candidate.split(/[\\/]/).pop() || candidate;
}

function needsDualSenseXInputFallback(game: Game): boolean {
  const executable = (game.executablePath || '').toLowerCase();
  const title = normalizeTitle(game.title);
  return executable.includes('sekiro') || title.includes('sekiro');
}

function needsDualSenseHapticsRouting(game: Game): boolean {
  const executable = (game.executablePath || '').toLowerCase();
  return executable.includes('gowr') || normalizeTitle(game.title).includes('god of war ragnarok');
}

function needsDualSenseHybridInput(game: Game): boolean {
  const match = [
    game.id,
    game.title,
    game.executablePath,
    game.launchCommand,
  ].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, '');
  return match.includes('hogwartslegacy');
}

function runPactl(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('pactl', args, (error, stdout) => {
      resolve(error ? '' : stdout);
    });
  });
}

async function getDualSenseSink(): Promise<string> {
  const sinks = await runPactl(['list', 'short', 'sinks']);
  return sinks
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1]?.toLowerCase().includes('dualsense') || parts[1]?.toLowerCase().includes('sony_interactive_entertainment'))?.[1] || '';
}

async function getDefaultSpeakerSink(dualSenseSink: string): Promise<string> {
  const info = await runPactl(['info']);
  const defaultSink = info.match(/^Default Sink:\s*(.+)$/m)?.[1]?.trim() || '';
  if (defaultSink && defaultSink !== dualSenseSink) return defaultSink;

  const sinks = await runPactl(['list', 'short', 'sinks']);
  return sinks
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1] && parts[1] !== dualSenseSink)?.[1] || '';
}

async function routeDualSenseHaptics(game: Game) {
  if (!needsDualSenseHapticsRouting(game)) return;

  const dualSenseSink = await getDualSenseSink();
  if (!dualSenseSink) return;

  await runPactl(['set-sink-mute', dualSenseSink, '0']);
  const speakerSink = await getDefaultSpeakerSink(dualSenseSink);
  if (!speakerSink) return;

  const inputs = await runPactl(['list', 'sink-inputs']);
  const gowInputs = inputs
    .split(/\n(?=Sink Input #)/)
    .filter((block) => /application\.name = "GoWR"/.test(block))
    .map((block) => ({
      id: block.match(/Sink Input #(\d+)/)?.[1] || '',
      channels: Number(block.match(/Sample Specification: .*?(\d+)ch/)?.[1] || 0),
    }))
    .filter((input) => input.id && input.channels >= 4);

  for (const input of gowInputs.slice(1)) {
    await runPactl(['move-sink-input', input.id, speakerSink]);
    log('launcher', `Moved GoW ${input.channels}-channel audio stream ${input.id} to speaker sink ${speakerSink}; first stream remains on DualSense`);
  }
}

function getSteamCompatPrefix(externalId?: string): string {
  if (!externalId) return '';

  let appId = externalId;
  if (externalId.startsWith('nonsteam-')) {
    try {
      appId = (BigInt(externalId.slice('nonsteam-'.length)) >> 32n).toString();
    } catch {
      return '';
    }
  }

  const home = process.env.HOME || '';
  const candidates = [
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.steam', 'steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  ];

  return candidates
    .map((steamPath) => path.join(steamPath, 'steamapps', 'compatdata', appId))
    .find((prefix) => fs.existsSync(path.join(prefix, 'pfx', 'system.reg'))) || '';
}

function escapeProcessPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z';
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

function hasMatchingProcess(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('pgrep', ['-f', escapeProcessPattern(target)], (error, stdout) => {
      resolve(!error && Boolean(stdout.trim()));
    });
  });
}

function killMatchingProcess(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('pkill', ['-9', '-f', escapeProcessPattern(target)], (error) => {
      resolve(!error);
    });
  });
}

async function completeGameTracking(id: string) {
  const tracked = runningGames.get(id);
  if (!tracked) return;

  clearInterval(tracked.timer);
  runningGames.delete(id);
  const duration = Math.floor((Date.now() - tracked.startTime) / 1000);
  await savePlaytime(id, duration);
  notifyGameStopped(id);
}

export async function listGames(): Promise<Game[]> {
  try {
    const db = getDb();
    const rows = await db.select({
      id: games.id,
      title: games.title,
      normalizedTitle: games.normalizedTitle,
      source: games.source,
      externalId: games.externalId,
      installPath: games.installPath,
      executablePath: games.executablePath,
      launchCommand: games.launchCommand,
      platform: games.platform,
      installed: games.installed,
      hidden: games.hidden,
      favorite: games.favorite,
      playtimeSeconds: games.playtimeSeconds,
      lastPlayedAt: games.lastPlayedAt,
      createdAt: games.createdAt,
      updatedAt: games.updatedAt,
      coverUrl: gameMetadata.coverUrl,
      heroUrl: gameMetadata.heroUrl,
      description: gameMetadata.description,
      developers: gameMetadata.developers,
      genres: gameMetadata.genres,
      rating: gameMetadata.rating,
      releaseDate: gameMetadata.releaseDate,
    })
    .from(games)
    .leftJoin(gameMetadata, eq(games.id, gameMetadata.gameId));

    return rows.map(r => ({
      ...r,
      installed: !!r.installed,
      hidden: !!r.hidden,
      favorite: !!r.favorite,
    })) as Game[];
  } catch (err: any) {
    log('main', `Failed to list games: ${err.message}`, 'ERROR');
    return [];
  }
}

export async function getGameDetail(id: string) {
  const db = getDb();
  const gameRows = await db.select().from(games).where(eq(games.id, id));
  if (gameRows.length === 0) return null;

  const game = gameRows[0];
  const metadataRows = await db.select().from(gameMetadata).where(eq(gameMetadata.gameId, id));
  const profilesRows = await db.select().from(launchProfiles).where(eq(launchProfiles.gameId, id));

  return {
    game: {
      ...game,
      installed: !!game.installed,
      hidden: !!game.hidden,
      favorite: !!game.favorite,
    },
    metadata: metadataRows[0] || null,
    profiles: profilesRows,
  };
}

export async function scanSources(): Promise<{ steam: number; legendary: number; roms: number; total: number }> {
  log('scanner', 'Starting game scan...');
  const db = getDb();
  let steamCount = 0;
  let legendaryCount = 0;
  let romCount = 0;

  const now = new Date().toISOString();

  // 1. Scan Steam
  try {
    const isSteamInstalled = await steamPlugin.detectInstallation();
    if (isSteamInstalled) {
      log('scanner', 'Steam detected. Scanning Steam library...');
      const steamGames = await steamPlugin.scan();
      log('scanner', `Found ${steamGames.length} games in Steam.`);

      for (const sg of steamGames) {
        const id = `steam:${sg.externalId}`;
        const normalized = normalizeTitle(sg.title);

        // Upsert into games
        const existing = await db.select().from(games).where(eq(games.id, id));
        if (existing.length > 0) {
          await db.update(games).set({
            title: sg.title,
            normalizedTitle: normalized,
            installPath: sg.installPath,
            executablePath: sg.executablePath,
            launchCommand: sg.launchCommand,
            launchOptions: sg.launchOptions,
            platform: sg.platform,
            installed: sg.installed,
            updatedAt: now,
          }).where(eq(games.id, id));
        } else {
          await db.insert(games).values({
            id,
            title: sg.title,
            normalizedTitle: normalized,
            source: 'steam',
            externalId: sg.externalId,
            installPath: sg.installPath,
            executablePath: sg.executablePath,
            launchCommand: sg.launchCommand,
            launchOptions: sg.launchOptions,
            platform: sg.platform,
            installed: sg.installed,
            createdAt: now,
            updatedAt: now,
          });

          // Trigger async metadata fetch in background (do not block scan)
          fetchAndCacheMetadata(id, sg.title).catch(err => {
            log('metadata', `Background fetch failed for ${sg.title}: ${err.message}`, 'WARN');
          });
        }
        steamCount++;
      }

      // Mark any steam games no longer detected as uninstalled
      const scannedSteamIds = steamGames.map(sg => `steam:${sg.externalId}`);
      if (scannedSteamIds.length > 0) {
        await db.update(games)
          .set({ installed: false })
          .where(and(eq(games.source, 'steam'), notInArray(games.id, scannedSteamIds)));
      } else {
        await db.update(games)
          .set({ installed: false })
          .where(eq(games.source, 'steam'));
      }

    } else {
      log('scanner', 'Steam client not detected.');
    }
  } catch (err: any) {
    log('scanner', `Error scanning Steam: ${err.message}`, 'ERROR');
  }

  // 2. Scan Legendary (Epic Games)
  try {
    const isLegendaryInstalled = await legendaryPlugin.detectInstallation();
    if (isLegendaryInstalled) {
      log('scanner', 'Legendary detected. Scanning Epic library...');
      const epicGames = await legendaryPlugin.scan();
      log('scanner', `Found ${epicGames.length} games in Legendary.`);

      for (const eg of epicGames) {
        const id = `legendary:${eg.externalId}`;
        const normalized = normalizeTitle(eg.title);

        // Upsert
        const existing = await db.select().from(games).where(eq(games.id, id));
        if (existing.length > 0) {
          const pinnedManual = existing[0].source === 'manual';
          await db.update(games).set({
            title: eg.title,
            normalizedTitle: normalized,
            installPath: pinnedManual ? existing[0].installPath : eg.installPath,
            executablePath: pinnedManual ? existing[0].executablePath : eg.executablePath,
            launchCommand: pinnedManual ? existing[0].launchCommand : eg.launchCommand,
            platform: pinnedManual ? existing[0].platform : eg.platform,
            installed: eg.installed,
            updatedAt: now,
          }).where(eq(games.id, id));
        } else {
          await db.insert(games).values({
            id,
            title: eg.title,
            normalizedTitle: normalized,
            source: 'legendary',
            externalId: eg.externalId,
            installPath: eg.installPath,
            executablePath: eg.executablePath,
            launchCommand: eg.launchCommand,
            platform: eg.platform,
            installed: eg.installed,
            createdAt: now,
            updatedAt: now,
          });

          // Trigger async metadata fetch in background
          fetchAndCacheMetadata(id, eg.title).catch(err => {
            log('metadata', `Background fetch failed for ${eg.title}: ${err.message}`, 'WARN');
          });
        }
        legendaryCount++;
      }
    } else {
      log('scanner', 'Legendary CLI not detected.');
    }
  } catch (err: any) {
    log('scanner', `Error scanning Legendary: ${err.message}`, 'ERROR');
  }

  // 3. Scan ROMs / Emulators
  try {
    const settings = await getSettings();
    const romDirs = settings.romDirectories ? settings.romDirectories.split(',').map(d => d.trim()).filter(Boolean) : [];

    const emulatorPlugin = new EmulatorPlugin({
      romDirectories: romDirs,
      ryujinxPath: settings.ryujinxPath,
      yuzuPath: settings.yuzuPath,
      pcsx2Path: settings.pcsx2Path,
    });

    const isEmuActive = await emulatorPlugin.detectInstallation();
    if (isEmuActive) {
      log('scanner', 'ROM directories detected. Scanning for retro games...');
      const emuGames = await emulatorPlugin.scan();
      log('scanner', `Found ${emuGames.length} ROMs.`);

      for (const eg of emuGames) {
        const id = `rom:${eg.externalId}`;
        const normalized = normalizeTitle(eg.title);

        const existing = await db.select().from(games).where(eq(games.id, id));
        if (existing.length > 0) {
          await db.update(games).set({
            title: eg.title,
            normalizedTitle: normalized,
            installPath: eg.installPath,
            executablePath: eg.executablePath,
            launchCommand: eg.launchCommand,
            platform: eg.platform,
            installed: eg.installed,
            updatedAt: now,
          }).where(eq(games.id, id));
        } else {
          await db.insert(games).values({
            id,
            title: eg.title,
            normalizedTitle: normalized,
            source: 'rom',
            externalId: eg.externalId,
            installPath: eg.installPath,
            executablePath: eg.executablePath,
            launchCommand: eg.launchCommand,
            platform: eg.platform,
            installed: eg.installed,
            createdAt: now,
            updatedAt: now,
          });

          fetchAndCacheMetadata(id, eg.title).catch(err => {
            log('metadata', `Background fetch failed for ${eg.title}: ${err.message}`, 'WARN');
          });
        }
        romCount++;
      }
    }
  } catch (err: any) {
    log('scanner', `Error scanning ROMs: ${err.message}`, 'ERROR');
  }

  log('scanner', `Scan completed. Steam: ${steamCount}, Legendary: ${legendaryCount}, ROMs: ${romCount}`);
  return { steam: steamCount, legendary: legendaryCount, roms: romCount, total: steamCount + legendaryCount + romCount };
}

export async function addManualGame(gameData: {
  title: string;
  launchCommand: string;
  launchOptions?: string;
  installPath?: string;
  executablePath?: string;
  platform?: Game["platform"];
}): Promise<Game> {
  const db = getDb();
  const now = new Date().toISOString();
  const id = `manual:${Math.random().toString(36).substring(2, 11)}`;
  const normalized = normalizeTitle(gameData.title);

  const game = {
    id,
    title: gameData.title,
    normalizedTitle: normalized,
    source: 'manual' as const,
    launchCommand: gameData.launchCommand,
    launchOptions: gameData.launchOptions || null,
    installPath: gameData.installPath || null,
    executablePath: gameData.executablePath || null,
    platform: gameData.platform || 'linux',
    installed: true,
    hidden: false,
    favorite: false,
    playtimeSeconds: 0,
    lastPlayedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(games).values(game as any);
  log('main', `Manually added game: ${gameData.title}`);

  // Fetch metadata in background
  fetchAndCacheMetadata(id, gameData.title).catch(err => {
    log('metadata', `Background fetch failed for ${gameData.title}: ${err.message}`, 'WARN');
  });

  return game as any;
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.select().from(games).where(eq(games.id, id));
  if (rows.length === 0) return false;

  const newValue = !rows[0].favorite;
  await db.update(games).set({ favorite: newValue }).where(eq(games.id, id));
  log('main', `Game ${id} favorite toggled to ${newValue}`);
  return newValue;
}

export async function toggleHide(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.select().from(games).where(eq(games.id, id));
  if (rows.length === 0) return false;

  const newValue = !rows[0].hidden;
  await db.update(games).set({ hidden: newValue }).where(eq(games.id, id));
  log('main', `Game ${id} hidden toggled to ${newValue}`);
  return newValue;
}

export async function launchGame(id: string): Promise<{ success: boolean; error?: string }> {
  log('launcher', `Attempting to launch game: ${id}`);
  const db = getDb();
  const gameRows = await db.select().from(games).where(eq(games.id, id));
  if (gameRows.length === 0) {
    return { success: false, error: 'Game not found in database' };
  }

  const game = gameRows[0] as Game;

  // Check if already running
  if (runningGames.has(id)) {
    return { success: false, error: 'Game is already running' };
  }

  let result;

  let tempProfile: LaunchProfile | undefined = undefined;
  if (game.source === 'steam' || game.source === 'manual' || game.source === 'legendary') {
    const prefix = game.source === 'steam'
      ? getSteamCompatPrefix(game.externalId)
      : game.winePrefix || path.join(process.env.HOME || '/tmp', '.local', 'share', 'nexus-play', 'prefixes', 'default');
    const extraEnv = await configureControllers(prefix, {
      forceXInput: needsDualSenseXInputFallback(game),
      hybridXInput: needsDualSenseHybridInput(game),
    });
    if (needsDualSenseHapticsRouting(game)) {
      const dualSenseSink = await getDualSenseSink();
      if (dualSenseSink) extraEnv.PULSE_SINK = dualSenseSink;
    }
    if (Object.keys(extraEnv).length > 0) {
      tempProfile = {
        id: 'temp-profile',
        gameId: id,
        name: 'Temp Profile',
        environmentJson: JSON.stringify(extraEnv),
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as LaunchProfile;
    }
  }

  if (game.source === 'steam') {
    result = await steamPlugin.launch(game, tempProfile);
  } else if (game.source === 'legendary') {
    result = await legendaryPlugin.launch(game, tempProfile);
  } else if (game.source === 'manual') {
    result = await manualPlugin.launch(game, tempProfile);
  } else if (game.source === 'rom') {
    const settings = await getSettings();
    const romDirs = settings.romDirectories ? settings.romDirectories.split(',').map(d => d.trim()).filter(Boolean) : [];
    const emulatorPlugin = new EmulatorPlugin({
      romDirectories: romDirs,
      ryujinxPath: settings.ryujinxPath,
      yuzuPath: settings.yuzuPath,
      pcsx2Path: settings.pcsx2Path,
    });
    result = await emulatorPlugin.launch(game, tempProfile);
  } else {
    return { success: false, error: `Unsupported game source: ${game.source}` };
  }

  if (!result.success) {
    log('launcher', `Failed to launch ${game.title}: ${result.error}`, 'ERROR');
    return { success: false, error: result.error };
  }

  log('launcher', `Successfully triggered launch for ${game.title}`);
  if (needsDualSenseHapticsRouting(game)) {
    [5000, 10000, 15000].forEach((delay) => {
      setTimeout(() => {
        routeDualSenseHaptics(game).catch((err: any) => {
          log('launcher', `DualSense haptics routing failed: ${err.message}`, 'WARN');
        });
      }, delay);
    });
  }

  // Track Playtime
  const startTime = Date.now();

  const processTarget = getProcessTarget(game);
  let missedCount = 0;
  let checkCount = 0;
  log('launcher', `Tracking ${game.title}${result.pid ? ` via PID ${result.pid}` : ''} with process target "${processTarget}"`);

  const timer = setInterval(async () => {
    checkCount++;
    const pidAlive = result.pid ? isPidAlive(result.pid) : false;
    const gameAlive = pidAlive || await hasMatchingProcess(processTarget);

    if (gameAlive) {
      missedCount = 0;
      return;
    }

    missedCount++;
    const threshold = checkCount < 10 ? 5 : 3;
    if (missedCount >= threshold) {
      await completeGameTracking(id);
    }
  }, 3000);

  runningGames.set(id, { startTime, timer, pid: result.pid, processTarget });

  // Update Discord RPC
  setPlayingPresence(game.title);

  // Update last played time immediately
  const nowStr = new Date().toISOString();
  await db.update(games).set({ lastPlayedAt: nowStr }).where(eq(games.id, id));

  return { success: true };
}

export async function stopGame(id: string): Promise<{ success: boolean; error?: string }> {
  log('launcher', `Attempting to stop game: ${id}`);
  const gameData = runningGames.get(id);
  if (!gameData) {
    return { success: false, error: 'Game is not running or tracking was lost' };
  }

  const db = getDb();
  const gameRows = await db.select().from(games).where(eq(games.id, id));
  if (gameRows.length === 0) return { success: false, error: 'Game not found' };

  const game = gameRows[0] as Game;

  // Try to kill the tracked process group first, then the game-specific matcher.
  let killed = false;

  if (gameData.pid) {
    try {
      // Try killing the process group (if detached)
      process.kill(-gameData.pid, 'SIGKILL');
      killed = true;
    } catch (e) {
      try {
        process.kill(gameData.pid, 'SIGKILL');
        killed = true;
      } catch (err) {
        log('launcher', `Failed to kill PID ${gameData.pid}`, 'WARN');
      }
    }
  }

  if (!killed && gameData.processTarget) {
    killed = await killMatchingProcess(gameData.processTarget);
  }

  if (!killed) {
    return { success: false, error: `Could not safely identify a process for ${game.title}` };
  }

  // Finalize tracking
  await completeGameTracking(id);

  return { success: true };
}

function restoreMainWindow() {
  try {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWin = windows[0];
      // show() is needed because we use hide() (not minimize()) when
      // launching games — this works reliably on all compositors
      // including Wayland/tiling ones like niri where minimize()
      // doesn't remove the window from the workspace.
      if (!mainWin.isVisible()) {
        mainWin.show();
      }
      if (mainWin.isMinimized()) {
        mainWin.restore();
      }
      mainWin.focus();
      log('launcher', 'Restored launcher window to foreground.');
    }
  } catch (err: any) {
    log('launcher', `Failed to restore launcher window: ${err.message}`, 'WARN');
  }
}

async function savePlaytime(gameId: string, durationSeconds: number) {
  restoreMainWindow();
  if (durationSeconds < 3) return;

  const db = getDb();
  log('launcher', `Game ${gameId} exited. Played for ${durationSeconds} seconds.`);

  try {
    await db.update(games).set({
      playtimeSeconds: sql`${games.playtimeSeconds} + ${durationSeconds}`,
      updatedAt: new Date().toISOString()
    }).where(eq(games.id, gameId));
  } catch (err: any) {
    log('launcher', `Failed to update playtime for ${gameId}: ${err.message}`, 'ERROR');
  }
}

export async function deleteGame(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const rows = await db.select().from(games).where(eq(games.id, id));
    if (rows.length === 0) return { success: false, error: 'Game not found' };

    await db.delete(games).where(eq(games.id, id));
    log('main', `Deleted game ${id}`);
    return { success: true };
  } catch (err: any) {
    log('main', `Failed to delete game ${id}: ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
}

export async function installGame(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const rows = await db.select().from(games).where(eq(games.id, id));
    if (rows.length === 0) return { success: false, error: 'Game not found' };
    const game = rows[0] as Game;

    if (game.source === 'steam') {
      exec(`steam steam://install/${game.externalId}`);
      return { success: true };
    } else if (game.source === 'legendary') {
      const settings = await getSettings();
      const exe = settings.legendaryPath || 'legendary';
      exec(`"${exe}" install ${game.externalId} -y`);
      return { success: true };
    }
    return { success: false, error: 'Install not supported for this source' };
  } catch (err: any) {
    log('main', `Install failed for ${id}: ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
}

export async function uninstallGame(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const rows = await db.select().from(games).where(eq(games.id, id));
    if (rows.length === 0) return { success: false, error: 'Game not found' };
    const game = rows[0] as Game;

    if (game.source === 'steam') {
      exec(`steam steam://uninstall/${game.externalId}`);
      // Steam handles its own uninstall UI, we will wait for a scan to update the DB.
      return { success: true };
    } else if (game.source === 'legendary') {
      const settings = await getSettings();
      const exe = settings.legendaryPath || 'legendary';
      exec(`"${exe}" uninstall ${game.externalId} -y`, async (err) => {
        if (!err) {
          await db.update(games).set({ installed: false }).where(eq(games.id, id));
        }
      });
      return { success: true };
    }
    return { success: false, error: 'Uninstall not supported for this source' };
  } catch (err: any) {
    log('main', `Uninstall failed for ${id}: ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
}

// ─── Search SteamGridDB for a game by title — returns result list ────────────
export async function searchMetadataForGame(query: string): Promise<{
  id: number;
  name: string;
  releaseDate?: string;
  types: string[];
}[]> {
  const { fetchSgdbSearch } = await import('./metadataService.ts');
  return fetchSgdbSearch(query);
}

// ─── Apply a chosen SGDB result to a game ────────────────────────────────────
export async function applyGameMetadata(
  gameId: string,
  sgdbGameId: number,
  gameTitle: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await applyMetadataFromSgdbId(gameId, sgdbGameId, gameTitle);
    log('metadata', `Manually applied metadata for ${gameTitle} (SGDB: ${sgdbGameId})`);
    return { success: true };
  } catch (err: any) {
    log('metadata', `Failed to apply metadata: ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
}

// re-export so it can be called with just an sgdbId
export { applyMetadataFromSgdbId };

export async function updateGameTitle(
  id: string,
  title: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const now = new Date().toISOString();
    await db.update(games).set({ title, normalizedTitle, updatedAt: now }).where(eq(games.id, id));
    log('main', `Successfully updated title of game ${id} to "${title}"`);
    return { success: true };
  } catch (err: any) {
    log('main', `Failed to update title for game ${id}: ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
}

export async function updateGameConfiguration(
  id: string,
  config: { winePrefix?: string; protonVersion?: string; launchOptions?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    await db.update(games).set({
      winePrefix: config.winePrefix,
      protonVersion: config.protonVersion,
      launchOptions: config.launchOptions,
      updatedAt: now
    }).where(eq(games.id, id));
    log('main', `Successfully updated configuration of game ${id}`);
    return { success: true };
  } catch (err: any) {
    log('main', `Failed to update configuration for game ${id}: ${err.message}`, 'ERROR');
    return { success: false, error: err.message };
  }
}
