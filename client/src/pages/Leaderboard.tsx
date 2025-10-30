import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Trophy, TrendingUp, Package, DollarSign, Dices, RefreshCw, Clock } from "lucide-react";
import type { User } from "@shared/schema";
import { PlayerProfileModal } from "@/components/PlayerProfileModal";
import { formatValue } from "@/lib/rarity";
import { leaderboardCache, type LeaderboardPlayer } from "@/lib/leaderboardCache";

export default function Leaderboard() {
  const [topValue, setTopValue] = useState<LeaderboardPlayer[]>([]);
  const [topItems, setTopItems] = useState<LeaderboardPlayer[]>([]);
  const [topCash, setTopCash] = useState<LeaderboardPlayer[]>([]);
  const [topRolls, setTopRolls] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const loadLeaderboards = async () => {
    setLoading(true);
    try {
      // Load from cache - this will use Firestore cached data
      const data = await leaderboardCache.getLeaderboard();
      
      setTopValue(data.topValue);
      setTopItems(data.topItems);
      setTopCash(data.topCash);
      setTopRolls(data.topRolls);
      setLastUpdated(data.lastUpdated);
    } catch (error) {
      console.error("Error loading leaderboards:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await leaderboardCache.forceRefresh();
      setTopValue(data.topValue);
      setTopItems(data.topItems);
      setTopCash(data.topCash);
      setTopRolls(data.topRolls);
      setLastUpdated(data.lastUpdated);
    } catch (error) {
      console.error("Error refreshing leaderboards:", error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLeaderboards();
  }, []);

  const handlePlayerClick = (player: User) => {
    setSelectedPlayer(player);
    setProfileOpen(true);
  };

  const getRankGradient = (rank: number) => {
    if (rank === 1) return "bg-gradient-to-br from-yellow-400/60 via-yellow-500/60 to-yellow-600/60";
    if (rank === 2) return "bg-gradient-to-br from-gray-300/50 via-gray-400/50 to-gray-500/50";
    if (rank === 3) return "bg-gradient-to-br from-amber-600/50 via-amber-700/50 to-amber-800/50";
    return "bg-card";
  };

  const getRankTextColor = (rank: number) => {
    if (rank <= 3) return "text-white";
    return "";
  };

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const LeaderboardFrame = ({ 
    title, 
    icon: Icon, 
    data, 
    valueFormatter 
  }: { 
    title: string; 
    icon: typeof Trophy; 
    data: LeaderboardPlayer[]; 
    valueFormatter: (value: number) => string;
  }) => (
    <Card className="flex-1 flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Icon className="w-5 h-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="space-y-2 pr-4">
              {data.map((entry) => (
                <div
                  key={entry.user.id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:opacity-80 transition-all ${getRankGradient(entry.rank)} ${getRankTextColor(entry.rank)}`}
                  onClick={() => handlePlayerClick(entry.user)}
                  data-testid={`leaderboard-entry-${entry.user.userId}`}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background/20 font-bold text-sm flex-shrink-0">
                    {entry.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" data-testid={`text-player-name-${entry.user.userId}`}>
                      {entry.user.username}
                    </p>
                  </div>
                  <Badge variant={entry.rank <= 3 ? "secondary" : "outline"} className={entry.rank <= 3 ? "bg-background/30 text-white border-white/30" : ""}>
                    {valueFormatter(entry.value)}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-[1600px]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
            <Trophy className="w-8 h-8" />
            Leaderboards
          </h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {lastUpdated ? (
              <>Last updated {getTimeAgo(lastUpdated)} • Updates every 5 minutes</>
            ) : (
              "Loading..."
            )}
          </p>
        </div>
        <Button 
          onClick={handleManualRefresh} 
          disabled={refreshing}
          variant="outline"
          size="sm"
          data-testid="button-refresh-leaderboard"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeaderboardFrame
          title="Top Value"
          icon={TrendingUp}
          data={topValue}
          valueFormatter={(v) => `$${formatValue(v)}`}
        />
        <LeaderboardFrame
          title="Top Items"
          icon={Package}
          data={topItems}
          valueFormatter={(v) => v.toLocaleString()}
        />
        <LeaderboardFrame
          title="Top Cash"
          icon={DollarSign}
          data={topCash}
          valueFormatter={(v) => `$${v.toLocaleString()}`}
        />
        <LeaderboardFrame
          title="Top Rolls"
          icon={Dices}
          data={topRolls}
          valueFormatter={(v) => v.toLocaleString()}
        />
      </div>

      <PlayerProfileModal
        player={selectedPlayer}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  );
}
