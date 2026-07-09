import { spawn } from 'node:child_process';
import { Game, LaunchProfile } from '@nexus-play/core';
import { DetectedGame, LaunchResult, LibraryPlugin } from '../index.ts';

export class ManualPlugin implements LibraryPlugin {
  readonly id = 'manual';
  readonly name = 'Manual Games';

  async detectInstallation(): Promise<boolean> {
    return true; // Always supported
  }

  async scan(): Promise<DetectedGame[]> {
    return []; // Manual games are added by the user, not scanned
  }

  async launch(game: Game, profile?: LaunchProfile): Promise<LaunchResult> {
    const launchCommand = game.launchCommand;
    if (!launchCommand) {
      return { success: false, error: 'Launch command is missing' };
    }

    try {
      // Use profile details if provided
      let finalCommand = launchCommand;
      let workingDir = game.installPath || undefined;
      const env = { ...process.env };

      if (profile) {
        if (profile.arguments) {
          finalCommand += ` ${profile.arguments}`;
        }
        if (profile.workingDirectory) {
          workingDir = profile.workingDirectory;
        }
        if (profile.environmentJson) {
          try {
            const extraEnv = JSON.parse(profile.environmentJson);
            Object.assign(env, extraEnv);
          } catch (e) {
            console.error('[Manual Plugin] Failed to parse profile environment variables', e);
          }
        }
      }

      if (game.winePrefix) {
        env.WINEPREFIX = game.winePrefix;
      }

      if (game.protonVersion) {
        finalCommand = `${game.protonVersion} ${finalCommand}`;
      }

      console.log(`[Manual Plugin] Executing command: "${finalCommand}" in directory: "${workingDir}"`);

      // We run via shell so that environment variables and pipe/shell features work
      const child = spawn(finalCommand, {
        cwd: workingDir,
        shell: true,
        env,
        detached: true,
        stdio: 'ignore'
      });

      child.unref();

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
