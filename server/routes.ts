import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { sendItemReleaseWebhook, sendAdminLogWebhook } from "./lib/discord-webhooks";
import { verifyIdToken, checkIsAdmin, initializeFirebaseAdmin, getFirebaseAdmin } from "./lib/firebase-admin";
import { type User, type Item } from "@shared/schema";
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
  
  if (!admin) {
    console.warn('⚠️  Skipping Firebase-dependent routes - Firebase not initialized');
    const server = createServer(app);
    return server;
  }
  
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

  // Accept trade endpoint (requires authentication)
  app.post("/api/trades/:tradeId/accept", requireAuth, async (req: any, res) => {
    try {
      const { tradeId } = req.params;
      const userId = req.user.uid;

      // Use Firestore transaction with admin privileges
      await db.runTransaction(async (transaction) => {
        // Get trade document
        const tradeRef = db.collection("trades").doc(tradeId);
        const tradeDoc = await transaction.get(tradeRef);

        if (!tradeDoc.exists) {
          throw new Error("Trade not found");
        }

        const trade = tradeDoc.data();
        if (!trade) {
          throw new Error("Trade data not found");
        }

        // Verify the user is the receiver
        if (trade.receiverId !== userId) {
          throw new Error("You are not the receiver of this trade");
        }

        // Verify trade is pending
        if (trade.status !== "pending") {
          throw new Error("Trade is not pending");
        }

        // Get both user documents
        const senderRef = db.collection("users").doc(trade.senderId);
        const receiverRef = db.collection("users").doc(trade.receiverId);

        const senderDoc = await transaction.get(senderRef);
        const receiverDoc = await transaction.get(receiverRef);

        if (!senderDoc.exists || !receiverDoc.exists) {
          throw new Error("One or both users not found");
        }

        const senderData = senderDoc.data();
        const receiverData = receiverDoc.data();

        if (!senderData || !receiverData) {
          throw new Error("User data not found");
        }

        // Get current inventories and cash
        const senderInventory = [...(senderData.inventory || [])];
        const receiverInventory = [...(receiverData.inventory || [])];
        let senderCash = senderData.cash || 0;
        let receiverCash = receiverData.cash || 0;

        // Validate sender has enough cash
        if (trade.senderOffer.cash > senderCash) {
          throw new Error("Sender does not have enough cash");
        }

        // Validate receiver has enough cash
        if (trade.receiverRequest.cash > receiverCash) {
          throw new Error("Receiver does not have enough cash");
        }

        // Remove sender's offered items from their inventory
        const senderOfferedInventoryIds = new Set(trade.senderOffer.items.map((item: any) => item.inventoryId));
        const senderNewInventory = senderInventory.filter(item => !senderOfferedInventoryIds.has(item.id));

        // Verify all sender items were found
        if (senderNewInventory.length !== senderInventory.length - trade.senderOffer.items.length) {
          throw new Error("Some sender items are no longer in inventory");
        }

        // Remove receiver's requested items from their inventory
        const receiverRequestedInventoryIds = new Set(trade.receiverRequest.items.map((item: any) => item.inventoryId));
        const receiverNewInventory = receiverInventory.filter(item => !receiverRequestedInventoryIds.has(item.id));

        // Verify all receiver items were found
        if (receiverNewInventory.length !== receiverInventory.length - trade.receiverRequest.items.length) {
          throw new Error("Some receiver items are no longer in inventory");
        }

        // Add sender's items to receiver's inventory
        for (const item of trade.senderOffer.items) {
          const originalItem = senderInventory.find(inv => inv.id === item.inventoryId);
          if (originalItem) {
            receiverNewInventory.push({
              ...originalItem,
              rolledAt: Date.now(),
            });
          }
        }

        // Add receiver's items to sender's inventory
        for (const item of trade.receiverRequest.items) {
          const originalItem = receiverInventory.find(inv => inv.id === item.inventoryId);
          if (originalItem) {
            senderNewInventory.push({
              ...originalItem,
              rolledAt: Date.now(),
            });
          }
        }

        // Transfer cash
        senderCash -= trade.senderOffer.cash;
        receiverCash += trade.senderOffer.cash;
        senderCash += trade.receiverRequest.cash;
        receiverCash -= trade.receiverRequest.cash;

        // Update sender document
        transaction.update(senderRef, {
          inventory: senderNewInventory,
          cash: senderCash,
        });

        // Update receiver document
        transaction.update(receiverRef, {
          inventory: receiverNewInventory,
          cash: receiverCash,
        });

        // Update trade status
        transaction.update(tradeRef, {
          status: "completed",
          updatedAt: Date.now(),
          completedAt: Date.now(),
        });
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error accepting trade:", error);
      res.status(400).json({ error: error.message || "Failed to accept trade" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
