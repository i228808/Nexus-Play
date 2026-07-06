import React, { useEffect, useState, useMemo } from 'react';
import { 
  useLauncherStore
} from './stores/launcherStore.ts';
import ConsoleMode from './ConsoleMode.tsx';
import { useGamepad } from './hooks/useGamepad.ts';
import { 
  Play, 
  Gamepad2, 
  Home as HomeIcon, 
  Library as LibraryIcon, 
  Settings as SettingsIcon, 
  FileText, 
  Search, 
  Star, 
  EyeOff, 
  Plus, 
  RefreshCw, 
  X, 
  Loader2, 
  Edit2,
  Save,
  CheckCircle,
  AlertCircle,
  Battery,
  BatteryCharging,
  Download,
  Trash2,
  Eye
} from 'lucide-react';

const getGameCoverUrl = (game: any) => {
  if (!game) return '';
  const base = game.coverUrl || `nexus-media://covers/${game.id.replace(/:/g, '_')}`;
  const t = game.updatedAt ? new Date(game.updatedAt).getTime() : 0;
  return `${base}?t=${t}`;
};

const getGameHeroUrl = (game: any) => {
  if (!game) return '';
  const base = game.heroUrl || `nexus-media://heroes/${game.id.replace(/:/g, '_')}`;
  const t = game.updatedAt ? new Date(game.updatedAt).getTime() : 0;
  return `${base}?t=${t}`;
};

export default function App() {
  const {
    games,
    settings,
    activeTab,
    selectedGameId,
    selectedGameDetail,
    isScanning,
    logs,
    activeLogFile,
    controllers,
    setActiveTab,
    setSelectedGameId,
    loadGames,
    loadSettings,
    updateSettings,
    scanSources,
    launchGame,
    toggleFavorite,
    toggleHide,
    addManualGame,
    loadLogs,
    loadControllers
  } = useLauncherStore();

  // Local UI States
  const [consoleMode, setConsoleMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'steam' | 'legendary' | 'manual'>('all');
  const [installedFilter, setInstalledFilter] = useState<'all' | 'installed'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Manual Game Fields
  const [manualTitle, setManualTitle] = useState('');
  const [manualCommand, setManualCommand] = useState('');
  const [manualInstallPath, setManualInstallPath] = useState('');
  const [manualExecutable, setManualExecutable] = useState('');

  // Metadata Search & Delete States
  const [metaSearchQuery, setMetaSearchQuery] = useState('');
  const [metaSearchResults, setMetaSearchResults] = useState<{ id: number; name: string; releaseDate?: string }[]>([]);
  const [isSearchingMetadata, setIsSearchingMetadata] = useState(false);
  const [isApplyingMetadata, setIsApplyingMetadata] = useState(false);
  const [metadataSearchError, setMetadataSearchError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Settings Local Input States
  const [sgdbKey, setSgdbKey] = useState('');
  const [legPath, setLegPath] = useState('');
  const [minLaunch, setMinLaunch] = useState(true);
  const [scanStartup, setScanStartup] = useState(true);
  
  // Emulator Settings States
  const [romDirs, setRomDirs] = useState('');
  const [ryuPath, setRyuPath] = useState('');
  const [yuPath, setYuPath] = useState('');
  const [pcsxPath, setPcsxPath] = useState('');

  // Listen for PS or Xbox Home/Guide button to toggle Big Picture Mode
  useGamepad({
    onAction: (action) => {
      if (action === 'home') {
        setConsoleMode((prev) => !prev);
      }
    },
    enabled: true,
  });

  // Initial load & Polling loops
  useEffect(() => {
    loadGames();
    loadSettings();
    
    // Gamepad controller battery polling loop
    loadControllers();
    const interval = setInterval(() => {
      loadControllers();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Battery helper
  const getBatteryIcon = (capacity: number, status: string) => {
    if (status === 'Charging') {
      return <BatteryCharging className="w-4 h-4 text-green-400 fill-green-400/10 animate-pulse" />;
    }
    if (capacity <= 20) {
      return <Battery className="w-4 h-4 text-red-500 fill-red-500/10 animate-bounce" />;
    }
    if (capacity <= 50) {
      return <Battery className="w-4 h-4 text-yellow-500 fill-yellow-500/10" />;
    }
    return <Battery className="w-4 h-4 text-green-400 fill-green-400/10" />;
  };

  // Update settings inputs when settings load
  useEffect(() => {
    if (settings) {
      setSgdbKey(settings.steamGridDbApiKey || '');
      setLegPath(settings.legendaryPath || 'legendary');
      setMinLaunch(settings.minimizeOnLaunch);
      setScanStartup(settings.scanOnStartup);
      setRomDirs(settings.romDirectories || '');
      setRyuPath(settings.ryujinxPath || 'ryujinx');
      setYuPath(settings.yuzuPath || 'yuzu');
      setPcsxPath(settings.pcsx2Path || 'pcsx2-qt');
    }
  }, [settings]);

  // Load logs on interval if in logs tab
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTab === 'logs') {
      loadLogs();
      interval = setInterval(() => loadLogs(), 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, activeLogFile]);

  // Formatted playtime helper
  const formatPlaytime = (seconds: number) => {
    if (seconds === 0) return 'Never played';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Filtered games
  const filteredGames = useMemo(() => {
    return games.filter(g => {
      if (g.hidden) return false;
      
      const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSource = sourceFilter === 'all' || g.source === sourceFilter;
      const matchesInstalled = installedFilter === 'all' || g.installed;

      return matchesSearch && matchesSource && matchesInstalled;
    });
  }, [games, searchQuery, sourceFilter, installedFilter]);

  // Home page categories
  const favoriteGames = useMemo(() => games.filter(g => g.favorite && !g.hidden), [games]);
  const recentlyPlayed = useMemo(() => {
    return [...games]
      .filter(g => g.lastPlayedAt && !g.hidden)
      .sort((a, b) => new Date(b.lastPlayedAt!).getTime() - new Date(a.lastPlayedAt!).getTime())
      .slice(0, 6);
  }, [games]);
  const recentlyAdded = useMemo(() => {
    return [...games]
      .filter(g => !g.hidden)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [games]);

  // Last played game for hero background
  const heroGame = useMemo(() => {
    const played = games.filter(g => g.lastPlayedAt && !g.hidden);
    if (played.length === 0) return games[0] || null;
    return played.sort((a, b) => new Date(b.lastPlayedAt!).getTime() - new Date(a.lastPlayedAt!).getTime())[0];
  }, [games]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');
    await updateSettings({
      steamGridDbApiKey: sgdbKey,
      legendaryPath: legPath,
      minimizeOnLaunch: minLaunch,
      scanOnStartup: scanStartup,
      romDirectories: romDirs,
      ryujinxPath: ryuPath,
      yuzuPath: yuPath,
      pcsx2Path: pcsxPath
    });
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleBrowseRomDirs = async () => {
    // @ts-ignore
    const result = await window.nexus.dialog.showOpenDialog({
      properties: ['openDirectory', 'multiSelections']
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      const currentDirs = romDirs.split(',').map(d => d.trim()).filter(Boolean);
      const newDirs = Array.from(new Set([...currentDirs, ...result.filePaths]));
      setRomDirs(newDirs.join(', '));
    }
  };

  const handleAddManualGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle || !manualCommand) return;
    
    await addManualGame({
      title: manualTitle,
      launchCommand: manualCommand,
      installPath: manualInstallPath || undefined,
      executablePath: manualExecutable || undefined,
      platform: 'linux'
    });

    // Reset fields
    setManualTitle('');
    setManualCommand('');
    setManualInstallPath('');
    setManualExecutable('');
    setShowAddModal(false);
  };

  const handleLaunch = async (id: string) => {
    setLaunchError(null);
    const res = await launchGame(id);
    if (!res.success) {
      setLaunchError(res.error || 'Unknown error launching game');
    }
  };

  const handleInstall = async (id: string) => {
    setLaunchError(null);
    const res = await window.nexus.games.install(id);
    if (!res.success) {
      setLaunchError(res.error || 'Unknown error installing game');
    } else {
      loadGames();
    }
  };

  const handleUninstall = async (id: string) => {
    setLaunchError(null);
    const res = await window.nexus.games.uninstall(id);
    if (!res.success) {
      setLaunchError(res.error || 'Unknown error uninstalling game');
    } else {
      loadGames();
    }
  };

  const handleOpenMetadataSearch = async () => {
    if (!selectedGameDetail) return;
    setIsSearchingMetadata(true);
    setMetaSearchQuery(selectedGameDetail.game.title);
    setMetadataSearchError(null);
    setMetaSearchResults([]);
    
    try {
      const results = await window.nexus.games.searchMetadata(selectedGameDetail.game.title);
      setMetaSearchResults(results);
    } catch (err: any) {
      setMetadataSearchError(err.message || 'Failed to search metadata');
    }
  };

  const handleSearchMetadata = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!metaSearchQuery.trim()) return;
    setMetadataSearchError(null);
    try {
      const results = await window.nexus.games.searchMetadata(metaSearchQuery);
      setMetaSearchResults(results);
    } catch (err: any) {
      setMetadataSearchError(err.message || 'Failed to search metadata');
    }
  };

  const handleApplyMetadata = async (sgdbGameId: number, sgdbGameName: string) => {
    if (!selectedGameDetail) return;
    setIsApplyingMetadata(true);
    setMetadataSearchError(null);
    try {
      const res = await window.nexus.games.applyMetadata(
        selectedGameDetail.game.id,
        sgdbGameId,
        sgdbGameName
      );
      if (res.success) {
        // Refresh details & list
        await setSelectedGameId(selectedGameDetail.game.id);
        setIsSearchingMetadata(false);
      } else {
        setMetadataSearchError(res.error || 'Failed to apply metadata');
      }
    } catch (err: any) {
      setMetadataSearchError(err.message || 'Failed to apply metadata');
    } finally {
      setIsApplyingMetadata(false);
    }
  };

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleVal, setEditTitleVal] = useState('');

  useEffect(() => {
    setIsEditingTitle(false);
    if (selectedGameDetail) {
      setEditTitleVal(selectedGameDetail.game.title);
    }
  }, [selectedGameDetail]);

  const { deleteGame, updateTitle } = useLauncherStore();

  const handleSaveTitle = async () => {
    if (!selectedGameDetail || !editTitleVal.trim()) return;
    try {
      const res = await updateTitle(selectedGameDetail.game.id, editTitleVal.trim());
      if (res.success) {
        setIsEditingTitle(false);
        // Refresh details & list
        await setSelectedGameId(selectedGameDetail.game.id);
      } else {
        alert(res.error || 'Failed to update title');
      }
    } catch (e: any) {
      alert(e.message || 'Error updating title');
    }
  };
  const handleDeleteGame = async () => {
    if (!selectedGameDetail) return;
    setLaunchError(null);
    const res = await deleteGame(selectedGameDetail.game.id);
    if (res.success) {
      setSelectedGameId(null);
      setDeleteConfirm(false);
    } else {
      setLaunchError(res.error || 'Failed to delete game');
    }
  };

  return (
    <div className="flex h-screen w-screen bg-dark-900 text-slate-200 overflow-hidden font-sans">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-dark-800/90 border-r border-slate-800/50 flex flex-col justify-between py-6 px-4 z-10 backdrop-blur-md">
        <div className="flex flex-col gap-8">
          {/* Logo */}
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-gradient-to-tr from-accent to-accent-purple rounded-lg shadow-lg shadow-blue-500/20 text-white">
              <Gamepad2 className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white leading-none">Nexus Play</h1>
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Game Command Center</span>
            </div>
          </div>

          {/* Nav List */}
          <nav className="flex flex-col gap-1.5">
            <button 
              onClick={() => setActiveTab('home')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all transform active:scale-[0.97] duration-150 ${
                activeTab === 'home' 
                  ? 'bg-accent/15 text-blue-400 border-l-2 border-accent' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <HomeIcon className="w-4 h-4" />
              Home
            </button>
            <button 
              onClick={() => setActiveTab('library')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all transform active:scale-[0.97] duration-150 ${
                activeTab === 'library' 
                  ? 'bg-accent/15 text-blue-400 border-l-2 border-accent' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <LibraryIcon className="w-4 h-4" />
              Library
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all transform active:scale-[0.97] duration-150 ${
                activeTab === 'settings' 
                  ? 'bg-accent/15 text-blue-400 border-l-2 border-accent' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              Settings
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all transform active:scale-[0.97] duration-150 ${
                activeTab === 'logs' 
                  ? 'bg-accent/15 text-blue-400 border-l-2 border-accent' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <FileText className="w-4 h-4" />
              Logs
            </button>
          </nav>
        </div>

        {/* Sync Status / Scanning */}
        <div className="flex flex-col gap-3">
          {/* Big Picture / Console Mode toggle */}
          <button
            onClick={() => setConsoleMode(true)}
            className="w-full py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/20 active:scale-95 transition-all duration-150 flex items-center justify-center gap-2"
          >
            <Gamepad2 className="w-4 h-4" />
            Big Picture Mode
          </button>
          <button 
            disabled={isScanning}
            onClick={scanSources}
            className={`w-full py-2.5 text-xs font-semibold rounded-lg shadow flex items-center justify-center gap-2 ${
              isScanning 
                ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-700/30' 
                : 'glow-btn'
            }`}
          >
            {isScanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Scanning Drives...
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Scan Library
              </>
            )}
          </button>
          <div className="text-[10px] text-center text-slate-500 font-medium">
            Total Games: {games.length}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT VIEW */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-gradient-to-b from-dark-800 to-dark-900">
        
        {/* TOP BAR / SYSTEM DECORATION PLACEHOLDER */}
        <header className="h-12 border-b border-white/5 flex items-center justify-between px-8 text-xs text-white/40 bg-dark-900/40 backdrop-blur-md z-10">
          <div className="flex items-center gap-2 select-none">
            <span className="font-semibold text-white/60">Command Hub</span>
            <span className="text-white/20">/</span>
            <span className="text-white/80 capitalize font-medium">{activeTab}</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Connected Gamepads */}
            <div className="flex items-center gap-2.5">
              {controllers && controllers.length > 0 ? (
                controllers.map((ctrl, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/5 text-white/80 font-medium text-[11px] shadow-sm hover:bg-white/[0.06] hover:border-white/10 active:scale-[0.95] transition-all duration-200 cursor-default"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 text-blue-400 fill-blue-400/20" />
                    <span className="max-w-[150px] truncate">{ctrl.name}</span>
                    <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                      {getBatteryIcon(ctrl.capacity, ctrl.status)}
                      <span className={ctrl.capacity <= 20 ? 'text-red-400 font-bold' : ''}>
                        {ctrl.capacity}%
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-1.5 text-white/30">
                  <Gamepad2 className="w-3.5 h-3.5 stroke-[1.5]" />
                  <span className="text-[10px] tracking-wide uppercase font-semibold">No controllers connected</span>
                </div>
              )}
            </div>
            
            <span className="text-white/10">|</span>
            <span className="text-white/40 font-mono text-[10px]">CachyOS Desktop Mode</span>
          </div>
        </header>

        {/* TAB CONTENTS */}
        <div className="flex-1 overflow-y-auto px-8 py-6 custom-scroll">
          
          {/* TAB: HOME */}
          {activeTab === 'home' && (
            <div className="flex flex-col gap-8 animate-fade-in">
              {/* Hero Banner of Last Played Game */}
              {heroGame ? (
                <div 
                  className="relative h-64 rounded-2xl overflow-hidden glass-card flex items-end p-6 border border-slate-700/30 cursor-pointer"
                  onClick={() => setSelectedGameId(heroGame.id)}
                >
                  {/* Backdrop artwork blur */}
                  {heroGame.id && (
                    <div 
                      className="absolute inset-0 bg-cover bg-center filter saturate-[0.8] brightness-[0.4]"
                      style={{ backgroundImage: `url('${getGameHeroUrl(heroGame)}')`, fallback: 'linear-gradient(to right, #0b0f19, #030712)' } as any}
                    />
                  )}
                  {/* Subtle dark gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/40 to-transparent" />
                  
                  <div className="relative z-10 flex flex-col gap-2 max-w-lg">
                    <span className="px-2 py-0.5 w-max bg-blue-500/25 border border-blue-500/30 rounded text-[10px] font-semibold uppercase tracking-wider text-blue-300">
                      {heroGame.source === 'steam' ? 'Steam' : heroGame.source === 'legendary' ? 'Epic Games' : 'Manual'}
                    </span>
                    <h2 className="text-3xl font-extrabold text-white leading-tight">{heroGame.title}</h2>
                    <p className="text-sm text-slate-400 font-medium">
                      Last Played: {heroGame.lastPlayedAt ? new Date(heroGame.lastPlayedAt).toLocaleDateString() : 'Never'}
                    </p>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleLaunch(heroGame.id); }}
                      className="glow-btn py-2 px-5 w-max text-xs mt-2"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Play Now
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-64 rounded-2xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-2">
                  <Gamepad2 className="w-12 h-12 stroke-[1.2]" />
                  <p>Your library is empty. Click "Scan Library" to import games.</p>
                </div>
              )}

              {/* Continue Playing Rows */}
              {recentlyPlayed.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold tracking-wider uppercase text-slate-400 px-1">Continue Playing</h3>
                  <div className="grid grid-cols-6 gap-4">
                    {recentlyPlayed.map(game => (
                      <div 
                        key={game.id} 
                        onClick={() => setSelectedGameId(game.id)}
                        className="glass-card overflow-hidden game-card-hover flex flex-col h-[270px] group border border-slate-800/40"
                      >
                        <div className="relative w-full h-[200px] shrink-0 bg-dark-900 overflow-hidden">
                          {/* Image cover cache protocol */}
                          <img 
                            src={getGameCoverUrl(game)} 
                            alt={game.title}
                            onError={(e) => {
                              // If image fails, replace with placeholder
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150" viewBox="0 0 100 150"><rect width="100" height="150" fill="%230b0f19"/><text x="50" y="75" font-family="sans-serif" font-size="10" fill="%23475569" text-anchor="middle">Cover</text></svg>';
                            }}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur rounded text-[9px] font-semibold text-slate-300">
                            {game.source.toUpperCase()}
                          </div>
                        </div>
                        <div className="p-3 flex flex-col gap-0.5 justify-center bg-dark-800/90 border-t border-slate-800/30">
                          <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-blue-400">{game.title}</h4>
                          <span className="text-[10px] text-slate-500">{formatPlaytime(game.playtimeSeconds)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Favorites Row */}
              {favoriteGames.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold tracking-wider uppercase text-slate-400 px-1">Favorites</h3>
                  <div className="grid grid-cols-6 gap-4">
                    {favoriteGames.slice(0, 6).map(game => (
                      <div 
                        key={game.id} 
                        onClick={() => setSelectedGameId(game.id)}
                        className="glass-card overflow-hidden game-card-hover flex flex-col h-[270px] group border border-slate-800/40"
                      >
                        <div className="relative w-full h-[200px] shrink-0 bg-dark-900 overflow-hidden">
                          <img 
                            src={getGameCoverUrl(game)} 
                            alt={game.title}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150" viewBox="0 0 100 150"><rect width="100" height="150" fill="%230b0f19"/><text x="50" y="75" font-family="sans-serif" font-size="10" fill="%23475569" text-anchor="middle">Cover</text></svg>';
                            }}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur rounded text-[9px] font-semibold text-slate-300">
                            {game.source.toUpperCase()}
                          </div>
                        </div>
                        <div className="p-3 flex flex-col gap-0.5 justify-center bg-dark-800/90 border-t border-slate-800/30">
                          <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-blue-400">{game.title}</h4>
                          <span className="text-[10px] text-slate-500">{formatPlaytime(game.playtimeSeconds)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recently Added Row */}
              {recentlyAdded.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold tracking-wider uppercase text-slate-400 px-1">Recently Added</h3>
                  <div className="grid grid-cols-6 gap-4">
                    {recentlyAdded.map(game => (
                      <div 
                        key={game.id} 
                        onClick={() => setSelectedGameId(game.id)}
                        className="glass-card overflow-hidden game-card-hover flex flex-col h-[270px] group border border-slate-800/40"
                      >
                        <div className="relative w-full h-[200px] shrink-0 bg-dark-900 overflow-hidden">
                          <img 
                            src={getGameCoverUrl(game)} 
                            alt={game.title}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150" viewBox="0 0 100 150"><rect width="100" height="150" fill="%230b0f19"/><text x="50" y="75" font-family="sans-serif" font-size="10" fill="%23475569" text-anchor="middle">Cover</text></svg>';
                            }}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur rounded text-[9px] font-semibold text-slate-300">
                            {game.source.toUpperCase()}
                          </div>
                        </div>
                        <div className="p-3 flex flex-col gap-0.5 justify-center bg-dark-800/90 border-t border-slate-800/30">
                          <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-blue-400">{game.title}</h4>
                          <span className="text-[10px] text-slate-500">{formatPlaytime(game.playtimeSeconds)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: LIBRARY */}
          {activeTab === 'library' && (
            <div className="flex flex-col gap-6 animate-fade-in">
              {/* Header section with Filter Controls */}
              <div className="flex items-center justify-between bg-dark-800/40 p-4 border border-slate-800/50 rounded-xl backdrop-blur-md gap-4">
                
                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input 
                    type="text"
                    placeholder="Search library..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-dark-900 border border-slate-800/80 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3">
                  {/* Source select */}
                  <select 
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value as any)}
                    className="bg-dark-900 border border-slate-800/80 rounded-lg text-slate-300 text-xs px-3 py-2 focus:outline-none focus:border-accent"
                  >
                    <option value="all">All Sources</option>
                    <option value="steam">Steam</option>
                    <option value="legendary">Epic Games</option>
                    <option value="manual">Manual</option>
                  </select>

                  {/* Installed select */}
                  <select 
                    value={installedFilter}
                    onChange={(e) => setInstalledFilter(e.target.value as any)}
                    className="bg-dark-900 border border-slate-800/80 rounded-lg text-slate-300 text-xs px-3 py-2 focus:outline-none focus:border-accent"
                  >
                    <option value="all">All Installed/Uninstalled</option>
                    <option value="installed">Installed Only</option>
                  </select>

                  {/* Add Manual Game Button */}
                  <button 
                    onClick={() => setShowAddModal(true)}
                    className="secondary-btn text-xs py-2 px-3.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Custom Game
                  </button>
                </div>
              </div>

              {/* Grid content */}
              {filteredGames.length > 0 ? (
                <div className="grid grid-cols-6 gap-4">
                  {filteredGames.map(game => (
                    <div 
                      key={game.id} 
                      onClick={() => setSelectedGameId(game.id)}
                      className="glass-card overflow-hidden game-card-hover flex flex-col h-[270px] group border border-slate-800/40"
                    >
                      <div className="relative w-full h-[200px] shrink-0 bg-dark-900 overflow-hidden">
                        <img 
                          src={getGameCoverUrl(game)} 
                          alt={game.title}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150" viewBox="0 0 100 150"><rect width="100" height="150" fill="%230b0f19"/><text x="50" y="75" font-family="sans-serif" font-size="10" fill="%23475569" text-anchor="middle">Cover</text></svg>';
                          }}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur rounded text-[9px] font-semibold text-slate-300">
                          {game.source.toUpperCase()}
                        </div>
                      </div>
                      <div className="p-3 flex flex-col gap-0.5 justify-center bg-dark-800/90 border-t border-slate-800/30">
                        <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-blue-400">{game.title}</h4>
                        <span className="text-[10px] text-slate-500">{formatPlaytime(game.playtimeSeconds)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-2 bg-dark-800/20">
                  <Gamepad2 className="w-10 h-10 stroke-[1.2] text-slate-600" />
                  <p className="text-sm font-medium">No matching games found.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl flex flex-col gap-8 animate-fade-in">
              <div className="glass-card p-6 border border-slate-800/50">
                <h3 className="text-lg font-bold text-white mb-6 border-b border-slate-800 pb-3 flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-accent" />
                  Configuration Settings
                </h3>

                <form onSubmit={handleSaveSettings} className="flex flex-col gap-5">
                  {/* SGDB API Key */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">SteamGridDB API Key</label>
                    <input 
                      type="password"
                      placeholder="Paste your 32-character SteamGridDB API key here..."
                      value={sgdbKey}
                      onChange={(e) => setSgdbKey(e.target.value)}
                      className="bg-dark-900 border border-slate-850 px-4 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent focus:bg-dark-900/60 font-mono"
                    />
                    <span className="text-[10px] text-slate-500">Required to automatically pull grid artwork and banners. Grab yours for free on steamgriddb.com.</span>
                  </div>

                  {/* Legendary Path */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Legendary Command Binary Path</label>
                    <input 
                      type="text"
                      placeholder="e.g. legendary"
                      value={legPath}
                      onChange={(e) => setLegPath(e.target.value)}
                      className="bg-dark-900 border border-slate-850 px-4 py-2.5 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent font-mono"
                    />
                    <span className="text-[10px] text-slate-500">Defaults to globally installed 'legendary' binary. Modify if installing in a custom prefix.</span>
                  </div>

                  <div className="border-t border-slate-800/40 pt-4 mt-2">
                    <h4 className="text-sm font-bold text-slate-300 mb-4">Emulator & ROMs</h4>
                    <div className="flex flex-col gap-4">
                      {/* ROM Directories */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">ROM Directories</label>
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            placeholder="/path/to/roms1, /path/to/roms2"
                            value={romDirs}
                            onChange={(e) => setRomDirs(e.target.value)}
                            className="bg-dark-900 border border-slate-850 px-4 py-2.5 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent font-mono flex-1"
                          />
                          <button
                            type="button"
                            onClick={handleBrowseRomDirs}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                          >
                            Browse...
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-500">Comma-separated list of directories to scan for .nsp, .xci, and .iso files.</span>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Ryujinx */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ryujinx Path</label>
                          <input 
                            type="text"
                            placeholder="ryujinx"
                            value={ryuPath}
                            onChange={(e) => setRyuPath(e.target.value)}
                            className="bg-dark-900 border border-slate-850 px-4 py-2.5 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent font-mono"
                          />
                        </div>

                        {/* PCSX2 */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">PCSX2 Path</label>
                          <input 
                            type="text"
                            placeholder="pcsx2-qt"
                            value={pcsxPath}
                            onChange={(e) => setPcsxPath(e.target.value)}
                            className="bg-dark-900 border border-slate-850 px-4 py-2.5 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="flex flex-col gap-3 mt-2 border-t border-slate-800/40 pt-4">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox"
                        checked={minLaunch}
                        onChange={(e) => setMinLaunch(e.target.checked)}
                        className="rounded bg-dark-900 border-slate-800 text-accent focus:ring-accent w-4 h-4"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">Minimize on game launch</span>
                        <span className="text-xs text-slate-500">Minimizes Nexus Play window and restores it to the foreground once the game process exits.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group mt-2">
                      <input 
                        type="checkbox"
                        checked={scanStartup}
                        onChange={(e) => setScanStartup(e.target.checked)}
                        className="rounded bg-dark-900 border-slate-800 text-accent focus:ring-accent w-4 h-4"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">Scan libraries on startup</span>
                        <span className="text-xs text-slate-500">Scan Steam and Epic Games installations automatically when launcher starts up.</span>
                      </div>
                    </label>
                  </div>

                  {/* Action button */}
                  <div className="flex items-center justify-end gap-3 mt-4 border-t border-slate-800/40 pt-4">
                    <button 
                      type="submit"
                      disabled={saveStatus === 'saving'}
                      className="glow-btn px-6 py-2.5 text-xs font-semibold"
                    >
                      {saveStatus === 'saving' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : saveStatus === 'saved' ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          Saved Config!
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          Save Config
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Diagnostics Section */}
              <div className="glass-card p-6 border border-slate-800/50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Diagnostics Information</h3>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div className="bg-dark-900/60 p-3 rounded border border-slate-850">
                    <div className="text-slate-500 mb-1">Configuration Directory</div>
                    <div className="text-slate-300 truncate">~/.config/NexusPlay/</div>
                  </div>
                  <div className="bg-dark-900/60 p-3 rounded border border-slate-850">
                    <div className="text-slate-500 mb-1">Cache Directory</div>
                    <div className="text-slate-300 truncate">~/.cache/NexusPlay/assets/</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: LOGS */}
          {activeTab === 'logs' && (
            <div className="flex flex-col gap-4 h-[calc(100vh-10rem)] animate-fade-in">
              {/* Log selector subnav */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex gap-2">
                  {(['main', 'scanner', 'launcher', 'metadata'] as const).map(file => (
                    <button
                      key={file}
                      onClick={() => loadLogs(file)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        activeLogFile === file
                          ? 'bg-slate-800 text-white font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {file.toUpperCase()}.log
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => loadLogs()}
                  className="secondary-btn text-xs px-3 py-1.5"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>

              {/* Log Viewport */}
              <div className="flex-1 bg-dark-900 border border-slate-800 rounded-xl p-4 font-mono text-[11px] text-slate-300 overflow-y-auto leading-relaxed custom-scroll h-full">
                {logs ? (
                  <pre className="whitespace-pre-wrap">{logs}</pre>
                ) : (
                  <div className="text-slate-600 italic">No log lines available yet. Trigger some actions or scan the library.</div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* DETAIL PANEL OVERLAY (MODAL VIEW) */}
        {selectedGameId && selectedGameDetail && (
          <div className="absolute inset-0 bg-dark-900/90 z-20 flex justify-end animate-fade-in">
            {/* Backdrop Blur Area (closes modal when clicked) */}
            <div className="absolute inset-0" onClick={() => setSelectedGameId(null)} />
            
            {/* Slide Out Panel */}
            <div className="relative w-[500px] h-full bg-dark-800/95 border-l border-slate-800/80 shadow-2xl flex flex-col justify-between z-30 backdrop-blur-lg">
              
              {/* Hero Image Header inside panel */}
              <div className="relative h-48 bg-dark-900 border-b border-slate-800/30 overflow-hidden">
                <div 
                  className="absolute inset-0 bg-cover bg-center brightness-[0.4]"
                  style={{ backgroundImage: `url('${getGameHeroUrl(selectedGameDetail.game)}')` } as any}
                />
                <button 
                  onClick={() => setSelectedGameId(null)}
                  className="absolute top-4 right-4 p-1.5 bg-black/60 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-4 left-6 z-10 flex flex-col gap-1.5">
                  <span className="px-2 py-0.5 w-max bg-blue-500/25 border border-blue-500/30 rounded text-[9px] font-semibold uppercase tracking-wider text-blue-300">
                    {selectedGameDetail.game.source.toUpperCase()}
                  </span>
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2 max-w-[400px] w-full mt-1">
                      <input
                        type="text"
                        value={editTitleVal}
                        onChange={(e) => setEditTitleVal(e.target.value)}
                        className="bg-dark-950 border border-slate-700 px-2 py-0.5 rounded text-sm text-slate-100 focus:outline-none focus:border-accent w-full font-semibold"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveTitle}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-[10px] text-white font-bold tracking-wide uppercase transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditingTitle(false)}
                        className="px-2 py-1 bg-slate-700 hover:bg-slate-650 rounded text-[10px] text-slate-300 font-bold tracking-wide uppercase transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 max-w-[400px] mt-0.5">
                      <h3 className="text-xl font-black text-white truncate">{selectedGameDetail.game.title}</h3>
                      <button
                        onClick={() => setIsEditingTitle(true)}
                        className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                        title="Rename game"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Panel Content (Switches between Main Details and Metadata Search) */}
              {isSearchingMetadata ? (
                <div className="flex-1 overflow-y-auto px-6 py-6 custom-scroll flex flex-col gap-5">
                  <div className="flex items-center justify-between border-b border-slate-800/40 pb-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Search Artwork & Metadata</h4>
                    <button 
                      onClick={() => {
                        setIsSearchingMetadata(false);
                        setMetadataSearchError(null);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      Back to details
                    </button>
                  </div>

                  <form onSubmit={handleSearchMetadata} className="flex gap-2">
                    <input 
                      type="text"
                      value={metaSearchQuery}
                      onChange={(e) => setMetaSearchQuery(e.target.value)}
                      placeholder="Enter game title..."
                      className="flex-1 bg-dark-900 border border-slate-850 px-3 py-2 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent"
                    />
                    <button 
                      type="submit"
                      className="glow-btn text-xs py-2 px-4"
                    >
                      Search
                    </button>
                  </form>

                  {metadataSearchError && (
                    <div className="p-3 bg-red-900/10 border border-red-900/30 rounded-lg text-xs text-red-400">
                      {metadataSearchError}
                    </div>
                  )}

                  <div className="flex-1 flex flex-col gap-2 min-h-0">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">SteamGridDB Matches</span>
                    
                    {isApplyingMetadata ? (
                      <div className="flex-1 py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-accent" />
                        <span className="text-xs text-slate-400 font-medium">Downloading high-res covers and artwork...</span>
                      </div>
                    ) : metaSearchResults.length > 0 ? (
                      <div className="flex flex-col gap-2 overflow-y-auto max-h-[360px] pr-1 custom-scroll">
                        {metaSearchResults.map((result) => (
                          <button
                            key={result.id}
                            onClick={() => handleApplyMetadata(result.id, result.name)}
                            className="w-full text-left p-3 rounded-lg bg-dark-900/50 hover:bg-accent/10 border border-slate-850 hover:border-accent/40 flex items-center justify-between group transition-all"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-bold text-slate-200 group-hover:text-blue-400 transition-colors">
                                {result.name}
                              </span>
                              {result.releaseDate && (
                                <span className="text-[10px] text-slate-500">Released: {result.releaseDate}</span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 border border-slate-800 px-2 py-0.5 rounded bg-dark-900">
                              ID: {result.id}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="py-16 border border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center text-xs text-slate-500 gap-1">
                        <span>No matches found.</span>
                        <span className="text-[10px] text-slate-600">Double check title or settings API key.</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-6 py-6 custom-scroll flex flex-col gap-6">
                  
                  {/* Launch Button Section */}
                  <div className="flex flex-col gap-2">
                    {selectedGameDetail.game.installed ? (
                      <button 
                        onClick={() => handleLaunch(selectedGameDetail.game.id)}
                        className="w-full glow-btn py-3.5 text-sm font-bold flex items-center justify-center gap-2"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Launch Game
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleInstall(selectedGameDetail.game.id)}
                        className="w-full glow-btn py-3.5 text-sm font-bold flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 shadow-blue-900/50"
                      >
                        <Download className="w-4 h-4" />
                        Install Game
                      </button>
                    )}
                    {launchError && (
                      <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-2 text-xs text-red-300">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{launchError}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions toggles row */}
                  <div className="flex flex-col gap-3 border-y border-slate-800/40 py-3.5">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => toggleFavorite(selectedGameDetail.game.id)}
                        className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                          selectedGameDetail.game.favorite 
                            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' 
                            : 'border-slate-850 bg-dark-900/40 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${selectedGameDetail.game.favorite ? 'fill-yellow-400' : ''}`} />
                        {selectedGameDetail.game.favorite ? 'Favorite' : 'Add Favorite'}
                      </button>

                      <button 
                        onClick={() => toggleHide(selectedGameDetail.game.id)}
                        className="flex-1 py-2 px-3 rounded-lg border border-slate-850 bg-dark-900/40 text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center justify-center gap-2"
                      >
                        {selectedGameDetail.game.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        {selectedGameDetail.game.hidden ? 'Unhide' : 'Hide'}
                      </button>

                      {selectedGameDetail.game.installed && selectedGameDetail.game.source !== 'manual' && selectedGameDetail.game.source !== 'rom' && (
                        <button 
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to uninstall ${selectedGameDetail.game.title}?`)) {
                              handleUninstall(selectedGameDetail.game.id);
                            }
                          }}
                          className="flex-1 py-2 px-3 rounded-lg border border-red-900/30 bg-red-950/20 text-xs font-semibold text-red-400 hover:text-red-300 hover:border-red-900/50 flex items-center justify-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Uninstall
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <button 
                        onClick={handleOpenMetadataSearch}
                        className="flex-1 py-2 px-3 rounded-lg border border-slate-850 bg-dark-900/40 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:border-slate-700 flex items-center justify-center gap-2 transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Match Artwork / Metadata
                      </button>

                      {deleteConfirm ? (
                        <div className="flex-1 flex gap-1.5">
                          <button 
                            type="button"
                            onClick={handleDeleteGame}
                            className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all"
                          >
                            Confirm Delete
                          </button>
                          <button 
                            type="button"
                            onClick={() => setDeleteConfirm(false)}
                            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeleteConfirm(true)}
                          className="flex-1 py-2 px-3 rounded-lg border border-red-950 bg-red-900/10 hover:bg-red-900/20 text-xs font-semibold text-red-400 hover:text-red-300 flex items-center justify-center gap-2 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                          Remove Game
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Game Details Info */}
                  {(selectedGameDetail.game.description || selectedGameDetail.game.developers || selectedGameDetail.game.genres || selectedGameDetail.game.rating || selectedGameDetail.game.releaseDate) && (
                    <div className="flex flex-col gap-3.5 bg-dark-900/30 p-4 border border-slate-850/60 rounded-lg">
                      {selectedGameDetail.game.rating !== undefined && selectedGameDetail.game.rating !== null && (
                        <div className="flex items-center justify-between border-b border-slate-850/40 pb-2">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Steam Rating</span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold text-[10px]">
                            ★ {selectedGameDetail.game.rating}% Positive
                          </span>
                        </div>
                      )}
                      
                      {selectedGameDetail.game.description && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">About the Game</span>
                          <p className="text-slate-300 text-xs leading-relaxed line-clamp-4 select-text">
                            {selectedGameDetail.game.description}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 mt-1.5 text-xs">
                        {selectedGameDetail.game.releaseDate && (
                          <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 font-semibold uppercase">Released</span>
                            <span className="text-slate-300 font-medium">{selectedGameDetail.game.releaseDate}</span>
                          </div>
                        )}
                        {selectedGameDetail.game.developers && (
                          <div className="flex flex-col">
                            <span className="text-[9px] text-slate-500 font-semibold uppercase">Developer</span>
                            <span className="text-slate-300 font-medium truncate" title={selectedGameDetail.game.developers}>
                              {selectedGameDetail.game.developers}
                            </span>
                          </div>
                        )}
                        {selectedGameDetail.game.genres && (
                          <div className="flex flex-col col-span-2">
                            <span className="text-[9px] text-slate-500 font-semibold uppercase">Genres</span>
                            <span className="text-slate-300 font-medium truncate" title={selectedGameDetail.game.genres}>
                              {selectedGameDetail.game.genres}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Play History</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-dark-900/60 p-3 rounded-lg border border-slate-850/60 flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Playtime</span>
                        <span className="text-sm font-bold text-slate-200">{formatPlaytime(selectedGameDetail.game.playtimeSeconds)}</span>
                      </div>
                      <div className="bg-dark-900/60 p-3 rounded-lg border border-slate-850/60 flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">Last Session</span>
                        <span className="text-sm font-bold text-slate-200">
                          {selectedGameDetail.game.lastPlayedAt 
                            ? new Date(selectedGameDetail.game.lastPlayedAt).toLocaleDateString()
                            : 'Never'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Paths and executable information */}
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Technical Details</h4>
                    
                    <div className="flex flex-col gap-2.5 font-mono text-[11px] bg-dark-900/40 p-4 border border-slate-850/80 rounded-lg">
                      {selectedGameDetail.game.installPath && (
                        <div className="flex flex-col">
                          <span className="text-slate-500 text-[10px] font-bold uppercase mb-0.5">Install Folder</span>
                          <span className="text-slate-300 select-text truncate" title={selectedGameDetail.game.installPath}>
                            {selectedGameDetail.game.installPath}
                          </span>
                        </div>
                      )}

                      {selectedGameDetail.game.executablePath && (
                        <div className="flex flex-col">
                          <span className="text-slate-500 text-[10px] font-bold uppercase mb-0.5">Executable</span>
                          <span className="text-slate-300 select-text truncate" title={selectedGameDetail.game.executablePath}>
                            {selectedGameDetail.game.executablePath}
                          </span>
                        </div>
                      )}

                      {selectedGameDetail.game.launchCommand && (
                        <div className="flex flex-col">
                          <span className="text-slate-500 text-[10px] font-bold uppercase mb-0.5">Launch Command</span>
                          <span className="text-slate-300 select-text truncate" title={selectedGameDetail.game.launchCommand}>
                            {selectedGameDetail.game.launchCommand}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-col">
                        <span className="text-slate-500 text-[10px] font-bold uppercase mb-0.5">Launch Adapter ID</span>
                        <span className="text-slate-300 select-text">
                          {selectedGameDetail.game.source}:{selectedGameDetail.game.externalId || 'manual'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* Panel Footer */}
              <div className="border-t border-slate-800/40 p-4 flex items-center justify-between text-xs text-slate-500 px-6">
                <span>Added: {new Date(selectedGameDetail.game.createdAt).toLocaleDateString()}</span>
                <span>ID: {selectedGameDetail.game.id}</span>
              </div>

            </div>
          </div>
        )}

        {/* MODAL: ADD MANUAL GAME */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/75 z-45 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 border border-slate-700/30 flex flex-col gap-5">
              <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-accent" />
                  Add Custom Game
                </h3>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-500 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddManualGame} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Game Title *</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. Minecraft"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="bg-dark-900 border border-slate-850 px-3 py-2 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Launch Command *</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. java -jar Launcher.jar or ./game"
                    value={manualCommand}
                    onChange={(e) => setManualCommand(e.target.value)}
                    className="bg-dark-900 border border-slate-850 px-3 py-2 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Install Path / Working Directory</label>
                  <input 
                    type="text"
                    placeholder="e.g. /home/user/Games/Minecraft/"
                    value={manualInstallPath}
                    onChange={(e) => setManualInstallPath(e.target.value)}
                    className="bg-dark-900 border border-slate-850 px-3 py-2 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Executable File</label>
                  <input 
                    type="text"
                    placeholder="e.g. minecraft-launcher"
                    value={manualExecutable}
                    onChange={(e) => setManualExecutable(e.target.value)}
                    className="bg-dark-900 border border-slate-850 px-3 py-2 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent font-mono"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 mt-4 border-t border-slate-850 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="secondary-btn text-xs py-2 px-4"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="glow-btn text-xs py-2 px-5"
                  >
                    Save Game
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>

      {/* ── CONSOLE / BIG PICTURE MODE OVERLAY ── */}
      {consoleMode && (
        <ConsoleMode
          games={games}
          controllers={controllers}
          onLaunch={handleLaunch}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
          onToggleFavorite={toggleFavorite}
          onDeleteGame={deleteGame}
          onClose={() => setConsoleMode(false)}
        />
      )}
    </div>
  );
}
