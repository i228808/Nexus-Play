import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nexus', {
  games: {
    list: () => ipcRenderer.invoke('games:list'),
    get: (id: string) => ipcRenderer.invoke('games:get', id),
    scanSources: () => ipcRenderer.invoke('games:scanSources'),
    launch: (id: string) => ipcRenderer.invoke('games:launch', id),
    stop: (id: string) => ipcRenderer.invoke('games:stop', id),
    toggleFavorite: (id: string) => ipcRenderer.invoke('games:toggleFavorite', id),
    toggleHide: (id: string) => ipcRenderer.invoke('games:toggleHide', id),
    addManual: (gameData: {
      title: string;
      launchCommand: string;
      installPath?: string;
      executablePath?: string;
      platform?: 'linux' | 'windows' | 'emulated' | 'web';
    }) => ipcRenderer.invoke('games:addManual', gameData),
    delete: (id: string) => ipcRenderer.invoke('games:delete', id),
    searchMetadata: (query: string) => ipcRenderer.invoke('games:searchMetadata', query),
    applyMetadata: (gameId: string, sgdbGameId: number, gameTitle: string) =>
      ipcRenderer.invoke('games:applyMetadata', gameId, sgdbGameId, gameTitle),
    updateConfiguration: (gameId: string, config: { winePrefix?: string; protonVersion?: string }) => 
      ipcRenderer.invoke('games:updateConfiguration', gameId, config),
    updateTitle: (id: string, title: string) =>
      ipcRenderer.invoke('games:updateTitle', id, title),
    install: (id: string) => ipcRenderer.invoke('games:install', id),
    uninstall: (id: string) => ipcRenderer.invoke('games:uninstall', id),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch: any) => ipcRenderer.invoke('settings:update', patch),
  },
  logs: {
    get: (file: 'main' | 'scanner' | 'launcher' | 'metadata') => ipcRenderer.invoke('logs:get', file),
  },
  controllers: {
    getBatteryInfo: () => ipcRenderer.invoke('controllers:getBatteryInfo'),
  },
  dialog: {
    showOpenDialog: (options: any) => ipcRenderer.invoke('dialog:showOpenDialog', options),
  },
  wine: {
    getRunners: () => ipcRenderer.invoke('wine:getRunners'),
    getPrefixes: () => ipcRenderer.invoke('wine:getPrefixes'),
    createPrefix: (name: string) => ipcRenderer.invoke('wine:createPrefix', name),
    installProtonGE: () => ipcRenderer.invoke('wine:installProtonGE'),
  },
  setFullscreen: (isFullscreen: boolean) => ipcRenderer.invoke('window:setFullscreen', isFullscreen),
});
