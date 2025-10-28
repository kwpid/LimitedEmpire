import { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayerCard } from "@/components/PlayerCard";
import { PlayerProfileModal } from "@/components/PlayerProfileModal";
import { Users, Search } from "lucide-react";

export default function Players() {
  const [players, setPlayers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, orderBy("lastActive", "desc"));
      const snapshot = await getDocs(q);
      
      const loadedPlayers: User[] = [];
      snapshot.forEach((doc) => {
        loadedPlayers.push({ id: doc.id, ...doc.data() } as User);
      });
      
      setPlayers(loadedPlayers);
    } catch (error) {
      console.error("Error loading players:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayerClick = (player: User) => {
    setSelectedPlayer(player);
    setProfileOpen(true);
  };

  const onlinePlayers = players.filter(p => p.lastActive && (Date.now() - p.lastActive < 5 * 60 * 1000));
  
  const filteredOnline = onlinePlayers.filter(p => 
    p.username.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredAll = players.filter(p => 
    p.username.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, searchQuery ? undefined : 10);

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <Users className="w-8 h-8" />
          Players
        </h1>
        <p className="text-muted-foreground">Browse and connect with other players</p>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-players"
          />
        </div>
      </div>

      <Tabs defaultValue="online" className="space-y-4">
        <TabsList>
          <TabsTrigger value="online" data-testid="tab-online-players">
            Online ({onlinePlayers.length})
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all-players">
            All Players ({players.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="online" className="space-y-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filteredOnline.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground">
                {searchQuery ? "No players found" : "No players online"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOnline.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  onClick={() => handlePlayerClick(player)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filteredAll.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground">No players found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAll.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  onClick={() => handlePlayerClick(player)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <PlayerProfileModal
        player={selectedPlayer}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  );
}
