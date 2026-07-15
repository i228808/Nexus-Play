import { Game, LaunchProfile } from "@nexus-play/core";

export interface DetectedGame {
  externalId: string;
  title: string;
  source: Game["source"];
  installPath?: string;
  executablePath?: string;
  launchCommand?: string;
  launchOptions?: string;
  platform: Game["platform"];
  installed: boolean;
}

export interface LaunchResult {
  success: boolean;
  pid?: number;
  error?: string;
}

export interface LibraryPlugin {
  id: string;
  name: string;
  detectInstallation(): Promise<boolean>;
  scan(): Promise<DetectedGame[]>;
  launch(game: Game, profile?: LaunchProfile): Promise<LaunchResult>;
}

export * from './adapters/steam.ts';
export * from './adapters/legendary.ts';
export * from './adapters/manual.ts';
export * from './adapters/vdf.ts';
export * from './adapters/emulator.ts';
