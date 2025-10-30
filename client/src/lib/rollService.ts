import { collection, doc } from "firebase/firestore";
import { db, runTransaction } from "./firebase";
import type { Item, User } from "@shared/schema";
import { rollableItemsCache } from "./rollableItemsCache";
import { adminCache } from "./adminCache";

export async function performRoll(user: User): Promise<{ item: Item; serialNumber: number | null; autoSold?: boolean; playerEarned?: number }> {
  // Use cache instead of querying all items every roll
  const eligibleItems = await rollableItemsCache.getItems();

  if (eligibleItems.length === 0) {
    throw new Error("No items available to roll");
  }

  let totalWeight = 0;
  const weights = eligibleItems.map((item) => {
    const weight = 1 / item.value;
    totalWeight += weight;
    return weight;
  });

  const random = Math.random() * totalWeight;
  let cumulative = 0;
  let selectedItemId = eligibleItems[0].id;

  for (let i = 0; i < eligibleItems.length; i++) {
    cumulative += weights[i];
    if (random <= cumulative) {
      selectedItemId = eligibleItems[i].id;
      break;
    }
  }

  // Use cached admin ID to save 1 database read per roll
  const adminDocId = await adminCache.getAdminDocId();

  let shouldRemoveFromCache = false;
  let itemIdToRemove: string | null = null;

  let result: { item: Item; serialNumber: number | null; autoSold?: boolean; playerEarned?: number };

  try {
    result = await runTransaction(db, async (transaction) => {
      const itemRef = doc(db, "items", selectedItemId);
      const userRef = doc(db, "users", user.id);
      const adminRef = adminDocId ? doc(db, "users", adminDocId) : null;

      // Read item first to determine if we need ownership marker
      const itemDoc = await transaction.get(itemRef);
      
      if (!itemDoc.exists()) {
        throw new Error("Item not found");
      }
      
      const selectedItem = { id: itemDoc.id, ...itemDoc.data() } as Item;
      
      if (selectedItem.offSale) {
        throw new Error("Item is off-sale and cannot be rolled");
      }

      if (selectedItem.stockType === "timer" && selectedItem.timerExpiresAt) {
        if (selectedItem.timerExpiresAt <= Date.now()) {
          shouldRemoveFromCache = true;
          itemIdToRemove = selectedItem.id;
          throw new Error("Timer item has expired and can no longer be rolled");
        }
      }

    // Only read ownership marker for limited and timer items
    let isFirstTimeOwning = false;
    let ownershipMarkerRef = null;
    if (selectedItem.stockType === "limited" || selectedItem.stockType === "timer") {
      ownershipMarkerRef = doc(db, "items", selectedItemId, "owners", user.firebaseUid);
      const ownershipDoc = await transaction.get(ownershipMarkerRef);
      isFirstTimeOwning = !ownershipDoc.exists();
    }

    // Read user and admin docs
    const userDoc = await transaction.get(userRef);
    const adminDoc = adminRef ? await transaction.get(adminRef) : null;
    
    if (!userDoc.exists()) {
      throw new Error("User document not found");
    }
    
    let serialNumber: number | null = null;
    const itemUpdates: any = {};
    let shouldSetOwnership = false;

    if (selectedItem.stockType === "limited") {
      if (!selectedItem.remainingStock || selectedItem.remainingStock <= 0) {
        throw new Error("Item is out of stock");
      }

      itemUpdates.remainingStock = selectedItem.remainingStock - 1;
      serialNumber = (selectedItem.totalStock || 0) - selectedItem.remainingStock + 1;
      
      if (isFirstTimeOwning) {
        itemUpdates.totalOwners = (selectedItem.totalOwners || 0) + 1;
        shouldSetOwnership = true;
      }
    } else if (selectedItem.stockType === "timer") {
      serialNumber = selectedItem.nextSerialNumber || 1;
      itemUpdates.nextSerialNumber = serialNumber + 1;
      
      if (isFirstTimeOwning) {
        itemUpdates.totalOwners = (selectedItem.totalOwners || 0) + 1;
        shouldSetOwnership = true;
      }
    } else {
      // For infinite items, always increment totalOwners (tracks total times owned, not unique owners)
      itemUpdates.totalOwners = (selectedItem.totalOwners || 0) + 1;
    }

    const isMythicOrHigher = selectedItem.rarity === "MYTHIC" || selectedItem.rarity === "INSANE";
    const shouldAutoSell = !isMythicOrHigher && (user.settings?.autoSellRarities?.includes(selectedItem.rarity) || false);
    let playerEarned = 0;

    if (shouldAutoSell) {
      const totalValue = selectedItem.value;
      playerEarned = Math.floor(totalValue * 0.8);
      const adminEarned = Math.floor(totalValue * 0.2);

      if (!adminDoc || !adminRef) {
        throw new Error("Admin user not found. Cannot process auto-sell.");
      }
      
      const adminCash = adminDoc.data()?.cash || 0;
      const currentCash = userDoc.data()?.cash || 0;
      const currentRollCount = userDoc.data()?.rollCount || 0;
      
      transaction.update(adminRef, {
        cash: adminCash + adminEarned,
      });

      transaction.update(userRef, {
        cash: currentCash + playerEarned,
        rollCount: currentRollCount + 1,
      });
    } else {
      const currentRollCount = userDoc.data()?.rollCount || 0;
      const currentInventory = userDoc.data()?.inventory || [];
      
      let updatedInventory = [...currentInventory];
      
      if (serialNumber === null) {
        const existingIndex = updatedInventory.findIndex(
          (invItem: any) => invItem.itemId === selectedItem.id && invItem.serialNumber === null
        );
        
        if (existingIndex !== -1) {
          updatedInventory[existingIndex] = {
            ...updatedInventory[existingIndex],
            amount: (updatedInventory[existingIndex].amount || 1) + 1,
          };
        } else {
          const inventoryItemId = `${user.firebaseUid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          updatedInventory.push({
            id: inventoryItemId,
            itemId: selectedItem.id,
            serialNumber,
            rolledAt: Date.now(),
            amount: 1,
          });
        }
      } else {
        const inventoryItemId = `${user.firebaseUid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        updatedInventory.push({
          id: inventoryItemId,
          itemId: selectedItem.id,
          serialNumber,
          rolledAt: Date.now(),
          amount: 1,
        });
      }
      
      transaction.update(userRef, {
        rollCount: currentRollCount + 1,
        inventory: updatedInventory,
      });
    }

    if (Object.keys(itemUpdates).length > 0) {
      transaction.update(itemRef, itemUpdates);
      
      // If limited item stock reached zero, mark for cache removal after commit
      if (selectedItem.stockType === "limited" && itemUpdates.remainingStock === 0) {
        shouldRemoveFromCache = true;
        itemIdToRemove = selectedItem.id;
      }
    }

    if (shouldSetOwnership && ownershipMarkerRef) {
      transaction.set(ownershipMarkerRef, { ownedAt: Date.now() });
    }

    if (selectedItem.value >= 2500000) {
      const globalRollRef = doc(collection(db, "globalRolls"));
      transaction.set(globalRollRef, {
        username: user.username,
        itemName: selectedItem.name,
        itemImageUrl: selectedItem.imageUrl,
        itemValue: selectedItem.value,
        rarity: selectedItem.rarity,
        timestamp: Date.now(),
        serialNumber,
      });
    }

    return { 
      item: selectedItem, 
      serialNumber,
      autoSold: shouldAutoSell,
      playerEarned: shouldAutoSell ? playerEarned : undefined,
    };
  });
  } catch (error) {
    // If transaction failed due to expired timer item, remove from cache
    if (shouldRemoveFromCache && itemIdToRemove) {
      rollableItemsCache.removeItem(itemIdToRemove);
      
      // Mark item as offSale outside the transaction
      const itemRef = doc(db, "items", itemIdToRemove);
      try {
        const { updateDoc } = await import("./firebase");
        await updateDoc(itemRef, { offSale: true });
      } catch (updateError) {
        console.error("Failed to mark expired timer item as offSale:", updateError);
      }
    }
    
    // Re-throw the original error
    throw error;
  }

  // Also remove from cache after successful transaction if needed (for out-of-stock limited items)
  if (shouldRemoveFromCache && itemIdToRemove) {
    rollableItemsCache.removeItem(itemIdToRemove);
  }

  return result;
}

export async function getRollableItems(): Promise<Item[]> {
  // Use cache instead of querying every time
  return rollableItemsCache.getItems();
}
