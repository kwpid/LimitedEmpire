import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { User, Item, Trade, CreateTradeRequest } from "@shared/schema";
import { useState, useEffect, useMemo } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatValue, getRarityColor } from "@/lib/rarity";
import { Search, Plus, Minus, X, ArrowLeftRight, DollarSign, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TradeModalProps {
  targetUser: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counterTrade?: Trade | null;
}

interface InventoryItemWithDetails {
  inventoryItemId: string;
  itemId: string;
  itemName: string;
  itemImageUrl: string;
  itemValue: number;
  serialNumber: number | null;
  amount: number;
  maxAmount: number;
  nftLocked: boolean;
}

export function TradeModal({ targetUser, open, onOpenChange, counterTrade }: TradeModalProps) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [myInventory, setMyInventory] = useState<InventoryItemWithDetails[]>([]);
  const [theirInventory, setTheirInventory] = useState<InventoryItemWithDetails[]>([]);
  const [mySelectedItems, setMySelectedItems] = useState<Map<string, number>>(new Map());
  const [theirSelectedItems, setTheirSelectedItems] = useState<Map<string, number>>(new Map());
  const [myCash, setMyCash] = useState<number>(0);
  const [theirCash, setTheirCash] = useState<number>(0);
  const [mySearch, setMySearch] = useState("");
  const [theirSearch, setTheirSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !currentUser || !targetUser) {
      setMyInventory([]);
      setTheirInventory([]);
      setMySelectedItems(new Map());
      setTheirSelectedItems(new Map());
      setMyCash(0);
      setTheirCash(0);
      setMySearch("");
      setTheirSearch("");
      return;
    }

    const loadInventories = async () => {
      setLoading(true);
      try {
        const [currentUserDoc, targetUserDoc] = await Promise.all([
          getDoc(doc(db, "users", currentUser.uid)),
          getDoc(doc(db, "users", targetUser.id))
        ]);

        if (currentUserDoc.exists() && targetUserDoc.exists()) {
          const currentUserData = currentUserDoc.data() as User;
          const targetUserData = targetUserDoc.data() as User;

          const loadInventory = async (userInventory: User['inventory']) => {
            const itemIds = Array.from(new Set(userInventory.map(inv => inv.itemId)));
            const itemDocs = await Promise.all(
              itemIds.map(id => getDoc(doc(db, "items", id)))
            );

            const itemsMap = new Map<string, Item>();
            itemDocs.forEach((itemDoc) => {
              if (itemDoc.exists()) {
                itemsMap.set(itemDoc.id, { id: itemDoc.id, ...itemDoc.data() } as Item);
              }
            });

            return userInventory.map((invItem) => {
              const item = itemsMap.get(invItem.itemId);
              if (!item) return null;

              return {
                inventoryItemId: invItem.id,
                itemId: item.id,
                itemName: item.name,
                itemImageUrl: item.imageUrl,
                itemValue: item.value,
                serialNumber: invItem.serialNumber,
                amount: 0,
                maxAmount: invItem.amount || 1,
                nftLocked: invItem.nftLocked || false,
              };
            }).filter((item): item is InventoryItemWithDetails => item !== null);
          };

          const [myInv, theirInv] = await Promise.all([
            loadInventory(currentUserData.inventory || []),
            loadInventory(targetUserData.inventory || [])
          ]);

          setMyInventory(myInv.sort((a, b) => b.itemValue - a.itemValue));
          setTheirInventory(theirInv.sort((a, b) => b.itemValue - a.itemValue));

          if (counterTrade) {
            const mySelected = new Map<string, number>();
            counterTrade.receiverItems.forEach(item => {
              mySelected.set(item.inventoryItemId, item.amount);
            });
            setMySelectedItems(mySelected);

            const theirSelected = new Map<string, number>();
            counterTrade.senderItems.forEach(item => {
              theirSelected.set(item.inventoryItemId, item.amount);
            });
            setTheirSelectedItems(theirSelected);

            setMyCash(counterTrade.receiverCash);
            setTheirCash(counterTrade.senderCash);
          }
        }
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

    loadInventories();
  }, [open, currentUser, targetUser, counterTrade, toast]);

  const createTradeMutation = useMutation({
    mutationFn: async (data: CreateTradeRequest) => {
      return apiRequest({
        url: "/api/trades",
        method: "POST",
        data,
      });
    },
    onSuccess: () => {
      toast({
        title: "Trade Sent",
        description: `Your trade has been sent to ${targetUser?.username}!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSelectItem = (inventoryItemId: string, isMine: boolean, amount: number) => {
    const items = isMine ? myInventory : theirInventory;
    const selected = isMine ? mySelectedItems : theirSelectedItems;
    const setSelected = isMine ? setMySelectedItems : setTheirSelectedItems;

    const item = items.find(i => i.inventoryItemId === inventoryItemId);
    if (!item) return;

    const newSelected = new Map(selected);
    if (amount > 0 && amount <= item.maxAmount) {
      newSelected.set(inventoryItemId, amount);
    } else {
      newSelected.delete(inventoryItemId);
    }

    setSelected(newSelected);
  };

  const mySelectedCount = mySelectedItems.size;
  const theirSelectedCount = theirSelectedItems.size;

  const canSendTrade = mySelectedCount >= 1 && mySelectedCount <= 7 &&
                       theirSelectedCount >= 1 && theirSelectedCount <= 7 &&
                       myCash >= 0 && myCash <= 50000 &&
                       theirCash >= 0 && theirCash <= 10000 &&
                       (currentUser?.cash || 0) >= myCash;

  const handleSendTrade = () => {
    if (!targetUser || !currentUser || !canSendTrade) return;

    const senderItems = Array.from(mySelectedItems.entries()).map(([inventoryItemId, amount]) => ({
      inventoryItemId,
      amount,
    }));

    const receiverItems = Array.from(theirSelectedItems.entries()).map(([inventoryItemId, amount]) => ({
      inventoryItemId,
      amount,
    }));

    createTradeMutation.mutate({
      receiverId: targetUser.id,
      senderItems,
      receiverItems,
      senderCash: myCash,
      receiverCash: theirCash,
    });
  };

  const filteredMyInventory = useMemo(() => {
    return myInventory.filter(item =>
      item.itemName.toLowerCase().includes(mySearch.toLowerCase())
    );
  }, [myInventory, mySearch]);

  const filteredTheirInventory = useMemo(() => {
    return theirInventory.filter(item =>
      item.itemName.toLowerCase().includes(theirSearch.toLowerCase())
    );
  }, [theirInventory, theirSearch]);

  const mySelectedValue = useMemo(() => {
    return Array.from(mySelectedItems.entries()).reduce((total, [invItemId, amount]) => {
      const item = myInventory.find(i => i.inventoryItemId === invItemId);
      return total + (item ? item.itemValue * amount : 0);
    }, 0) + myCash;
  }, [mySelectedItems, myInventory, myCash]);

  const theirSelectedValue = useMemo(() => {
    return Array.from(theirSelectedItems.entries()).reduce((total, [invItemId, amount]) => {
      const item = theirInventory.find(i => i.inventoryItemId === invItemId);
      return total + (item ? item.itemValue * amount : 0);
    }, 0) + theirCash;
  }, [theirSelectedItems, theirInventory, theirCash]);

  const renderInventoryItem = (item: InventoryItemWithDetails, isMine: boolean) => {
    const selected = isMine ? mySelectedItems : theirSelectedItems;
    const selectedAmount = selected.get(item.inventoryItemId) || 0;
    const isSelected = selectedAmount > 0;

    return (
      <Card
        key={item.inventoryItemId}
        className={`p-2 cursor-pointer transition-all ${
          isSelected ? "ring-2 ring-primary" : ""
        } ${item.nftLocked ? "opacity-50" : ""}`}
        onClick={() => {
          if (item.nftLocked) return;
          if (!isSelected) {
            handleSelectItem(item.inventoryItemId, isMine, 1);
          }
        }}
        data-testid={`trade-item-${item.inventoryItemId}`}
      >
        <div className="flex items-center gap-2">
          <img
            src={item.itemImageUrl}
            alt={item.itemName}
            className="w-12 h-12 object-cover rounded"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.itemName}</p>
            <p className="text-xs text-muted-foreground">{formatValue(item.itemValue)}</p>
            {item.serialNumber !== null && (
              <p className="text-xs text-muted-foreground">Serial #{item.serialNumber}</p>
            )}
            {item.maxAmount > 1 && (
              <p className="text-xs text-muted-foreground">x{item.maxAmount} available</p>
            )}
          </div>
          {item.nftLocked && (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
          {isSelected && !item.nftLocked && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0"
                onClick={() => handleSelectItem(item.inventoryItemId, isMine, Math.max(0, selectedAmount - 1))}
                data-testid={`trade-decrease-${item.inventoryItemId}`}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="text-sm font-medium w-6 text-center">{selectedAmount}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0"
                onClick={() => handleSelectItem(item.inventoryItemId, isMine, Math.min(item.maxAmount, selectedAmount + 1))}
                disabled={selectedAmount >= item.maxAmount}
                data-testid={`trade-increase-${item.inventoryItemId}`}
              >
                <Plus className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-6 w-6 p-0"
                onClick={() => handleSelectItem(item.inventoryItemId, isMine, 0)}
                data-testid={`trade-remove-${item.inventoryItemId}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {counterTrade ? "Counter Trade" : "Send Trade"} with {targetUser?.username}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Your Offer ({mySelectedCount}/7)</h3>
              <Badge variant={mySelectedCount > 7 ? "destructive" : "secondary"}>
                {formatValue(mySelectedValue)}
              </Badge>
            </div>

            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search your items..."
                value={mySearch}
                onChange={(e) => setMySearch(e.target.value)}
                className="pl-8"
                data-testid="trade-search-my-items"
              />
            </div>

            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <Input
                type="number"
                placeholder="Cash to offer (max 50,000)"
                value={myCash || ""}
                onChange={(e) => setMyCash(Math.min(50000, Math.max(0, parseInt(e.target.value) || 0)))}
                min={0}
                max={50000}
                data-testid="trade-my-cash"
              />
            </div>
            {myCash > (currentUser?.cash || 0) && (
              <p className="text-xs text-destructive">Insufficient cash</p>
            )}

            <ScrollArea className="flex-1 h-[400px]">
              <div className="space-y-2 pr-4">
                {loading ? (
                  <p className="text-center text-muted-foreground py-4">Loading...</p>
                ) : filteredMyInventory.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No items found</p>
                ) : (
                  filteredMyInventory.map(item => renderInventoryItem(item, true))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">You Request ({theirSelectedCount}/7)</h3>
              <Badge variant={theirSelectedCount > 7 ? "destructive" : "secondary"}>
                {formatValue(theirSelectedValue)}
              </Badge>
            </div>

            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search their items..."
                value={theirSearch}
                onChange={(e) => setTheirSearch(e.target.value)}
                className="pl-8"
                data-testid="trade-search-their-items"
              />
            </div>

            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <Input
                type="number"
                placeholder="Cash to request (max 10,000)"
                value={theirCash || ""}
                onChange={(e) => setTheirCash(Math.min(10000, Math.max(0, parseInt(e.target.value) || 0)))}
                min={0}
                max={10000}
                data-testid="trade-their-cash"
              />
            </div>

            <ScrollArea className="flex-1 h-[400px]">
              <div className="space-y-2 pr-4">
                {loading ? (
                  <p className="text-center text-muted-foreground py-4">Loading...</p>
                ) : filteredTheirInventory.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No items found</p>
                ) : (
                  filteredTheirInventory.map(item => renderInventoryItem(item, false))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              Trade Value Difference: {formatValue(Math.abs(mySelectedValue - theirSelectedValue))}
              {mySelectedValue > theirSelectedValue && " (You're offering more)"}
              {theirSelectedValue > mySelectedValue && " (You're requesting more)"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="trade-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendTrade}
                disabled={!canSendTrade || createTradeMutation.isPending}
                data-testid="trade-send"
              >
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                {counterTrade ? "Send Counter-Offer" : "Send Trade"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
