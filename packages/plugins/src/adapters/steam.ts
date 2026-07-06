import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { Game, LaunchProfile } from '@nexus-play/core';
import { DetectedGame, LaunchResult, LibraryPlugin } from '../index.ts';
import { parseVDF } from './vdf.ts';

// ─── Hard-blocked App IDs (runtimes, tools, middleware) ──────────────────────
const EXCLUDED_APP_IDS = new Set([
  '228980',  // Steamworks Common Redistributables
  '250820',  // SteamVR
  '1070560', // Steam Controller Configs
  '1391110', // Steam Linux Runtime - Soldier
  '1628350', // Steam Linux Runtime - Scout
  '1636620', // Steam Linux Runtime - Sniper
  '2180100', // Steam Linux Runtime - Medic
  '1493710', // Proton EasyAntiCheat Runtime
  '1161040', // Proton BattlEye Runtime
  '220980',  // SteamVR Beta
  '1235420', // DXVK async helper
  '2805730', // Steam Linux Runtime - Thorium
  '2221490', // Proton 9.0
  '2348590', // Proton 8.0
  '1420170', // Proton 7.0
  '961940',  // Proton 6.3
  '858280',  // Proton 5.13
  '1054830', // Proton 5.0
  '2311280', // Proton Experimental
]);

// ─── Soft filter — title keyword exclusions ───────────────────────────────────
const EXCLUDED_TITLE_KEYWORDS = [
  'proton',
  'steam linux runtime',
  'steamworks common',
  'easyanticheat runtime',
  'battleye runtime',
  ' - soundtrack',
  'official soundtrack',
  'artbook',
  ' - playtest',
  'dedicated server',
  'steam controller',
  'presskit',
  'bonus content',
];

// ─── Detect native Linux vs Proton-wrapped ────────────────────────────────────
function detectPlatform(appState: Record<string, any>): 'linux' | 'windows' {
  // StateFlags bit 4 = fully installed; oslist often has 'linux'
  const oslist: string = (appState.oslist || '').toLowerCase();
  if (oslist.includes('linux')) return 'linux';
  return 'windows';
}

// ─── Parse Steam's localconfig.vdf for non-Steam shortcuts ───────────────────
interface NonSteamShortcut {
  appid: string;
  appName: string;
  exe: string;
  startDir: string;
  iconPath: string;
  launchOptions: string;
}

function parseShortcuts(buf: Buffer): NonSteamShortcut[] {
  let i = 0;

  const readStr = (): string => {
    const start = i;
    while (i < buf.length && buf[i] !== 0x00) {
      i++;
    }
    const strBuf = buf.subarray(start, i);
    i++; // consume null terminator
    return strBuf.toString('utf8');
  };

  const readUint32 = (): number => {
    if (i + 4 > buf.length) return 0;
    const v = buf.readUInt32LE(i);
    i += 4;
    return v;
  };

  const readMap = (): Record<string, any> => {
    const obj: Record<string, any> = {};
    while (i < buf.length) {
      const type = buf[i++];
      if (type === 0x08) {
        break; // end of map
      }
      const key = readStr().toLowerCase();
      if (type === 0x00) {
        obj[key] = readMap();
      } else if (type === 0x01) {
        obj[key] = readStr();
      } else if (type === 0x02) {
        obj[key] = readUint32();
      } else if (type === 0x07) {
        // int64 (8 bytes)
        i += 8;
        obj[key] = 0;
      } else if (type === 0x03 || type === 0x05) {
        // float or color (4 bytes)
        i += 4;
      }
    }
    return obj;
  };

  let rootMap: Record<string, any> = {};
  if (buf.length > 0 && buf[0] === 0x00) {
    i = 1;
    readStr(); // consume "shortcuts"
    rootMap = readMap();
  }

  const shortcuts: NonSteamShortcut[] = [];
  for (const indexKey of Object.keys(rootMap)) {
    const entry = rootMap[indexKey];
    if (!entry || typeof entry !== 'object') continue;

    const appname = entry.appname || entry.AppName || '';
    const exe = entry.exe || entry.Exe || '';
    const startdir = entry.startdir || entry.StartDir || '';
    const icon = entry.icon || entry.Icon || '';
    const launchoptions = entry.launchoptions || entry.LaunchOptions || '';
    const appidVal = entry.appid || entry.AppID;

    if (!appname) continue;

    let appidStr = '';
    if (appidVal !== undefined) {
      // appid is unsigned 32-bit int
      const appidUnsigned = BigInt(appidVal) & 0xffffffffn;
      // Convert to 64-bit launch ID: (appidUnsigned << 32) | 0x02000000
      const launchId = (appidUnsigned << 32n) | 0x02000000n;
      appidStr = launchId.toString();
    } else {
      // Fallback hash if appid is somehow missing
      const rawId = Math.abs(appname.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0));
      const appidUnsigned = BigInt(rawId) & 0xffffffffn;
      const launchId = (appidUnsigned << 32n) | 0x02000000n;
      appidStr = launchId.toString();
    }

    shortcuts.push({
      appid: appidStr,
      appName: appname,
      exe: exe.replace(/^"|"$/g, '').trim(),
      startDir: startdir.replace(/^"|"$/g, '').trim(),
      iconPath: icon.replace(/^"|"$/g, '').trim(),
      launchOptions: launchoptions || '',
    });
  }

  return shortcuts;
}


export class SteamPlugin implements LibraryPlugin {
  readonly id = 'steam';
  readonly name = 'Steam';

  private async getSteamPaths(): Promise<string[]> {
    const home = process.env.HOME || '';
    const candidates = [
      path.join(home, '.steam', 'steam'),
      path.join(home, '.local', 'share', 'Steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    ];

    const valid: string[] = [];
    for (const p of candidates) {
      try {
        await fs.access(p);
        valid.push(p);
      } catch { /* not found */ }
    }
    return valid;
  }

  async detectInstallation(): Promise<boolean> {
    const paths = await this.getSteamPaths();
    return paths.length > 0;
  }

  async scan(): Promise<DetectedGame[]> {
    const steamPaths = await this.getSteamPaths();
    if (steamPaths.length === 0) return [];

    const primarySteamPath = steamPaths[0];
    const detectedGames: DetectedGame[] = [];

    // ── 1. Scan all Steam library folders for installed .acf manifests ──────
    const libraryFoldersVdf = path.join(primarySteamPath, 'steamapps', 'libraryfolders.vdf');
    try {
      const vdfContent = await fs.readFile(libraryFoldersVdf, 'utf-8');
      const vdfData = parseVDF(vdfContent);
      const foldersData = vdfData.libraryfolders || {};

      for (const key of Object.keys(foldersData)) {
        const folder = foldersData[key];
        const libraryPath = folder?.path;
        if (!libraryPath) continue;

        const steamAppsPath = path.join(libraryPath, 'steamapps');
        let files: string[];
        try {
          files = await fs.readdir(steamAppsPath);
        } catch { continue; }

        const manifests = files.filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'));

        for (const file of manifests) {
          try {
            const acfContent = await fs.readFile(path.join(steamAppsPath, file), 'utf-8');
            const acfData = parseVDF(acfContent);
            const appState = acfData.AppState || {};

            const appid    = appState.appid;
            const name     = (appState.name || appState.title || '').trim();
            const installdir = appState.installdir;

            if (!appid || !name) continue;

            // ── Filter runtimes, tools, soundtracks ──
            if (EXCLUDED_APP_IDS.has(String(appid))) continue;
            const lowerName = name.toLowerCase();
            if (EXCLUDED_TITLE_KEYWORDS.some(kw => lowerName.includes(kw))) continue;

            const installPath = path.join(steamAppsPath, 'common', installdir || '');
            const platform = detectPlatform(appState);

            detectedGames.push({
              externalId: String(appid),
              title: name,
              source: 'steam',
              installPath,
              executablePath: undefined,
              launchCommand: `steam steam://rungameid/${appid}`,
              platform,
              installed: true,
            });
          } catch { /* malformed manifest — skip */ }
        }
      }
    } catch (err) {
      console.error('[Steam Plugin] Failed to read libraryfolders.vdf', err);
    }

    // ── 2. Scan non-Steam shortcuts from every user's shortcuts.vdf ─────────
    const userdataPath = path.join(primarySteamPath, 'userdata');
    try {
      const userDirs = await fs.readdir(userdataPath);
      for (const userId of userDirs) {
        const shortcutsPath = path.join(userdataPath, userId, 'config', 'shortcuts.vdf');
        try {
          const buf = await fs.readFile(shortcutsPath);
          const shortcuts = parseShortcuts(buf);

          for (const sc of shortcuts) {
            if (!sc.appName || sc.appName === 'Unknown') continue;

            detectedGames.push({
              externalId: `nonsteam-${sc.appid}`,
              title: sc.appName,
              source: 'steam',
              installPath: sc.startDir || undefined,
              executablePath: sc.exe || undefined,
              launchCommand: `steam steam://rungameid/${sc.appid}`,
              platform: 'linux',
              installed: true,
            });
          }
        } catch { /* no shortcuts.vdf for this user */ }
      }
    } catch { /* no userdata dir */ }

    return detectedGames;
  }

  async launch(game: Game, _profile?: LaunchProfile): Promise<LaunchResult> {
    if (!game.externalId) {
      return { success: false, error: 'Steam App ID is missing' };
    }

    // Non-Steam games: launch via Steam URI to respect Proton options and overlays
    if (game.externalId.startsWith('nonsteam-')) {
      const appid = game.externalId.replace('nonsteam-', '');
      const command = `steam steam://rungameid/${appid}`;
      return new Promise((resolve) => {
        exec(command, (error) => {
          if (error) resolve({ success: false, error: error.message });
          else resolve({ success: true });
        });
      });
    }

    // Regular Steam games
    const command = `steam steam://rungameid/${game.externalId}`;
    return new Promise((resolve) => {
      exec(command, (error) => {
        if (error) resolve({ success: false, error: error.message });
        else resolve({ success: true });
      });
    });
  }
}
