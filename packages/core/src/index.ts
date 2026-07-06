export interface Game {
  id: string;
  title: string;
  normalizedTitle: string;
  source: "steam" | "epic" | "legendary" | "heroic" | "lutris" | "bottles" | "flatpak" | "native" | "rom" | "manual";
  externalId?: string;
  launchCommand?: string;
  installPath?: string;
  executablePath?: string;
  winePrefix?: string;
  protonVersion?: string;
  platform: "linux" | "windows" | "emulated" | "web";
  installed: boolean;
  hidden: boolean;
  favorite: boolean;
  playtimeSeconds: number;
  lastPlayedAt?: string;
  createdAt: string;
  updatedAt: string;
  // Joined from GameMetadata when available
  coverUrl?: string;
  heroUrl?: string;
  description?: string;
  developers?: string;
  genres?: string;
  rating?: number;
  releaseDate?: string;
}

export interface GameMetadata {
  gameId: string;
  description?: string;
  releaseDate?: string;
  rating?: number;
  developers: string[];
  publishers: string[];
  genres: string[];
  tags: string[];
  platforms: string[];
  coverUrl?: string;
  heroUrl?: string;
  logoUrl?: string;
  iconUrl?: string;
  screenshots: string[];
  trailers: string[];
  protonTier?: "platinum" | "gold" | "silver" | "bronze" | "borked" | "unknown";
  metadataProvider?: string;
  providerGameId?: string;
}

export interface GameAsset {
  id: string;
  gameId: string;
  type: 'cover' | 'hero' | 'logo' | 'icon' | 'screenshot';
  remoteUrl?: string;
  localPath?: string;
  width?: number;
  height?: number;
  source?: string;
}

export interface LaunchProfile {
  id: string;
  gameId: string;
  name: string;
  runner?: string;
  protonVersion?: string;
  winePrefix?: string;
  environmentJson?: string;
  arguments?: string;
  workingDirectory?: string;
  isDefault: boolean;
}

export interface LibrarySource {
  id: string;
  type: string;
  path?: string;
  enabled: boolean;
  lastScannedAt?: string;
}

/**
 * Normalizes game titles for matching logic (e.g. God of War (2018) -> god of war)
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[:™®©]/g, "")
    .replace(/\b(deluxe|ultimate|complete|goty|edition|remastered)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
