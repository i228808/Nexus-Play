import { getDb } from '../db/index.ts';
import { settings } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { log } from './logger.ts';

export interface AppSettings {
  steamGridDbApiKey: string;
  legendaryPath: string;
  steamPath: string;
  minimizeOnLaunch: boolean;
  theme: string;
  scanOnStartup: boolean;
  romDirectories: string;
  ryujinxPath: string;
  yuzuPath: string;
  pcsx2Path: string;
  duckstationPath?: string;
  dolphinPath?: string;
  cemuPath?: string;
  accentColor?: string;
  backgroundImage?: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  steamGridDbApiKey: '',
  legendaryPath: 'legendary',
  steamPath: '',
  minimizeOnLaunch: true,
  theme: 'dark',
  scanOnStartup: true,
  romDirectories: '',
  ryujinxPath: 'ryujinx',
  yuzuPath: 'yuzu',
  pcsx2Path: 'pcsx2-qt',
  accentColor: '#e7e9e5',
  backgroundImage: ''
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const db = getDb();
    const rows = await db.select().from(settings);
    
    const loadedSettings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      const key = row.key as keyof AppSettings;
      if (key in DEFAULT_SETTINGS) {
        if (typeof DEFAULT_SETTINGS[key] === 'boolean') {
          (loadedSettings as any)[key] = row.value === 'true';
        } else {
          (loadedSettings as any)[key] = row.value;
        }
      }
    }
    return loadedSettings;
  } catch (err: any) {
    log('main', `Failed to load settings from DB: ${err.message}`, 'WARN');
    return DEFAULT_SETTINGS;
  }
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const db = getDb();
  log('main', `Updating settings with patch: ${JSON.stringify(patch)}`);

  for (const [key, value] of Object.entries(patch)) {
    const strValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    
    // Check if key exists
    const existing = await db.select().from(settings).where(eq(settings.key, key));
    if (existing.length > 0) {
      await db.update(settings).set({ value: strValue }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value: strValue });
    }
  }

  return getSettings();
}
