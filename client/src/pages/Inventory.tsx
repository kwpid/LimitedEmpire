import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemCard } from "@/components/ItemCard";
import { ItemDetailModal } from "@/components/ItemDetailModal";
import type { InventoryItemWithDetails, Item } from "@shared/schema";
import { Search, Package } from "lucide-react";
import { RARITY_TIERS } from "@shared/schema";

type StackedInventoryItem = {
  item: Item;
  count: number;
  serialNumber?: number;
  inventoryIds: string[];
};

export default function Inventory() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItemWithDetails[]>([]);
  const [stackedInventory, setStackedInventory] = useState<StackedInventoryItem[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<StackedInventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<{ item: Item; serialNumber?: number; inventoryIds: string[]; stackCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadInventory();
    }
  }, [user]);

  useEffect(() => {
    stackItems();
  }, [inventory]);

  useEffect(() => {
    filterInventory();
  }, [stackedInventory, searchTerm, rarityFilter]);

  const loadInventory = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const userDocRef = doc(db, "users", user.id);
      const userDocSnap = await getDoc(userDocRef);
      
      if (!userDocSnap.exists()) {
        setInventory([]);
        setLoading(false);
        return;
      }

      const userData = userDocSnap.data();
      const userInventory = userData.inventory || [];

      const uniqueItemIds = Array.from(new Set(userInventory.map((inv: any) => inv.itemId))) as string[];
      
      const itemFetches = uniqueItemIds.map(async (itemId: string) => {
        const itemDocRef = doc(db, "items", itemId);
        const itemDoc = await getDoc(itemDocRef);
        return itemDoc.exists() 
          ? { id: itemDoc.id, ...itemDoc.data() } as Item
          : null;
      });

      const fetchedItems = await Promise.all(itemFetches);
      const itemCache = new Map<string, Item>();
      fetchedItems.forEach((item) => {
        if (item) itemCache.set(item.id, item);
      });

      const items: InventoryItemWithDetails[] = [];
      for (const invItem of userInventory) {
        const item = itemCache.get(invItem.itemId);
        if (item) {
          const amount = invItem.amount || 1;
          if (invItem.serialNumber !== null) {
            items.push({ 
              id: invItem.id,
              itemId: invItem.itemId,
              userId: user.firebaseUid,
              serialNumber: invItem.serialNumber,
              rolledAt: invItem.rolledAt,
              item 
            });
          } else {
            for (let i = 0; i < amount; i++) {
              items.push({ 
                id: i === 0 ? invItem.id : `${invItem.id}-${i}`,
                itemId: invItem.itemId,
                userId: user.firebaseUid,
                serialNumber: invItem.serialNumber,
                rolledAt: invItem.rolledAt,
                item 
              });
            }
          }
        }
      }

      items.sort((a, b) => b.item.value - a.item.value);
      setInventory(items);
    } catch (error) {
      console.error("Error loading inventory:", error);
    } finally {
      setLoading(false);
    }
  };

  const stackItems = () => {
    const grouped = new Map<string, StackedInventoryItem>();

    inventory.forEach((invItem) => {
      const isLimitedWithSerial = invItem.item.stockType === "limited" && invItem.serialNumber !== null;
      
      if (isLimitedWithSerial) {
        const uniqueKey = `${invItem.itemId}-${invItem.serialNumber}`;
        grouped.set(uniqueKey, {
          item: invItem.item,
          count: 1,
          serialNumber: invItem.serialNumber || undefined,
          inventoryIds: [invItem.id],
        });
      } else {
        const existing = grouped.get(invItem.itemId);
        if (existing) {
          existing.count += 1;
          existing.inventoryIds.push(invItem.id);
        } else {
          grouped.set(invItem.itemId, {
            item: invItem.item,
            count: 1,
            inventoryIds: [invItem.id],
          });
        }
      }
    });

    const stacked = Array.from(grouped.values()).sort((a, b) => b.item.value - a.item.value);
    setStackedInventory(stacked);
  };

  const filterInventory = () => {
    let filtered = [...stackedInventory];

    if (searchTerm) {
      const searchWords = searchTerm.toLowerCase().trim().split(/\s+/);
      filtered = filtered.filter((item) => {
        const itemName = item.item.name.toLowerCase();
        return searchWords.every(word => itemName.includes(word));
      });
    }

    if (rarityFilter !== "all") {
      filtered = filtered.filter((item) => item.item.rarity === rarityFilter);
    }

    setFilteredInventory(filtered);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Inventory</h1>
        <p className="text-muted-foreground">
          {inventory.length} item{inventory.length !== 1 ? "s" : ""} collected ({stackedInventory.length} unique)
        </p>
      </div>

      <div className="sticky top-0 z-10 bg-background pb-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-inventory"
            />
          </div>
          <Select value={rarityFilter} onValueChange={setRarityFilter}>
            <SelectTrigger className="w-full sm:w-48" data-testid="select-rarity-filter">
              <SelectValue placeholder="Filter by rarity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rarities</SelectItem>
              {Object.keys(RARITY_TIERS).map((rarity) => (
                <SelectItem key={rarity} value={rarity}>
                  {RARITY_TIERS[rarity as keyof typeof RARITY_TIERS].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading your collection...</p>
        </div>
      ) : filteredInventory.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredInventory.map((stackedItem, index) => (
            <ItemCard
              key={`${stackedItem.item.id}-${stackedItem.serialNumber || index}`}
              item={stackedItem.item}
              serialNumber={stackedItem.serialNumber}
              stackCount={stackedItem.count}
              onClick={() =>
                setSelectedItem({
                  item: stackedItem.item,
                  serialNumber: stackedItem.serialNumber,
                  inventoryIds: stackedItem.inventoryIds,
                  stackCount: stackedItem.count,
                })
              }
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {searchTerm || rarityFilter !== "all"
              ? "No items match your filters"
              : "Your inventory is empty. Start rolling to collect items!"}
          </p>
        </div>
      )}

      <ItemDetailModal
        item={selectedItem?.item || null}
        serialNumber={selectedItem?.serialNumber}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        inventoryIds={selectedItem?.inventoryIds}
        stackCount={selectedItem?.stackCount}
        onSellComplete={loadInventory}
      />
    </div>
  );
}
