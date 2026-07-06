import fs from 'node:fs/promises';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import { Game, LaunchProfile } from '@nexus-play/core';
import { DetectedGame, LaunchResult, LibraryPlugin } from '../index.ts';

export class LegendaryPlugin implements LibraryPlugin {
  readonly id = 'legendary';
  readonly name = 'Legendary (Epic Games)';

  async detectInstallation(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('legendary --version', (err) => {
        resolve(!err);
      });
    });
  }

  async scan(): Promise<DetectedGame[]> {
    const detectedGames: DetectedGame[] = [];

    // Approach 1: Try reading installed.json directly (offline, fast, no sub-processes)
    const home = process.env.HOME || '';
    const configPath = path.join(home, '.config', 'legendary', 'installed.json');

    try {
      const fileContent = await fs.readFile(configPath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      const gamesList = Array.isArray(data) ? data : Object.values(data);

      for (const game of gamesList as any[]) {
        const appName = game.app_name;
        const title = game.title;
        const installPath = game.install_path;
        const executable = game.executable;
        const platform = game.platform || 'win32';

        if (!appName || !title) continue;

        detectedGames.push({
          externalId: appName,
          title: title,
          source: 'legendary',
          installPath: installPath,
          executablePath: executable,
          launchCommand: `legendary launch ${appName}`,
          platform: platform === 'win32' || platform === 'windows' ? 'windows' : 'linux',
          installed: true
        });
      }
      return detectedGames;
    } catch (err) {
      // Direct file read failed or not found, fallback to CLI command
    }

    // Approach 2: Run CLI list command
    return new Promise((resolve) => {
      exec('legendary list-installed --json', (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }

        try {
          const data = JSON.parse(stdout);
          const gamesList = Array.isArray(data) ? data : Object.values(data);
          
          for (const game of gamesList as any[]) {
            const appName = game.app_name;
            const title = game.title;
            const installPath = game.install_path;
            const executable = game.executable;
            const platform = game.platform || 'win32';

            if (!appName || !title) continue;

            detectedGames.push({
              externalId: appName,
              title: title,
              source: 'legendary',
              installPath: installPath,
              executablePath: executable,
              launchCommand: `legendary launch ${appName}`,
              platform: platform === 'win32' || platform === 'windows' ? 'windows' : 'linux',
              installed: true
            });
          }
        } catch (e) {
          console.error('[Legendary Plugin] Error parsing list-installed JSON output', e);
        }
        resolve(detectedGames);
      });
    });
  }

  async launch(game: Game, _profile?: LaunchProfile): Promise<LaunchResult> {
    if (!game.externalId) {
      return { success: false, error: 'Legendary App Name is missing' };
    }

    // Prepare commands and arguments
    // We launch legendary launch <app_name>
    const args = ['launch', game.externalId];
    
    // Check if we should append arguments or environment variables from profile
    const env = { ...process.env };
    
    // In future versions, we can append MangoHud or other toggles
    // For MVP, we spawn legendary CLI directly
    try {
      const child = spawn('legendary', args, {
        env,
        detached: true, // run in its own process group
        stdio: 'ignore'
      });

      child.unref(); // let parent process continue running independently

      if (child.pid) {
        return { success: true, pid: child.pid };
      } else {
        return { success: false, error: 'Failed to retrieve process ID' };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
