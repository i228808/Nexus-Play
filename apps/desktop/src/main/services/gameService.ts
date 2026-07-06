import { getDb } from '../db/index.ts';
import { games, gameMetadata, launchProfiles } from '../db/schema.ts';
import { eq, sql } from 'drizzle-orm';
import { SteamPlugin, LegendaryPlugin, ManualPlugin } from '@nexus-play/plugins';
import { Game, normalizeTitle } from '@nexus-play/core';
import { log } from './logger.ts';
import { exec } from 'node:child_process';
import { fetchAndCacheMetadata } from './metadataService.ts';
import { BrowserWindow } from 'electron';
import path from 'node:path';

const steamPlugin = new SteamPlugin();
const legendaryPlugin = new LegendaryPlugin();
const manualPlugin = new ManualPlugin();

// Map of game IDs that are currently running and tracked
const runningGames = new Map<string, { startTime: number; timer: NodeJS.Timeout }>();

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

export async function scanSources(): Promise<{ steam: number; legendary: number; total: number }> {
  log('scanner', 'Starting game scan...');
  const db = getDb();
  let steamCount = 0;
  let legendaryCount = 0;

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

  log('scanner', `Scan completed. Steam: ${steamCount}, Legendary: ${legendaryCount}`);
  return { steam: steamCount, legendary: legendaryCount, total: steamCount + legendaryCount };
}

export async function addManualGame(gameData: {
  title: string;
  launchCommand: string;
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
  if (game.source === 'steam') {
    result = await steamPlugin.launch(game);
  } else if (game.source === 'legendary') {
    result = await legendaryPlugin.launch(game);
  } else if (game.source === 'manual') {
    result = await manualPlugin.launch(game);
  } else {
    return { success: false, error: `Unsupported game source: ${game.source}` };
  }

  if (!result.success) {
    log('launcher', `Failed to launch ${game.title}: ${result.error}`, 'ERROR');
    return { success: false, error: result.error };
  }

  log('launcher', `Successfully triggered launch for ${game.title}`);
  
  // Track Playtime
  const startTime = Date.now();
  
  // Setup PID or process grep tracking
  let timer: NodeJS.Timeout;
  if (result.pid) {
    const pid = result.pid;
    log('launcher', `Tracking ${game.title} via PID ${pid}`);
    timer = setInterval(async () => {
      try {
        // Send signal 0 to check if process exists
        process.kill(pid, 0);
      } catch (err) {
        // Process is dead
        clearInterval(timer);
        runningGames.delete(id);
        const duration = Math.floor((Date.now() - startTime) / 1000);
        await savePlaytime(id, duration);
      }
    }, 3000);
  } else {
    // Steam launch or similar without a return PID. Fallback to process grep on installPath directory name.
    const installDirName = game.installPath ? path.basename(game.installPath) : '';
    if (installDirName) {
      log('launcher', `Tracking ${game.title} via process grep search for folder name: "${installDirName}"`);
      
      let missedCount = 0;
      timer = setInterval(() => {
        // We grep for the install directory name in the process tree.
        // It fits Wine, Proton, and native games well as the path is in the cmdline.
        exec(`pgrep -f "${installDirName}"`, async (err, stdout) => {
          if (err || !stdout.trim()) {
            // Give it 3 checks (9 seconds) to buffer load times
            missedCount++;
            if (missedCount >= 3) {
              clearInterval(timer);
              runningGames.delete(id);
              const duration = Math.floor((Date.now() - startTime) / 1000);
              await savePlaytime(id, duration);
            }
          } else {
            missedCount = 0; // Reset, process is currently alive
          }
        });
      }, 3000);
    } else {
      // Complete fallback
      log('launcher', `No PID and no installPath for ${game.title}. Tracking default 1-hour session unless stopped.`, 'WARN');
      timer = setInterval(async () => {
        // Simple session stop check (e.g. if we can't grep it, we just let it run or stop it in UI)
        // For MVP, if there is no path, we check if wine processes are active if platform is windows
        exec('pgrep -i wine || pgrep -f proton', async (err, stdout) => {
          if (err || !stdout.trim()) {
            clearInterval(timer);
            runningGames.delete(id);
            const duration = Math.floor((Date.now() - startTime) / 1000);
            await savePlaytime(id, duration);
          }
        });
      }, 5000);
    }
  }

  runningGames.set(id, { startTime, timer });

  // Update last played time immediately
  const nowStr = new Date().toISOString();
  await db.update(games).set({ lastPlayedAt: nowStr }).where(eq(games.id, id));

  return { success: true };
}

function restoreMainWindow() {
  try {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWin = windows[0];
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

// ─── Delete a game entry from the library ────────────────────────────────────
export async function deleteGame(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const rows = await db.select().from(games).where(eq(games.id, id));
    if (rows.length === 0) return { success: false, error: 'Game not found' };

    // ON DELETE CASCADE handles metadata/assets/profiles
    await db.delete(games).where(eq(games.id, id));
    log('main', `Deleted game ${id}`);
    return { success: true };
  } catch (err: any) {
    log('main', `Failed to delete game ${id}: ${err.message}`, 'ERROR');
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
import { applyMetadataFromSgdbId } from './metadataService.ts';

