import { runTransaction, doc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "@shared/schema";

export interface SellResult {
  soldCount: number;
  playerEarned: number;
  adminEarned: number;
}

export async function sellItems(
  user: User,
  inventoryIds: string[],
  itemValue: number,
  quantityToSell: number,
  itemId?: string
): Promise<SellResult> {
  if (quantityToSell <= 0) {
    throw new Error("Quantity must be positive");
  }

  if (quantityToSell > inventoryIds.length) {
    throw new Error("Cannot sell more items than you own");
  }

  const idsToSell = inventoryIds.slice(0, quantityToSell);
  const totalValue = itemValue * quantityToSell;
  const playerEarned = Math.floor(totalValue * 0.8);
  const adminEarned = Math.floor(totalValue * 0.2);

  const usersRef = collection(db, "users");
  const adminQuery = query(usersRef, where("userId", "==", 1));
  const adminSnapshot = await getDocs(adminQuery);
  
  if (adminSnapshot.empty) {
    throw new Error("Admin user not found");
  }

  const adminDocId = adminSnapshot.docs[0].id;

  const result = await runTransaction(db, async (transaction) => {
    const userRef = doc(db, "users", user.id);
    const adminRef = doc(db, "users", adminDocId);
    
    const userDoc = await transaction.get(userRef);
    const adminDoc = await transaction.get(adminRef);
    
    if (!userDoc.exists()) {
      throw new Error("User not found");
    }
    
    if (!adminDoc.exists()) {
      throw new Error("Admin user not found");
    }

    const currentCash = userDoc.data().cash || 0;
    const currentInventory = userDoc.data().inventory || [];
    const adminCash = adminDoc.data().cash || 0;

    const idsToSellSet = new Set(idsToSell);
    const updatedInventory = [];
    let actualRemovedCount = 0;
    let soldItemId: string | null = null;
    
    for (const invItem of currentInventory) {
      if (idsToSellSet.has(invItem.id)) {
        if (!soldItemId) {
          soldItemId = invItem.itemId;
        }
        const amount = invItem.amount || 1;
        const sellAmount = Math.min(amount, quantityToSell - actualRemovedCount);
        
        actualRemovedCount += sellAmount;
        
        if (sellAmount < amount) {
          updatedInventory.push({
            ...invItem,
            amount: amount - sellAmount,
          });
        }
      } else {
        updatedInventory.push(invItem);
      }
    }
    
    if (actualRemovedCount !== quantityToSell) {
      throw new Error(`Invalid inventory: expected to remove ${quantityToSell} items but only found ${actualRemovedCount}`);
    }

    const finalItemId = soldItemId || itemId;
    let itemDoc = null;
    let itemRef = null;
    let ownershipMarkerRef = null;
    
    if (finalItemId) {
      itemRef = doc(db, "items", finalItemId);
      ownershipMarkerRef = doc(db, "items", finalItemId, "owners", user.firebaseUid);
      itemDoc = await transaction.get(itemRef);
    }

    transaction.update(userRef, {
      cash: currentCash + playerEarned,
      inventory: updatedInventory,
    });

    transaction.update(adminRef, {
      cash: adminCash + adminEarned,
    });

    if (itemDoc && itemDoc.exists() && itemRef && ownershipMarkerRef) {
      const itemData = itemDoc.data();
      const currentOwners = itemData.totalOwners || 0;
      
      const stillOwnsItem = updatedInventory.some((invItem: any) => invItem.itemId === finalItemId);
      
      if (itemData.stockType === "limited") {
        if (!stillOwnsItem) {
          transaction.update(itemRef, {
            totalOwners: Math.max(0, currentOwners - 1),
          });
          transaction.delete(ownershipMarkerRef);
        }
      } else {
        transaction.update(itemRef, {
          totalOwners: Math.max(0, currentOwners - actualRemovedCount),
        });
      }
    }

    return {
      soldCount: actualRemovedCount,
      playerEarned,
      adminEarned,
    };
  });

  return result;
}
