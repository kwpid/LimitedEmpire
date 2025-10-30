import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, limit, where } from "firebase/firestore";
import { db, getDocs } from "@/lib/firebase";
import type { User } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayerCard } from "@/components/PlayerCard";
import { PlayerProfileModal } from "@/components/PlayerProfileModal";
import { Users, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Players() {
  const [onlinePlayers, setOnlinePlayers] = useState<User[]>([]);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<User | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("online");

  useEffect(() => {
    loadOnlinePlayers();
  }, []);

  useEffect(() => {
    if (searchQuery && activeTab === "all") {
      const timeoutId = setTimeout(() => {
        searchPlayers(searchQuery);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else if (!searchQuery && activeTab === "all") {
      setSearchResults([]);
    }
  }, [searchQuery, activeTab]);

  const loadOnlinePlayers = async () => {
    setLoading(true);
    try {
      const usersRef = collection(db, "users");
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const q = query(
        usersRef,
        where("lastActive", ">=", fiveMinutesAgo),
        orderBy("lastActive", "desc"),
        limit(50)
      );
      const snapshot = await getDocs(q);
      
      const loadedPlayers: User[] = [];
      snapshot.forEach((doc) => {
        loadedPlayers.push({ id: doc.id, ...doc.data() } as User);
      });
      
      setOnlinePlayers(loadedPlayers);
    } catch (error) {
      console.error("Error loading online players:", error);
    } finally {
      setLoading(false);
    }
  };

  const searchPlayers = async (search: string) => {
    if (!search) {
      setSearchResults([]);
      return;
    }
    
    setSearchLoading(true);
    try {
      const usersRef = collection(db, "users");
      const searchLower = search.toLowerCase();
      const q = query(
        usersRef, 
        where("usernameLower", ">=", searchLower),
        where("usernameLower", "<=", searchLower + "\uf8ff"),
        orderBy("usernameLower"),
        limit(20)
      );
      const snapshot = await getDocs(q);
      
      const loadedPlayers: User[] = [];
      snapshot.forEach((doc) => {
        loadedPlayers.push({ id: doc.id, ...doc.data() } as User);
      });
      
      setSearchResults(loadedPlayers);
    } catch (error) {
      console.error("Error searching players:", error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePlayerClick = (player: User) => {
    setSelectedPlayer(player);
    setProfileOpen(true);
  };

  const filteredOnline = useMemo(() => {
    if (!searchQuery) return onlinePlayers;
    const searchLower = searchQuery.toLowerCase();
    return onlinePlayers.filter(p => 
      p.username?.toLowerCase().includes(searchLower)
    );
  }, [onlinePlayers, searchQuery]);

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

      <Tabs defaultValue="online" className="space-y-4" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="online" data-testid="tab-online-players">
            Online ({onlinePlayers.length})
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all-players">
            All Players
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
          {!searchQuery ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium mb-2">Search for Players</p>
                <p className="text-muted-foreground">
                  Use the search box above to find specific players by username
                </p>
              </CardContent>
            </Card>
          ) : searchLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : searchResults.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No players found matching "{searchQuery}"</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((player) => (
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
