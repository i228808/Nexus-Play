import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  normalizedTitle: text('normalized_title').notNull(),
  source: text('source').notNull(), // 'steam' | 'legendary' | 'heroic' | 'lutris' | 'bottles' | 'flatpak' | 'native' | 'rom' | 'manual'
  externalId: text('external_id'),
  installPath: text('install_path'),
  executablePath: text('executable_path'),
  launchCommand: text('launch_command'),
  platform: text('platform').default('linux'), // 'linux' | 'windows' | 'emulated' | 'web'
  winePrefix: text('wine_prefix'),
  protonVersion: text('proton_version'),
  installed: integer('installed', { mode: 'boolean' }).default(true).notNull(),
  hidden: integer('hidden', { mode: 'boolean' }).default(false).notNull(),
  favorite: integer('favorite', { mode: 'boolean' }).default(false).notNull(),
  playtimeSeconds: integer('playtime_seconds').default(0).notNull(),
  lastPlayedAt: text('last_played_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const gameMetadata = sqliteTable('game_metadata', {
  gameId: text('game_id').primaryKey().references(() => games.id, { onDelete: 'cascade' }),
  description: text('description'),
  releaseDate: text('release_date'),
  rating: real('rating'),
  developers: text('developers'), // comma-separated or JSON stringified list
  publishers: text('publishers'), // comma-separated or JSON stringified list
  genres: text('genres'), // comma-separated or JSON stringified list
  tags: text('tags'), // comma-separated or JSON stringified list
  platforms: text('platforms'), // comma-separated or JSON stringified list
  coverUrl: text('cover_url'),
  heroUrl: text('hero_url'),
  logoUrl: text('logo_url'),
  iconUrl: text('icon_url'),
  metadataProvider: text('metadata_provider'), // e.g., 'steamgriddb' or 'igdb'
  providerGameId: text('provider_game_id'),
  updatedAt: text('updated_at').notNull(),
});

export const gameAssets = sqliteTable('game_assets', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'cover' | 'hero' | 'logo' | 'icon' | 'screenshot'
  remoteUrl: text('remote_url'),
  localPath: text('local_path'),
  width: integer('width'),
  height: integer('height'),
  source: text('source'), // source provider
  createdAt: text('created_at').notNull(),
});

export const launchProfiles = sqliteTable('launch_profiles', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  runner: text('runner'), // e.g. 'system-wine', 'proton-ge', etc.
  protonVersion: text('proton_version'),
  winePrefix: text('wine_prefix'),
  environmentJson: text('environment_json'), // stringified env object
  arguments: text('arguments'),
  workingDirectory: text('working_directory'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
});

export const librarySources = sqliteTable('library_sources', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'steam' | 'legendary' | 'custom'
  path: text('path'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
  lastScannedAt: text('last_scanned_at'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
