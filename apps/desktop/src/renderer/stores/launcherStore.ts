import { create } from 'zustand';
import { Game, GameMetadata } from '@nexus-play/core';

export interface AppSettings {
  steamGridDbApiKey: string;
  legendaryPath: string;
  steamPath: string;
  minimizeOnLaunch: boolean;
  theme: string;
  scanOnStartup: boolean;
  romDirectories?: string;
  ryujinxPath?: string;
  yuzuPath?: string;
  pcsx2Path?: string;
  duckstationPath?: string;
  dolphinPath?: string;
  cemuPath?: string;
}

export interface ControllerBatteryInfo {
  name: string;
  capacity: number;
  status: string;
}

interface LauncherState {
  games: Game[];
  settings: AppSettings | null;
  activeTab: 'home' | 'library' | 'settings' | 'logs';
  selectedGameId: string | null;
  selectedGameDetail: { game: Game; metadata: GameMetadata | null; profiles: any[] } | null;
  isScanning: boolean;
  logs: string;
  activeLogFile: 'main' | 'scanner' | 'launcher' | 'metadata';
  controllers: ControllerBatteryInfo[];
  
  // Actions
  setActiveTab: (tab: 'home' | 'library' | 'settings' | 'logs') => void;
  setSelectedGameId: (id: string | null) => Promise<void>;
  loadGames: () => Promise<void>;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  scanSources: () => Promise<void>;
  launchGame: (id: string) => Promise<{ success: boolean; error?: string }>;
  toggleFavorite: (id: string) => Promise<void>;
  toggleHide: (id: string) => Promise<void>;
  addManualGame: (gameData: {
    title: string;
    launchCommand: string;
    installPath?: string;
    executablePath?: string;
    platform?: Game["platform"];
  }) => Promise<void>;
  loadLogs: (file?: 'main' | 'scanner' | 'launcher' | 'metadata') => Promise<void>;
  loadControllers: () => Promise<void>;
  deleteGame: (id: string) => Promise<{ success: boolean; error?: string }>;
  searchMetadata: (query: string) => Promise<{ id: number; name: string; releaseDate?: string; types: string[] }[]>;
  applyMetadata: (gameId: string, sgdbGameId: number, gameTitle: string) => Promise<{ success: boolean; error?: string }>;
  updateTitle: (id: string, title: string) => Promise<{ success: boolean; error?: string }>;
}

export const useLauncherStore = create<LauncherState>((set, get) => ({
  games: [],
  settings: null,
  activeTab: 'home',
  selectedGameId: null,
  selectedGameDetail: null,
  isScanning: false,
  logs: '',
  controllers: [],
  activeLogFile: 'main',

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    if (tab === 'logs') {
      get().loadLogs();
    }
  },

  setSelectedGameId: async (id) => {
    set({ selectedGameId: id });
    if (id === null) {
      set({ selectedGameDetail: null });
      return;
    }

    try {
      const detail = await window.nexus.games.get(id);
      set({ selectedGameDetail: detail });
    } catch (err) {
      console.error(`Failed to load game detail for: ${id}`, err);
    }
  },

  loadGames: async () => {
    try {
      const gamesList = await window.nexus.games.list();
      set({ games: gamesList });
    } catch (err) {
      console.error('Failed to load games list', err);
    }
  },

  loadSettings: async () => {
    try {
      const config = await window.nexus.settings.get();
      set({ settings: config });
    } catch (err) {
      console.error('Failed to load settings', err);
    }
  },

  updateSettings: async (patch) => {
    try {
      const updated = await window.nexus.settings.update(patch);
      set({ settings: updated });
    } catch (err) {
      console.error('Failed to update settings', err);
    }
  },

  scanSources: async () => {
    set({ isScanning: true });
    try {
      await window.nexus.games.scanSources();
      await get().loadGames();
    } catch (err) {
      console.error('Failed scanning libraries', err);
    } finally {
      set({ isScanning: false });
    }
  },

  launchGame: async (id) => {
    try {
      const res = await window.nexus.games.launch(id);
      if (res.success) {
        // If minimized, it will happen on the main process side
        // Refresh games list later to catch playtimes
        setTimeout(() => get().loadGames(), 5000);
      }
      return res;
    } catch (err: any) {
      console.error(`Failed to launch game: ${id}`, err);
      return { success: false, error: err.message };
    }
  },

  toggleFavorite: async (id) => {
    try {
      const isFav = await window.nexus.games.toggleFavorite(id);
      // Update local state
      set((state) => ({
        games: state.games.map((g) => (g.id === id ? { ...g, favorite: isFav } : g)),
        selectedGameDetail: state.selectedGameDetail && state.selectedGameDetail.game.id === id
          ? { ...state.selectedGameDetail, game: { ...state.selectedGameDetail.game, favorite: isFav } }
          : state.selectedGameDetail
      }));
    } catch (err) {
      console.error('Failed to toggle favorite', err);
    }
  },

  toggleHide: async (id) => {
    try {
      const isHidden = await window.nexus.games.toggleHide(id);
      set((state) => ({
        games: state.games.map((g) => (g.id === id ? { ...g, hidden: isHidden } : g)),
        selectedGameDetail: state.selectedGameDetail && state.selectedGameDetail.game.id === id
          ? { ...state.selectedGameDetail, game: { ...state.selectedGameDetail.game, hidden: isHidden } }
          : state.selectedGameDetail
      }));
    } catch (err) {
      console.error('Failed to toggle hidden', err);
    }
  },

  addManualGame: async (gameData) => {
    try {
      await window.nexus.games.addManual(gameData);
      await get().loadGames();
    } catch (err) {
      console.error('Failed to add manual game', err);
    }
  },

  loadLogs: async (file) => {
    const fileToLoad = file || get().activeLogFile;
    set({ activeLogFile: fileToLoad });
    try {
      const logsContent = await window.nexus.logs.get(fileToLoad);
      set({ logs: logsContent });
    } catch (err) {
      console.error('Failed to load logs', err);
    }
  },

  loadControllers: async () => {
    try {
      const list = await window.nexus.controllers.getBatteryInfo();
      set({ controllers: list });
    } catch (err) {
      console.error('Failed to load controller battery info', err);
    }
  },

  deleteGame: async (id) => {
    try {
      const res = await window.nexus.games.delete(id);
      if (res.success) {
        await get().loadGames();
      }
      return res;
    } catch (err: any) {
      console.error('Failed to delete game', err);
      return { success: false, error: err.message || 'Unknown error' };
    }
  },

  searchMetadata: async (query) => {
    try {
      return await window.nexus.games.searchMetadata(query);
    } catch (err) {
      console.error('Failed to search metadata', err);
      return [];
    }
  },

  applyMetadata: async (gameId, sgdbGameId, gameTitle) => {
    try {
      const res = await window.nexus.games.applyMetadata(gameId, sgdbGameId, gameTitle);
      if (res.success) {
        await get().loadGames();
      }
      return res;
    } catch (err: any) {
      console.error('Failed to apply metadata', err);
      return { success: false, error: err.message || 'Unknown error' };
    }
  },

  updateTitle: async (id, title) => {
    try {
      const res = await window.nexus.games.updateTitle(id, title);
      if (res.success) {
        await get().loadGames();
      }
      return res;
    } catch (err: any) {
      console.error('Failed to update title', err);
      return { success: false, error: err.message || 'Unknown error' };
    }
  }
}));

// Setup global typescript declarations for context isolated preload APIs
interface NexusAPI {
  games: {
    list(): Promise<Game[]>;
    get(id: string): Promise<any>;
    scanSources(): Promise<any>;
    launch(id: string): Promise<{ success: boolean; error?: string }>;
    toggleFavorite(id: string): Promise<boolean>;
    toggleHide(id: string): Promise<boolean>;
    addManual(gameData: any): Promise<Game>;
    delete(id: string): Promise<{ success: boolean; error?: string }>;
    searchMetadata(query: string): Promise<{ id: number; name: string; releaseDate?: string; types: string[] }[]>;
    applyMetadata(gameId: string, sgdbGameId: number, gameTitle: string): Promise<{ success: boolean; error?: string }>;
    updateTitle(id: string, title: string): Promise<{ success: boolean; error?: string }>;
    install(id: string): Promise<{ success: boolean; error?: string }>;
    uninstall(id: string): Promise<{ success: boolean; error?: string }>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
  };
  logs: {
    get(file: 'main' | 'scanner' | 'launcher' | 'metadata'): Promise<string>;
  };
  controllers: {
    getBatteryInfo(): Promise<ControllerBatteryInfo[]>;
  };
}

declare global {
  interface Window {
    nexus: NexusAPI;
  }
}
