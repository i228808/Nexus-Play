import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
      let baseCommand = launchCommand;
      if (profile && profile.arguments) {
        baseCommand += ` ${profile.arguments}`;
      }

      let workingDir = game.installPath || undefined;
      const env = { ...process.env };

      if (profile) {
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

      const compatDataPath = game.winePrefix || path.join(os.homedir(), '.local', 'share', 'nexus-play', 'prefixes', 'default');
      if (game.winePrefix) {
        env.STEAM_COMPAT_DATA_PATH = compatDataPath;
        const protonPrefix = path.join(compatDataPath, 'pfx');
        env.WINEPREFIX = fs.existsSync(protonPrefix) ? protonPrefix : game.winePrefix;
      } else {
        env.STEAM_COMPAT_DATA_PATH = compatDataPath;
        env.WINEPREFIX = fs.existsSync(path.join(compatDataPath, 'pfx')) ? path.join(compatDataPath, 'pfx') : compatDataPath;
      }

      env.STEAM_COMPAT_CLIENT_INSTALL_PATH = path.join(os.homedir(), '.local', 'share', 'Steam');
      env.PROTON_LOCAL_SHADER_CACHE ||= '1';
      env.STEAM_COMPAT_SHADER_PATH ||= path.join(
        compatDataPath,
        'shadercache',
        game.id.replace(/[^a-zA-Z0-9._-]/g, '_')
      );
      fs.mkdirSync(env.STEAM_COMPAT_SHADER_PATH, { recursive: true });

      if (game.protonVersion) {
        if (game.protonVersion.toLowerCase().endsWith('proton')) {
          baseCommand = `"${game.protonVersion}" run ${baseCommand}`;
        } else {
          baseCommand = `"${game.protonVersion}" ${baseCommand}`;
        }
      }

      let finalCommand = baseCommand;
      if (game.launchOptions) {
        if (game.launchOptions.includes('%command%')) {
          finalCommand = game.launchOptions.replace('%command%', baseCommand);
        } else {
          finalCommand = `${baseCommand} ${game.launchOptions}`;
        }
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

      // Don't return shell PID — with detached+shell, the PID is the shell wrapper
      // which becomes a zombie. Let gameService use pgrep-based tracking instead.
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
