import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { collection, getDocs, query, where, doc, getDoc, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  
  const [selectedOffer, setSelectedOffer] = useState<InventoryItemWithDetails[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<InventoryItemWithDetails[]>([]);
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
    setSelectedOffer([]);
    setSelectedRequest([]);
    setOfferCash(0);
    setRequestCash(0);
  };

  const loadInventories = async () => {
    if (!user || !targetUser) return;
    setLoading(true);

    try {
      const [myItems, theirItems] = await Promise.all([
        loadUserInventory(user),
        loadUserInventory(targetUser),
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

    const itemPromises = uniqueItemIds.map(itemId => getDoc(doc(db, "items", itemId)));
    const itemDocs = await Promise.all(itemPromises);
    
    const itemsMap = new Map<string, Item>();
    itemDocs.forEach((itemDoc) => {
      if (itemDoc.exists()) {
        itemsMap.set(itemDoc.id, { id: itemDoc.id, ...itemDoc.data() } as Item);
      }
    });

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
      };
    }).filter((item): item is InventoryItemWithDetails => item !== null);

    return itemsWithDetails.sort((a, b) => b.itemValue - a.itemValue);
  };

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

  const toggleOfferItem = (item: InventoryItemWithDetails) => {
    if (item.nftLocked) {
      toast({
        title: "Item Locked",
        description: "This item is marked as NFT (Not For Trade)",
        variant: "destructive",
      });
      return;
    }

    const isSelected = selectedOffer.some(i => i.inventoryId === item.inventoryId);
    
    if (isSelected) {
      setSelectedOffer(selectedOffer.filter(i => i.inventoryId !== item.inventoryId));
    } else {
      if (selectedOffer.length >= 7) {
        toast({
          title: "Maximum Reached",
          description: "You can offer up to 7 items",
          variant: "destructive",
        });
        return;
      }
      setSelectedOffer([...selectedOffer, item]);
    }
  };

  const toggleRequestItem = (item: InventoryItemWithDetails) => {
    if (item.nftLocked) {
      toast({
        title: "Item Locked",
        description: "This item is marked as NFT (Not For Trade)",
        variant: "destructive",
      });
      return;
    }

    const isSelected = selectedRequest.some(i => i.inventoryId === item.inventoryId);
    
    if (isSelected) {
      setSelectedRequest(selectedRequest.filter(i => i.inventoryId !== item.inventoryId));
    } else {
      if (selectedRequest.length >= 7) {
        toast({
          title: "Maximum Reached",
          description: "You can request up to 7 items",
          variant: "destructive",
        });
        return;
      }
      setSelectedRequest([...selectedRequest, item]);
    }
  };

  const removeOfferItem = (inventoryId: string) => {
    setSelectedOffer(selectedOffer.filter(i => i.inventoryId !== inventoryId));
  };

  const removeRequestItem = (inventoryId: string) => {
    setSelectedRequest(selectedRequest.filter(i => i.inventoryId !== inventoryId));
  };

  const handleSubmitTrade = async () => {
    if (!user || !targetUser) return;

    if (selectedOffer.length === 0) {
      toast({
        title: "Invalid Trade",
        description: "You must offer at least 1 item",
        variant: "destructive",
      });
      return;
    }

    if (selectedRequest.length === 0) {
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
      await addDoc(collection(db, "trades"), {
        status: "pending",
        senderId: user.id,
        senderUsername: user.username,
        receiverId: targetUser.id,
        receiverUsername: targetUser.username,
        senderOffer: {
          items: selectedOffer,
          cash: offerCash,
        },
        receiverRequest: {
          items: selectedRequest,
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

  const totalOfferValue = selectedOffer.reduce((sum, item) => sum + item.itemValue, 0) + offerCash;
  const totalRequestValue = selectedRequest.reduce((sum, item) => sum + item.itemValue, 0) + requestCash;

  const renderInventoryItem = (item: InventoryItemWithDetails, isOffer: boolean, isSelected: boolean) => {
    const onClick = isOffer ? () => toggleOfferItem(item) : () => toggleRequestItem(item);

    return (
      <Card
        key={item.inventoryId}
        className={`cursor-pointer transition-all hover:shadow-lg ${
          isSelected ? "ring-2 ring-primary" : ""
        } ${item.nftLocked ? "opacity-50" : ""}`}
        onClick={onClick}
        data-testid={`trade-item-${item.inventoryId}`}
      >
        <CardContent className="p-3">
          <div className="relative aspect-square mb-2 rounded-lg overflow-hidden bg-gradient-to-br from-card to-muted">
            <img
              src={item.itemImageUrl}
              alt={item.itemName}
              className="w-full h-full object-cover"
            />
            {item.nftLocked && (
              <div className="absolute top-1 right-1 bg-destructive/90 rounded-full p-1">
                <Lock className="w-3 h-3 text-destructive-foreground" />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold truncate" title={item.itemName}>
              {item.itemName}
            </p>
            <div className="flex items-center justify-between gap-1">
              <Badge variant="outline" className={`text-[10px] px-1 py-0 ${getRarityClass(item.itemRarity)}`}>
                {item.itemRarity}
              </Badge>
              <span className="text-[10px] font-mono text-muted-foreground">
                ${formatValue(item.itemValue)}
              </span>
            </div>
            {item.serialNumber !== null && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Hash className="w-3 h-3" />
                <span>#{item.serialNumber}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="modal-trade">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5" />
            Trade with {targetUser?.username}
          </DialogTitle>
          <DialogDescription>
            Offer items and cash in exchange for their items. Both parties must agree to complete the trade.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="offer" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="offer" data-testid="tab-your-offer">
              Your Offer ({selectedOffer.length}/7)
            </TabsTrigger>
            <TabsTrigger value="request" data-testid="tab-your-request">
              Your Request ({selectedRequest.length}/7)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="offer" className="flex-1 flex flex-col overflow-hidden space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Your Items ({selectedOffer.length}/7)</Label>
              <div className="flex gap-2 flex-wrap min-h-[80px] p-2 border rounded-lg bg-muted/50">
                {selectedOffer.length === 0 ? (
                  <p className="text-sm text-muted-foreground m-auto">Select items from your inventory below</p>
                ) : (
                  selectedOffer.map(item => (
                    <div key={item.inventoryId} className="relative group">
                      <img
                        src={item.itemImageUrl}
                        alt={item.itemName}
                        className="w-16 h-16 object-cover rounded-lg border-2"
                        style={{ borderColor: getRarityGlow(item.itemRarity) }}
                      />
                      {item.serialNumber !== null && (
                        <div className="absolute bottom-0 right-0 bg-black/75 text-white text-[10px] px-1 rounded-tl">
                          #{item.serialNumber}
                        </div>
                      )}
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeOfferItem(item.inventoryId)}
                        data-testid={`button-remove-offer-${item.inventoryId}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cash Offer (Optional, Max: $50,000)</Label>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={0}
                  max={50000}
                  value={offerCash}
                  onChange={(e) => setOfferCash(Math.min(50000, Math.max(0, parseInt(e.target.value) || 0)))}
                  placeholder="0"
                  data-testid="input-offer-cash"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  / ${(user?.cash ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2 flex-1 flex flex-col overflow-hidden">
              <Label>Your Inventory</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search your items..."
                  value={mySearchTerm}
                  onChange={(e) => setMySearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-my-items"
                />
              </div>
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 pr-4">
                  {loading ? (
                    <p className="col-span-full text-center text-muted-foreground py-8">Loading...</p>
                  ) : filteredMyInventory.length === 0 ? (
                    <p className="col-span-full text-center text-muted-foreground py-8">No items found</p>
                  ) : (
                    filteredMyInventory.map(item =>
                      renderInventoryItem(
                        item,
                        true,
                        selectedOffer.some(i => i.inventoryId === item.inventoryId)
                      )
                    )
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="request" className="flex-1 flex flex-col overflow-hidden space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Items You Want ({selectedRequest.length}/7)</Label>
              <div className="flex gap-2 flex-wrap min-h-[80px] p-2 border rounded-lg bg-muted/50">
                {selectedRequest.length === 0 ? (
                  <p className="text-sm text-muted-foreground m-auto">Select items from their inventory below</p>
                ) : (
                  selectedRequest.map(item => (
                    <div key={item.inventoryId} className="relative group">
                      <img
                        src={item.itemImageUrl}
                        alt={item.itemName}
                        className="w-16 h-16 object-cover rounded-lg border-2"
                        style={{ borderColor: getRarityGlow(item.itemRarity) }}
                      />
                      {item.serialNumber !== null && (
                        <div className="absolute bottom-0 right-0 bg-black/75 text-white text-[10px] px-1 rounded-tl">
                          #{item.serialNumber}
                        </div>
                      )}
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeRequestItem(item.inventoryId)}
                        data-testid={`button-remove-request-${item.inventoryId}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cash Request (Optional, Max: $10,000)</Label>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  value={requestCash}
                  onChange={(e) => setRequestCash(Math.min(10000, Math.max(0, parseInt(e.target.value) || 0)))}
                  placeholder="0"
                  data-testid="input-request-cash"
                />
              </div>
            </div>

            <div className="space-y-2 flex-1 flex flex-col overflow-hidden">
              <Label>{targetUser?.username}'s Inventory</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search their items..."
                  value={theirSearchTerm}
                  onChange={(e) => setTheirSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-their-items"
                />
              </div>
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 pr-4">
                  {loading ? (
                    <p className="col-span-full text-center text-muted-foreground py-8">Loading...</p>
                  ) : filteredTheirInventory.length === 0 ? (
                    <p className="col-span-full text-center text-muted-foreground py-8">No items found</p>
                  ) : (
                    filteredTheirInventory.map(item =>
                      renderInventoryItem(
                        item,
                        false,
                        selectedRequest.some(i => i.inventoryId === item.inventoryId)
                      )
                    )
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between border-t pt-4 mt-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Total Offer: <span className="font-semibold text-foreground">${formatValue(totalOfferValue)}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Total Request: <span className="font-semibold text-foreground">${formatValue(totalRequestValue)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-trade">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitTrade}
              disabled={submitting || selectedOffer.length === 0 || selectedRequest.length === 0}
              data-testid="button-send-trade"
            >
              {submitting ? "Sending..." : "Send Trade Offer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
