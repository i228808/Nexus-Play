import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { app } from 'electron';
import { getDb } from '../db/index.ts';
import { games, gameMetadata } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { getSettings } from './settings.ts';
import { log } from './logger.ts';

let cacheDir: string | null = null;

function ensureFoldersExist(dir: string) {
  const assetTypes = ['covers', 'heroes', 'logos', 'icons'];
  for (const type of assetTypes) {
    const p = path.join(dir, type);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }
}

export function getAssetCacheDir(): string {
  if (!cacheDir) {
    try {
      const userData = app.getPath('userData');
      cacheDir = path.join(userData, 'assets');
    } catch (e) {
      const home = process.env.HOME || '/tmp';
      cacheDir = path.join(home, '.cache', 'NexusPlayDev', 'assets');
    }
    ensureFoldersExist(cacheDir);
  }
  return cacheDir;
}

/**
 * Downloads a file from a URL to a local destination path.
 */
function downloadFile(url: string, destPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    // Support redirect hops (SteamGridDB can redirect grid requests)
    const request = (targetUrl: string) => {
      https.get(targetUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            request(redirectUrl);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP Status ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {}); // Clean up partial file
        reject(err);
      });
    };

    request(url);
  });
}

function httpsGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Handle redirects if needed
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          httpsGet(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e: any) {
          reject(new Error(`Failed to parse JSON response: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function fetchSteamStoreMetadata(title: string): Promise<{
  description?: string;
  developers?: string;
  genres?: string;
  releaseDate?: string;
  rating?: number;
} | null> {
  try {
    log('metadata', `Searching Steam Store for descriptive info: "${title}"...`);
    // Remove common suffixes like '.exe', '.msi', and other trailing noise to get cleaner matches
    const cleanTitle = title
      .replace(/\.(exe|msi|bat|sh)$/i, '')
      .replace(/installer/i, '')
      .trim();

    const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleanTitle)}&l=english&cc=US`;
    const searchJson = await httpsGet(searchUrl);
    if (!searchJson || !searchJson.items || searchJson.items.length === 0) {
      log('metadata', `No Steam Store match found for "${cleanTitle}"`);
      return null;
    }

    const matched = searchJson.items[0];
    const appId = matched.id;
    log('metadata', `Matched "${cleanTitle}" to Steam AppID: ${appId}`);

    // Fetch details
    const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
    const detailsJson = await httpsGet(detailsUrl);
    const detailsData = detailsJson?.[appId];

    let description: string | undefined;
    let developers: string | undefined;
    let genres: string | undefined;
    let releaseDate: string | undefined;

    if (detailsData?.success && detailsData.data) {
      const d = detailsData.data;
      description = d.short_description || d.detailed_description;
      if (d.developers && Array.isArray(d.developers)) {
        developers = d.developers.join(', ');
      }
      if (d.genres && Array.isArray(d.genres)) {
        genres = d.genres.map((g: any) => g.description).join(', ');
      }
      if (d.release_date && d.release_date.date) {
        releaseDate = d.release_date.date;
      }
    }

    // Fetch reviews rating
    let rating: number | undefined;
    try {
      const reviewsUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&purchase_type=all`;
      const reviewsJson = await httpsGet(reviewsUrl);
      if (reviewsJson && reviewsJson.query_summary) {
        const sum = reviewsJson.query_summary;
        if (sum.total_reviews > 0) {
          rating = Math.round((sum.total_positive / sum.total_reviews) * 100);
        }
      }
    } catch (e: any) {
      log('metadata', `Failed to fetch Steam reviews: ${e.message}`, 'WARN');
    }

    return {
      description,
      developers,
      genres,
      releaseDate,
      rating
    };
  } catch (err: any) {
    log('metadata', `Failed to fetch Steam Store metadata for "${title}": ${err.message}`, 'WARN');
    return null;
  }
}

/**
 * Calls SteamGridDB API.
 */
async function sgdbRequest(endpoint: string, apiKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.steamgriddb.com',
      path: `/api/v2${endpoint}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`SteamGridDB error: Status ${res.statusCode} ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

export async function fetchAndCacheMetadata(gameId: string, gameTitle: string): Promise<void> {
  const db = getDb();
  const settings = await getSettings();
  const apiKey = settings.steamGridDbApiKey?.trim() || 'cb322daa48a712464a43096fe933bc12';
  const cacheDir = getAssetCacheDir();

  const now = new Date().toISOString();

  // If no API key, create/ensure a basic metadata entry in the DB and return
  if (!apiKey || apiKey.trim() === '') {
    log('metadata', `No SteamGridDB API key set. Skipping online fetch for "${gameTitle}".`);
    
    // Check if metadata already exists
    const existing = await db.select().from(gameMetadata).where(eq(gameMetadata.gameId, gameId));
    if (existing.length === 0) {
      const steamMeta = await fetchSteamStoreMetadata(gameTitle);
      await db.insert(gameMetadata).values({
        gameId,
        description: steamMeta?.description || 'No metadata available (API key missing)',
        developers: steamMeta?.developers,
        genres: steamMeta?.genres,
        releaseDate: steamMeta?.releaseDate,
        rating: steamMeta?.rating,
        updatedAt: now
      });
    }
    return;
  }

  log('metadata', `Fetching SteamGridDB metadata for: "${gameTitle}"`);

  try {
    // 1. Search for game
    const searchResult = await sgdbRequest(`/games/search/autocomplete?term=${encodeURIComponent(gameTitle)}`, apiKey);
    if (!searchResult.success || !searchResult.data || searchResult.data.length === 0) {
      log('metadata', `No SteamGridDB search results for "${gameTitle}"`, 'WARN');
      return;
    }

    const sgdbGame = searchResult.data[0];
    const sgdbGameId = sgdbGame.id;
    log('metadata', `Found match: "${sgdbGame.name}" (SGDB ID: ${sgdbGameId})`);

    // 2. Fetch cover (grid), hero, logo in parallel
    let coverUrl: string | undefined;
    let heroUrl: string | undefined;
    let logoUrl: string | undefined;

    const safeId = gameId.replace(/:/g, '_');

    // Fetch cover (grids)
    try {
      const grids = await sgdbRequest(`/grids/game/${sgdbGameId}`, apiKey);
      if (grids.success && grids.data && grids.data.length > 0) {
        const remoteUrl = grids.data[0].url;
        const localExt = path.extname(new URL(remoteUrl).pathname) || '.jpg';
        const localPath = path.join(cacheDir, 'covers', `${safeId}${localExt}`);
        log('metadata', `Downloading cover for ${gameTitle}...`);
        await downloadFile(remoteUrl, localPath);
        coverUrl = `nexus-media://covers/${safeId}${localExt}`;
      }
    } catch (e: any) {
      log('metadata', `Failed to download cover: ${e.message}`, 'WARN');
    }

    // Fetch hero
    try {
      const heroes = await sgdbRequest(`/heroes/game/${sgdbGameId}`, apiKey);
      if (heroes.success && heroes.data && heroes.data.length > 0) {
        const remoteUrl = heroes.data[0].url;
        const localExt = path.extname(new URL(remoteUrl).pathname) || '.jpg';
        const localPath = path.join(cacheDir, 'heroes', `${safeId}${localExt}`);
        log('metadata', `Downloading hero for ${gameTitle}...`);
        await downloadFile(remoteUrl, localPath);
        heroUrl = `nexus-media://heroes/${safeId}${localExt}`;
      }
    } catch (e: any) {
      log('metadata', `Failed to download hero: ${e.message}`, 'WARN');
    }

    // Fetch logo
    try {
      const logos = await sgdbRequest(`/logos/game/${sgdbGameId}`, apiKey);
      if (logos.success && logos.data && logos.data.length > 0) {
        const remoteUrl = logos.data[0].url;
        const localExt = path.extname(new URL(remoteUrl).pathname) || '.png';
        const localPath = path.join(cacheDir, 'logos', `${safeId}${localExt}`);
        log('metadata', `Downloading logo for ${gameTitle}...`);
        await downloadFile(remoteUrl, localPath);
        logoUrl = `nexus-media://logos/${safeId}${localExt}`;
      }
    } catch (e: any) {
      log('metadata', `Failed to download logo: ${e.message}`, 'WARN');
    }

    // Fetch descriptive metadata from Steam
    const steamMeta = await fetchSteamStoreMetadata(gameTitle);

    // 3. Save to database
    const existing = await db.select().from(gameMetadata).where(eq(gameMetadata.gameId, gameId));
    if (existing.length > 0) {
      await db.update(gameMetadata).set({
        coverUrl: coverUrl || existing[0].coverUrl,
        heroUrl: heroUrl || existing[0].heroUrl,
        logoUrl: logoUrl || existing[0].logoUrl,
        description: steamMeta?.description || existing[0].description,
        developers: steamMeta?.developers || existing[0].developers,
        genres: steamMeta?.genres || existing[0].genres,
        releaseDate: steamMeta?.releaseDate || existing[0].releaseDate,
        rating: steamMeta?.rating || existing[0].rating,
        metadataProvider: 'steamgriddb',
        providerGameId: String(sgdbGameId),
        updatedAt: now
      }).where(eq(gameMetadata.gameId, gameId));
    } else {
      await db.insert(gameMetadata).values({
        gameId,
        coverUrl,
        heroUrl,
        logoUrl,
        description: steamMeta?.description,
        developers: steamMeta?.developers,
        genres: steamMeta?.genres,
        releaseDate: steamMeta?.releaseDate,
        rating: steamMeta?.rating,
        metadataProvider: 'steamgriddb',
        providerGameId: String(sgdbGameId),
        updatedAt: now
      });
    }

    log('metadata', `Successfully updated metadata for: "${gameTitle}"`);
  } catch (err: any) {
    log('metadata', `Error fetching metadata for "${gameTitle}": ${err.message}`, 'ERROR');
  }
}

// ─── Search SGDB and return a list of matching games for the UI picker ────────
export async function fetchSgdbSearch(query: string): Promise<{
  id: number;
  name: string;
  releaseDate?: string;
  types: string[];
}[]> {
  const settings = await getSettings();
  const apiKey = settings.steamGridDbApiKey?.trim() || 'cb322daa48a712464a43096fe933bc12';
  if (!apiKey) return [];

  try {
    const result = await sgdbRequest(`/search/autocomplete/${encodeURIComponent(query)}`, apiKey);
    if (!result.success || !result.data) return [];
    return result.data.map((g: any) => ({
      id: g.id,
      name: g.name,
      releaseDate: g.release_date,
      types: g.types || [],
    }));
  } catch {
    return [];
  }
}

// ─── Download and store all art assets for a given SGDB game ID ──────────────
export async function applyMetadataFromSgdbId(
  gameId: string,
  sgdbGameId: number,
  _gameTitle: string
): Promise<void> {
  const db = getDb();
  const settings = await getSettings();
  const apiKey = settings.steamGridDbApiKey?.trim() || 'cb322daa48a712464a43096fe933bc12';
  if (!apiKey) throw new Error('No SteamGridDB API key configured');
  const cacheDir = getAssetCacheDir();

  const now = new Date().toISOString();
  const safeId = gameId.replace(/:/g, '_');

  let coverUrl: string | undefined;
  let heroUrl: string | undefined;
  let logoUrl: string | undefined;
  let iconUrl: string | undefined;

  const endpoints: [string, string, string, string][] = [
    [`/grids/game/${sgdbGameId}?dimensions=600x900`, 'covers',  `.jpg`, 'cover'],
    [`/heroes/game/${sgdbGameId}`,                  'heroes',   `.jpg`, 'hero'],
    [`/logos/game/${sgdbGameId}`,                   'logos',    `.png`, 'logo'],
    [`/icons/game/${sgdbGameId}`,                   'icons',    `.png`, 'icon'],
  ];

  const results = await Promise.allSettled(
    endpoints.map(async ([endpoint, folder, fallbackExt, kind]) => {
      const res = await sgdbRequest(endpoint, apiKey);
      if (!res.success || !res.data?.length) return;
      const remoteUrl: string = res.data[0].url;
      const ext = path.extname(new URL(remoteUrl).pathname) || fallbackExt;
      const localPath = path.join(cacheDir, folder, `${safeId}${ext}`);
      await downloadFile(remoteUrl, localPath);
      const nexusUrl = `nexus-media://${folder}/${safeId}${ext}`;
      if (kind === 'cover') coverUrl = nexusUrl;
      else if (kind === 'hero') heroUrl = nexusUrl;
      else if (kind === 'logo') logoUrl = nexusUrl;
      else if (kind === 'icon') iconUrl = nexusUrl;
    })
  );

  for (const r of results) {
    if (r.status === 'rejected') {
      log('metadata', `Asset download failed: ${r.reason}`, 'WARN');
    }
  }

  // Fetch descriptive metadata from Steam
  const steamMeta = await fetchSteamStoreMetadata(_gameTitle || gameId);

  // Upsert into DB
  const existing = await db.select().from(gameMetadata).where(eq(gameMetadata.gameId, gameId));
  if (existing.length > 0) {
    await db.update(gameMetadata).set({
      coverUrl: coverUrl ?? existing[0].coverUrl,
      heroUrl:  heroUrl  ?? existing[0].heroUrl,
      logoUrl:  logoUrl  ?? existing[0].logoUrl,
      iconUrl:  iconUrl  ?? existing[0].iconUrl,
      description: steamMeta?.description ?? existing[0].description,
      developers: steamMeta?.developers ?? existing[0].developers,
      genres: steamMeta?.genres ?? existing[0].genres,
      releaseDate: steamMeta?.releaseDate ?? existing[0].releaseDate,
      rating: steamMeta?.rating ?? existing[0].rating,
      metadataProvider: 'steamgriddb',
      providerGameId: String(sgdbGameId),
      updatedAt: now,
    }).where(eq(gameMetadata.gameId, gameId));
  } else {
    await db.insert(gameMetadata).values({
      gameId,
      coverUrl, heroUrl, logoUrl, iconUrl,
      description: steamMeta?.description,
      developers: steamMeta?.developers,
      genres: steamMeta?.genres,
      releaseDate: steamMeta?.releaseDate,
      rating: steamMeta?.rating,
      metadataProvider: 'steamgriddb',
      providerGameId: String(sgdbGameId),
      updatedAt: now,
    });
  }

  // Also update games table updatedAt to force cache busters to update on the frontend
  await db.update(games).set({ updatedAt: now }).where(eq(games.id, gameId));

  log('metadata', `Applied SGDB metadata (id=${sgdbGameId}) to game ${gameId}`);
}

