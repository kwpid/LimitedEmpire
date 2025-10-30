import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { itemsCache } from "./itemsCache";
import type { User } from "@shared/schema";

export async function updateUserShowcaseMetadata(userId: string, userDoc: User) {
  try {
    const items = await itemsCache.getItems();
    const showcaseMetadata = [];
    let totalValue = 0;

    if (userDoc.showcaseItems && userDoc.showcaseItems.length > 0) {
      for (const inventoryItemId of userDoc.showcaseItems) {
        const invItem = userDoc.inventory?.find(item => item.id === inventoryItemId);
        if (!invItem) continue;

        const item = items.get(invItem.itemId);
        if (!item) continue;

        showcaseMetadata.push({
          inventoryId: invItem.id,
          itemId: invItem.itemId,
          itemName: item.name,
          itemImageUrl: item.imageUrl,
          itemValue: item.value,
          serialNumber: invItem.serialNumber
        });
      }
    }

    if (userDoc.inventory && userDoc.inventory.length > 0) {
      for (const invItem of userDoc.inventory) {
        const item = items.get(invItem.itemId);
        if (item) {
          totalValue += item.value * (invItem.amount || 1);
        }
      }
    }

    return {
      showcaseMetadata,
      inventoryValue: totalValue,
      usernameLower: userDoc.username.toLowerCase()
    };
  } catch (error) {
    console.error(`Error updating metadata for user ${userId}:`, error);
    return {
      showcaseMetadata: [],
      inventoryValue: 0,
      usernameLower: userDoc.username.toLowerCase()
    };
  }
}

export async function migrateAllUsersSchema() {
  try {
    console.log("Starting user schema migration...");
    
    const items = await itemsCache.getItems();
    console.log(`Loaded ${items.size} items from cache`);

    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    
    console.log(`Found ${snapshot.size} users to migrate`);

    let updateCount = 0;
    const batchSize = 500;
    let batch = writeBatch(db);
    let batchCount = 0;

    for (const docSnapshot of snapshot.docs) {
      const userData = docSnapshot.data() as User;
      
      const needsUpdate = 
        !userData.showcaseMetadata || 
        userData.inventoryValue === undefined || 
        !userData.usernameLower;
      
      if (!needsUpdate) {
        continue;
      }

      const updates = await updateUserShowcaseMetadata(docSnapshot.id, userData);
      
      const userRef = doc(db, "users", docSnapshot.id);
      batch.update(userRef, updates);
      batchCount++;
      updateCount++;

      if (batchCount >= batchSize) {
        await batch.commit();
        console.log(`Committed batch of ${batchCount} users (total: ${updateCount})`);
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      console.log(`Committed final batch of ${batchCount} users`);
    }

    console.log(`Migration complete! Updated ${updateCount} users out of ${snapshot.size} total.`);
    return { success: true, updated: updateCount, total: snapshot.size };
  } catch (error) {
    console.error("Error during migration:", error);
    throw error;
  }
}
