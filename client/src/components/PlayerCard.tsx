import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { User, Item } from "@shared/schema";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { User as UserIcon } from "lucide-react";

interface PlayerCardProps {
  player: User;
  onClick?: () => void;
}

export function PlayerCard({ player, onClick }: PlayerCardProps) {
  const [showcaseItems, setShowcaseItems] = useState<(Item & { serialNumber: number | null })[]>([]);
  const [loading, setLoading] = useState(true);

  const isOnline = player.lastActive && (Date.now() - player.lastActive < 5 * 60 * 1000);

  useEffect(() => {
    const loadShowcaseItems = async () => {
      if (!player.showcaseItems || player.showcaseItems.length === 0) {
        setShowcaseItems([]);
        setLoading(false);
        return;
      }

      try {
        const items = await Promise.all(
          player.showcaseItems.slice(0, 3).map(async (inventoryItemId) => {
            const invItem = player.inventory?.find(item => item.id === inventoryItemId);
            if (!invItem) return null;

            const itemDoc = await getDoc(doc(db, "items", invItem.itemId));
            if (!itemDoc.exists()) return null;

            return {
              id: itemDoc.id,
              ...itemDoc.data(),
              serialNumber: invItem.serialNumber
            } as Item & { serialNumber: number | null };
          })
        );

        setShowcaseItems(items.filter((item): item is Item & { serialNumber: number | null } => item !== null));
      } catch (error) {
        console.error("Error loading showcase items:", error);
      } finally {
        setLoading(false);
      }
    };

    loadShowcaseItems();
  }, [player]);

  return (
    <Card
      className="cursor-pointer hover-elevate transition-all duration-300"
      onClick={onClick}
      data-testid={`card-player-${player.userId}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-primary" />
            </div>
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-background rounded-full" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-lg truncate" data-testid={`text-player-name-${player.userId}`}>
                {player.username}
              </h3>
              {player.isAdmin && (
                <Badge variant="destructive" className="text-xs">Admin</Badge>
              )}
            </div>
            
            {player.customStatus && (
              <p className="text-sm text-muted-foreground truncate mb-2" data-testid={`text-player-status-${player.userId}`}>
                {player.customStatus}
              </p>
            )}

            {loading ? (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-16 h-16 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : showcaseItems.length > 0 ? (
              <div className="flex gap-2">
                {showcaseItems.map((item, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded border-2 border-primary/30 overflow-hidden">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='24' font-weight='bold'%3E%3F%3C/text%3E%3C/svg%3E";
                      }}
                    />
                    {item.serialNumber !== null && (
                      <Badge variant="secondary" className="absolute bottom-0 right-0 text-[8px] px-1 py-0">
                        #{item.serialNumber}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No showcase items</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
