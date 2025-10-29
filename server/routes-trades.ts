import type { Express } from "express";
import { insertTradeSchema, type Trade, type User } from "@shared/schema";

export function addTradeHistoryToUser(
  userId: string,
  username: string,
  trade: Trade,
  isInitiator: boolean,
  status: "accepted" | "declined" | "cancelled" | "expired"
) {
  return {
    id: trade.id,
    status,
    isInitiator,
    otherUserId: isInitiator ? trade.recipientId : trade.initiatorId,
    otherUsername: isInitiator ? trade.recipientUsername : trade.initiatorUsername,
    myOffer: isInitiator ? trade.initiatorOffer : trade.recipientOffer,
    theirOffer: isInitiator ? trade.recipientOffer : trade.initiatorOffer,
    createdAt: trade.createdAt,
    completedAt: Date.now(),
    message: trade.message,
  };
}

export function registerTradeRoutes(app: Express, db: any, requireAuth: any) {
  app.post("/api/trades/:id/accept", requireAuth, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        return res.status(403).json({ error: "User not found" });
      }
      const authUserId = userDoc.docs[0].data().id;
      
      await db.runTransaction(async (transaction: any) => {
        const tradeRef = db.collection("trades").doc(id);
        const tradeDoc = await transaction.get(tradeRef);
        
        if (!tradeDoc.exists) {
          throw new Error("Trade not found");
        }

        const trade = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
        
        if (trade.recipientId !== authUserId) {
          throw new Error("Only the recipient can accept this trade");
        }
        
        if (trade.status !== "pending") {
          throw new Error("Trade is not pending");
        }

        const initiatorRef = db.collection("users").doc(trade.initiatorId);
        const recipientRef = db.collection("users").doc(trade.recipientId);
        
        const [initiatorDoc, recipientDoc] = await Promise.all([
          transaction.get(initiatorRef),
          transaction.get(recipientRef),
        ]);

        if (!initiatorDoc.exists || !recipientDoc.exists) {
          throw new Error("User not found");
        }

        const initiator = { id: initiatorDoc.id, ...initiatorDoc.data() } as User;
        const recipient = { id: recipientDoc.id, ...recipientDoc.data() } as User;

        if (initiator.cash < trade.initiatorOffer.cash) {
          throw new Error("Initiator has insufficient cash");
        }
        if (recipient.cash < trade.recipientOffer.cash) {
          throw new Error("Recipient has insufficient cash");
        }

        const initiatorItemIds = trade.initiatorOffer.items.map(i => i.inventoryItemId);
        const recipientItemIds = trade.recipientOffer.items.map(i => i.inventoryItemId);

        const initiatorHasItems = initiatorItemIds.every(itemId =>
          initiator.inventory?.some(inv => inv.id === itemId)
        );
        const recipientHasItems = recipientItemIds.every(itemId =>
          recipient.inventory?.some(inv => inv.id === itemId)
        );

        if (!initiatorHasItems || !recipientHasItems) {
          throw new Error("One or more items no longer available");
        }

        let initiatorInventory = [...(initiator.inventory || [])];
        let recipientInventory = [...(recipient.inventory || [])];

        initiatorInventory = initiatorInventory.filter(inv => !initiatorItemIds.includes(inv.id));
        recipientInventory = recipientInventory.filter(inv => !recipientItemIds.includes(inv.id));

        const initiatorItemsToGive = (initiator.inventory || []).filter(inv =>
          initiatorItemIds.includes(inv.id)
        );
        const recipientItemsToGive = (recipient.inventory || []).filter(inv =>
          recipientItemIds.includes(inv.id)
        );

        recipientInventory.push(...initiatorItemsToGive);
        initiatorInventory.push(...recipientItemsToGive);

        const newInitiatorCash = initiator.cash - trade.initiatorOffer.cash + trade.recipientOffer.cash;
        const newRecipientCash = recipient.cash - trade.recipientOffer.cash + trade.initiatorOffer.cash;

        const initiatorHistory = addTradeHistoryToUser(trade.initiatorId, trade.initiatorUsername, trade, true, "accepted");
        const recipientHistory = addTradeHistoryToUser(trade.recipientId, trade.recipientUsername, trade, false, "accepted");

        transaction.update(initiatorRef, {
          inventory: initiatorInventory,
          cash: newInitiatorCash,
          tradeHistory: [...(initiator.tradeHistory || []), initiatorHistory],
        });

        transaction.update(recipientRef, {
          inventory: recipientInventory,
          cash: newRecipientCash,
          tradeHistory: [...(recipient.tradeHistory || []), recipientHistory],
        });

        transaction.delete(tradeRef);
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error accepting trade:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to accept trade" });
    }
  });

  app.post("/api/trades/:id/decline", requireAuth, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        return res.status(403).json({ error: "User not found" });
      }
      const authUserId = userDoc.docs[0].data().id;
      
      await db.runTransaction(async (transaction: any) => {
        const tradeRef = db.collection("trades").doc(id);
        const tradeDoc = await transaction.get(tradeRef);
        
        if (!tradeDoc.exists) {
          throw new Error("Trade not found");
        }
        
        const trade = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
        if (trade.recipientId !== authUserId) {
          throw new Error("Only the recipient can decline this trade");
        }
        
        if (trade.status !== "pending") {
          throw new Error("Trade is not pending");
        }

        const initiatorRef = db.collection("users").doc(trade.initiatorId);
        const recipientRef = db.collection("users").doc(trade.recipientId);
        
        const [initiatorDoc, recipientDoc] = await Promise.all([
          transaction.get(initiatorRef),
          transaction.get(recipientRef),
        ]);

        if (!initiatorDoc.exists || !recipientDoc.exists) {
          throw new Error("User not found");
        }

        const initiator = { id: initiatorDoc.id, ...initiatorDoc.data() } as User;
        const recipient = { id: recipientDoc.id, ...recipientDoc.data() } as User;

        const initiatorHistory = addTradeHistoryToUser(trade.initiatorId, trade.initiatorUsername, trade, true, "declined");
        const recipientHistory = addTradeHistoryToUser(trade.recipientId, trade.recipientUsername, trade, false, "declined");

        transaction.update(initiatorRef, {
          tradeHistory: [...(initiator.tradeHistory || []), initiatorHistory],
        });

        transaction.update(recipientRef, {
          tradeHistory: [...(recipient.tradeHistory || []), recipientHistory],
        });

        transaction.delete(tradeRef);
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error declining trade:", error);
      res.status(500).json({ error: "Failed to decline trade" });
    }
  });

  app.post("/api/trades/:id/cancel", requireAuth, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        return res.status(403).json({ error: "User not found" });
      }
      const authUserId = userDoc.docs[0].data().id;
      
      await db.runTransaction(async (transaction: any) => {
        const tradeRef = db.collection("trades").doc(id);
        const tradeDoc = await transaction.get(tradeRef);
        
        if (!tradeDoc.exists) {
          throw new Error("Trade not found");
        }
        
        const trade = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
        if (trade.initiatorId !== authUserId) {
          throw new Error("Only the initiator can cancel this trade");
        }
        
        if (trade.status !== "pending") {
          throw new Error("Trade is not pending");
        }

        const initiatorRef = db.collection("users").doc(trade.initiatorId);
        const recipientRef = db.collection("users").doc(trade.recipientId);
        
        const [initiatorDoc, recipientDoc] = await Promise.all([
          transaction.get(initiatorRef),
          transaction.get(recipientRef),
        ]);

        if (!initiatorDoc.exists || !recipientDoc.exists) {
          throw new Error("User not found");
        }

        const initiator = { id: initiatorDoc.id, ...initiatorDoc.data() } as User;
        const recipient = { id: recipientDoc.id, ...recipientDoc.data() } as User;

        const initiatorHistory = addTradeHistoryToUser(trade.initiatorId, trade.initiatorUsername, trade, true, "cancelled");
        const recipientHistory = addTradeHistoryToUser(trade.recipientId, trade.recipientUsername, trade, false, "cancelled");

        transaction.update(initiatorRef, {
          tradeHistory: [...(initiator.tradeHistory || []), initiatorHistory],
        });

        transaction.update(recipientRef, {
          tradeHistory: [...(recipient.tradeHistory || []), recipientHistory],
        });

        transaction.delete(tradeRef);
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling trade:", error);
      res.status(500).json({ error: "Failed to cancel trade" });
    }
  });
}
