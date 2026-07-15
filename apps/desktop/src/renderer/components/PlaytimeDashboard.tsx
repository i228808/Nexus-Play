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
  const colors = ['#f4f4f5', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b'];

  return (
    <div className="flex flex-col gap-4 w-full">
      <h3 className="text-sm font-semibold tracking-wider uppercase text-white/40 px-1">Playtime Analytics</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stats Cards */}
        <div className="flex flex-col gap-4 col-span-1">
          <div className="glass-card p-5 flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-lg text-white/80">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Total Playtime</p>
              <h4 className="text-xl font-black text-white">{totalPlaytime}</h4>
            </div>
          </div>
          <div className="glass-card p-5 flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-lg text-white/70">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Preferred Platform</p>
              <h4 className="text-xl font-black text-white">{mostPlayedSource}</h4>
            </div>
          </div>
          <div className="glass-card p-5 flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-lg text-white/60">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Most Played</p>
              <h4 className="text-base font-black text-white truncate max-w-[150px]">{topGames[0]?.name || 'N/A'}</h4>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="glass-card p-5 col-span-2 flex flex-col h-[280px]">
          <h4 className="text-xs text-white/40 font-bold uppercase tracking-wider mb-4">Top 5 Games (Hours)</h4>
          <div className="flex-1 min-h-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topGames} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#afb7a9', fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: '#3e463a' }}
                  tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val}
                />
                <YAxis 
                  tick={{ fill: '#afb7a9', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: '#171b15', border: '1px solid #3e463a', borderRadius: '8px' }}
                  itemStyle={{ color: '#f1f4e9', fontWeight: 'bold' }}
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
