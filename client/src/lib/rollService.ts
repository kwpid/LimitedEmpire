import { collection, doc, runTransaction, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { Item, User } from "@shared/schema";

export async function performRoll(user: User): Promise<{ item: Item; serialNumber: number | null }> {
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

  const result = await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, "items", selectedItemId);
    const itemDoc = await transaction.get(itemRef);
    
    if (!itemDoc.exists()) {
      throw new Error("Item not found");
    }
    
    const selectedItem = { id: itemDoc.id, ...itemDoc.data() } as Item;
    
    if (selectedItem.offSale) {
      throw new Error("Item is off-sale and cannot be rolled");
    }

    const ownershipMarkerRef = doc(db, "items", selectedItemId, "owners", user.firebaseUid);
    const ownershipDoc = await transaction.get(ownershipMarkerRef);
    const isFirstTimeOwning = !ownershipDoc.exists();
    
    let serialNumber: number | null = null;
    const updates: any = {};

    if (selectedItem.stockType === "limited") {
      if (!selectedItem.remainingStock || selectedItem.remainingStock <= 0) {
        throw new Error("Item is out of stock");
      }

      updates.remainingStock = selectedItem.remainingStock - 1;
      serialNumber = (selectedItem.totalStock || 0) - selectedItem.remainingStock + 1;
    }

    if (isFirstTimeOwning) {
      updates.totalOwners = (selectedItem.totalOwners || 0) + 1;
      transaction.set(ownershipMarkerRef, { ownedAt: Date.now() });
    }

    if (Object.keys(updates).length > 0) {
      transaction.update(itemRef, updates);
    }

    const inventoryRef = doc(collection(db, "inventory"));
    transaction.set(inventoryRef, {
      itemId: selectedItem.id,
      userId: user.firebaseUid,
      serialNumber,
      rolledAt: Date.now(),
    });

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

    return { item: selectedItem, serialNumber };
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
