import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { sendItemReleaseWebhook, sendAdminLogWebhook } from "./lib/discord-webhooks";
import { verifyIdToken, checkIsAdmin, initializeFirebaseAdmin, getFirebaseAdmin } from "./lib/firebase-admin";
import { insertTradeSchema, type Trade, type User, type Item } from "@shared/schema";
import { z } from "zod";

const requireAuth = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized - No token provided" });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyIdToken(idToken);
    
    if (!decodedToken) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized - No token provided" });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyIdToken(idToken);
    
    if (!decodedToken) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }

    const isAdmin = await checkIsAdmin(decodedToken.uid);
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden - Admin access required" });
    }

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Firebase Admin SDK
  initializeFirebaseAdmin();
  const admin = getFirebaseAdmin();
  const db = admin.firestore();

  // Webhook endpoint for item releases (admin only)
  app.post("/api/webhooks/item-release", requireAdmin, async (req, res) => {
    try {
      const { name, rarity, value, stock } = req.body;
      await sendItemReleaseWebhook({ name, rarity, value, stock });
      res.json({ success: true });
    } catch (error) {
      console.error("Error sending item release webhook:", error);
      res.status(500).json({ error: "Failed to send webhook" });
    }
  });

  // Webhook endpoint for admin logs (admin only)
  app.post("/api/webhooks/admin-log", requireAdmin, async (req, res) => {
    try {
      const { action, adminUsername, targetUsername, details, color } = req.body;
      await sendAdminLogWebhook({ action, adminUsername, targetUsername, details, color });
      res.json({ success: true });
    } catch (error) {
      console.error("Error sending admin log webhook:", error);
      res.status(500).json({ error: "Failed to send webhook" });
    }
  });

  // Create a new trade
  app.post("/api/trades", requireAuth, async (req: any, res: any) => {
    try {
      console.log("[Trade Creation] Starting trade creation request");
      console.log("[Trade Creation] Request body:", JSON.stringify(req.body, null, 2));
      
      const parsed = insertTradeSchema.parse(req.body);
      console.log("[Trade Creation] Schema validation passed");
      
      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        console.error("[Trade Creation] User not found for firebaseUid:", req.user.uid);
        return res.status(403).json({ error: "User not found" });
      }
      const userData = userDoc.docs[0].data();
      console.log("[Trade Creation] Found user:", userData.id, userData.username);
      
      if (userData.id !== parsed.initiatorId) {
        console.error("[Trade Creation] User ID mismatch:", userData.id, "vs", parsed.initiatorId);
        return res.status(403).json({ error: "Cannot create trades for other users" });
      }
      
      const tradeDoc = db.collection("trades").doc();
      console.log("[Trade Creation] Generated trade doc ID:", tradeDoc.id);
      
      const trade: Trade = {
        id: tradeDoc.id,
        status: "pending",
        initiatorId: parsed.initiatorId,
        initiatorUsername: parsed.initiatorUsername,
        recipientId: parsed.recipientId,
        recipientUsername: parsed.recipientUsername,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000),
        initiatorOffer: parsed.initiatorOffer,
        recipientOffer: parsed.recipientOffer,
        message: parsed.message || "",
      };

      console.log("[Trade Creation] About to write trade to Firestore:", trade.id);
      await tradeDoc.set(trade);
      console.log("[Trade Creation] ✓ Successfully wrote trade to Firestore!");
      console.log("[Trade Creation] Trade document path: trades/" + tradeDoc.id);
      
      res.json(trade);
    } catch (error) {
      console.error("[Trade Creation] ❌ ERROR:", error);
      console.error("[Trade Creation] Error stack:", error instanceof Error ? error.stack : "No stack trace");
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create trade" });
    }
  });

  // Get trades for a user
  app.get("/api/trades", requireAuth, async (req: any, res: any) => {
    try {
      const { userId, box } = req.query;
      console.log("[Get Trades] Request for userId:", userId, "box:", box);
      
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId is required" });
      }

      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        console.error("[Get Trades] User not found for firebaseUid:", req.user.uid);
        return res.status(403).json({ error: "User not found" });
      }
      const userData = userDoc.docs[0].data();
      console.log("[Get Trades] Found user:", userData.id, userData.username);
      
      if (userData.id !== userId) {
        console.error("[Get Trades] User ID mismatch:", userData.id, "vs", userId);
        return res.status(403).json({ error: "Cannot view trades for other users" });
      }

      let query = db.collection("trades");
      
      if (box === "inbound") {
        console.log("[Get Trades] Querying inbound trades for recipientId:", userId);
        query = query.where("recipientId", "==", userId).where("status", "==", "pending") as any;
      } else if (box === "outbound") {
        console.log("[Get Trades] Querying outbound trades for initiatorId:", userId);
        query = query.where("initiatorId", "==", userId).where("status", "==", "pending") as any;
      } else if (box === "completed") {
        console.log("[Get Trades] Querying completed trades for userId:", userId);
        query = query.where("status", "==", "accepted") as any;
        const q1 = query.where("initiatorId", "==", userId);
        const q2 = query.where("recipientId", "==", userId);
        
        const [snap1, snap2] = await Promise.all([q1.get(), q2.get()]);
        const trades: Trade[] = [];
        snap1.forEach(doc => trades.push({ id: doc.id, ...doc.data() } as Trade));
        snap2.forEach(doc => {
          if (!trades.find(t => t.id === doc.id)) {
            trades.push({ id: doc.id, ...doc.data() } as Trade);
          }
        });
        
        console.log("[Get Trades] Found", trades.length, "completed trades");
        console.log("[Get Trades] Trade IDs:", trades.map(t => t.id).join(", ") || "none");
        
        return res.json(trades.sort((a, b) => b.updatedAt - a.updatedAt));
      } else if (box === "inactive") {
        console.log("[Get Trades] Querying inactive trades for userId:", userId);
        const inactiveStatuses = ["declined", "cancelled", "expired"];
        const queries = inactiveStatuses.map(status => 
          db.collection("trades").where("status", "==", status).where("initiatorId", "==", userId).get()
        );
        const queries2 = inactiveStatuses.map(status =>
          db.collection("trades").where("status", "==", status).where("recipientId", "==", userId).get()
        );
        
        const results = await Promise.all([...queries, ...queries2]);
        const trades: Trade[] = [];
        results.forEach(snap => {
          snap.forEach(doc => {
            if (!trades.find(t => t.id === doc.id)) {
              trades.push({ id: doc.id, ...doc.data() } as Trade);
            }
          });
        });
        
        console.log("[Get Trades] Found", trades.length, "inactive trades");
        console.log("[Get Trades] Trade IDs:", trades.map(t => t.id).join(", ") || "none");
        
        return res.json(trades.sort((a, b) => b.updatedAt - a.updatedAt));
      }

      const snapshot = await query.orderBy("createdAt", "desc").get();
      const trades: Trade[] = [];
      snapshot.forEach(doc => {
        trades.push({ id: doc.id, ...doc.data() } as Trade);
      });

      console.log("[Get Trades] Found", trades.length, "trades");
      console.log("[Get Trades] Trade IDs:", trades.map(t => t.id).join(", ") || "none");
      
      res.json(trades);
    } catch (error) {
      console.error("[Get Trades] ❌ ERROR:", error);
      console.error("[Get Trades] Error stack:", error instanceof Error ? error.stack : "No stack trace");
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  // Accept a trade
  app.post("/api/trades/:id/accept", requireAuth, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        return res.status(403).json({ error: "User not found" });
      }
      const authUserId = userDoc.docs[0].data().id;
      
      await db.runTransaction(async (transaction) => {
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

        transaction.update(initiatorRef, {
          inventory: initiatorInventory,
          cash: newInitiatorCash,
        });

        transaction.update(recipientRef, {
          inventory: recipientInventory,
          cash: newRecipientCash,
        });

        transaction.update(tradeRef, {
          status: "accepted",
          updatedAt: Date.now(),
        });
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error accepting trade:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to accept trade" });
    }
  });

  // Decline a trade
  app.post("/api/trades/:id/decline", requireAuth, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        return res.status(403).json({ error: "User not found" });
      }
      const authUserId = userDoc.docs[0].data().id;
      
      const tradeRef = db.collection("trades").doc(id);
      const tradeDoc = await tradeRef.get();
      
      if (!tradeDoc.exists) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      const trade = tradeDoc.data() as Trade;
      if (trade.recipientId !== authUserId) {
        return res.status(403).json({ error: "Only the recipient can decline this trade" });
      }
      
      await tradeRef.update({
        status: "declined",
        updatedAt: Date.now(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error declining trade:", error);
      res.status(500).json({ error: "Failed to decline trade" });
    }
  });

  // Cancel a trade
  app.post("/api/trades/:id/cancel", requireAuth, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        return res.status(403).json({ error: "User not found" });
      }
      const authUserId = userDoc.docs[0].data().id;
      
      const tradeRef = db.collection("trades").doc(id);
      const tradeDoc = await tradeRef.get();
      
      if (!tradeDoc.exists) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      const trade = tradeDoc.data() as Trade;
      if (trade.initiatorId !== authUserId) {
        return res.status(403).json({ error: "Only the initiator can cancel this trade" });
      }
      
      await tradeRef.update({
        status: "cancelled",
        updatedAt: Date.now(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling trade:", error);
      res.status(500).json({ error: "Failed to cancel trade" });
    }
  });

  // Toggle NFT lock on inventory item
  app.patch("/api/inventory/:userId/:inventoryItemId/nft", requireAuth, async (req: any, res: any) => {
    try {
      const { userId, inventoryItemId } = req.params;
      const { nftLocked } = req.body;

      if (typeof nftLocked !== "boolean") {
        return res.status(400).json({ error: "nftLocked must be a boolean" });
      }

      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        return res.status(403).json({ error: "User not found" });
      }
      const authUserId = userDoc.docs[0].data().id;
      
      if (authUserId !== userId) {
        return res.status(403).json({ error: "Cannot modify other users' inventory" });
      }

      const userRef = db.collection("users").doc(userId);
      const userDocData = await userRef.get();

      if (!userDocData.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = { id: userDocData.id, ...userDocData.data() } as User;
      const inventory = user.inventory || [];
      
      const itemIndex = inventory.findIndex(inv => inv.id === inventoryItemId);
      if (itemIndex === -1) {
        return res.status(404).json({ error: "Inventory item not found" });
      }

      inventory[itemIndex].nftLocked = nftLocked;

      await userRef.update({ inventory });

      res.json({ success: true, inventory });
    } catch (error) {
      console.error("Error toggling NFT lock:", error);
      res.status(500).json({ error: "Failed to toggle NFT lock" });
    }
  });

  // Update trade settings
  app.patch("/api/users/:userId/trade-settings", requireAuth, async (req: any, res: any) => {
    try {
      const { userId } = req.params;
      const { autoDeclineHugeLoss } = req.body;

      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        return res.status(403).json({ error: "User not found" });
      }
      const authUserId = userDoc.docs[0].data().id;
      
      if (authUserId !== userId) {
        return res.status(403).json({ error: "Cannot modify other users' settings" });
      }

      const userRef = db.collection("users").doc(userId);
      const userDocData = await userRef.get();

      if (!userDocData.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = { id: userDocData.id, ...userDocData.data() } as User;
      const settings = user.settings || { autoSellRarities: [], tradeSettings: { autoDeclineHugeLoss: false } };

      if (!settings.tradeSettings) {
        settings.tradeSettings = { autoDeclineHugeLoss: false };
      }

      if (typeof autoDeclineHugeLoss === "boolean") {
        settings.tradeSettings.autoDeclineHugeLoss = autoDeclineHugeLoss;
      }

      await userRef.update({ settings });

      res.json({ success: true, settings });
    } catch (error) {
      console.error("Error updating trade settings:", error);
      res.status(500).json({ error: "Failed to update trade settings" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
