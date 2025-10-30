import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { collection, getDocs, query, where, doc, getDoc, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { itemsCache } from "@/lib/itemsCache";
import type { User, Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue } from "@/lib/rarity";
import { Search, X, DollarSign, ArrowLeftRight, Hash, Lock } from "lucide-react";

interface InventoryItemWithDetails {
  inventoryId: string;
  itemId: string;
  itemName: string;
  itemImageUrl: string;
  itemValue: number;
  itemRarity: "COMMON" | "UNCOMMON" | "RARE" | "ULTRA_RARE" | "EPIC" | "ULTRA_EPIC" | "MYTHIC" | "INSANE";
  serialNumber: number | null;
  nftLocked: boolean;
  amount: number;
}

interface TradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: User | null;
}

export function TradeModal({ open, onOpenChange, targetUser }: TradeModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [myInventory, setMyInventory] = useState<InventoryItemWithDetails[]>([]);
  const [theirInventory, setTheirInventory] = useState<InventoryItemWithDetails[]>([]);
  const [mySearchTerm, setMySearchTerm] = useState("");
  const [theirSearchTerm, setTheirSearchTerm] = useState("");
  
  // Track desired quantities per itemId (unit-based, not entry-based)
  const [offerQuantities, setOfferQuantities] = useState<Map<string, number>>(new Map());
  const [requestQuantities, setRequestQuantities] = useState<Map<string, number>>(new Map());
  const [offerCash, setOfferCash] = useState<number>(0);
  const [requestCash, setRequestCash] = useState<number>(0);
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && user && targetUser) {
      loadInventories();
    } else {
      resetTrade();
    }
  }, [open, user, targetUser]);

  const resetTrade = () => {
    setMyInventory([]);
    setTheirInventory([]);
    setMySearchTerm("");
    setTheirSearchTerm("");
    setOfferQuantities(new Map());
    setRequestQuantities(new Map());
    setOfferCash(0);
    setRequestCash(0);
  };

  const loadInventories = async () => {
    if (!user || !targetUser) return;
    setLoading(true);

    try {
      // Fetch fresh user data from Firestore to ensure inventory is up-to-date
      const [myUserDoc, targetUserDoc] = await Promise.all([
        getDoc(doc(db, "users", user.firebaseUid)),
        getDoc(doc(db, "users", targetUser.firebaseUid)),
      ]);

      if (!myUserDoc.exists() || !targetUserDoc.exists()) {
        throw new Error("User data not found");
      }

      const myUserData = { id: myUserDoc.id, ...myUserDoc.data() } as User;
      const targetUserData = { id: targetUserDoc.id, ...targetUserDoc.data() } as User;

      const [myItems, theirItems] = await Promise.all([
        loadUserInventory(myUserData),
        loadUserInventory(targetUserData),
      ]);

      setMyInventory(myItems);
      setTheirInventory(theirItems);
    } catch (error) {
      console.error("Error loading inventories:", error);
      toast({
        title: "Error",
        description: "Failed to load inventories",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUserInventory = async (targetUser: User): Promise<InventoryItemWithDetails[]> => {
    const inventory = targetUser.inventory || [];
    const uniqueItemIds = Array.from(new Set(inventory.map(inv => inv.itemId)));

    // Use items cache instead of individual Firestore reads
    const itemsMap = await itemsCache.getItemsBatch(uniqueItemIds);

    const itemsWithDetails: InventoryItemWithDetails[] = inventory.map(invItem => {
      const item = itemsMap.get(invItem.itemId);
      if (!item) return null;

      return {
        inventoryId: invItem.id,
        itemId: item.id,
        itemName: item.name,
        itemImageUrl: item.imageUrl,
        itemValue: item.value,
        itemRarity: item.rarity,
        serialNumber: invItem.serialNumber,
        nftLocked: invItem.nftLocked || false,
        amount: invItem.amount || 1,
      };
    }).filter((item): item is InventoryItemWithDetails => item !== null);

    return itemsWithDetails.sort((a, b) => b.itemValue - a.itemValue);
  };

  // Group inventory items by itemId to handle duplicates
  const groupInventoryByItem = (inventory: InventoryItemWithDetails[]) => {
    const grouped = new Map<string, InventoryItemWithDetails[]>();
    inventory.forEach(item => {
      const existing = grouped.get(item.itemId) || [];
      existing.push(item);
      grouped.set(item.itemId, existing);
    });
    return grouped;
  };

  // Create full grouped maps (for summary section - always shows all selected items)
  const groupedMyInventory = groupInventoryByItem(myInventory);
  const groupedTheirInventory = groupInventoryByItem(theirInventory);

  // Create filtered inventories (for search functionality)
  const filteredMyInventory = myInventory.filter(item => {
    if (!mySearchTerm) return true;
    const searchLower = mySearchTerm.toLowerCase();
    return item.itemName.toLowerCase().includes(searchLower) ||
           (item.serialNumber !== null && item.serialNumber.toString().includes(searchLower));
  });

  const filteredTheirInventory = theirInventory.filter(item => {
    if (!theirSearchTerm) return true;
    const searchLower = theirSearchTerm.toLowerCase();
    return item.itemName.toLowerCase().includes(searchLower) ||
           (item.serialNumber !== null && item.serialNumber.toString().includes(searchLower));
  });

  // Create filtered grouped maps (for inventory grid display)
  const filteredGroupedMyInventory = groupInventoryByItem(filteredMyInventory);
  const filteredGroupedTheirInventory = groupInventoryByItem(filteredTheirInventory);

  // Handle quantity changes (unit-based, not entry-based)
  const handleQuantityChange = (itemId: string, items: InventoryItemWithDetails[], newQuantity: number, isOffer: boolean) => {
    const totalUnits = items.reduce((sum, item) => sum + item.amount, 0);
    const clampedQuantity = Math.min(totalUnits, Math.max(0, newQuantity));
    
    // Check for NFT locked items
    if (items.some(item => item.nftLocked)) {
      toast({
        title: "Item Locked",
        description: "This item is marked as NFT (Not For Trade)",
        variant: "destructive",
      });
      return;
    }

    const quantities = isOffer ? offerQuantities : requestQuantities;
    const setter = isOffer ? setOfferQuantities : setRequestQuantities;
    
    const newQuantities = new Map(quantities);
    if (clampedQuantity === 0) {
      newQuantities.delete(itemId);
    } else {
      newQuantities.set(itemId, clampedQuantity);
    }
    
    setter(newQuantities);
  };

  // Convert quantities to trade items with amount field
  // Handles cases where items span multiple inventory entries
  const quantitiesToEntries = (quantities: Map<string, number>, inventory: InventoryItemWithDetails[]): any[] => {
    const tradeItems: any[] = [];
    const grouped = groupInventoryByItem(inventory);
    
    quantities.forEach((desiredQuantity, itemId) => {
      const items = grouped.get(itemId) || [];
      if (items.length === 0) return;
      
      // Sort items by serial number for deterministic selection
      const sortedItems = [...items].sort((a, b) => {
        if (a.serialNumber !== null && b.serialNumber !== null) {
          return a.serialNumber - b.serialNumber;
        }
        if (a.serialNumber !== null) return -1;
        if (b.serialNumber !== null) return 1;
        return a.inventoryId.localeCompare(b.inventoryId);
      });
      
      // Distribute desired quantity across multiple inventory entries if needed
      let remainingQuantity = desiredQuantity;
      for (const item of sortedItems) {
        if (remainingQuantity <= 0) break;
        
        const amountFromThisEntry = Math.min(remainingQuantity, item.amount);
        
        tradeItems.push({
          inventoryId: item.inventoryId,
          itemId: item.itemId,
          itemName: item.itemName,
          itemImageUrl: item.itemImageUrl,
          itemValue: item.itemValue,
          itemRarity: item.itemRarity,
          serialNumber: item.serialNumber,
          nftLocked: item.nftLocked || false,
          amount: amountFromThisEntry,
        });
        
        remainingQuantity -= amountFromThisEntry;
      }
    });
    
    return tradeItems;
  };

  const handleSubmitTrade = async () => {
    if (!user || !targetUser) return;

    if (offerQuantities.size === 0) {
      toast({
        title: "Invalid Trade",
        description: "You must offer at least 1 item",
        variant: "destructive",
      });
      return;
    }

    if (requestQuantities.size === 0) {
      toast({
        title: "Invalid Trade",
        description: "You must request at least 1 item",
        variant: "destructive",
      });
      return;
    }

    if (offerCash > 50000) {
      toast({
        title: "Invalid Trade",
        description: "Cash offer cannot exceed $50,000",
        variant: "destructive",
      });
      return;
    }

    if (requestCash > 10000) {
      toast({
        title: "Invalid Trade",
        description: "Cash request cannot exceed $10,000",
        variant: "destructive",
      });
      return;
    }

    if (offerCash > (user.cash ?? 0)) {
      toast({
        title: "Insufficient Funds",
        description: "You don't have enough cash to offer",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      // Convert quantities to inventory entries
      const offerEntries = quantitiesToEntries(offerQuantities, myInventory);
      const requestEntries = quantitiesToEntries(requestQuantities, theirInventory);

      await addDoc(collection(db, "trades"), {
        status: "pending",
        senderId: user.firebaseUid,
        senderUsername: user.username,
        receiverId: targetUser.firebaseUid,
        receiverUsername: targetUser.username,
        senderOffer: {
          items: offerEntries,
          cash: offerCash,
        },
        receiverRequest: {
          items: requestEntries,
          cash: requestCash,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      toast({
        title: "Trade Sent",
        description: `Your trade offer has been sent to ${targetUser.username}`,
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Error creating trade:", error);
      toast({
        title: "Error",
        description: "Failed to create trade offer",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate total values based on quantities
  const calculateTotalValue = (quantities: Map<string, number>, inventory: InventoryItemWithDetails[]): number => {
    const grouped = groupInventoryByItem(inventory);
    let total = 0;
    quantities.forEach((quantity, itemId) => {
      const items = grouped.get(itemId);
      if (items && items.length > 0) {
        total += items[0].itemValue * quantity;
      }
    });
    return total;
  };

  const totalOfferValue = calculateTotalValue(offerQuantities, myInventory) + offerCash;
  const totalRequestValue = calculateTotalValue(requestQuantities, theirInventory) + requestCash;

  const renderInventoryItem = (itemId: string, items: InventoryItemWithDetails[], isOffer: boolean) => {
    const representativeItem = items[0];
    const totalUnits = items.reduce((sum, item) => sum + item.amount, 0);
    const hasNftLocked = items.some(item => item.nftLocked);
    
    const quantities = isOffer ? offerQuantities : requestQuantities;
    const selectedQuantity = quantities.get(itemId) || 0;

    const handleIncrement = () => {
      if (selectedQuantity < totalUnits) {
        handleQuantityChange(itemId, items, selectedQuantity + 1, isOffer);
      }
    };

    const handleDecrement = () => {
      if (selectedQuantity > 0) {
        handleQuantityChange(itemId, items, selectedQuantity - 1, isOffer);
      }
    };

    const handleClick = () => {
      if (totalUnits === 1 && !hasNftLocked) {
        if (selectedQuantity === 0) {
          handleIncrement();
        } else {
          handleDecrement();
        }
      }
    };

    return (
      <Card
        key={itemId}
        className={`transition-all hover:shadow-lg ${
          selectedQuantity > 0 ? "ring-2 ring-primary shadow-lg" : ""
        } ${hasNftLocked ? "opacity-50" : ""} ${totalUnits === 1 && !hasNftLocked ? "cursor-pointer" : ""}`}
        onClick={handleClick}
        data-testid={`trade-item-group-${itemId}`}
      >
        <CardContent className="p-2">
          <div className="relative aspect-square mb-1 rounded-md overflow-hidden bg-gradient-to-br from-card to-muted">
            <img
              src={representativeItem.itemImageUrl}
              alt={representativeItem.itemName}
              className="w-full h-full object-cover"
            />
            {hasNftLocked && (
              <div className="absolute top-0.5 right-0.5 bg-destructive/90 rounded-full p-0.5">
                <Lock className="w-2.5 h-2.5 text-destructive-foreground" />
              </div>
            )}
            {selectedQuantity > 0 && (
              <div className="absolute top-0.5 right-0.5 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {selectedQuantity}
              </div>
            )}
          </div>
          <p className="text-[10px] font-semibold truncate mb-0.5" title={representativeItem.itemName}>
            {representativeItem.itemName}
          </p>
          <div className="flex items-center justify-between gap-0.5 mb-1">
            <span className="text-[9px] font-mono text-muted-foreground">
              {formatValue(representativeItem.itemValue)}
            </span>
            {totalUnits > 1 && (
              <span className="text-[9px] text-muted-foreground">
                Own: {totalUnits}
              </span>
            )}
          </div>
          {totalUnits > 1 && (
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDecrement();
                }}
                disabled={hasNftLocked || selectedQuantity === 0}
                data-testid={`button-decrease-${itemId}`}
              >
                -
              </Button>
              <span className="text-xs font-semibold min-w-[20px] text-center" data-testid={`text-quantity-${itemId}`}>
                {selectedQuantity}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleIncrement();
                }}
                disabled={hasNftLocked || selectedQuantity >= totalUnits}
                data-testid={`button-increase-${itemId}`}
              >
                +
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-full h-[90vh] overflow-hidden flex flex-col p-6" data-testid="modal-trade">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ArrowLeftRight className="w-5 h-5" />
            Trade with {targetUser?.username}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden mt-4">
          {/* Your Inventory */}
          <div className="flex flex-col overflow-hidden border rounded-lg bg-card/50">
            <div className="p-3 border-b bg-muted/30">
              <Label className="text-sm font-semibold mb-2 block">Your Inventory</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search your items..."
                  value={mySearchTerm}
                  onChange={(e) => setMySearchTerm(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-search-my-items"
                />
              </div>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="grid grid-cols-4 gap-2">
                {loading ? (
                  <p className="col-span-full text-center text-muted-foreground py-8 text-sm">Loading...</p>
                ) : filteredGroupedMyInventory.size === 0 ? (
                  <p className="col-span-full text-center text-muted-foreground py-8 text-sm">No items found</p>
                ) : (
                  Array.from(filteredGroupedMyInventory.entries()).map(([itemId, items]) =>
                    renderInventoryItem(itemId, items, true)
                  )
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Their Inventory */}
          <div className="flex flex-col overflow-hidden border rounded-lg bg-card/50">
            <div className="p-3 border-b bg-muted/30">
              <Label className="text-sm font-semibold mb-2 block">{targetUser?.username}'s Inventory</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search their items..."
                  value={theirSearchTerm}
                  onChange={(e) => setTheirSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-search-their-items"
                />
              </div>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="grid grid-cols-4 gap-2">
                {loading ? (
                  <p className="col-span-full text-center text-muted-foreground py-8 text-sm">Loading...</p>
                ) : filteredGroupedTheirInventory.size === 0 ? (
                  <p className="col-span-full text-center text-muted-foreground py-8 text-sm">No items found</p>
                ) : (
                  Array.from(filteredGroupedTheirInventory.entries()).map(([itemId, items]) =>
                    renderInventoryItem(itemId, items, false)
                  )
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Offer/Request Panel */}
          <div className="flex flex-col overflow-hidden border rounded-lg bg-card/50">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Your Offer</Label>
                  <div className="min-h-[100px] p-3 border rounded-lg bg-muted/30">
                    {offerQuantities.size === 0 && offerCash === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Select items from your inventory</p>
                    ) : (
                      <div className="space-y-1">
                        {Array.from(offerQuantities.entries()).map(([itemId, quantity]) => {
                          const items = groupedMyInventory.get(itemId);
                          if (!items || items.length === 0) return null;
                          const item = items[0];
                          return (
                            <div key={itemId} className="flex items-center justify-between p-2 rounded bg-background/50">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                                  <img src={item.itemImageUrl} alt={item.itemName} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate">{item.itemName}</p>
                                  <p className="text-[10px] text-muted-foreground">Qty: {quantity}</p>
                                </div>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-6 h-6 flex-shrink-0"
                                onClick={() => handleQuantityChange(itemId, items, 0, true)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Cash (Max: R$50,000)</Label>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <Input
                        type="number"
                        min={0}
                        max={50000}
                        value={offerCash}
                        onChange={(e) => setOfferCash(Math.min(50000, Math.max(0, parseInt(e.target.value) || 0)))}
                        placeholder="0"
                        className="h-8 text-sm"
                        data-testid="input-offer-cash"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Available: R${(user?.cash ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Value:</span>
                      <span className="text-lg font-bold text-foreground">{formatValue(totalOfferValue)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-base font-semibold">Your Request</Label>
                  <div className="min-h-[100px] p-3 border rounded-lg bg-muted/30">
                    {requestQuantities.size === 0 && requestCash === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Select items from their inventory</p>
                    ) : (
                      <div className="space-y-1">
                        {Array.from(requestQuantities.entries()).map(([itemId, quantity]) => {
                          const items = groupedTheirInventory.get(itemId);
                          if (!items || items.length === 0) return null;
                          const item = items[0];
                          return (
                            <div key={itemId} className="flex items-center justify-between p-2 rounded bg-background/50">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                                  <img src={item.itemImageUrl} alt={item.itemName} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate">{item.itemName}</p>
                                  <p className="text-[10px] text-muted-foreground">Qty: {quantity}</p>
                                </div>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-6 h-6 flex-shrink-0"
                                onClick={() => handleQuantityChange(itemId, items, 0, false)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Cash (Max: R$10,000)</Label>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <Input
                        type="number"
                        min={0}
                        max={10000}
                        value={requestCash}
                        onChange={(e) => setRequestCash(Math.min(10000, Math.max(0, parseInt(e.target.value) || 0)))}
                        placeholder="0"
                        className="h-8 text-sm"
                        data-testid="input-request-cash"
                      />
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Value:</span>
                      <span className="text-lg font-bold text-foreground">{formatValue(totalRequestValue)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t space-y-2">
                  <Button
                    onClick={handleSubmitTrade}
                    disabled={submitting || offerQuantities.size === 0 || requestQuantities.size === 0}
                    className="w-full"
                    size="default"
                    data-testid="button-send-trade"
                  >
                    {submitting ? "Sending..." : "Make Offer"}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => onOpenChange(false)} 
                    className="w-full"
                    size="default"
                    data-testid="button-cancel-trade"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
