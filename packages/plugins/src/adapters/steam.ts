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

interface ShortcutField {
  value: string;
  start: number;
  end: number;
}

interface ShortcutEntry {
  appId?: number;
  launchOptions?: ShortcutField;
  insertAt: number;
}

interface VdfToken {
  kind: 'string' | 'open' | 'close';
  value?: string;
  start: number;
  end: number;
  contentStart?: number;
  contentEnd?: number;
}

interface VdfEntry {
  key: string;
  value?: VdfToken;
  child?: VdfObject;
}

interface VdfObject {
  entries: VdfEntry[];
  close?: VdfToken;
}

function patchShortcutLaunchOptions(buffer: Buffer, appId: number, useHidraw: boolean, useSteamDeckBypass: boolean): Buffer | null {
  let offset = 0;
  let match: ShortcutEntry | undefined;

  const readString = (): ShortcutField => {
    const start = offset;
    const end = buffer.indexOf(0x00, start);
    if (end === -1) throw new Error('Malformed shortcuts.vdf string');
    offset = end + 1;
    return { value: buffer.subarray(start, end).toString('utf8'), start, end };
  };

  const readMap = (): ShortcutEntry => {
    const entry: ShortcutEntry = { insertAt: offset };

    while (offset < buffer.length) {
      const type = buffer[offset++];
      if (type === 0x08) {
        entry.insertAt = offset - 1;
        return entry;
      }

      const key = readString().value.toLowerCase();
      if (type === 0x00) {
        const child = readMap();
        if (child.appId === appId) match = child;
      } else if (type === 0x01) {
        const field = readString();
        if (key === 'launchoptions') entry.launchOptions = field;
      } else if (type === 0x02 || type === 0x03 || type === 0x05) {
        if (offset + 4 > buffer.length) throw new Error('Malformed shortcuts.vdf number');
        const value = buffer.readUInt32LE(offset);
        offset += 4;
        if (key === 'appid' && type === 0x02) entry.appId = value;
      } else if (type === 0x07) {
        if (offset + 8 > buffer.length) throw new Error('Malformed shortcuts.vdf int64');
        offset += 8;
      } else {
        throw new Error(`Unsupported shortcuts.vdf value type: ${type}`);
      }
    }

    throw new Error('Malformed shortcuts.vdf map');
  };

  try {
    if (buffer[offset++] !== 0x00) return null;
    readString(); // "shortcuts"
    readMap();
  } catch (error) {
    console.error('[Steam Plugin] Failed to parse shortcuts.vdf for native DualSense', error);
    return null;
  }

  if (!match) return null;

  const current = match.launchOptions?.value || '';
  const withoutNexusControllerOptions = current
    .replace(/(^|\s)PROTON_ENABLE_HIDRAW=1(?=\s|$)/g, ' ')
    .replace(/(^|\s)SteamDeck=1(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const nativeOptions = `PROTON_ENABLE_HIDRAW=1${useSteamDeckBypass ? ' SteamDeck=1' : ''}`;
  const next = useHidraw ? `${nativeOptions} ${withoutNexusControllerOptions}`.trim() : withoutNexusControllerOptions;
  if (next === current) return null;
  const value = Buffer.from(`${next}\0`, 'utf8');

  if (match.launchOptions) {
    return Buffer.concat([
      buffer.subarray(0, match.launchOptions.start),
      value,
      buffer.subarray(match.launchOptions.end + 1),
    ]);
  }

  const field = Buffer.concat([
    Buffer.from([0x01]),
    Buffer.from('launchoptions\0', 'utf8'),
    value,
  ]);
  return Buffer.concat([buffer.subarray(0, match.insertAt), field, buffer.subarray(match.insertAt)]);
}

function getShortcutAppId(externalId: string): number | null {
  if (!externalId.startsWith('nonsteam-')) return null;
  try {
    const appId = BigInt(externalId.slice('nonsteam-'.length)) >> 32n;
    return appId <= 0xffffffffn ? Number(appId) : null;
  } catch {
    return null;
  }
}

function getSteamControllerConfigKey(externalId: string): string | null {
  const shortcutAppId = getShortcutAppId(externalId);
  if (shortcutAppId !== null) {
    return String(shortcutAppId > 0x7fffffff ? shortcutAppId - 0x100000000 : shortcutAppId);
  }

  return /^\d+$/.test(externalId) ? externalId : null;
}

function needsPlayStationSdkBypass(game: Game): boolean {
  const title = (game.title || '').toLowerCase();
  return title.includes('god of war') && title.includes('ragnarok');
}

function tokenizeVdf(source: string): VdfToken[] | null {
  const tokens: VdfToken[] = [];
  let offset = 0;

  while (offset < source.length) {
    const char = source[offset];
    if (/\s/.test(char)) {
      offset++;
      continue;
    }

    if (char === '/' && source[offset + 1] === '/') {
      const newline = source.indexOf('\n', offset + 2);
      offset = newline === -1 ? source.length : newline + 1;
      continue;
    }

    if (char === '{' || char === '}') {
      tokens.push({ kind: char === '{' ? 'open' : 'close', start: offset, end: offset + 1 });
      offset++;
      continue;
    }

    if (char !== '"') return null;

    const start = offset++;
    const contentStart = offset;
    let value = '';
    while (offset < source.length && source[offset] !== '"') {
      if (source[offset] === '\\' && offset + 1 < source.length) {
        value += source[offset + 1];
        offset += 2;
      } else {
        value += source[offset++];
      }
    }

    if (offset >= source.length) return null;
    const contentEnd = offset;
    tokens.push({
      kind: 'string',
      value,
      start,
      end: ++offset,
      contentStart,
      contentEnd,
    });
  }

  return tokens;
}

function parseVdf(source: string): VdfObject | null {
  const tokens = tokenizeVdf(source);
  if (!tokens) return null;

  let index = 0;
  const parseObject = (expectClose: boolean): VdfObject | null => {
    const object: VdfObject = { entries: [] };

    while (index < tokens.length) {
      const token = tokens[index];
      if (token.kind === 'close') {
        if (!expectClose) return null;
        object.close = token;
        index++;
        return object;
      }

      if (token.kind !== 'string') return null;
      const key = token.value || '';
      index++;

      const next = tokens[index];
      if (!next) return null;
      if (next.kind === 'string') {
        object.entries.push({ key, value: next });
        index++;
        continue;
      }
      if (next.kind !== 'open') return null;

      index++;
      const child = parseObject(true);
      if (!child) return null;
      object.entries.push({ key, child });
    }

    return expectClose ? null : object;
  };

  return parseObject(false);
}

function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  return source.slice(lineStart, offset).match(/^[\t ]*/)?.[0] || '';
}

function patchSteamControllerConfig(source: string, appKey: string, useSteamInput: boolean): string | null {
  const root = parseVdf(source);
  const userConfig = root?.entries.find(entry => entry.key.toLowerCase() === 'userlocalconfigstore')?.child;
  const apps = userConfig?.entries.find(entry => entry.key.toLowerCase() === 'apps')?.child;
  if (!apps?.close) return null;

  const app = apps.entries.find(entry => entry.key === appKey)?.child;
  if (app?.close) {
    const controllerConfig = app.entries.find(entry => entry.key.toLowerCase() === 'usesteamcontrollerconfig');
    if (controllerConfig?.value?.contentStart !== undefined && controllerConfig.value.contentEnd !== undefined) {
      if (controllerConfig.value.value === (useSteamInput ? '1' : '0') ||
          (useSteamInput && controllerConfig.value.value === '2')) return null;
      const value = useSteamInput ? '1' : '0';
      return `${source.slice(0, controllerConfig.value.contentStart)}${value}${source.slice(controllerConfig.value.contentEnd)}`;
    }

    if (useSteamInput) return null;

    const insertAt = source.lastIndexOf('\n', app.close.start) + 1;
    const indent = lineIndent(source, app.close.start);
    const field = `${indent}\t"UseSteamControllerConfig"\t\t"0"\n`;
    return `${source.slice(0, insertAt)}${field}${source.slice(insertAt)}`;
  }

  if (useSteamInput) return null;

  const insertAt = source.lastIndexOf('\n', apps.close.start) + 1;
  const indent = lineIndent(source, apps.close.start);
  const entry = [
    `${indent}\t"${appKey}"`,
    `${indent}\t{`,
    `${indent}\t\t"UseSteamControllerConfig"\t\t"0"`,
    `${indent}\t}`,
    '',
  ].join('\n');
  return `${source.slice(0, insertAt)}${entry}${source.slice(insertAt)}`;
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

  async prepareNativeDualSense(game: Game, profile?: LaunchProfile): Promise<void> {
    if (!profile?.environmentJson || !game.externalId) return;

    let useHidraw = false;
    let useSteamInput = false;
    try {
      const env = JSON.parse(profile.environmentJson);
      useHidraw = env.PROTON_ENABLE_HIDRAW === '1';
      useSteamInput = env.NEXUS_PLAY_STEAM_INPUT === '1';
      if (!useHidraw && !useSteamInput) return;
    } catch {
      return;
    }

    const appId = getShortcutAppId(game.externalId);
    const controllerConfigKey = getSteamControllerConfigKey(game.externalId);
    const useSteamDeckBypass = useHidraw && needsPlayStationSdkBypass(game);

    for (const steamPath of await this.getSteamPaths()) {
      const userdataPath = path.join(steamPath, 'userdata');
      let users: string[] = [];
      try {
        users = await fs.readdir(userdataPath);
      } catch {
        continue;
      }

      for (const user of users) {
        const configPath = path.join(userdataPath, user, 'config');

        if (appId !== null) {
          const shortcutsPath = path.join(configPath, 'shortcuts.vdf');
          try {
            const shortcuts = await fs.readFile(shortcutsPath);
            const patched = patchShortcutLaunchOptions(shortcuts, appId, useHidraw, useSteamDeckBypass);
            if (patched) {
              const tempPath = `${shortcutsPath}.nexus-play.tmp`;
              await fs.writeFile(tempPath, patched);
              await fs.rename(tempPath, shortcutsPath);
              console.log(`[Steam Plugin] ${useHidraw ? 'Enabled native DualSense HIDRAW' : 'Removed native DualSense HIDRAW'} for shortcut ${appId}`);
            }
          } catch (error) {
            console.error(`[Steam Plugin] Failed to update ${shortcutsPath}`, error);
          }
        }

        if (controllerConfigKey !== null) {
          const localConfigPath = path.join(configPath, 'localconfig.vdf');
          try {
            const localConfig = await fs.readFile(localConfigPath, 'utf8');
            const patched = patchSteamControllerConfig(localConfig, controllerConfigKey, useSteamInput);
            if (patched) {
              const tempPath = `${localConfigPath}.nexus-play.tmp`;
              await fs.writeFile(tempPath, patched, 'utf8');
              await fs.rename(tempPath, localConfigPath);
              console.log(`[Steam Plugin] ${useSteamInput ? 'Restored Steam Input' : 'Disabled Steam Input'} for controller app ${controllerConfigKey}`);
            }
          } catch (error) {
            console.error(`[Steam Plugin] Failed to update ${localConfigPath}`, error);
          }
        }
      }
    }
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
              launchOptions: sc.launchOptions || undefined,
              platform: 'linux',
              installed: true,
            });
          }
        } catch { /* no shortcuts.vdf for this user */ }
      }
    } catch { /* no userdata dir */ }

    return detectedGames;
  }

  async launch(game: Game, profile?: LaunchProfile): Promise<LaunchResult> {
    if (!game.externalId) {
      return { success: false, error: 'Steam App ID is missing' };
    }

    await this.prepareNativeDualSense(game, profile);

    // Non-Steam games
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
