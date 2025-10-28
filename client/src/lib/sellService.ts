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
  quantityToSell: number
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
    const filteredInventory = currentInventory.filter(
      (invItem: any) => !idsToSellSet.has(invItem.id)
    );

    const actualRemovedCount = currentInventory.length - filteredInventory.length;
    
    if (actualRemovedCount !== quantityToSell) {
      throw new Error(`Invalid inventory: expected to remove ${quantityToSell} items but only found ${actualRemovedCount}`);
    }

    transaction.update(userRef, {
      cash: currentCash + playerEarned,
      inventory: filteredInventory,
    });

    transaction.update(adminRef, {
      cash: adminCash + adminEarned,
    });

    return {
      soldCount: actualRemovedCount,
      playerEarned,
      adminEarned,
    };
  });

  return result;
}
