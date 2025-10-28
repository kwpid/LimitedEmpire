import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { User, Item } from "@shared/schema";
import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { User as UserIcon, Ban, TrendingUp } from "lucide-react";
import { formatValue } from "@/lib/rarity";

interface PlayerCardProps {
  player: User;
  onClick?: () => void;
}

export function PlayerCard({ player, onClick }: PlayerCardProps) {
  const [showcaseItems, setShowcaseItems] = useState<(Item & { serialNumber: number | null })[]>([]);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [loading, setLoading] = useState(true);

  const isOnline = player.lastActive && (Date.now() - player.lastActive < 5 * 60 * 1000);

  useEffect(() => {
    const loadPlayerData = async () => {
      try {
        let totalValue = 0;
        
        if (player.inventory && player.inventory.length > 0) {
          const itemIds = Array.from(new Set(player.inventory.map(inv => inv.itemId)));
          const itemValues = new Map<string, number>();
          
          await Promise.all(
            itemIds.map(async (itemId) => {
              const itemDoc = await getDoc(doc(db, "items", itemId));
              if (itemDoc.exists()) {
                const itemData = itemDoc.data() as Item;
                itemValues.set(itemId, itemData.value);
              }
            })
          );

          player.inventory.forEach((invItem) => {
            const value = itemValues.get(invItem.itemId) || 0;
            totalValue += value * (invItem.amount || 1);
          });
        }

        setInventoryValue(totalValue);

        if (player.showcaseItems && player.showcaseItems.length > 0) {
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
        }
      } catch (error) {
        console.error("Error loading player data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPlayerData();
  }, [player]);

  const emptySlots = Math.max(0, 3 - showcaseItems.length);

  return (
    <Card
      className="cursor-pointer hover-elevate transition-all duration-300"
      onClick={onClick}
      data-testid={`card-player-${player.userId}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <UserIcon className="w-6 h-6 text-primary" />
            </div>
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-base truncate" data-testid={`text-player-name-${player.userId}`}>
                {player.username}
              </h3>
              {player.isAdmin && (
                <Badge variant="destructive" className="text-[10px] px-1 py-0">Admin</Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span className="font-medium">${formatValue(inventoryValue)}</span>
              </div>
            </div>

            {player.customStatus && (
              <p className="text-xs text-muted-foreground truncate mt-1" data-testid={`text-player-status-${player.userId}`}>
                {player.customStatus}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          {loading ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-16 h-16 bg-muted animate-pulse rounded border border-muted-foreground/20" />
              ))}
            </>
          ) : (
            <>
              {showcaseItems.map((item, idx) => (
                <div key={idx} className="relative w-16 h-16 rounded border border-primary/30 overflow-hidden bg-muted">
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
              {Array.from({ length: emptySlots }).map((_, idx) => (
                <div key={`empty-${idx}`} className="w-16 h-16 rounded border border-muted-foreground/20 bg-muted/30 flex items-center justify-center">
                  <Ban className="w-6 h-6 text-muted-foreground/40" />
                </div>
              ))}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
