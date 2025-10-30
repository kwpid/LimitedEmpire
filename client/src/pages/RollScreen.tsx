import { useState, useEffect, useCallback, useRef } from "react";
import { collection, getDocs, query, where, orderBy, limit, doc, updateDoc, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Item } from "@shared/schema";
import { useAuth } from "@/contexts/AuthContext";
import { SlotMachineRoll } from "@/components/SlotMachineRoll";
import { getRarityClass, getRarityGlow, formatValue } from "@/lib/rarity";
import { Dices, Loader2, TrendingUp, Package, Gem, Hash } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import type { RarityTier } from "@shared/schema";

interface UserStats {
  totalRolls: number;
  totalItems: number;
  uniqueItems: number;
  totalValue: number;
  rarestItem: { item: Item; count: number } | null;
}

interface SavedRoll {
  itemId: string;
  itemName: string;
  itemImageUrl: string;
  itemValue: number;
  itemRarity: RarityTier;
  serialNumber?: number | null;
  timestamp: number;
}

export default function RollScreen() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [rolling, setRolling] = useState(false);
  const [autoRoll, setAutoRoll] = useState(false);
  const [rolledItem, setRolledItem] = useState<Item | null>(null);
  const [bestRolls, setBestRolls] = useState<SavedRoll[]>([]);
  const [globalRolls, setGlobalRolls] = useState<SavedRoll[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [userStats, setUserStats] = useState<UserStats>({
    totalRolls: 0,
    totalItems: 0,
    uniqueItems: 0,
    totalValue: 0,
    rarestItem: null,
  });
  const rollingRef = useRef(false);
  const autoRollRef = useRef(false);
  const autoRollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedRef.current && user) {
      loadItems();
      loadBestRolls();
      loadGlobalRolls();
      loadUserStats();
      hasLoadedRef.current = true;
    }
  }, [user]);

  const loadUserStats = async () => {
    if (!user) return;

    const inventory = user.inventory || [];
    const itemIdCounts = new Map<string, number>();
    const uniqueItemIds = new Set<string>();

    inventory.forEach((invItem) => {
      const itemId = invItem.itemId;
      const amount = invItem.amount || 1;
      uniqueItemIds.add(itemId);
      itemIdCounts.set(itemId, (itemIdCounts.get(itemId) || 0) + amount);
    });

    const { itemsCache } = await import("@/lib/itemsCache");
    const items = await Promise.all(
      Array.from(uniqueItemIds).map(async (itemId) => {
        return await itemsCache.getItem(itemId);
      })
    ).then(results => results.filter((item): item is Item => item !== null));

    const itemCounts = new Map<string, { item: Item; count: number }>();
    let totalValue = 0;
    let totalItems = 0;

    items.forEach((item) => {
      const count = itemIdCounts.get(item.id) || 0;
      totalValue += item.value * count;
      totalItems += count;
      itemCounts.set(item.id, { item, count });
    });

    let rarestItem: { item: Item; count: number } | null = null;
    for (const itemData of Array.from(itemCounts.values())) {
      if (!rarestItem || itemData.item.value > rarestItem.item.value) {
        rarestItem = itemData;
      }
    }

    setUserStats({
      totalRolls: user.rollCount || 0,
      totalItems,
      uniqueItems: itemCounts.size,
      totalValue,
      rarestItem,
    });
  };

  const loadItems = async () => {
    const { itemsCache } = await import("@/lib/itemsCache");
    const itemsMap = await itemsCache.getItems();
    const loadedItems: Item[] = [];
    
    itemsMap.forEach((item) => {
      if (!item.offSale && (item.stockType === "infinite" || (item.remainingStock && item.remainingStock > 0))) {
        loadedItems.push(item);
      }
    });
    setItems(loadedItems);
  };

  const loadBestRolls = () => {
    if (!user) return;
    const rolls = user.bestRolls || [];
    setBestRolls(rolls.slice(0, 10));
  };

  const loadGlobalRolls = async () => {
    try {
      const rollsRef = collection(db, "globalRolls");
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const q = query(rollsRef, where("timestamp", ">=", fiveMinutesAgo), orderBy("timestamp", "desc"), limit(10));
      const snapshot = await getDocs(q);
      
      const rolls: SavedRoll[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        rolls.push({
          itemId: data.itemId || '',
          itemName: data.itemName || '',
          itemImageUrl: data.itemImageUrl || '',
          itemValue: data.itemValue || 0,
          itemRarity: data.rarity || 'COMMON',
          serialNumber: data.serialNumber,
          timestamp: data.timestamp || Date.now(),
        });
      });
      
      setGlobalRolls(rolls);
    } catch (error) {
      console.error("Error loading global rolls:", error);
      setGlobalRolls([]);
    }
  };

  const saveRollToDatabase = async (item: Item, serialNumber?: number | null) => {
    if (!user) return;

    const newRoll: SavedRoll = {
      itemId: item.id,
      itemName: item.name,
      itemImageUrl: item.imageUrl,
      itemValue: item.value,
      itemRarity: item.rarity,
      serialNumber,
      timestamp: Date.now(),
    };

    try {
      // Save to user's best rolls if >= 250K (batched via autoSaveManager)
      if (item.value >= 250000) {
        const currentBest = user.bestRolls || [];
        const updated = [newRoll, ...currentBest].slice(0, 10);
        
        // Optimistically update local state
        setBestRolls(updated);
        
        // Queue update for batched save (no immediate write)
        const { autoSaveManager } = await import("@/lib/autoSaveManager");
        autoSaveManager.queueUpdate("users", user.id, {
          bestRolls: updated
        });
      }

      // Note: Global rolls >= 2.5M are already handled in rollService transaction
      // No need to duplicate here - just reload to show the new roll
      if (item.value >= 2500000) {
        await loadGlobalRolls();
      }
    } catch (error) {
      console.error("Error saving roll to database:", error);
    }
  };

  const handleAnimationComplete = useCallback(async () => {
    if (!rolledItem || !user) return;
    
    // Immediately transition to result after animation completes
    setIsAnimating(false);
    
    // Save to database and update UI
    const serialNumber = rolledItem.stockType === "limited" ? 
      user.inventory?.find(inv => inv.itemId === rolledItem.id)?.serialNumber : undefined;
    
    await saveRollToDatabase(rolledItem, serialNumber);
    
    // Show toast based on whether item was auto-sold
    const wasAutoSold = user.settings?.autoSellRarities?.includes(rolledItem.rarity);
    if (wasAutoSold) {
      toast({
        title: "Auto-Sold!",
        description: `${rolledItem.name} - Earned ${formatValue(rolledItem.value)}`,
      });
    } else {
      toast({
        title: "You rolled!",
        description: `${rolledItem.name} - ${formatValue(rolledItem.value)}${serialNumber ? ` #${serialNumber}` : ""}`,
      });
    }

    await Promise.all([
      loadItems(),
      loadUserStats(),
      refetchUser(),
    ]);
    
    loadBestRolls();
    
    setRolling(false);
    rollingRef.current = false;
  }, [rolledItem, user, toast, refetchUser]);

  const performRoll = useCallback(async () => {
    if (!user || rolling || rollingRef.current) return;

    rollingRef.current = true;
    setRolling(true);

    try {
      const { performRoll: executeRoll } = await import("@/lib/rollService");
      const result = await executeRoll(user);
      
      setRolledItem(result.item);
      setIsAnimating(true);
      
      // Animation complete handler will be called by SlotMachineRoll component
      // No need to wait here - the callback handles everything smoothly
      
    } catch (error: any) {
      console.error("Roll error:", error);
      setIsAnimating(false);
      setRolling(false);
      rollingRef.current = false;
      toast({
        title: "Roll failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    }
  }, [user, rolling, toast]);

  useEffect(() => {
    autoRollRef.current = autoRoll;
  }, [autoRoll]);

  useEffect(() => {
    if (!autoRoll || rolling || rollingRef.current) return;
    
    const tryAutoRoll = async () => {
      if (!autoRollRef.current || rollingRef.current) return;
      await performRoll();
      if (autoRollRef.current && !rollingRef.current) {
        autoRollTimeoutRef.current = setTimeout(tryAutoRoll, 100);
      }
    };
    
    autoRollTimeoutRef.current = setTimeout(tryAutoRoll, 100);
    
    return () => {
      if (autoRollTimeoutRef.current) {
        clearTimeout(autoRollTimeoutRef.current);
        autoRollTimeoutRef.current = null;
      }
    };
  }, [autoRoll, rolling]);

  const rarityClass = rolledItem ? getRarityClass(rolledItem.rarity) : "";
  const rarityGlow = rolledItem ? getRarityGlow(rolledItem.rarity) : "";

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl space-y-4 md:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Dices className="w-5 h-5 text-primary" />
              </div>
              <p className="text-2xl font-bold tabular-nums">{userStats.totalRolls.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Rolls</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <p className="text-2xl font-bold tabular-nums">{userStats.totalItems.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Items</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Gem className="w-5 h-5 text-primary" />
              </div>
              <p className="text-2xl font-bold tabular-nums">{userStats.uniqueItems.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Unique Items</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatValue(userStats.totalValue)}</p>
              <p className="text-xs text-muted-foreground">Total Value</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Hash className="w-5 h-5 text-primary" />
              </div>
              <p className="text-2xl font-bold tabular-nums">#{user?.userId || 0}</p>
              <p className="text-xs text-muted-foreground">User ID</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight">Roll</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 md:space-y-6">
          <div className="min-h-[300px] md:min-h-[400px] flex items-center justify-center w-full overflow-hidden">
            <AnimatePresence mode="wait">
              {isAnimating ? (
                <motion.div
                  key="rolling"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full flex justify-center"
                >
                  <SlotMachineRoll 
                    items={items} 
                    finalItem={rolledItem} 
                    isRolling={isAnimating}
                    onAnimationComplete={handleAnimationComplete}
                  />
                </motion.div>
              ) : rolledItem ? (
                <motion.div
                  key="result"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, type: "spring" }}
                  className={`border-4 rounded-lg overflow-hidden ${rarityClass} ${rarityGlow}`}
                >
                  <img
                    src={rolledItem.imageUrl}
                    alt={rolledItem.name}
                    className="w-48 h-48 md:w-64 md:h-64 object-cover"
                  />
                  <div className="p-3 md:p-4 bg-card text-center">
                    <h3 className="font-bold text-base md:text-lg">{rolledItem.name}</h3>
                    <p className="text-xs md:text-sm text-muted-foreground">{formatValue(rolledItem.value)}</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-muted-foreground"
                >
                  <Dices className="w-24 h-24 md:w-32 md:h-32 mx-auto mb-4 opacity-50" />
                  <p className="text-sm md:text-base">Click Roll to start</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-3 md:space-y-4">
            <Button
              onClick={performRoll}
              disabled={rolling || items.length === 0}
              size="lg"
              className="w-full h-14 md:h-16 text-lg md:text-xl font-bold"
              data-testid="button-roll"
            >
              {rolling ? (
                <>
                  <Loader2 className="w-5 h-5 md:w-6 md:h-6 mr-2 animate-spin" />
                  Rolling...
                </>
              ) : (
                <>
                  <Dices className="w-5 h-5 md:w-6 md:h-6 mr-2" />
                  Roll
                </>
              )}
            </Button>

            <div className="flex items-center justify-between p-3 md:p-4 bg-muted rounded-lg">
              <Label htmlFor="auto-roll" className="cursor-pointer text-sm md:text-base">
                Auto Roll
              </Label>
              <Switch
                id="auto-roll"
                checked={autoRoll}
                onCheckedChange={setAutoRoll}
                disabled={items.length === 0}
                data-testid="switch-auto-roll"
              />
            </div>

            {items.length === 0 && (
              <p className="text-xs md:text-sm text-center text-muted-foreground">
                No items available to roll. Contact an admin to add items.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Your Best Rolls</CardTitle>
            <p className="text-xs text-muted-foreground">Last 10 worth 250K+</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {bestRolls.map((roll, idx) => (
                <div
                  key={`${roll.itemId}-${roll.timestamp}-${idx}`}
                  className="flex items-center gap-2 md:gap-3 p-2 rounded-lg hover-elevate"
                  data-testid={`best-roll-${idx}`}
                >
                  <img
                    src={roll.itemImageUrl}
                    alt={roll.itemName}
                    className="w-10 h-10 md:w-12 md:h-12 rounded-md object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-semibold truncate">{roll.itemName}</p>
                    <p className="text-xs text-muted-foreground">{formatValue(roll.itemValue)}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground">{formatTimestamp(roll.timestamp)}</p>
                  </div>
                </div>
              ))}
              {bestRolls.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-8">
                  No high-value rolls yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Global Rolls</CardTitle>
            <p className="text-xs text-muted-foreground">Last 10 worth 2.5M+</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {globalRolls.map((roll, idx) => (
                <div
                  key={`${roll.itemId}-${roll.timestamp}-${idx}`}
                  className="flex items-center gap-2 md:gap-3 p-2 rounded-lg hover-elevate"
                  data-testid={`global-roll-${idx}`}
                >
                  <img
                    src={roll.itemImageUrl}
                    alt={roll.itemName}
                    className="w-10 h-10 md:w-12 md:h-12 rounded-md object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-semibold truncate">{roll.itemName}</p>
                    <p className="text-xs text-muted-foreground truncate">{formatValue(roll.itemValue)}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground">{formatTimestamp(roll.timestamp)}</p>
                  </div>
                </div>
              ))}
              {globalRolls.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-8">
                  No recent global rolls
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
