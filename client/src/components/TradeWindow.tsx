import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ArrowRight, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type User, type Item, type TradeItem } from "@shared/schema";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface TradeWindowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: User;
  onTradeSent?: () => void;
}

interface InventoryItemDisplay extends Item {
  inventoryItemId: string;
  serialNumber: number | null;
  nftLocked?: boolean;
}

export function TradeWindow({ open, onOpenChange, targetUser, onTradeSent }: TradeWindowProps) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  
  const [myInventory, setMyInventory] = useState<InventoryItemDisplay[]>([]);
  const [theirInventory, setTheirInventory] = useState<InventoryItemDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [mySearch, setMySearch] = useState("");
  const [theirSearch, setTheirSearch] = useState("");
  
  const [selectedMyItems, setSelectedMyItems] = useState<Set<string>>(new Set());
  const [selectedTheirItems, setSelectedTheirItems] = useState<Set<string>>(new Set());
  
  const [myCash, setMyCash] = useState(0);
  const [theirCash, setTheirCash] = useState(0);
  
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  
  useEffect(() => {
    if (!open || !currentUser || !targetUser) {
      setMyInventory([]);
      setTheirInventory([]);
      setSelectedMyItems(new Set());
      setSelectedTheirItems(new Set());
      setMyCash(0);
      setTheirCash(0);
      setMessage("");
      return;
    }
    
    const loadInventories = async () => {
      setLoading(true);
      try {
        const myItemsMap = new Map<string, InventoryItemDisplay[]>();
        const theirItemsMap = new Map<string, InventoryItemDisplay[]>();
        
        const myItemIds = new Set(currentUser.inventory.map(inv => inv.itemId));
        const theirItemIds = new Set(targetUser.inventory.map(inv => inv.itemId));
        
        const allItemIds = new Set([...myItemIds, ...theirItemIds]);
        
        const itemDocs = await Promise.all(
          Array.from(allItemIds).map(itemId => getDoc(doc(db, "items", itemId)))
        );
        
        const itemsData = new Map<string, Item>();
        itemDocs.forEach(itemDoc => {
          if (itemDoc.exists()) {
            itemsData.set(itemDoc.id, { id: itemDoc.id, ...itemDoc.data() } as Item);
          }
        });
        
        const myItems: InventoryItemDisplay[] = [];
        for (const invItem of currentUser.inventory) {
          const item = itemsData.get(invItem.itemId);
          if (item) {
            myItems.push({
              ...item,
              inventoryItemId: invItem.id,
              serialNumber: invItem.serialNumber,
              nftLocked: invItem.nftLocked,
            });
          }
        }
        
        const theirItems: InventoryItemDisplay[] = [];
        for (const invItem of targetUser.inventory) {
          const item = itemsData.get(invItem.itemId);
          if (item) {
            theirItems.push({
              ...item,
              inventoryItemId: invItem.id,
              serialNumber: invItem.serialNumber,
              nftLocked: invItem.nftLocked,
            });
          }
        }
        
        myItems.sort((a, b) => b.value - a.value);
        theirItems.sort((a, b) => b.value - a.value);
        
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
    
    loadInventories();
  }, [open, currentUser, targetUser]);
  
  const filteredMyInventory = useMemo(() => {
    if (!mySearch) return myInventory;
    const search = mySearch.toLowerCase();
    return myInventory.filter(item => item.name.toLowerCase().includes(search));
  }, [myInventory, mySearch]);
  
  const filteredTheirInventory = useMemo(() => {
    if (!theirSearch) return theirInventory;
    const search = theirSearch.toLowerCase();
    return theirInventory.filter(item => item.name.toLowerCase().includes(search));
  }, [theirInventory, theirSearch]);
  
  const toggleMyItem = (inventoryItemId: string) => {
    const newSet = new Set(selectedMyItems);
    if (newSet.has(inventoryItemId)) {
      newSet.delete(inventoryItemId);
    } else {
      if (newSet.size >= 7) {
        toast({
          title: "Maximum items reached",
          description: "You can only offer up to 7 items",
          variant: "destructive",
        });
        return;
      }
      newSet.add(inventoryItemId);
    }
    setSelectedMyItems(newSet);
  };
  
  const toggleTheirItem = (inventoryItemId: string) => {
    const newSet = new Set(selectedTheirItems);
    if (newSet.has(inventoryItemId)) {
      newSet.delete(inventoryItemId);
    } else {
      if (newSet.size >= 7) {
        toast({
          title: "Maximum items reached",
          description: "You can only request up to 7 items",
          variant: "destructive",
        });
        return;
      }
      newSet.add(inventoryItemId);
    }
    setSelectedTheirItems(newSet);
  };
  
  const myOfferValue = useMemo(() => {
    let total = myCash;
    selectedMyItems.forEach(id => {
      const item = myInventory.find(i => i.inventoryItemId === id);
      if (item) total += item.value;
    });
    return total;
  }, [selectedMyItems, myCash, myInventory]);
  
  const theirOfferValue = useMemo(() => {
    let total = theirCash;
    selectedTheirItems.forEach(id => {
      const item = theirInventory.find(i => i.inventoryItemId === id);
      if (item) total += item.value;
    });
    return total;
  }, [selectedTheirItems, theirCash, theirInventory]);
  
  const handleSendTrade = async () => {
    if (!currentUser) return;
    
    if (selectedMyItems.size === 0 && selectedTheirItems.size === 0 && myCash === 0 && theirCash === 0) {
      toast({
        title: "Invalid trade",
        description: "Trade must include at least one item or cash",
        variant: "destructive",
      });
      return;
    }
    
    if (selectedMyItems.size === 0 && myCash === 0) {
      toast({
        title: "Invalid trade",
        description: "You must offer at least one item or cash",
        variant: "destructive",
      });
      return;
    }
    
    if (selectedTheirItems.size === 0 && theirCash === 0) {
      toast({
        title: "Invalid trade",
        description: "You must request at least one item or cash",
        variant: "destructive",
      });
      return;
    }
    
    if (myCash > currentUser.cash) {
      toast({
        title: "Insufficient cash",
        description: "You don't have enough cash",
        variant: "destructive",
      });
      return;
    }
    
    setSending(true);
    try {
      const initiatorItems: TradeItem[] = Array.from(selectedMyItems).map(id => {
        const item = myInventory.find(i => i.inventoryItemId === id)!;
        return {
          inventoryItemId: item.inventoryItemId,
          itemId: item.id,
          itemName: item.name,
          itemImageUrl: item.imageUrl,
          itemValue: item.value,
          serialNumber: item.serialNumber,
          nftLocked: item.nftLocked || false,
        };
      });
      
      const recipientItems: TradeItem[] = Array.from(selectedTheirItems).map(id => {
        const item = theirInventory.find(i => i.inventoryItemId === id)!;
        return {
          inventoryItemId: item.inventoryItemId,
          itemId: item.id,
          itemName: item.name,
          itemImageUrl: item.imageUrl,
          itemValue: item.value,
          serialNumber: item.serialNumber,
          nftLocked: item.nftLocked || false,
        };
      });
      
      await apiRequest({
        url: "/api/trades",
        method: "POST",
        data: {
          recipientId: targetUser.id,
          initiatorOffer: {
            items: initiatorItems,
            cash: myCash,
          },
          recipientOffer: {
            items: recipientItems,
            cash: theirCash,
          },
          message,
        },
      });
      
      toast({
        title: "Trade sent!",
        description: `Trade request sent to ${targetUser.username}`,
      });
      
      onOpenChange(false);
      onTradeSent?.();
    } catch (error: any) {
      console.error("Error sending trade:", error);
      toast({
        title: "Failed to send trade",
        description: error.response?.data?.error || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };
  
  const formatCash = (value: number) => {
    return value.toLocaleString();
  };
  
  if (!currentUser) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] bg-white dark:bg-gray-900 text-black dark:text-white">
        <DialogHeader>
          <DialogTitle className="text-black dark:text-white">Trade with {targetUser.username}</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-600 dark:text-gray-400">
            Loading inventories...
          </div>
        ) : (
          <div className="flex flex-col gap-4 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-black dark:text-white">Your Offer</h3>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Value: {formatCash(myOfferValue)}
                  </span>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <Input
                    placeholder="Search your items..."
                    value={mySearch}
                    onChange={(e) => setMySearch(e.target.value)}
                    className="pl-10 bg-white dark:bg-gray-800 text-black dark:text-white border-gray-300 dark:border-gray-700"
                    data-testid="input-my-search"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Cash to offer"
                    value={myCash || ""}
                    onChange={(e) => setMyCash(Math.min(50000, Math.max(0, parseInt(e.target.value) || 0)))}
                    max={Math.min(50000, currentUser.cash)}
                    className="bg-white dark:bg-gray-800 text-black dark:text-white border-gray-300 dark:border-gray-700"
                    data-testid="input-my-cash"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    Max: {formatCash(Math.min(50000, currentUser.cash))}
                  </span>
                </div>
                
                <ScrollArea className="flex-1 border border-gray-300 dark:border-gray-700 rounded-md p-2 bg-gray-50 dark:bg-gray-800">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {filteredMyInventory.map((item) => {
                      const isSelected = selectedMyItems.has(item.inventoryItemId);
                      const isNftLocked = item.nftLocked;
                      return (
                        <Card
                          key={item.inventoryItemId}
                          className={`cursor-pointer transition-all ${
                            isSelected
                              ? "ring-2 ring-blue-500 dark:ring-blue-400"
                              : isNftLocked
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:ring-2 hover:ring-gray-400 dark:hover:ring-gray-600"
                          } bg-white dark:bg-gray-800`}
                          onClick={() => !isNftLocked && toggleMyItem(item.inventoryItemId)}
                          data-testid={`card-my-item-${item.inventoryItemId}`}
                        >
                          <div className="p-2">
                            <img src={item.imageUrl} alt={item.name} className="w-full aspect-square object-cover rounded mb-1" />
                            <p className="text-xs font-semibold truncate text-black dark:text-white">{item.name}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{formatCash(item.value)}</p>
                            {item.serialNumber !== null && (
                              <p className="text-xs text-blue-600 dark:text-blue-400">#{item.serialNumber}</p>
                            )}
                            {isNftLocked && (
                              <p className="text-xs text-red-600 dark:text-red-400">NFT Locked</p>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
                
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Selected: {selectedMyItems.size}/7 items
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-black dark:text-white">Your Request</h3>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Value: {formatCash(theirOfferValue)}
                  </span>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <Input
                    placeholder="Search their items..."
                    value={theirSearch}
                    onChange={(e) => setTheirSearch(e.target.value)}
                    className="pl-10 bg-white dark:bg-gray-800 text-black dark:text-white border-gray-300 dark:border-gray-700"
                    data-testid="input-their-search"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Cash to request"
                    value={theirCash || ""}
                    onChange={(e) => setTheirCash(Math.min(50000, Math.max(0, parseInt(e.target.value) || 0)))}
                    max={50000}
                    className="bg-white dark:bg-gray-800 text-black dark:text-white border-gray-300 dark:border-gray-700"
                    data-testid="input-their-cash"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    Max: 50,000
                  </span>
                </div>
                
                <ScrollArea className="flex-1 border border-gray-300 dark:border-gray-700 rounded-md p-2 bg-gray-50 dark:bg-gray-800">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {filteredTheirInventory.map((item) => {
                      const isSelected = selectedTheirItems.has(item.inventoryItemId);
                      const isNftLocked = item.nftLocked;
                      return (
                        <Card
                          key={item.inventoryItemId}
                          className={`cursor-pointer transition-all ${
                            isSelected
                              ? "ring-2 ring-green-500 dark:ring-green-400"
                              : isNftLocked
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:ring-2 hover:ring-gray-400 dark:hover:ring-gray-600"
                          } bg-white dark:bg-gray-800`}
                          onClick={() => !isNftLocked && toggleTheirItem(item.inventoryItemId)}
                          data-testid={`card-their-item-${item.inventoryItemId}`}
                        >
                          <div className="p-2">
                            <img src={item.imageUrl} alt={item.name} className="w-full aspect-square object-cover rounded mb-1" />
                            <p className="text-xs font-semibold truncate text-black dark:text-white">{item.name}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{formatCash(item.value)}</p>
                            {item.serialNumber !== null && (
                              <p className="text-xs text-blue-600 dark:text-blue-400">#{item.serialNumber}</p>
                            )}
                            {isNftLocked && (
                              <p className="text-xs text-red-600 dark:text-red-400">NFT Locked</p>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
                
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Selected: {selectedTheirItems.size}/7 items
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Textarea
                placeholder="Optional message (max 200 characters)"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                maxLength={200}
                className="resize-none bg-white dark:bg-gray-800 text-black dark:text-white border-gray-300 dark:border-gray-700"
                data-testid="input-message"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                {message.length}/200
              </div>
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Trade expires in 7 days
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="border-gray-300 dark:border-gray-700 text-black dark:text-white"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendTrade}
                  disabled={sending}
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
                  data-testid="button-send-trade"
                >
                  {sending ? "Sending..." : "Send Trade"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
