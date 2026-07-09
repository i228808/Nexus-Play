import React, { useMemo } from 'react';
import { Game } from '@nexus-play/core';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, Gamepad2, Trophy } from 'lucide-react';

interface PlaytimeDashboardProps {
  games: Game[];
}

export const PlaytimeDashboard: React.FC<PlaytimeDashboardProps> = ({ games }) => {
  // Aggregate data
  const { topGames, totalPlaytime, mostPlayedSource } = useMemo(() => {
    // Top 5 games by playtime
    const sortedByPlaytime = [...games]
      .filter(g => g.playtimeSeconds > 0)
      .sort((a, b) => b.playtimeSeconds - a.playtimeSeconds)
      .slice(0, 5)
      .map(g => ({
        name: g.title,
        hours: Number((g.playtimeSeconds / 3600).toFixed(1)),
        source: g.source
      }));

    const totalSeconds = games.reduce((acc, game) => acc + game.playtimeSeconds, 0);
    const totalHours = Math.floor(totalSeconds / 3600);
    const totalMinutes = Math.floor((totalSeconds % 3600) / 60);

    const sources: Record<string, number> = {};
    games.forEach(g => {
      sources[g.source] = (sources[g.source] || 0) + g.playtimeSeconds;
    });
    
    let bestSource = 'None';
    let maxSrcSeconds = 0;
    for (const [src, secs] of Object.entries(sources)) {
      if (secs > maxSrcSeconds) {
        maxSrcSeconds = secs;
        bestSource = src;
      }
    }

    return { 
      topGames: sortedByPlaytime, 
      totalPlaytime: `${totalHours}h ${totalMinutes}m`,
      mostPlayedSource: bestSource.charAt(0).toUpperCase() + bestSource.slice(1)
    };
  }, [games]);

  if (topGames.length === 0) {
    return null;
  }

  // Bar colors
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316'];

  return (
    <div className="flex flex-col gap-4 w-full">
      <h3 className="text-sm font-semibold tracking-wider uppercase text-slate-400 px-1">Playtime Analytics</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stats Cards */}
        <div className="flex flex-col gap-4 col-span-1">
          <div className="glass-card p-5 rounded-2xl flex items-center gap-4 border border-slate-700/40">
            <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Playtime</p>
              <h4 className="text-xl font-black text-white">{totalPlaytime}</h4>
            </div>
          </div>
          <div className="glass-card p-5 rounded-2xl flex items-center gap-4 border border-slate-700/40">
            <div className="p-3 bg-purple-500/20 rounded-xl text-purple-400">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Preferred Platform</p>
              <h4 className="text-xl font-black text-white">{mostPlayedSource}</h4>
            </div>
          </div>
          <div className="glass-card p-5 rounded-2xl flex items-center gap-4 border border-slate-700/40">
            <div className="p-3 bg-pink-500/20 rounded-xl text-pink-400">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Most Played</p>
              <h4 className="text-base font-black text-white truncate max-w-[150px]">{topGames[0]?.name || 'N/A'}</h4>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="glass-card p-5 rounded-2xl col-span-2 border border-slate-700/40 flex flex-col h-[280px]">
          <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4">Top 5 Games (Hours)</h4>
          <div className="flex-1 min-h-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topGames} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                  tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val}
                />
                <YAxis 
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
                />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                  {topGames.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
