import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy, TrendingUp, Package, DollarSign, Dices } from "lucide-react";
import type { User, Item } from "@shared/schema";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlayerProfileModal } from "@/components/PlayerProfileModal";
import { formatValue } from "@/lib/rarity";

interface LeaderboardPlayer {
  user: User;
  value: number;
  rank: number;
}

export default function Leaderboard() {
  const [topValue, setTopValue] = useState<LeaderboardPlayer[]>([]);
  const [topItems, setTopItems] = useState<LeaderboardPlayer[]>([]);
  const [topCash, setTopCash] = useState<LeaderboardPlayer[]>([]);
  const [topRolls, setTopRolls] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);

  const loadLeaderboards = async () => {
    setLoading(true);
    try {
      const usersSnapshot = await getDocs(collection(db, "users"));
      const users: User[] = [];
      usersSnapshot.forEach((doc) => {
        const userData = { id: doc.id, ...doc.data() } as User;
        if (userData.userId !== 1) {
          users.push(userData);
        }
      });

      const itemsSnapshot = await getDocs(collection(db, "items"));
      const itemsMap = new Map<string, Item>();
      itemsSnapshot.forEach((doc) => {
        itemsMap.set(doc.id, { id: doc.id, ...doc.data() } as Item);
      });

      const playersWithValues = await Promise.all(
        users.map(async (user) => {
          let totalValue = 0;
          if (user.inventory && user.inventory.length > 0) {
            user.inventory.forEach((invItem) => {
              const item = itemsMap.get(invItem.itemId);
              if (item) {
                totalValue += item.value * (invItem.amount || 1);
              }
            });
          }

          return {
            user,
            totalValue,
            itemCount: user.inventory?.reduce((sum, inv) => sum + (inv.amount || 1), 0) || 0,
            cash: user.cash ?? 0,
            rolls: user.rollCount ?? 0,
          };
        })
      );

      const topValueSorted = playersWithValues
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, 30)
        .map((p, idx) => ({ user: p.user, value: p.totalValue, rank: idx + 1 }));

      const topItemsSorted = playersWithValues
        .sort((a, b) => b.itemCount - a.itemCount)
        .slice(0, 30)
        .map((p, idx) => ({ user: p.user, value: p.itemCount, rank: idx + 1 }));

      const topCashSorted = playersWithValues
        .sort((a, b) => b.cash - a.cash)
        .slice(0, 30)
        .map((p, idx) => ({ user: p.user, value: p.cash, rank: idx + 1 }));

      const topRollsSorted = playersWithValues
        .sort((a, b) => b.rolls - a.rolls)
        .slice(0, 30)
        .map((p, idx) => ({ user: p.user, value: p.rolls, rank: idx + 1 }));

      setTopValue(topValueSorted);
      setTopItems(topItemsSorted);
      setTopCash(topCashSorted);
      setTopRolls(topRollsSorted);
    } catch (error) {
      console.error("Error loading leaderboards:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasRendered) {
      loadLeaderboards();
      setHasRendered(true);
    }
    
    const refreshInterval = setInterval(() => {
      loadLeaderboards();
    }, 5 * 60 * 1000);
    
    return () => {
      clearInterval(refreshInterval);
    };
  }, [hasRendered]);

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
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <Trophy className="w-8 h-8" />
          Leaderboards
        </h1>
        <p className="text-muted-foreground">Top players across all categories</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
