import { useState, useEffect, useCallback, useRef } from "react";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Item, InventoryItemWithDetails } from "@shared/schema";
import { useAuth } from "@/contexts/AuthContext";
import { ItemCard } from "@/components/ItemCard";
import { SlotMachineRoll } from "@/components/SlotMachineRoll";
import { getRarityClass, getRarityGlow, formatValue } from "@/lib/rarity";
import { Dices, Loader2, TrendingUp, Package, Gem, Hash } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { RARITY_TIERS } from "@shared/schema";

interface UserStats {
  totalRolls: number;
  totalItems: number;
  uniqueItems: number;
  totalValue: number;
  rarestItem: { item: Item; count: number } | null;
}

export default function RollScreen() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [rolling, setRolling] = useState(false);
  const [autoRoll, setAutoRoll] = useState(false);
  const [rolledItem, setRolledItem] = useState<Item | null>(null);
  const [bestRolls, setBestRolls] = useState<InventoryItemWithDetails[]>([]);
  const [globalRolls, setGlobalRolls] = useState<any[]>([]);
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

  useEffect(() => {
    loadItems();
    if (user) {
      loadBestRolls();
      loadGlobalRolls();
      loadUserStats();
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

    const itemPromises = Array.from(uniqueItemIds).map(async (itemId) => {
      const itemDoc = await getDocs(query(collection(db, "items"), where("__name__", "==", itemId)));
      if (!itemDoc.empty) {
        return { id: itemDoc.docs[0].id, ...itemDoc.docs[0].data() } as Item;
      }
      return null;
    });

    const itemResults = await Promise.all(itemPromises);
    const items = itemResults.filter((item): item is Item => item !== null);

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
    const itemsRef = collection(db, "items");
    const q = query(itemsRef, where("offSale", "==", false));
    const snapshot = await getDocs(q);
    const loadedItems: Item[] = [];
    snapshot.forEach((doc) => {
      const item = { id: doc.id, ...doc.data() } as Item;
      if (item.stockType === "infinite" || (item.remainingStock && item.remainingStock > 0)) {
        loadedItems.push(item);
      }
    });
    setItems(loadedItems);
  };

  const loadBestRolls = async () => {
    if (!user) return;
    const inventoryRef = collection(db, "inventory");
    const q = query(inventoryRef, where("userId", "==", user.firebaseUid), orderBy("rolledAt", "desc"), limit(20));
    const snapshot = await getDocs(q);
    
    const rolls: InventoryItemWithDetails[] = [];
    for (const doc of snapshot.docs) {
      const invItem = { id: doc.id, ...doc.data() } as any;
      const itemDoc = await getDocs(query(collection(db, "items"), where("__name__", "==", invItem.itemId)));
      if (!itemDoc.empty) {
        const item = { id: itemDoc.docs[0].id, ...itemDoc.docs[0].data() } as Item;
        if (item.value >= 250000) {
          rolls.push({ ...invItem, item });
        }
      }
    }
    setBestRolls(rolls.slice(0, 8));
  };

  const loadGlobalRolls = async () => {
    const rollsRef = collection(db, "globalRolls");
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const q = query(rollsRef, where("timestamp", ">=", fiveMinutesAgo), orderBy("timestamp", "desc"), limit(8));
    const snapshot = await getDocs(q);
    const rolls: any[] = [];
    snapshot.forEach((doc) => rolls.push(doc.data()));
    setGlobalRolls(rolls);
  };

  const performRoll = useCallback(async () => {
    if (!user || rolling || rollingRef.current) return;

    rollingRef.current = true;
    setRolling(true);

    try {
      const { performRoll: executeRoll } = await import("@/lib/rollService");
      const result = await executeRoll(user);
      
      setRolledItem(result.item);
      setIsAnimating(true);
      
      await new Promise((resolve) => setTimeout(resolve, 2100));
      
      setIsAnimating(false);
      
      if (result.autoSold) {
        toast({
          title: "Auto-Sold!",
          description: `${result.item.name} - Earned ${formatValue(result.playerEarned || 0)}`,
        });
      } else {
        toast({
          title: "You rolled!",
          description: `${result.item.name} - ${formatValue(result.item.value)}${result.serialNumber ? ` #${result.serialNumber}` : ""}`,
        });
      }

      await Promise.all([
        loadItems(),
        loadBestRolls(),
        loadUserStats(),
        refetchUser(),
      ]);
    } catch (error: any) {
      console.error("Roll error:", error);
      setIsAnimating(false);
      toast({
        title: "Roll failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setRolling(false);
      rollingRef.current = false;
    }
  }, [user, rolling, toast]);

  useEffect(() => {
    autoRollRef.current = autoRoll;
    
    const autoRollLoop = async () => {
      if (!autoRollRef.current || rollingRef.current) return;
      
      await performRoll();
      
      if (autoRollRef.current) {
        autoRollTimeoutRef.current = setTimeout(autoRollLoop, 2000);
      }
    };
    
    if (autoRoll && !rolling) {
      autoRollTimeoutRef.current = setTimeout(autoRollLoop, 0);
    }
    
    return () => {
      if (autoRollTimeoutRef.current) {
        clearTimeout(autoRollTimeoutRef.current);
        autoRollTimeoutRef.current = null;
      }
    };
  }, [autoRoll, rolling, performRoll]);

  const rarityClass = rolledItem ? getRarityClass(rolledItem.rarity) : "";
  const rarityGlow = rolledItem ? getRarityGlow(rolledItem.rarity) : "";

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
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
          {userStats.rarestItem && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2">Rarest Item</p>
              <div className="flex items-center gap-3">
                <img
                  src={userStats.rarestItem.item.imageUrl}
                  alt={userStats.rarestItem.item.name}
                  className="w-12 h-12 rounded-md object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{userStats.rarestItem.item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatValue(userStats.rarestItem.item.value)} • x{userStats.rarestItem.count}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-[1fr,300px,300px] gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-3xl font-bold tracking-tight">Roll</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="min-h-[400px] flex items-center justify-center">
              <AnimatePresence mode="wait">
                {isAnimating ? (
                  <motion.div
                    key="rolling"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <SlotMachineRoll items={items} finalItem={rolledItem} isRolling={isAnimating} />
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
                      className="w-64 h-64 object-cover"
                    />
                    <div className="p-4 bg-card text-center">
                      <h3 className="font-bold text-lg">{rolledItem.name}</h3>
                      <p className="text-sm text-muted-foreground">{formatValue(rolledItem.value)}</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-muted-foreground"
                  >
                    <Dices className="w-32 h-32 mx-auto mb-4 opacity-50" />
                    <p>Click Roll to start</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-4">
              <Button
                onClick={performRoll}
                disabled={rolling || items.length === 0}
                size="lg"
                className="w-full h-16 text-xl font-bold"
                data-testid="button-roll"
              >
                {rolling ? (
                  <>
                    <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                    Rolling...
                  </>
                ) : (
                  <>
                    <Dices className="w-6 h-6 mr-2" />
                    Roll
                  </>
                )}
              </Button>

              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <Label htmlFor="auto-roll" className="cursor-pointer">
                  Auto Roll
                </Label>
                <Switch
                  id="auto-roll"
                  checked={autoRoll}
                  onCheckedChange={setAutoRoll}
                  disabled={rolling || items.length === 0}
                  data-testid="switch-auto-roll"
                />
              </div>

              {items.length === 0 && (
                <p className="text-sm text-center text-muted-foreground">
                  No items available to roll. Contact an admin to add items.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Best Rolls</CardTitle>
            <p className="text-xs text-muted-foreground">Items worth 250K+</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {bestRolls.map((roll) => (
                <div
                  key={roll.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover-elevate"
                  data-testid={`best-roll-${roll.id}`}
                >
                  <img
                    src={roll.item.imageUrl}
                    alt={roll.item.name}
                    className="w-12 h-12 rounded-md object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{roll.item.name}</p>
                    <p className="text-xs text-muted-foreground">{formatValue(roll.item.value)}</p>
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
            <CardTitle className="text-lg">Global Rolls</CardTitle>
            <p className="text-xs text-muted-foreground">Items worth 2.5M+</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {globalRolls.map((roll, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2 rounded-lg hover-elevate"
                  data-testid={`global-roll-${idx}`}
                >
                  <img
                    src={roll.itemImageUrl}
                    alt={roll.itemName}
                    className="w-12 h-12 rounded-md object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{roll.username}</p>
                    <p className="text-xs text-muted-foreground truncate">{roll.itemName}</p>
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
