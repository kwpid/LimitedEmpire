import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { collection, getDocs, query, where, runTransaction, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Item, User } from "@shared/schema";
import { Gift } from "lucide-react";

interface AdminGiveItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: User | null;
  onSuccess?: () => void;
}

interface OwnerInfo {
  username: string;
  userId: number;
  serialNumber: number;
  userDocId: string;
}

export function AdminGiveItemsDialog({ open, onOpenChange, targetUser, onSuccess }: AdminGiveItemsDialogProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [giveMode, setGiveMode] = useState<"create" | "pick">("create");
  const [quantity, setQuantity] = useState(1);
  const [selectedSerial, setSelectedSerial] = useState<string>("");
  const [owners, setOwners] = useState<OwnerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOwners, setLoadingOwners] = useState(false);

  useEffect(() => {
    if (open) {
      loadItems();
      setSelectedItemId("");
      setSelectedItem(null);
      setQuantity(1);
      setSelectedSerial("");
      setGiveMode("create");
    }
  }, [open]);

  useEffect(() => {
    if (selectedItemId) {
      const item = items.find(i => i.id === selectedItemId);
      setSelectedItem(item || null);
      if (item?.stockType === "limited") {
        loadOwners(item);
      }
    } else {
      setSelectedItem(null);
      setOwners([]);
    }
  }, [selectedItemId, items]);

  const loadItems = async () => {
    try {
      const itemsSnapshot = await getDocs(collection(db, "items"));
      const itemsList: Item[] = [];
      itemsSnapshot.forEach((doc) => {
        itemsList.push({ id: doc.id, ...doc.data() } as Item);
      });
      setItems(itemsList.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("Error loading items:", error);
      toast({
        title: "Failed to load items",
        description: "Could not load items list",
        variant: "destructive",
      });
    }
  };

  const loadOwners = async (item: Item) => {
    if (item.stockType !== "limited") return;
    
    setLoadingOwners(true);
    try {
      const usersSnapshot = await getDocs(collection(db, "users"));
      const ownersList: OwnerInfo[] = [];

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const inventory = userData.inventory || [];
        
        for (const invItem of inventory) {
          if (invItem.itemId === item.id && invItem.serialNumber !== null && invItem.serialNumber !== 0) {
            ownersList.push({
              username: userData.username || "Unknown",
              userId: userData.userId || 0,
              serialNumber: invItem.serialNumber,
              userDocId: userDoc.id,
            });
          }
        }
      }

      ownersList.sort((a, b) => a.serialNumber - b.serialNumber);
      setOwners(ownersList);
    } catch (error) {
      console.error("Error loading owners:", error);
    } finally {
      setLoadingOwners(false);
    }
  };

  const handleGiveItem = async () => {
    if (!targetUser || !selectedItem) return;

    if (targetUser.userId === 1 && giveMode === "pick") {
      toast({
        title: "Cannot pick serial for Admin",
        description: "Admin cannot receive items via serial transfer. Use Create Serial instead.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (selectedItem.stockType === "infinite") {
        await giveInfiniteItem(targetUser, selectedItem, quantity);
      } else {
        if (giveMode === "create") {
          await createAndGiveSerial(targetUser, selectedItem);
        } else {
          if (!selectedSerial) {
            throw new Error("Please select a serial number");
          }
          await transferSerial(targetUser, selectedItem, parseInt(selectedSerial));
        }
      }

      toast({
        title: "Item given successfully",
        description: `${selectedItem.name} has been given to ${targetUser.username}`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error giving item:", error);
      toast({
        title: "Failed to give item",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const giveInfiniteItem = async (user: User, item: Item, qty: number) => {
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, "users", user.id);
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists()) {
        throw new Error("User not found");
      }

      const currentInventory = userDoc.data().inventory || [];
      const existingIndex = currentInventory.findIndex(
        (invItem: any) => invItem.itemId === item.id && invItem.serialNumber === null
      );

      let updatedInventory;
      if (existingIndex !== -1) {
        updatedInventory = [...currentInventory];
        updatedInventory[existingIndex] = {
          ...updatedInventory[existingIndex],
          amount: (updatedInventory[existingIndex].amount || 1) + qty,
        };
      } else {
        const inventoryItemId = `${user.firebaseUid}_${Date.now()}_admin_gift`;
        updatedInventory = [
          ...currentInventory,
          {
            id: inventoryItemId,
            itemId: item.id,
            serialNumber: null,
            rolledAt: Date.now(),
            amount: qty,
          },
        ];
      }

      transaction.update(userRef, { inventory: updatedInventory });
    });
  };

  const createAndGiveSerial = async (user: User, item: Item) => {
    await runTransaction(db, async (transaction) => {
      const itemRef = doc(db, "items", item.id);
      const userRef = doc(db, "users", user.id);
      const ownershipMarkerRef = doc(db, "items", item.id, "owners", user.firebaseUid);

      const itemDoc = await transaction.get(itemRef);
      const userDoc = await transaction.get(userRef);
      const ownershipDoc = await transaction.get(ownershipMarkerRef);

      if (!itemDoc.exists() || !userDoc.exists()) {
        throw new Error("Item or user not found");
      }

      const itemData = itemDoc.data() as Item;
      const currentInventory = userDoc.data().inventory || [];

      const newTotalStock = (itemData.totalStock || 0) + 1;
      const newSerial = newTotalStock;

      const inventoryItemId = `${user.firebaseUid}_${Date.now()}_admin_gift_${newSerial}`;
      const updatedInventory = [
        ...currentInventory,
        {
          id: inventoryItemId,
          itemId: item.id,
          serialNumber: newSerial,
          rolledAt: Date.now(),
          amount: 1,
        },
      ];

      transaction.update(itemRef, {
        totalStock: newTotalStock,
      });

      transaction.update(userRef, { inventory: updatedInventory });

      if (!ownershipDoc.exists()) {
        transaction.set(ownershipMarkerRef, {
          userId: user.firebaseUid,
          username: user.username,
          ownedAt: Date.now(),
        });

        transaction.update(itemRef, {
          totalOwners: (itemData.totalOwners || 0) + 1,
        });
      }
    });
  };

  const transferSerial = async (targetUser: User, item: Item, serial: number) => {
    if (serial === 0) {
      throw new Error("Serial #0 is reserved for Admin and cannot be transferred");
    }

    const owner = owners.find(o => o.serialNumber === serial);
    if (!owner) {
      throw new Error("Serial number owner not found");
    }

    await runTransaction(db, async (transaction) => {
      const sourceUserRef = doc(db, "users", owner.userDocId);
      const targetUserRef = doc(db, "users", targetUser.id);
      const targetOwnershipMarkerRef = doc(db, "items", item.id, "owners", targetUser.firebaseUid);

      const sourceUserDoc = await transaction.get(sourceUserRef);
      const targetUserDoc = await transaction.get(targetUserRef);
      const targetOwnershipDoc = await transaction.get(targetOwnershipMarkerRef);

      if (!sourceUserDoc.exists() || !targetUserDoc.exists()) {
        throw new Error("Source or target user not found");
      }

      const sourceInventory = sourceUserDoc.data().inventory || [];
      const targetInventory = targetUserDoc.data().inventory || [];

      const sourceItemIndex = sourceInventory.findIndex(
        (invItem: any) => invItem.itemId === item.id && invItem.serialNumber === serial
      );

      if (sourceItemIndex === -1) {
        throw new Error("Serial number not found in source user's inventory");
      }

      const transferredItem = sourceInventory[sourceItemIndex];
      const updatedSourceInventory = sourceInventory.filter((_: any, idx: number) => idx !== sourceItemIndex);
      const updatedTargetInventory = [...targetInventory, transferredItem];

      transaction.update(sourceUserRef, { inventory: updatedSourceInventory });
      transaction.update(targetUserRef, { inventory: updatedTargetInventory });

      if (!targetOwnershipDoc.exists()) {
        const itemRef = doc(db, "items", item.id);
        const itemDoc = await transaction.get(itemRef);
        
        transaction.set(targetOwnershipMarkerRef, {
          userId: targetUser.firebaseUid,
          username: targetUser.username,
          ownedAt: Date.now(),
        });

        transaction.update(itemRef, {
          totalOwners: (itemDoc.data()?.totalOwners || 0) + 1,
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-give-items">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Give Item to {targetUser?.username}
          </DialogTitle>
          <DialogDescription>
            Select an item and configure how to give it to this user.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="item-select">Select Item</Label>
            <Select value={selectedItemId} onValueChange={setSelectedItemId}>
              <SelectTrigger id="item-select" data-testid="select-item">
                <SelectValue placeholder="Choose an item..." />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.stockType === "limited" ? `Limited, Stock: ${item.totalStock}` : "Infinite"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedItem && selectedItem.stockType === "infinite" && (
            <div>
              <Label htmlFor="quantity-input">Quantity</Label>
              <Input
                id="quantity-input"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                data-testid="input-quantity"
              />
            </div>
          )}

          {selectedItem && selectedItem.stockType === "limited" && (
            <div className="space-y-3">
              <Label>Give Mode</Label>
              <RadioGroup value={giveMode} onValueChange={(value: "create" | "pick") => setGiveMode(value)} data-testid="radio-give-mode">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="create" id="mode-create" data-testid="radio-create-serial" />
                  <Label htmlFor="mode-create" className="font-normal cursor-pointer">
                    Create Serial (adds +1 to stock, gives new serial)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pick" id="mode-pick" data-testid="radio-pick-serial" />
                  <Label htmlFor="mode-pick" className="font-normal cursor-pointer">
                    Pick Serial (transfer existing serial from another user)
                  </Label>
                </div>
              </RadioGroup>

              {giveMode === "pick" && (
                <div>
                  <Label htmlFor="serial-select">Select Serial to Transfer</Label>
                  {loadingOwners ? (
                    <p className="text-sm text-muted-foreground">Loading serials...</p>
                  ) : owners.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No transferable serials available (excluding Admin #0)</p>
                  ) : (
                    <Select value={selectedSerial} onValueChange={setSelectedSerial}>
                      <SelectTrigger id="serial-select" data-testid="select-serial">
                        <SelectValue placeholder="Choose a serial..." />
                      </SelectTrigger>
                      <SelectContent>
                        {owners.map((owner) => (
                          <SelectItem key={owner.serialNumber} value={owner.serialNumber.toString()}>
                            #{owner.serialNumber} - {owner.username} (ID: {owner.userId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
              data-testid="button-cancel-give"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGiveItem}
              disabled={loading || !selectedItem || (selectedItem.stockType === "limited" && giveMode === "pick" && !selectedSerial)}
              className="flex-1"
              data-testid="button-confirm-give"
            >
              {loading ? "Giving..." : "Give Item"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
