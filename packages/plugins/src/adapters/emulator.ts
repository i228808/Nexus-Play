import { spawn } from 'node:child_process';
import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Game, LaunchProfile } from '@nexus-play/core';
import { DetectedGame, LaunchResult, LibraryPlugin } from '../index.ts';

export interface EmulatorConfig {
  romDirectories: string[];
  ryujinxPath: string;
  yuzuPath: string;
  pcsx2Path: string;
}

export class EmulatorPlugin implements LibraryPlugin {
  readonly id = 'emulator';
  readonly name = 'Emulator Games';
  private config: EmulatorConfig;

  constructor(config: EmulatorConfig) {
    this.config = config;
  }

  async detectInstallation(): Promise<boolean> {
    return this.config.romDirectories.length > 0;
  }

  private async walkDir(dir: string): Promise<string[]> {
    let results: string[] = [];
    try {
      const files = await readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
          results = results.concat(await this.walkDir(filePath));
        } else {
          results.push(filePath);
        }
      }
    } catch (err) {
      console.warn(`[Emulator Plugin] Failed to read directory ${dir}`, err);
    }
    return results;
  }

  async scan(): Promise<DetectedGame[]> {
    const games: DetectedGame[] = [];
    
    for (const dir of this.config.romDirectories) {
      if (!dir) continue;
      try {
        const stats = await stat(dir);
        if (!stats.isDirectory()) continue;

        const files = await this.walkDir(dir);
        for (const filePath of files) {
          const ext = path.extname(filePath).toLowerCase();
          const title = path.basename(filePath, ext);

          // Nintendo Switch (Ryujinx / Yuzu)
          if (ext === '.nsp' || ext === '.xci') {
            const exe = this.config.ryujinxPath || 'ryujinx';
            games.push({
              externalId: `switch_${title.replace(/[^a-zA-Z0-9]/g, '_')}`,
              title,
              source: 'rom',
              installPath: dir,
              executablePath: exe,
              launchCommand: `"${exe}" "${filePath}"`,
              platform: 'emulated',
              installed: true,
            });
          }
          // PS2 (PCSX2)
          else if (ext === '.iso') {
            const exe = this.config.pcsx2Path || 'pcsx2-qt';
            games.push({
              externalId: `ps2_${title.replace(/[^a-zA-Z0-9]/g, '_')}`,
              title,
              source: 'rom',
              installPath: dir,
              executablePath: exe,
              launchCommand: `"${exe}" "${filePath}"`,
              platform: 'emulated',
              installed: true,
            });
          }
        }
      } catch (err) {
        console.warn(`[Emulator Plugin] Failed to access directory ${dir}`, err);
      }
    }

    return games;
  }

  async launch(game: Game, _profile?: LaunchProfile): Promise<LaunchResult> {
    const launchCommand = game.launchCommand;
    if (!launchCommand) {
      return { success: false, error: 'Launch command is missing' };
    }

    try {
      const child = spawn(launchCommand, {
        cwd: game.installPath || undefined,
        shell: true,
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
