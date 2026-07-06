import { useEffect, useRef, useState, useMemo } from 'react';
import { Game } from '@nexus-play/core';
import { useGamepad, GamepadAction } from './hooks/useGamepad';
import {
  Play,
  Star,
  ChevronLeft,
  Clock,
  Gamepad2,
  Search,
  X,
  Battery,
} from 'lucide-react';

// ─── Source icons & branding ─────────────────────────────────────────────────
function SourceBadge({ source, size = 'sm' }: { source: string; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg'
    ? 'text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full'
    : 'text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full';

  switch (source) {
    case 'steam':
      return (
        <span className={`${cls} bg-gradient-to-r from-[#1b2838] to-[#2a475e] text-[#66c0f4] border border-[#66c0f4]/20 flex items-center gap-1.5`}>
          <SteamIcon className={size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} />
          Steam
        </span>
      );
    case 'legendary':
    case 'epic':
      return (
        <span className={`${cls} bg-gradient-to-r from-[#0078f2] to-[#003087] text-white border border-[#0078f2]/30 flex items-center gap-1.5`}>
          <EpicIcon className={size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} />
          Epic
        </span>
      );
    case 'manual':
      return (
        <span className={`${cls} bg-white/10 text-white/60 border border-white/10 flex items-center gap-1.5`}>
          <Gamepad2 className={size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} />
          Custom
        </span>
      );
    default:
      return (
        <span className={`${cls} bg-white/10 text-white/60 border border-white/10`}>
          {source}
        </span>
      );
  }
}

// Inline SVG icons (no external deps)
function SteamIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.524s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.455 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/>
    </svg>
  );
}

function EpicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 2v20h18V2H3zm9.6 3.6l2.4 7.2H9l3-7.2zm-5.4 9.6h9.6l-1.2 3.6H8.4L7.2 15.2z"/>
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatPlaytime(seconds: number) {
  if (!seconds || seconds === 0) return 'Not played yet';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const PLACEHOLDER_GRADIENTS = [
  'from-blue-900 via-blue-800 to-indigo-900',
  'from-purple-900 via-purple-800 to-pink-900',
  'from-emerald-900 via-emerald-800 to-teal-900',
  'from-orange-900 via-red-900 to-rose-900',
  'from-cyan-900 via-blue-900 to-indigo-900',
  'from-rose-900 via-pink-900 to-purple-900',
  'from-amber-900 via-orange-900 to-red-900',
  'from-slate-900 via-slate-800 to-zinc-900',
];

const placeholderGrad = (title: string) =>
  PLACEHOLDER_GRADIENTS[
    title.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % PLACEHOLDER_GRADIENTS.length
  ];

// ─── Category Definitions ─────────────────────────────────────────────────────
type Category = { id: string; label: string; filter: (games: Game[]) => Game[] };

const CATEGORIES: Category[] = [
  { id: 'all',       label: 'All Games',        filter: g => g.filter(x => !x.hidden) },
  { id: 'recent',    label: 'Recently Played',  filter: g =>
      [...g].filter(x => x.lastPlayedAt && !x.hidden)
             .sort((a, b) => new Date(b.lastPlayedAt!).getTime() - new Date(a.lastPlayedAt!).getTime())
             .slice(0, 30) },
  { id: 'favorites', label: 'Favorites',        filter: g => g.filter(x => x.favorite && !x.hidden) },
  { id: 'steam',     label: 'Steam',            filter: g => g.filter(x => x.source === 'steam' && !x.hidden) },
  { id: 'epic',      label: 'Epic Games',       filter: g => g.filter(x => (x.source === 'legendary' || x.source === 'epic') && !x.hidden) },
  { id: 'custom',    label: 'Custom',           filter: g => g.filter(x => x.source === 'manual' && !x.hidden) },
];

// ─── Cover helper ─────────────────────────────────────────────────────────────
const getCover = (game: Game) => {
  if (!game) return '';
  const base = game.coverUrl || `nexus-media://covers/${game.id.replace(/:/g, '_')}`;
  const t = game.updatedAt ? new Date(game.updatedAt).getTime() : 0;
  return `${base}?t=${t}`;
};
const getHero  = (game: Game) => {
  if (!game) return '';
  const base = game.heroUrl || game.coverUrl || `nexus-media://heroes/${game.id.replace(/:/g, '_')}`;
  const t = game.updatedAt ? new Date(game.updatedAt).getTime() : 0;
  return `${base}?t=${t}`;
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface ConsoleModeProps {
  games: Game[];
  controllers: any[];
  onLaunch: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteGame?: (id: string) => Promise<any>;
  onClose: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ConsoleMode({ games, controllers, onLaunch, onToggleFavorite, onDeleteGame, onClose }: ConsoleModeProps) {
  // All navigation state in refs so gamepad handler is never stale
  const catIndexRef  = useRef(0);
  const gameIndexRef = useRef(0);
  const viewRef      = useRef<'shelf' | 'detail' | 'search'>('shelf');
  const launchingRef = useRef(false);

  // React state for rendering (mirrors refs)
  const [catIndex,   setCatIndexState]  = useState(0);
  const [gameIndex,  setGameIndexState] = useState(0);
  const [view,       setViewState]      = useState<'shelf' | 'detail' | 'search'>('shelf');
  const [launching,  setLaunching]      = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [showHint,   setShowHint]       = useState(true);
  const [catAnim,    setCatAnim]        = useState(false); // flicker for category switch feedback

  // Sync helpers
  const setCat = (fn: (i: number) => number) => {
    const next = fn(catIndexRef.current);
    catIndexRef.current = next;
    setCatIndexState(next);
    gameIndexRef.current = 0;
    setGameIndexState(0);
    // Trigger category switch animation
    setCatAnim(true);
    setTimeout(() => setCatAnim(false), 180);
  };
  const setGame = (fn: (i: number) => number, max: number) => {
    const next = Math.max(0, Math.min(max - 1, fn(gameIndexRef.current)));
    gameIndexRef.current = next;
    setGameIndexState(next);
  };
  const setView = (v: 'shelf' | 'detail' | 'search') => {
    viewRef.current = v;
    setViewState(v);
  };

  const searchInputRef = useRef<HTMLInputElement>(null);
  const shelfRef = useRef<HTMLDivElement>(null);
  const gameItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const gamesForCat = useMemo(() => CATEGORIES[catIndex].filter(games), [games, catIndex]);
  const visibleGames = useMemo(() => {
    if (view === 'search') {
      const q = searchQuery.toLowerCase();
      return games.filter(g => !g.hidden && g.title.toLowerCase().includes(q));
    }
    return gamesForCat;
  }, [gamesForCat, games, view, searchQuery]);

  const safeIdx      = Math.min(gameIndex, Math.max(0, visibleGames.length - 1));
  const selectedGame = visibleGames[safeIdx] ?? null;

  // Keep ref in sync with derived index
  useEffect(() => { gameIndexRef.current = safeIdx; }, [safeIdx]);

  // Hide hint
  useEffect(() => { const t = setTimeout(() => setShowHint(false), 6000); return () => clearTimeout(t); }, []);

  // Auto-scroll focused card manually without affecting parent container bounds
  useEffect(() => {
    const shelf = shelfRef.current;
    const card = gameItemRefs.current[safeIdx];
    if (!shelf || !card) return;

    const cardLeft = card.offsetLeft;
    const cardWidth = card.offsetWidth;
    const shelfWidth = shelf.clientWidth;

    const targetScroll = cardLeft - (shelfWidth / 2) + (cardWidth / 2);
    shelf.scrollTo({
      left: Math.max(0, targetScroll),
      behavior: 'smooth'
    });
  }, [safeIdx, catIndex]);

  // ── Keyboard fallback ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return; // Prevent rapid keyboard repeat jumps!
      if (viewRef.current === 'search') {
        if (e.key === 'Escape') { setView('shelf'); setSearchQuery(''); }
        return;
      }
      const map: Record<string, GamepadAction> = {
        ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down',
        Enter: 'confirm', Escape: 'back', Tab: 'r1',
        '[': 'l1', ']': 'r1',
      };
      const action = map[e.key];
      if (action) { e.preventDefault(); dispatchAction(action); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Central action dispatcher (all via refs — zero stale closure) ─────────
  const dispatchAction = (action: GamepadAction) => {
    if (launchingRef.current) return;

    if (viewRef.current === 'search') {
      if (action === 'back') { setView('shelf'); setSearchQuery(''); }
      return;
    }

    if (viewRef.current === 'detail') {
      if (action === 'back') { setView('shelf'); return; }
      if (action === 'confirm') {
        const sel = visibleGamesRef.current[gameIndexRef.current];
        if (!sel) return;
        launchingRef.current = true; setLaunching(true);
        onLaunch(sel.id);
        setTimeout(() => { launchingRef.current = false; setLaunching(false); }, 3000);
        return;
      }
      if (action === 'menu') {
        const sel = visibleGamesRef.current[gameIndexRef.current];
        if (sel) onToggleFavorite(sel.id);
        return;
      }
      if (action === 'options') {
        const sel = visibleGamesRef.current[gameIndexRef.current];
        if (sel && onDeleteGame) {
          if (window.confirm(`Are you sure you want to remove "${sel.title}" from library?`)) {
            onDeleteGame(sel.id).then(() => {
              setView('shelf');
            });
          }
        }
        return;
      }
      return;
    }

    // shelf view
    const total = visibleGamesRef.current.length;
    if      (action === 'right')   setGame(i => i + 1, total);
    else if (action === 'left')    setGame(i => i - 1, total);
    else if (action === 'r1')      setCat(i => (i + 1) % CATEGORIES.length);
    else if (action === 'l1')      setCat(i => (i - 1 + CATEGORIES.length) % CATEGORIES.length);
    else if (action === 'confirm') { if (visibleGamesRef.current[gameIndexRef.current]) setView('detail'); }
    else if (action === 'back')    onClose();
    else if (action === 'options') { setView('search'); setTimeout(() => searchInputRef.current?.focus(), 80); }
    else if (action === 'menu') {
      const sel = visibleGamesRef.current[gameIndexRef.current];
      if (sel) onToggleFavorite(sel.id);
    }
  };

  // Stable ref for visibleGames so dispatchAction never captures stale value
  const visibleGamesRef = useRef(visibleGames);
  useEffect(() => { visibleGamesRef.current = visibleGames; }, [visibleGames]);

  useGamepad({ onAction: dispatchAction });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col overflow-hidden select-none">

      {/* ── Background artwork (Shared, unblurred on the right) ── */}
      <div className="absolute inset-0 z-0 transition-all duration-700 bg-[#0a0a0a]">
        {selectedGame ? (
          <div className="absolute inset-0 transition-all duration-500 animate-fade-in">
            {/* The main background image (prefer hero, fallback to cover/poster) */}
            <img
              key={selectedGame.id}
              src={getHero(selectedGame) || getCover(selectedGame)}
              alt=""
              className="absolute right-0 top-0 h-full w-[75vw] object-cover opacity-35 transition-all duration-700 scale-105"
            />
            {/* Left and bottom dark gradient overlays for maximum text contrast */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/85 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/40 to-transparent" />
          </div>
        ) : null}
      </div>

      {view === 'detail' && selectedGame ? (
        /* ── GAME DETAIL LAYOUT (Clash-Free) ── */
        <div className="relative z-10 flex-1 flex flex-col justify-between overflow-hidden min-h-0 animate-fade-in">
          
          {/* Main Detail Content */}
          <div className="flex-1 flex h-full">
            {/* Left: details */}
            <div className="flex flex-col justify-center px-14 w-[520px] shrink-0">
              <button
                onClick={() => setView('shelf')}
                className="flex items-center gap-2 text-white/35 text-sm hover:text-white mb-8 w-fit transition-colors group"
              >
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                Back to library
              </button>

              <div className="mb-4">
                <SourceBadge source={selectedGame.source} size="lg" />
              </div>

              <h1 className="text-[3rem] font-black text-white leading-[1.05] tracking-tight mb-3 select-text">
                {selectedGame.title}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-white/40 text-sm mb-8">
                <span className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  {formatPlaytime(selectedGame.playtimeSeconds)}
                </span>
                {selectedGame.lastPlayedAt && (
                  <span>Last played {new Date(selectedGame.lastPlayedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                )}
                {selectedGame.rating !== undefined && selectedGame.rating !== null && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs">
                    ★ {selectedGame.rating}% Positive
                  </span>
                )}
              </div>

              <div className="flex gap-3 mb-10">
                <button
                  onClick={() => {
                    if (launchingRef.current) return;
                    launchingRef.current = true; setLaunching(true);
                    onLaunch(selectedGame.id);
                    setTimeout(() => { launchingRef.current = false; setLaunching(false); }, 3000);
                  }}
                  disabled={launching}
                  className="flex items-center gap-3 pl-6 pr-8 py-3.5 rounded-2xl bg-white text-black font-black text-base shadow-2xl shadow-white/5 hover:bg-white/90 active:scale-95 transition-all duration-100 disabled:opacity-50"
                >
                  {launching
                    ? <span className="w-5 h-5 rounded-full border-2 border-black/20 border-t-black animate-spin" />
                    : <Play className="w-5 h-5 fill-black" />
                  }
                  {launching ? 'Launching…' : 'Play Now'}
                </button>
                <button
                  onClick={() => onToggleFavorite(selectedGame.id)}
                  className={`p-3.5 rounded-2xl border transition-all active:scale-95 duration-100 ${
                    selectedGame.favorite
                      ? 'bg-yellow-500/20 border-yellow-400/40 text-yellow-400 font-bold'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-yellow-400 hover:border-yellow-500/30'
                  }`}
                  title="Favorite"
                >
                  <Star className={`w-5 h-5 ${selectedGame.favorite ? 'fill-yellow-400' : ''}`} />
                </button>
                {onDeleteGame && (
                  <button
                    onClick={async () => {
                      if (window.confirm(`Are you sure you want to remove "${selectedGame.title}" from library?`)) {
                        await onDeleteGame(selectedGame.id);
                        setView('shelf');
                      }
                    }}
                    className="p-3.5 rounded-2xl border bg-red-950/20 border-red-500/20 text-red-400 hover:text-red-300 hover:border-red-500/40 transition-all active:scale-95 duration-100"
                    title="Remove Game"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {selectedGame.description && (
                <div className="mb-6">
                  <h3 className="text-white/20 text-[9px] uppercase tracking-widest font-bold mb-1.5">Description</h3>
                  <p className="text-white/60 text-xs leading-relaxed max-w-[420px] line-clamp-4 select-text">
                    {selectedGame.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'Platform', value: selectedGame.platform },
                  { label: 'Source', value: selectedGame.source === 'legendary' ? 'Epic Games' : selectedGame.source },
                  { label: 'Total Playtime', value: formatPlaytime(selectedGame.playtimeSeconds) },
                  { label: 'Added', value: new Date(selectedGame.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
                  ...(selectedGame.releaseDate ? [{ label: 'Released', value: selectedGame.releaseDate }] : []),
                  ...(selectedGame.developers ? [{ label: 'Developer', value: selectedGame.developers }] : []),
                  ...(selectedGame.genres ? [{ label: 'Genres', value: selectedGame.genres }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3">
                    <p className="text-white/25 text-[9px] uppercase tracking-widest font-bold mb-1">{label}</p>
                    <p className="text-white/75 text-sm font-semibold capitalize truncate" title={value}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: large cover */}
            <div className="flex-1 flex items-center justify-center pr-16">
              <div className="relative w-[220px] h-[320px] rounded-3xl overflow-hidden shadow-2xl shadow-black/80 ring-1 ring-white/10 bg-black">
                <img 
                  src={getCover(selectedGame)} 
                  alt={selectedGame.title} 
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  className="absolute inset-0 w-full h-full object-cover z-10" 
                />
                <div className={`absolute inset-0 bg-gradient-to-br ${placeholderGrad(selectedGame.title)} flex items-center justify-center`}>
                  <Gamepad2 className="w-20 h-20 text-white/10" />
                </div>
              </div>
            </div>
          </div>

          {/* Detail controller legend */}
          <div className="relative z-10 flex items-center gap-5 px-14 pb-6 text-white/30 text-[11px]">
            <CtrlHint glyph="✕" color="text-blue-400"  label="Launch" />
            <CtrlHint glyph="○" color="text-red-400"   label="Back" />
            <CtrlHint glyph="□" color="text-pink-400"  label="Favorite" />
            {onDeleteGame && <CtrlHint glyph="△" color="text-green-400" label="Remove Game" />}
          </div>
        </div>
      ) : (
        /* ── SHELF VIEW / SEARCH VIEW ── */
        <>
          {/* Top bar */}
          <header className="relative z-10 flex items-center justify-between px-10 pt-7">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-sm">
                <Gamepad2 className="w-5 h-5 text-white/80" />
              </div>
              <div>
                <p className="text-white font-bold text-base leading-none">Nexus Play</p>
                <p className="text-white/30 text-[10px] font-medium mt-0.5 uppercase tracking-widest">Big Picture Mode</p>
              </div>
            </div>

            {/* Connected gamepads with battery percentage */}
            <div className="flex items-center gap-2">
              {controllers && controllers.length > 0 ? (
                controllers.map((ctrl, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                    <Battery className="w-3.5 h-3.5" />
                    <span className="text-[9px] uppercase font-bold tracking-wider">
                      {ctrl.name}: {ctrl.capacity}% {ctrl.status === 'Charging' ? '(Charging)' : ''}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/25">
                  <Gamepad2 className="w-3.5 h-3.5 text-white/20" />
                  <span className="text-[9px] uppercase font-bold tracking-wider">No Gamepads</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { setView('search'); setTimeout(() => searchInputRef.current?.focus(), 80); }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/10 hover:text-white transition-all"
                aria-label="Search"
              >
                <Search className="w-4 h-4" />
                <span>Search</span>
                <kbd className="ml-1 px-1.5 py-0.5 rounded bg-white/5 text-[9px] text-white/30 font-mono border border-white/10">△</kbd>
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/40 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center"
                aria-label="Exit Big Picture"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Category tabs */}
          <div className="relative z-10 flex items-center gap-1.5 px-10 mt-6">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-white/5 border border-white/10 text-white/25 text-[9px] font-bold mr-1">L1</div>
            {CATEGORIES.map((cat, i) => {
              const isActive = catIndex === i && view === 'shelf';
              const count = cat.filter(games).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => { setCat(() => i); setView('shelf'); }}
                  className={`relative px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-white text-black shadow-lg shadow-white/10'
                      : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  {cat.label}
                  {isActive && count > 0 && (
                    <span className="ml-2 text-black/40 text-[11px] font-medium">{count}</span>
                  )}
                </button>
              );
            })}
            <div className="flex items-center justify-center w-6 h-6 rounded bg-white/5 border border-white/10 text-white/25 text-[9px] font-bold ml-1">R1</div>
          </div>

          {/* Main layout */}
          <div className="relative z-10 flex flex-1 mt-6 overflow-hidden min-h-0">
            {/* Left panel — selected game info */}
            <div className="flex flex-col justify-end px-10 pb-10 w-[480px] shrink-0">
              {selectedGame ? (
                <div key={selectedGame.id} className="flex flex-col gap-4 animate-fade-in">
                  <div className="relative w-[210px] h-[300px] rounded-2xl overflow-hidden shadow-2xl shadow-black/70 ring-1 ring-white/10 bg-black">
                    <img 
                      src={getCover(selectedGame)} 
                      alt={selectedGame.title} 
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      className="absolute inset-0 w-full h-full object-cover z-10" 
                    />
                    <div className={`absolute inset-0 bg-gradient-to-br ${placeholderGrad(selectedGame.title)} flex items-center justify-center`}>
                      <Gamepad2 className="w-12 h-12 text-white/15" />
                    </div>
                    {selectedGame.favorite && (
                      <div className="absolute top-2 right-2">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-lg" />
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2">
                      <SourceBadge source={selectedGame.source} />
                    </div>
                  </div>

                  <div>
                    <h1 className="text-[2.2rem] font-black text-white leading-tight tracking-tight line-clamp-2" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}>
                      {selectedGame.title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-white/40 text-xs">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {formatPlaytime(selectedGame.playtimeSeconds)}
                      </span>
                      {selectedGame.lastPlayedAt && (
                        <span>Last played {new Date(selectedGame.lastPlayedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/30 text-[10px] uppercase tracking-widest">
                        {selectedGame.platform}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => {
                        if (launchingRef.current) return;
                        launchingRef.current = true; setLaunching(true);
                        onLaunch(selectedGame.id);
                        setTimeout(() => { launchingRef.current = false; setLaunching(false); }, 3000);
                      }}
                      disabled={launching}
                      className="flex items-center gap-3 pl-5 pr-7 py-3 rounded-2xl bg-white text-black font-black text-sm shadow-2xl shadow-white/10 hover:bg-white/90 active:scale-95 transition-all duration-100 disabled:opacity-50"
                    >
                      {launching
                        ? <span className="w-4 h-4 rounded-full border-2 border-black/20 border-t-black animate-spin" />
                        : <Play className="w-4 h-4 fill-black" />
                      }
                      {launching ? 'Launching…' : 'Play'}
                    </button>
                    <button
                      onClick={() => onToggleFavorite(selectedGame.id)}
                      className={`p-3 rounded-2xl border transition-all active:scale-95 duration-100 ${
                        selectedGame.favorite
                          ? 'bg-yellow-500/20 border-yellow-400/40 text-yellow-400'
                          : 'bg-white/5 border-white/10 text-white/40 hover:text-yellow-400 hover:border-yellow-500/30'
                      }`}
                      aria-label="Toggle favorite"
                    >
                      <Star className={`w-4 h-4 ${selectedGame.favorite ? 'fill-yellow-400' : ''}`} />
                    </button>
                  </div>

                  {selectedGame.description && (
                    <p className="text-white/60 text-xs line-clamp-3 leading-relaxed mt-2 max-w-[360px]" style={{ textShadow: '0 1px 10px rgba(0,0,0,0.5)' }}>
                      {selectedGame.description}
                    </p>
                  )}
                  {(selectedGame.developers || selectedGame.genres) && (
                    <div className="flex flex-col gap-1 text-[10px] text-white/40 mt-1 max-w-[360px]">
                      {selectedGame.developers && (
                        <div>Developer: <span className="text-white/65">{selectedGame.developers}</span></div>
                      )}
                      {selectedGame.genres && (
                        <div>Genre: <span className="text-white/65">{selectedGame.genres}</span></div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-white/20 text-sm">
                  {searchQuery
                    ? 'No games in this category'
                    : 'No games found'}
                </div>
              )}
            </div>

            {/* Right — horizontal game shelf */}
            <div className="flex-1 flex flex-col justify-end pb-10 overflow-hidden min-w-0">
              <div
                ref={shelfRef}
                className={`flex items-end gap-4 overflow-x-auto pr-10 pb-2 scrollbar-none transition-opacity duration-150 relative ${catAnim ? 'opacity-0' : 'opacity-100'}`}
                style={{ scrollbarWidth: 'none' }}
              >
                {visibleGames.length === 0 ? (
                  <p className="text-white/25 ml-2 text-sm">Nothing here yet</p>
                ) : (
                  visibleGames.map((game, idx) => {
                    const focused = idx === safeIdx;
                    const cover   = getCover(game);
                    return (
                      <div
                        key={game.id}
                        ref={el => { gameItemRefs.current[idx] = el; }}
                        onClick={() => setGame(() => idx, visibleGames.length)}
                        onDoubleClick={() => { setGame(() => idx, visibleGames.length); setView('detail'); }}
                        className={`shrink-0 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 relative ${
                          focused
                            ? 'w-[210px] h-[300px] shadow-2xl shadow-black/60 ring-2 ring-white/70 scale-100'
                            : 'w-[154px] h-[220px] opacity-55 hover:opacity-80'
                        }`}
                      >
                        <img 
                          src={cover} 
                          alt={game.title} 
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          className="absolute inset-0 w-full h-full object-cover z-10" 
                        />
                        <div className={`absolute inset-0 bg-gradient-to-br ${placeholderGrad(game.title)} flex items-center justify-center`}>
                          <Gamepad2 className="w-10 h-10 text-white/10" />
                        </div>
                        {game.favorite && (
                          <div className="absolute top-2 right-2">
                            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 drop-shadow-md" />
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2">
                          <SourceBadge source={game.source} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Bottom controller hints */}
          <footer className={`relative z-10 flex items-center justify-between px-10 pb-5 pt-2 transition-all duration-1000 ${showHint ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="flex items-center gap-5 text-white/30 text-[11px] font-medium">
              <CtrlHint glyph="✕" color="text-blue-400"   label="Open" />
              <CtrlHint glyph="○" color="text-red-400"    label="Back / Exit" />
              <CtrlHint glyph="□" color="text-pink-400"   label="Favorite" />
              <CtrlHint glyph="△" color="text-green-400"  label="Search" />
              <span className="flex items-center gap-1.5 text-white/25">
                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-bold">L1</span>
                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-bold">R1</span>
                Categories
              </span>
            </div>
            <span className="text-white/15 text-[10px] font-mono uppercase tracking-widest">DualSense / Xbox Compatible</span>
          </footer>

          {/* Search Overlay */}
          {view === 'search' && (
            <div className="absolute inset-0 z-60 bg-black/95 backdrop-blur-2xl flex flex-col items-center pt-28 px-16 animate-fade-in">
              <div className="w-full max-w-2xl">
                <div className="flex items-center gap-4 bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 ring-1 ring-white/5">
                  <Search className="w-6 h-6 text-white/30 shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search your library…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setView('shelf'); setSearchQuery(''); }
                      if (e.key === 'Enter' && visibleGames.length > 0) {
                        setGame(() => 0, visibleGames.length);
                        setView('shelf');
                      }
                    }}
                    className="flex-1 bg-transparent text-white text-2xl font-light placeholder-white/15 focus:outline-none caret-white"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-white/30 hover:text-white transition-colors p-1">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <p className="text-white/25 text-sm mt-4 text-center">
                  {searchQuery.length === 0 ? 'Start typing to search' :
                   visibleGames.length > 0
                    ? `${visibleGames.length} result${visibleGames.length !== 1 ? 's' : ''} — Enter to browse`
                    : 'No games match'}
                </p>

                <div className="mt-8 grid grid-cols-5 gap-3">
                  {visibleGames.slice(0, 10).map((game) => {
                    const cover = getCover(game);
                    return (
                      <button
                        key={game.id}
                        onClick={() => {
                          setView('shelf');
                          setCat(() => 0);
                          const allGames = CATEGORIES[0].filter(games);
                          const idx = allGames.findIndex(g => g.id === game.id);
                          if (idx >= 0) setGame(() => idx, allGames.length);
                          setSearchQuery('');
                        }}
                        className="relative rounded-xl overflow-hidden aspect-[2/3] bg-white/5 border border-white/10 hover:border-white/30 hover:scale-[1.04] active:scale-95 transition-all duration-150"
                      >
                        {cover ? (
                          <img src={cover} alt={game.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className={`w-full h-full bg-gradient-to-br ${placeholderGrad(game.title)} flex items-center justify-center`}>
                            <Gamepad2 className="w-7 h-7 text-white/15" />
                          </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 p-2">
                          <p className="text-white text-[9px] font-semibold line-clamp-2">{game.title}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Controller hint pill ──────────────────────────────────────────────────────
function CtrlHint({ glyph, color, label }: { glyph: string; color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black ${color}`}>
        {glyph}
      </span>
      {label}
    </span>
  );
}
