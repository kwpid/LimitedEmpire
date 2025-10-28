import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { User, Item } from "@shared/schema";
import { formatValue } from "@/lib/rarity";
import { ArrowRightLeft, Flag, Ban, User as UserIcon, Dices, DollarSign, Clock, Calendar, Package, Hash } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ItemCard } from "@/components/ItemCard";
import { calculateUserBadges, calculateLeaderboardPositions, type BadgeConfig } from "@/lib/badgeConfig";

interface PlayerProfileModalProps {
  player: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlayerProfileModal({ player, open, onOpenChange }: PlayerProfileModalProps) {
  const [showcaseItems, setShowcaseItems] = useState<(Item & { serialNumber: number | null })[]>([]);
  const [inventoryItems, setInventoryItems] = useState<{ item: Item; serialNumber: number | null; stackCount: number; inventoryIds: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<BadgeConfig[]>([]);

  useEffect(() => {
    if (!player || !open) {
      setShowcaseItems([]);
      setInventoryItems([]);
      return;
    }

    const loadPlayerData = async () => {
      setLoading(true);
      try {
        const showcasePromises = (player.showcaseItems || []).map(async (inventoryItemId) => {
          const invItem = player.inventory?.find(item => item.id === inventoryItemId);
          if (!invItem) return null;

          const itemDoc = await getDoc(doc(db, "items", invItem.itemId));
          if (!itemDoc.exists()) return null;

          return {
            id: itemDoc.id,
            ...itemDoc.data(),
            serialNumber: invItem.serialNumber
          } as Item & { serialNumber: number | null };
        });

        const showcase = await Promise.all(showcasePromises);
        setShowcaseItems(showcase.filter((item): item is Item & { serialNumber: number | null } => item !== null));

        if (player.inventory && player.inventory.length > 0) {
          const uniqueItemIds = Array.from(new Set(player.inventory.map(inv => inv.itemId)));
          
          const itemPromises = uniqueItemIds.map(itemId => 
            getDoc(doc(db, "items", itemId))
          );
          
          const itemDocs = await Promise.all(itemPromises);
          const itemsMap = new Map<string, Item>();
          
          itemDocs.forEach((itemDoc) => {
            if (itemDoc.exists()) {
              itemsMap.set(itemDoc.id, { id: itemDoc.id, ...itemDoc.data() } as Item);
            }
          });

          const groupedInventory = new Map<string, { item: Item; serialNumbers: (number | null)[]; inventoryIds: string[] }>();

          for (const invItem of player.inventory) {
            const item = itemsMap.get(invItem.itemId);
            if (!item) continue;

            const key = invItem.serialNumber === null ? invItem.itemId : `${invItem.itemId}-${invItem.serialNumber}`;

            if (!groupedInventory.has(key)) {
              groupedInventory.set(key, { item, serialNumbers: [], inventoryIds: [] });
            }

            const group = groupedInventory.get(key)!;
            group.serialNumbers.push(invItem.serialNumber);
            group.inventoryIds.push(invItem.id);
          }

          const inventoryArray = Array.from(groupedInventory.values()).map(group => ({
            item: group.item,
            serialNumber: group.serialNumbers[0],
            stackCount: group.serialNumbers.length,
            inventoryIds: group.inventoryIds,
          }));

          inventoryArray.sort((a, b) => b.item.value - a.item.value);
          setInventoryItems(inventoryArray);
        }
      } catch (error) {
        console.error("Error loading player data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPlayerData();
  }, [player, open]);

  const totalInventoryValue = useMemo(() => {
    return inventoryItems.reduce((total, { item, stackCount }) => total + (item.value * stackCount), 0);
  }, [inventoryItems]);

  useEffect(() => {
    async function loadBadges() {
      if (!player || !open) {
        setBadges([]);
        return;
      }

      const leaderboardPositions = await calculateLeaderboardPositions(player.userId);
      const userBadges = await calculateUserBadges(player, totalInventoryValue, leaderboardPositions);
      setBadges(userBadges);
    }

    loadBadges();
  }, [player, open, totalInventoryValue]);

  const formatTimeSpent = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  if (!player) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="modal-player-profile">
        {player.isBanned && (
          <div className="bg-red-600 text-white px-4 py-2 text-center font-bold flex items-center justify-center gap-2" data-testid="banner-user-banned">
            <Ban className="w-5 h-5" />
            USER IS BANNED
            {player.banReason && <span className="text-sm font-normal">- {player.banReason}</span>}
          </div>
        )}
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-2xl flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <UserIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {player.username}
                {player.isAdmin && <Badge variant="destructive">Admin</Badge>}
              </div>
              <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                <Hash className="w-3 h-3" />
                <span>ID: {player.userId}</span>
                {player.customStatus && (
                  <>
                    <span>•</span>
                    <span>{player.customStatus}</span>
                  </>
                )}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto pr-4">
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <Dices className="w-5 h-5 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold tabular-nums">{(player.rollCount || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Rolls</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <DollarSign className="w-5 h-5 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold tabular-nums">{formatValue(player.cash || 0)}</p>
                  <p className="text-xs text-muted-foreground">Cash</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Clock className="w-5 h-5 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold tabular-nums">{formatTimeSpent(player.timeSpentOnSite || 0)}</p>
                  <p className="text-xs text-muted-foreground">Time Played</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Calendar className="w-5 h-5 mx-auto mb-2 text-primary" />
                  <p className="text-sm font-bold">{formatDate(player.dateJoined || player.createdAt)}</p>
                  <p className="text-xs text-muted-foreground">Joined</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled data-testid="button-send-trade">
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Send Trade
              </Button>
              <Button variant="outline" disabled data-testid="button-report">
                <Flag className="w-4 h-4 mr-2" />
                Report
              </Button>
              <Button variant="destructive" disabled data-testid="button-block">
                <Ban className="w-4 h-4 mr-2" />
                Block
              </Button>
            </div>

            {player.description && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">About</h3>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-player-description">
                    {player.description}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Player Badges</h3>
                {badges.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {badges.map((badge) => (
                      <div
                        key={badge.id}
                        className="flex flex-col items-center gap-2 p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                        data-testid={`badge-${badge.id}`}
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${badge.color}20` }}>
                          <img
                            src={badge.icon}
                            alt={badge.name}
                            className="w-8 h-8 object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-semibold" style={{ color: badge.color }}>
                            {badge.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {badge.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No badges earned yet</p>
                )}
              </CardContent>
            </Card>

            {showcaseItems.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Showcase Items</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {showcaseItems.map((item, idx) => (
                      <ItemCard
                        key={idx}
                        item={item}
                        serialNumber={item.serialNumber ?? undefined}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Inventory</h3>
                  <p className="text-sm text-muted-foreground">
                    Total Value: <span className="font-bold">{formatValue(totalInventoryValue)}</span>
                  </p>
                </div>
                {loading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-48 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : inventoryItems.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p className="text-sm text-muted-foreground">No items in inventory</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {inventoryItems.map((invItem, idx) => (
                      <ItemCard
                        key={idx}
                        item={invItem.item}
                        serialNumber={invItem.serialNumber ?? undefined}
                        stackCount={invItem.stackCount}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
