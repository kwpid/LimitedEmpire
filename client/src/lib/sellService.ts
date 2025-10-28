import { runTransaction, doc, collection, query, where, getDocs, updateDoc } from "firebase/firestore";
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

  const result = await runTransaction(db, async (transaction) => {
    const usersRef = collection(db, "users");
    const adminQuery = query(usersRef, where("userId", "==", 1));
    const adminSnapshot = await getDocs(adminQuery);
    
    if (adminSnapshot.empty) {
      throw new Error("Admin user not found");
    }

    const adminDoc = adminSnapshot.docs[0];
    const adminRef = doc(db, "users", adminDoc.id);
    const adminData = adminDoc.data();

    const userRef = doc(db, "users", user.id);
    const userDoc = await transaction.get(userRef);
    
    if (!userDoc.exists()) {
      throw new Error("User not found");
    }

    const currentCash = userDoc.data().cash || 0;
    const adminCash = adminData.cash || 0;

    transaction.update(userRef, {
      cash: currentCash + playerEarned,
    });

    transaction.update(adminRef, {
      cash: adminCash + adminEarned,
    });

    for (const invId of idsToSell) {
      const inventoryRef = doc(db, "inventory", invId);
      transaction.delete(inventoryRef);
    }

    return {
      soldCount: quantityToSell,
      playerEarned,
      adminEarned,
    };
  });

  return result;
}
