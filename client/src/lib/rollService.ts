import { collection, doc, runTransaction, getDocs, query, where, arrayUnion } from "firebase/firestore";
import { db } from "./firebase";
import type { Item, User } from "@shared/schema";

export async function performRoll(user: User): Promise<{ item: Item; serialNumber: number | null; autoSold?: boolean; playerEarned?: number }> {
  const itemsRef = collection(db, "items");
  const q = query(itemsRef, where("offSale", "==", false));
  const itemsSnapshot = await getDocs(q);
  
  const eligibleItems: Item[] = [];
  itemsSnapshot.forEach((doc) => {
    const item = { id: doc.id, ...doc.data() } as Item;
    if (item.stockType === "infinite" || (item.remainingStock && item.remainingStock > 0)) {
      eligibleItems.push(item);
    }
  });

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

  const usersRef = collection(db, "users");
  const adminQuery = query(usersRef, where("userId", "==", 1));
  const adminSnapshot = await getDocs(adminQuery);
  
  const adminDocId = !adminSnapshot.empty ? adminSnapshot.docs[0].id : null;

  const result = await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, "items", selectedItemId);
    const ownershipMarkerRef = doc(db, "items", selectedItemId, "owners", user.firebaseUid);
    const userRef = doc(db, "users", user.id);
    const adminRef = adminDocId ? doc(db, "users", adminDocId) : null;

    const itemDoc = await transaction.get(itemRef);
    const ownershipDoc = await transaction.get(ownershipMarkerRef);
    const userDoc = await transaction.get(userRef);
    const adminDoc = adminRef ? await transaction.get(adminRef) : null;
    
    if (!itemDoc.exists()) {
      throw new Error("Item not found");
    }
    
    if (!userDoc.exists()) {
      throw new Error("User document not found");
    }
    
    const selectedItem = { id: itemDoc.id, ...itemDoc.data() } as Item;
    
    if (selectedItem.offSale) {
      throw new Error("Item is off-sale and cannot be rolled");
    }

    const isFirstTimeOwning = !ownershipDoc.exists();
    
    let serialNumber: number | null = null;
    const itemUpdates: any = {};

    if (selectedItem.stockType === "limited") {
      if (!selectedItem.remainingStock || selectedItem.remainingStock <= 0) {
        throw new Error("Item is out of stock");
      }

      itemUpdates.remainingStock = selectedItem.remainingStock - 1;
      serialNumber = (selectedItem.totalStock || 0) - selectedItem.remainingStock + 1;
      
      if (isFirstTimeOwning) {
        itemUpdates.totalOwners = (selectedItem.totalOwners || 0) + 1;
        transaction.set(ownershipMarkerRef, { ownedAt: Date.now() });
      }
    } else {
      itemUpdates.totalOwners = (selectedItem.totalOwners || 0) + 1;
    }

    if (Object.keys(itemUpdates).length > 0) {
      transaction.update(itemRef, itemUpdates);
    }

    const shouldAutoSell = user.settings?.autoSellRarities?.includes(selectedItem.rarity) || false;
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

  return result;
}

export async function getRollableItems(): Promise<Item[]> {
  const itemsRef = collection(db, "items");
  const q = query(itemsRef, where("offSale", "==", false));
  const snapshot = await getDocs(q);
  
  const items: Item[] = [];
  snapshot.forEach((doc) => {
    const item = { id: doc.id, ...doc.data() } as Item;
    if (item.stockType === "infinite" || (item.remainingStock && item.remainingStock > 0)) {
      items.push(item);
    }
  });
  
  return items;
}
