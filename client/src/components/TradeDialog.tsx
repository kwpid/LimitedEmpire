import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeftRight, Search, DollarSign, Lock, Plus, X, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User, Item, TradeItem } from "@shared/schema";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { RARITY_TIERS, getRarityFromValue } from "@shared/schema";

interface TradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipient: User | null;
}

interface InventoryItemWithDetails {
  inventoryId: string;
  itemId: string;
  item: Item;
  serialNumber: number | null;
  nftLocked: boolean;
}

export function TradeDialog({ open, onOpenChange, recipient }: TradeDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [myInventory, setMyInventory] = useState<InventoryItemWithDetails[]>([]);
  const [theirInventory, setTheirInventory] = useState<InventoryItemWithDetails[]>([]);
  const [loading, setLoading] = useState(false);

  const [myOffer, setMyOffer] = useState<TradeItem[]>([]);
  const [theirOffer, setTheirOffer] = useState<TradeItem[]>([]);
  const [myCash, setMyCash] = useState(0);
  const [theirCash, setTheirCash] = useState(0);
  const [message, setMessage] = useState("");

  const [mySearch, setMySearch] = useState("");
  const [theirSearch, setTheirSearch] = useState("");

  useEffect(() => {
    if (open && user && recipient) {
      loadInventories();
    }
  }, [open, user, recipient]);

  const loadInventories = async () => {
    if (!user || !recipient) return;
    
    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, "users", user.id));
      const recipientDoc = await getDoc(doc(db, "users", recipient.id));

      if (!userDoc.exists() || !recipientDoc.exists()) {
        throw new Error("User not found");
      }

      const userData = { id: userDoc.id, ...userDoc.data() } as User;
      const recipientData = { id: recipientDoc.id, ...recipientDoc.data() } as User;

      const itemsSnapshot = await getDocs(collection(db, "items"));
      const itemsMap = new Map<string, Item>();
      itemsSnapshot.forEach((doc) => {
        itemsMap.set(doc.id, { id: doc.id, ...doc.data() } as Item);
      });

      const myInv: InventoryItemWithDetails[] = (userData.inventory || [])
        .map(inv => {
          const item = itemsMap.get(inv.itemId);
          if (!item) return null;
          return {
            inventoryId: inv.id,
            itemId: inv.itemId,
            item,
            serialNumber: inv.serialNumber,
            nftLocked: inv.nftLocked || false,
          };
        })
        .filter((inv): inv is InventoryItemWithDetails => inv !== null);

      const theirInv: InventoryItemWithDetails[] = (recipientData.inventory || [])
        .map(inv => {
          const item = itemsMap.get(inv.itemId);
          if (!item) return null;
          return {
            inventoryId: inv.id,
            itemId: inv.itemId,
            item,
            serialNumber: inv.serialNumber,
            nftLocked: inv.nftLocked || false,
          };
        })
        .filter((inv): inv is InventoryItemWithDetails => inv !== null);

      setMyInventory(myInv);
      setTheirInventory(theirInv);
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

  const createTradeMutation = useMutation({
    mutationFn: async () => {
      if (!user || !recipient) throw new Error("User or recipient not found");
      if (myOffer.length === 0) throw new Error("You must offer at least 1 item");
      if (theirOffer.length === 0) throw new Error("You must request at least 1 item");

      return await apiRequest("POST", "/api/trades", {
        initiatorId: user.id,
        initiatorUsername: user.username,
        recipientId: recipient.id,
        recipientUsername: recipient.username,
        initiatorOffer: {
          items: myOffer,
          cash: myCash,
        },
        recipientOffer: {
          items: theirOffer,
          cash: theirCash,
        },
        message,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      toast({
        title: "Trade sent!",
        description: `Your trade offer has been sent to ${recipient?.username}`,
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Trade failed",
        description: error.message || "Failed to create trade",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setMyOffer([]);
    setTheirOffer([]);
    setMyCash(0);
    setTheirCash(0);
    setMessage("");
    setMySearch("");
    setTheirSearch("");
    onOpenChange(false);
  };

  const addToMyOffer = (inv: InventoryItemWithDetails) => {
    if (inv.nftLocked) {
      toast({
        title: "Item locked",
        description: "This item is marked as Not For Trade",
        variant: "destructive",
      });
      return;
    }
    if (myOffer.length >= 7) {
      toast({
        title: "Limit reached",
        description: "You can only offer up to 7 items",
        variant: "destructive",
      });
      return;
    }
    if (myOffer.some(item => item.inventoryItemId === inv.inventoryId)) {
      toast({
        title: "Already added",
        description: "This item is already in your offer",
        variant: "destructive",
      });
      return;
    }

    setMyOffer([...myOffer, {
      inventoryItemId: inv.inventoryId,
      itemId: inv.itemId,
      itemName: inv.item.name,
      itemImageUrl: inv.item.imageUrl,
      serialNumber: inv.serialNumber,
      valueAtOffer: inv.item.value,
    }]);
  };

  const addToTheirOffer = (inv: InventoryItemWithDetails) => {
    if (theirOffer.length >= 7) {
      toast({
        title: "Limit reached",
        description: "You can only request up to 7 items",
        variant: "destructive",
      });
      return;
    }
    if (theirOffer.some(item => item.inventoryItemId === inv.inventoryId)) {
      toast({
        title: "Already added",
        description: "This item is already in your request",
        variant: "destructive",
      });
      return;
    }

    setTheirOffer([...theirOffer, {
      inventoryItemId: inv.inventoryId,
      itemId: inv.itemId,
      itemName: inv.item.name,
      itemImageUrl: inv.item.imageUrl,
      serialNumber: inv.serialNumber,
      valueAtOffer: inv.item.value,
    }]);
  };

  const removeFromMyOffer = (inventoryId: string) => {
    setMyOffer(myOffer.filter(item => item.inventoryItemId !== inventoryId));
  };

  const removeFromTheirOffer = (inventoryId: string) => {
    setTheirOffer(theirOffer.filter(item => item.inventoryItemId !== inventoryId));
  };

  const filteredMyInventory = myInventory.filter(inv =>
    inv.item.name.toLowerCase().includes(mySearch.toLowerCase())
  );

  const filteredTheirInventory = theirInventory.filter(inv =>
    inv.item.name.toLowerCase().includes(theirSearch.toLowerCase())
  );

  const getTotalValue = (items: TradeItem[]) => {
    return items.reduce((sum, item) => sum + item.valueAtOffer, 0);
  };

  const myOfferValue = getTotalValue(myOffer) + myCash;
  const theirOfferValue = getTotalValue(theirOffer) + theirCash;

  if (!recipient) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5" />
            Trade with {recipient.username}
          </DialogTitle>
          <DialogDescription>
            Select items to offer and request. Both sides must include at least 1 item.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Your Offer ({myOffer.length}/7)</h3>
                <div className="min-h-[200px] border rounded-lg p-2 space-y-2 bg-muted/20">
                  {myOffer.map((item) => (
                    <div key={item.inventoryItemId} className="flex items-center gap-2 p-2 bg-background rounded" data-testid={`my-offer-item-${item.inventoryItemId}`}>
                      <img src={item.itemImageUrl} alt={item.itemName} className="w-10 h-10 rounded object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.itemName}</p>
                        <p className="text-xs text-muted-foreground">
                          ${item.valueAtOffer.toLocaleString()}
                          {item.serialNumber !== null && ` • #${item.serialNumber}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromMyOffer(item.inventoryItemId)}
                        data-testid={`button-remove-my-${item.inventoryItemId}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {myOffer.length === 0 && (
                    <p className="text-center text-muted-foreground text-sm py-8">
                      No items selected
                    </p>
                  )}
                </div>
                <div className="mt-2">
                  <Label>Add Cash (Optional, Max: 50,000)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min="0"
                      max="50000"
                      value={myCash}
                      onChange={(e) => setMyCash(Math.min(50000, Math.max(0, parseInt(e.target.value) || 0)))}
                      placeholder="0"
                      data-testid="input-my-cash"
                    />
                  </div>
                </div>
                <p className="text-sm font-medium mt-2">
                  Total Value: ${myOfferValue.toLocaleString()}
                </p>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">Your Inventory</h3>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search your inventory..."
                    value={mySearch}
                    onChange={(e) => setMySearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-my-inventory"
                  />
                </div>
                <ScrollArea className="h-[300px] border rounded-lg p-2">
                  <div className="grid grid-cols-2 gap-2">
                    {filteredMyInventory.map((inv) => (
                      <div
                        key={inv.inventoryId}
                        className={`relative cursor-pointer border rounded-lg p-2 hover:bg-muted/50 transition ${
                          inv.nftLocked ? "opacity-50" : ""
                        }`}
                        onClick={() => addToMyOffer(inv)}
                        data-testid={`inventory-item-${inv.inventoryId}`}
                      >
                        <img src={inv.item.imageUrl} alt={inv.item.name} className="w-full aspect-square object-cover rounded mb-1" />
                        {inv.nftLocked && (
                          <div className="absolute top-1 right-1">
                            <Lock className="w-4 h-4 text-destructive" />
                          </div>
                        )}
                        <p className="text-xs font-medium truncate">{inv.item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          ${inv.item.value.toLocaleString()}
                          {inv.serialNumber !== null && ` • #${inv.serialNumber}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Your Request ({theirOffer.length}/7)</h3>
                <div className="min-h-[200px] border rounded-lg p-2 space-y-2 bg-muted/20">
                  {theirOffer.map((item) => (
                    <div key={item.inventoryItemId} className="flex items-center gap-2 p-2 bg-background rounded" data-testid={`their-offer-item-${item.inventoryItemId}`}>
                      <img src={item.itemImageUrl} alt={item.itemName} className="w-10 h-10 rounded object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.itemName}</p>
                        <p className="text-xs text-muted-foreground">
                          ${item.valueAtOffer.toLocaleString()}
                          {item.serialNumber !== null && ` • #${item.serialNumber}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromTheirOffer(item.inventoryItemId)}
                        data-testid={`button-remove-their-${item.inventoryItemId}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {theirOffer.length === 0 && (
                    <p className="text-center text-muted-foreground text-sm py-8">
                      No items selected
                    </p>
                  )}
                </div>
                <div className="mt-2">
                  <Label>Request Cash (Optional, Max: 50,000)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min="0"
                      max="50000"
                      value={theirCash}
                      onChange={(e) => setTheirCash(Math.min(50000, Math.max(0, parseInt(e.target.value) || 0)))}
                      placeholder="0"
                      data-testid="input-their-cash"
                    />
                  </div>
                </div>
                <p className="text-sm font-medium mt-2">
                  Total Value: ${theirOfferValue.toLocaleString()}
                </p>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2">{recipient.username}'s Inventory</h3>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search their inventory..."
                    value={theirSearch}
                    onChange={(e) => setTheirSearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-their-inventory"
                  />
                </div>
                <ScrollArea className="h-[300px] border rounded-lg p-2">
                  <div className="grid grid-cols-2 gap-2">
                    {filteredTheirInventory.map((inv) => (
                      <div
                        key={inv.inventoryId}
                        className="cursor-pointer border rounded-lg p-2 hover:bg-muted/50 transition"
                        onClick={() => addToTheirOffer(inv)}
                        data-testid={`their-inventory-item-${inv.inventoryId}`}
                      >
                        <img src={inv.item.imageUrl} alt={inv.item.name} className="w-full aspect-square object-cover rounded mb-1" />
                        <p className="text-xs font-medium truncate">{inv.item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          ${inv.item.value.toLocaleString()}
                          {inv.serialNumber !== null && ` • #${inv.serialNumber}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Label>Message (Optional)</Label>
            <Textarea
              placeholder="Add a message to your trade offer..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              className="mt-1"
              data-testid="input-trade-message"
            />
            <p className="text-xs text-muted-foreground mt-1">{message.length}/200</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-trade">
            Cancel
          </Button>
          <Button
            onClick={() => createTradeMutation.mutate()}
            disabled={createTradeMutation.isPending || myOffer.length === 0 || theirOffer.length === 0}
            data-testid="button-send-trade"
          >
            <Send className="w-4 h-4 mr-2" />
            Send Trade Offer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
