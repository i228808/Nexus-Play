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

    // Run CLI list command for ALL games
    return new Promise((resolve) => {
      exec('legendary list --json', async (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }

        try {
          const data = JSON.parse(stdout);
          const gamesList = Array.isArray(data) ? data : Object.values(data);
          
          // Get installed games from config to mark installation status
          const home = process.env.HOME || '';
          const configPath = path.join(home, '.config', 'legendary', 'installed.json');
          let installedSet = new Set<string>();
          
          try {
            const installedContent = await fs.readFile(configPath, 'utf-8');
            const installedData = JSON.parse(installedContent);
            const installedArray = Array.isArray(installedData) ? installedData : Object.values(installedData);
            for (const item of installedArray as any[]) {
              if (item.app_name) installedSet.add(item.app_name);
            }
          } catch (e) {
            // Ignore if installed.json is missing
          }

          for (const game of gamesList as any[]) {
            const appName = game.app_name;
            const title = game.app_title || game.title;
            const isInstalled = installedSet.has(appName);
            // Default executable is just a placeholder since Legendary handles the launch internally
            const executable = game.executable || '';
            const platform = 'windows';

            if (!appName || !title) continue;

            detectedGames.push({
              externalId: appName,
              title: title,
              source: 'legendary',
              installPath: isInstalled ? '<installed>' : undefined,
              executablePath: executable,
              launchCommand: `legendary launch ${appName}`,
              platform: platform,
              installed: isInstalled
            });
          }
        } catch (e) {
          console.error('[Legendary Plugin] Error parsing list JSON output', e);
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
