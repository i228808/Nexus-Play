import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import util from 'node:util';
import { log } from './logger.ts';

const execPromise = util.promisify(exec);
const STEAM_COMPAT_DIR = path.join(os.homedir(), '.local', 'share', 'Steam', 'compatibilitytools.d');
const NEXUS_PREFIXES_DIR = path.join(os.homedir(), '.local', 'share', 'nexus-play', 'prefixes');

export async function getProtonRunners(): Promise<{ name: string; path: string }[]> {
  const runners: { name: string; path: string }[] = [];
  
  // System wine
  try {
    const { stdout } = await execPromise('which wine');
    if (stdout.trim()) {
      runners.push({ name: 'System Wine', path: stdout.trim() });
    }
  } catch (e) {
    // ignore
  }

  // Proton-GE and Steam Protons
  if (fs.existsSync(STEAM_COMPAT_DIR)) {
    try {
      const dirs = fs.readdirSync(STEAM_COMPAT_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory()) {
          const protonPath = path.join(STEAM_COMPAT_DIR, d.name, 'proton');
          if (fs.existsSync(protonPath)) {
            runners.push({ name: d.name, path: protonPath });
          }
        }
      }
    } catch (e) {
      log('main', 'Error reading steam compat dir: ' + e, 'WARN');
    }
  }
  
  return runners;
}

export async function getWinePrefixes(): Promise<{ name: string; path: string }[]> {
  const prefixes: { name: string; path: string }[] = [];
  
  // Default Nexus Prefixes dir
  if (fs.existsSync(NEXUS_PREFIXES_DIR)) {
    try {
      const dirs = fs.readdirSync(NEXUS_PREFIXES_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory()) {
          prefixes.push({ name: d.name, path: path.join(NEXUS_PREFIXES_DIR, d.name) });
        }
      }
    } catch (e) {
       log('main', 'Error reading prefixes: ' + e, 'WARN');
    }
  }

  // We could add heroic or lutris prefixes here if we want, but for now just our custom ones.
  return prefixes;
}

export async function createWinePrefix(name: string): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    if (!name.match(/^[a-zA-Z0-9_-]+$/)) {
      return { success: false, error: 'Invalid prefix name. Use only letters, numbers, dashes and underscores.' };
    }
    const prefixPath = path.join(NEXUS_PREFIXES_DIR, name);
    if (fs.existsSync(prefixPath)) {
      return { success: false, error: 'Prefix already exists.' };
    }
    fs.mkdirSync(prefixPath, { recursive: true });
    log('main', `Created new wine prefix at ${prefixPath}`);
    return { success: true, path: prefixPath };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function installLatestProtonGE(): Promise<{ success: boolean; name?: string; error?: string }> {
  try {
    log('main', 'Fetching latest Proton-GE release...', 'INFO');
    const res = await fetch('https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest', {
      headers: { 'User-Agent': 'Nexus-Play-Launcher' }
    });
    
    if (!res.ok) throw new Error('Failed to fetch from GitHub API');
    
    const data = await res.json();
    const asset = data.assets.find((a: any) => a.name.endsWith('.tar.gz'));
    
    if (!asset) throw new Error('Could not find tar.gz in latest release');
    
    const downloadUrl = asset.browser_download_url;
    const filename = asset.name; // e.g. GE-Proton9-5.tar.gz
    const extractName = filename.replace('.tar.gz', '');
    
    fs.mkdirSync(STEAM_COMPAT_DIR, { recursive: true });
    
    const targetDir = path.join(STEAM_COMPAT_DIR, extractName);
    if (fs.existsSync(targetDir)) {
      return { success: true, name: extractName }; // Already installed
    }
    
    const tempTarPath = path.join(os.tmpdir(), filename);
    
    // Download using curl for simplicity and reliability
    log('main', `Downloading ${downloadUrl}...`, 'INFO');
    await execPromise(`curl -L -o "${tempTarPath}" "${downloadUrl}"`);
    
    log('main', `Extracting ${filename}...`, 'INFO');
    await execPromise(`tar -xzf "${tempTarPath}" -C "${STEAM_COMPAT_DIR}"`);
    
    // Cleanup
    fs.unlinkSync(tempTarPath);
    log('main', `Successfully installed ${extractName}`, 'INFO');
    
    return { success: true, name: extractName };
  } catch (e: any) {
    log('main', `Failed to install Proton-GE: ${e.message}`, 'ERROR');
    return { success: false, error: e.message };
  }
}
