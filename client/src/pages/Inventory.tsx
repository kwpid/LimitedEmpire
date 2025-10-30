import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ItemCard } from "@/components/ItemCard";
import { ItemDetailModal } from "@/components/ItemDetailModal";
import type { InventoryItemWithDetails, Item, RarityTier } from "@shared/schema";
import { Search, Package, CheckSquare, X, DollarSign } from "lucide-react";
import { RARITY_TIERS } from "@shared/schema";
import { sellItems } from "@/lib/sellService";
import { useToast } from "@/hooks/use-toast";
import { formatValue } from "@/lib/rarity";

type StackedInventoryItem = {
  item: Item;
  count: number;
  serialNumber?: number;
  inventoryIds: string[];
};

export default function Inventory() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [inventory, setInventory] = useState<InventoryItemWithDetails[]>([]);
  const [stackedInventory, setStackedInventory] = useState<StackedInventoryItem[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<StackedInventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<{ item: Item; serialNumber?: number; inventoryIds: string[]; stackCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectorMode, setSelectorMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkSellRarity, setBulkSellRarity] = useState<RarityTier | null>(null);
  const [showBulkSellDialog, setShowBulkSellDialog] = useState(false);
  const [selling, setSelling] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartKey, setDragStartKey] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<'add' | 'remove'>('add');

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
      // Use user data from context instead of fetching again
      const userInventory = user.inventory || [];
      
      // Extract unique item IDs
      const uniqueItemIds = Array.from(new Set(userInventory.map((inv: any) => inv.itemId))) as string[];
      
      // Use itemsCache for batched, cached item fetching
      const { itemsCache } = await import("@/lib/itemsCache");
      const itemCache = await itemsCache.getItemsBatch(uniqueItemIds);

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

  const handleBulkSellByRarity = (rarity: RarityTier) => {
    setBulkSellRarity(rarity);
  };

  const confirmBulkSellByRarity = async () => {
    if (!user || !bulkSellRarity || selling) return;

    const itemsToSell = stackedInventory.filter(item => item.item.rarity === bulkSellRarity);
    if (itemsToSell.length === 0) {
      setBulkSellRarity(null);
      return;
    }

    setSelling(true);
    try {
      let totalEarned = 0;
      let totalSold = 0;

      for (const stackedItem of itemsToSell) {
        const result = await sellItems(user, stackedItem.inventoryIds, stackedItem.item.value, stackedItem.count, stackedItem.item.id);
        totalEarned += result.playerEarned;
        totalSold += result.soldCount;
      }

      toast({
        title: "Bulk sell complete!",
        description: `Sold ${totalSold} ${RARITY_TIERS[bulkSellRarity].name} items for $${formatValue(totalEarned)}`,
      });

      setBulkSellRarity(null);
      await loadInventory();
      await refetchUser();
    } catch (error: any) {
      console.error("Bulk sell error:", error);
      toast({
        title: "Bulk sell failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSelling(false);
    }
  };

  const toggleSelectorMode = () => {
    setSelectorMode(!selectorMode);
    setSelectedItems(new Set());
  };

  const toggleItemSelection = (key: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    setSelectedItems(newSelection);
  };

  const handleItemClick = (stackedItem: StackedInventoryItem, index: number) => {
    const key = `${stackedItem.item.id}-${stackedItem.serialNumber || index}`;
    
    if (selectorMode) {
      toggleItemSelection(key);
    } else {
      setSelectedItem({
        item: stackedItem.item,
        serialNumber: stackedItem.serialNumber,
        inventoryIds: stackedItem.inventoryIds,
        stackCount: stackedItem.count,
      });
    }
  };

  const handleMouseDown = (key: string, e: React.MouseEvent) => {
    if (selectorMode && e.button === 0) { // Left mouse button only
      e.preventDefault();
      setIsDragging(true);
      setDragStartKey(key);
      
      // Determine if we're adding or removing based on current state
      const isCurrentlySelected = selectedItems.has(key);
      setDragMode(isCurrentlySelected ? 'remove' : 'add');
      
      // Toggle the anchor item
      toggleItemSelection(key);
    }
  };

  const handleMouseEnter = (key: string) => {
    if (selectorMode && isDragging && key !== dragStartKey) {
      const newSelection = new Set(selectedItems);
      
      if (dragMode === 'add') {
        newSelection.add(key);
      } else {
        newSelection.delete(key);
      }
      
      setSelectedItems(newSelection);
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragStartKey(null);
    }
  };

  useEffect(() => {
    if (selectorMode) {
      const handleGlobalMouseUp = () => {
        setIsDragging(false);
        setDragStartKey(null);
      };

      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [selectorMode]);

  const getSelectedItemsData = () => {
    const selected = filteredInventory.filter((item, index) => {
      const key = `${item.item.id}-${item.serialNumber || index}`;
      return selectedItems.has(key);
    });
    
    const totalValue = selected.reduce((sum, item) => sum + (item.item.value * item.count), 0);
    const totalCount = selected.reduce((sum, item) => sum + item.count, 0);
    const sellValue = Math.floor(totalValue * 0.8);
    
    return { selected, totalValue, totalCount, sellValue };
  };

  const confirmBulkSellSelected = async () => {
    if (!user || selling || selectedItems.size === 0) return;

    const { selected } = getSelectedItemsData();
    
    setSelling(true);
    try {
      let totalEarned = 0;
      let totalSold = 0;

      for (const stackedItem of selected) {
        const result = await sellItems(user, stackedItem.inventoryIds, stackedItem.item.value, stackedItem.count, stackedItem.item.id);
        totalEarned += result.playerEarned;
        totalSold += result.soldCount;
      }

      toast({
        title: "Bulk sell complete!",
        description: `Sold ${totalSold} items for $${formatValue(totalEarned)}`,
      });

      setShowBulkSellDialog(false);
      setSelectedItems(new Set());
      setSelectorMode(false);
      await loadInventory();
      await refetchUser();
    } catch (error: any) {
      console.error("Bulk sell error:", error);
      toast({
        title: "Bulk sell failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSelling(false);
    }
  };

  const { selected, totalCount, sellValue } = getSelectedItemsData();

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

        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectorMode ? "default" : "outline"}
            size="sm"
            onClick={toggleSelectorMode}
            data-testid="button-selector-mode"
          >
            <CheckSquare className="w-4 h-4 mr-2" />
            {selectorMode ? `Selected (${selectedItems.size})` : "Selector Mode"}
          </Button>

          {selectorMode && selectedItems.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkSellDialog(true)}
                data-testid="button-sell-selected"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Sell Selected ({totalCount})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedItems(new Set())}
                data-testid="button-clear-selection"
              >
                <X className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </>
          )}

          {!selectorMode && (
            <>
              {(["COMMON", "UNCOMMON", "RARE", "ULTRA_RARE"] as RarityTier[]).map((rarity) => {
                const count = stackedInventory.filter(item => item.item.rarity === rarity).reduce((sum, item) => sum + item.count, 0);
                if (count === 0) return null;
                
                return (
                  <Button
                    key={rarity}
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkSellByRarity(rarity)}
                    data-testid={`button-bulk-sell-${rarity.toLowerCase()}`}
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Sell All {RARITY_TIERS[rarity].name} ({count})
                  </Button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading your collection...</p>
        </div>
      ) : filteredInventory.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredInventory.map((stackedItem, index) => {
            const key = `${stackedItem.item.id}-${stackedItem.serialNumber || index}`;
            const isSelected = selectedItems.has(key);
            
            return (
              <div 
                key={key} 
                className="relative select-none"
                onMouseDown={(e) => selectorMode ? handleMouseDown(key, e) : undefined}
                onMouseEnter={() => selectorMode ? handleMouseEnter(key) : undefined}
                onMouseUp={handleMouseUp}
              >
                {selectorMode && isSelected && (
                  <div className="absolute -top-2 -right-2 z-10 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center pointer-events-none">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                )}
                <div className={`${selectorMode && isSelected ? "ring-4 ring-primary rounded-lg" : ""} ${selectorMode ? "cursor-pointer" : ""}`}>
                  <ItemCard
                    item={stackedItem.item}
                    serialNumber={stackedItem.serialNumber}
                    stackCount={stackedItem.count}
                    onClick={!selectorMode ? () => handleItemClick(stackedItem, index) : undefined}
                  />
                </div>
              </div>
            );
          })}
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

      {/* Bulk sell by rarity confirmation */}
      <AlertDialog open={!!bulkSellRarity} onOpenChange={(open) => !open && setBulkSellRarity(null)}>
        <AlertDialogContent data-testid="dialog-bulk-sell-rarity">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Sell All {bulkSellRarity && RARITY_TIERS[bulkSellRarity].name} Items?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkSellRarity && (() => {
                const itemsToSell = stackedInventory.filter(item => item.item.rarity === bulkSellRarity);
                const totalCount = itemsToSell.reduce((sum, item) => sum + item.count, 0);
                const totalValue = itemsToSell.reduce((sum, item) => sum + (item.item.value * item.count), 0);
                const sellValue = Math.floor(totalValue * 0.8);
                
                return (
                  <div className="space-y-2">
                    <p>
                      You will sell <strong>{totalCount}</strong> {RARITY_TIERS[bulkSellRarity].name} items for <strong>${formatValue(sellValue)}</strong> (80% of value).
                    </p>
                    <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
                  </div>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={selling} data-testid="button-cancel-bulk-sell">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkSellByRarity}
              disabled={selling}
              data-testid="button-confirm-bulk-sell"
            >
              {selling ? "Selling..." : "Confirm Sale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk sell selected items confirmation */}
      <AlertDialog open={showBulkSellDialog} onOpenChange={setShowBulkSellDialog}>
        <AlertDialogContent data-testid="dialog-bulk-sell-selected">
          <AlertDialogHeader>
            <AlertDialogTitle>Sell Selected Items?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <p>
                  You will sell <strong>{totalCount}</strong> selected items for <strong>${formatValue(sellValue)}</strong> (80% of value).
                </p>
                <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={selling} data-testid="button-cancel-selected-sell">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkSellSelected}
              disabled={selling}
              data-testid="button-confirm-selected-sell"
            >
              {selling ? "Selling..." : "Confirm Sale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
