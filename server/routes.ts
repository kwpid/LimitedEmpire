import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { sendItemReleaseWebhook, sendAdminLogWebhook } from "./lib/discord-webhooks";
import { verifyIdToken, checkIsAdmin, initializeFirebaseAdmin, getFirebaseAdmin } from "./lib/firebase-admin";
import { type User, type Item, type Trade, createTradeSchema, type TradeItem } from "@shared/schema";
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

  // Trade Routes
  
  // Auto-expire old trades (called periodically or on page load)
  app.post("/api/trades/expire", requireAuth, async (req, res) => {
    try {
      const now = Date.now();
      const tradesRef = db.collection("trades");
      
      const expiredTrades = await tradesRef
        .where("status", "==", "pending")
        .where("expiresAt", "<=", now)
        .get();

      const batch = db.batch();
      expiredTrades.docs.forEach(doc => {
        batch.update(doc.ref, { status: "expired", lastActionAt: now });
      });
      
      await batch.commit();
      
      res.json({ expired: expiredTrades.size });
    } catch (error) {
      console.error("Error expiring trades:", error);
      res.status(500).json({ error: "Failed to expire trades" });
    }
  });
  
  // Get user's trades with filtering
  app.get("/api/trades", requireAuth, async (req, res) => {
    try {
      const userId = req.user.uid;
      const type = req.query.type as string;
      const tradesRef = db.collection("trades");
      
      let query;
      
      switch (type) {
        case "inbound":
          query = tradesRef
            .where("recipientId", "==", userId)
            .where("status", "==", "pending");
          break;
        case "outbound":
          query = tradesRef
            .where("initiatorId", "==", userId)
            .where("status", "==", "pending");
          break;
        case "completed":
          query = tradesRef
            .where("status", "==", "accepted")
            .orderBy("completedAt", "desc")
            .limit(50);
          break;
        case "inactive":
          query = tradesRef
            .where("status", "in", ["declined", "cancelled", "expired"])
            .orderBy("lastActionAt", "desc")
            .limit(50);
          break;
        default:
          return res.status(400).json({ error: "Invalid type parameter" });
      }
      
      const snapshot = await query.get();
      const trades: Trade[] = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (type === "completed" || type === "inactive") {
          if (data.initiatorId === userId || data.recipientId === userId) {
            trades.push({ id: doc.id, ...data } as Trade);
          }
        } else {
          trades.push({ id: doc.id, ...data } as Trade);
        }
      });
      
      res.json(trades);
    } catch (error) {
      console.error("Error fetching trades:", error);
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });
  
  // Create a new trade
  app.post("/api/trades", requireAuth, async (req, res) => {
    try {
      const userId = req.user.uid;
      const validation = createTradeSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors[0].message });
      }
      
      const { recipientId, initiatorOffer, recipientOffer, message } = validation.data;
      
      if (recipientId === userId) {
        return res.status(400).json({ error: "Cannot trade with yourself" });
      }
      
      const initiatorDoc = await db.collection("users").doc(userId).get();
      const recipientDoc = await db.collection("users").doc(recipientId).get();
      
      if (!initiatorDoc.exists || !recipientDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const initiator = initiatorDoc.data() as User;
      const recipient = recipientDoc.data() as User;
      
      if (initiator.isBanned || recipient.isBanned) {
        return res.status(403).json({ error: "Cannot trade with banned users" });
      }
      
      if (initiatorOffer.cash > initiator.cash) {
        return res.status(400).json({ error: "Insufficient cash" });
      }
      
      const initiatorInventoryIds = new Set(initiator.inventory.map(item => item.id));
      for (const item of initiatorOffer.items) {
        if (!initiatorInventoryIds.has(item.inventoryItemId)) {
          return res.status(400).json({ error: "Invalid inventory item" });
        }
        const invItem = initiator.inventory.find(i => i.id === item.inventoryItemId);
        if (invItem?.nftLocked) {
          return res.status(400).json({ error: "Cannot trade NFT-locked items" });
        }
      }
      
      const recipientInventoryIds = new Set(recipient.inventory.map(item => item.id));
      for (const item of recipientOffer.items) {
        if (!recipientInventoryIds.has(item.inventoryItemId)) {
          return res.status(400).json({ error: "Invalid inventory item for recipient" });
        }
        const invItem = recipient.inventory.find(i => i.id === item.inventoryItemId);
        if (invItem?.nftLocked) {
          return res.status(400).json({ error: "Cannot request NFT-locked items" });
        }
      }
      
      const initiatorValue = initiatorOffer.items.reduce((sum, item) => sum + item.itemValue, 0) + initiatorOffer.cash;
      const recipientValue = recipientOffer.items.reduce((sum, item) => sum + item.itemValue, 0) + recipientOffer.cash;
      
      if (recipient.settings?.tradeSettings?.autoDeclineHugeLoss) {
        const recipientLoss = recipientValue - initiatorValue;
        const lossPercentage = (recipientLoss / recipientValue) * 100;
        
        if (lossPercentage >= 70) {
          return res.status(400).json({ error: "Trade auto-declined: recipient has 70% loss protection enabled" });
        }
      }
      
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      const trade: Omit<Trade, "id"> = {
        status: "pending",
        initiatorId: userId,
        initiatorUsername: initiator.username,
        recipientId,
        recipientUsername: recipient.username,
        initiatorOffer,
        recipientOffer,
        message: message || "",
        createdAt: now,
        expiresAt: now + sevenDays,
        counterCount: 0,
        initiatorOfferValue: initiatorValue,
        recipientOfferValue: recipientValue,
      };
      
      const tradeRef = await db.collection("trades").add(trade);
      
      res.json({ id: tradeRef.id, ...trade });
    } catch (error) {
      console.error("Error creating trade:", error);
      res.status(500).json({ error: "Failed to create trade" });
    }
  });
  
  // Accept a trade
  app.post("/api/trades/:id/accept", requireAuth, async (req, res) => {
    try {
      const userId = req.user.uid;
      const tradeId = req.params.id;
      
      const tradeDoc = await db.collection("trades").doc(tradeId).get();
      
      if (!tradeDoc.exists) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      const trade = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
      
      if (trade.recipientId !== userId) {
        return res.status(403).json({ error: "Only the recipient can accept a trade" });
      }
      
      if (trade.status !== "pending") {
        return res.status(400).json({ error: "Trade is no longer active" });
      }
      
      if (trade.expiresAt < Date.now()) {
        await tradeDoc.ref.update({ status: "expired", lastActionAt: Date.now() });
        return res.status(400).json({ error: "Trade has expired" });
      }
      
      const initiatorDoc = await db.collection("users").doc(trade.initiatorId).get();
      const recipientDoc = await db.collection("users").doc(trade.recipientId).get();
      
      if (!initiatorDoc.exists || !recipientDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const initiator = initiatorDoc.data() as User;
      const recipient = recipientDoc.data() as User;
      
      if (initiator.isBanned || recipient.isBanned) {
        return res.status(403).json({ error: "Cannot complete trade with banned users" });
      }
      
      if (initiator.cash < trade.initiatorOffer.cash) {
        return res.status(400).json({ error: "Initiator has insufficient cash" });
      }
      
      if (recipient.cash < trade.recipientOffer.cash) {
        return res.status(400).json({ error: "You have insufficient cash" });
      }
      
      const initiatorInventoryIds = new Set(initiator.inventory.map(item => item.id));
      for (const item of trade.initiatorOffer.items) {
        if (!initiatorInventoryIds.has(item.inventoryItemId)) {
          return res.status(400).json({ error: "Initiator no longer has offered items" });
        }
      }
      
      const recipientInventoryIds = new Set(recipient.inventory.map(item => item.id));
      for (const item of trade.recipientOffer.items) {
        if (!recipientInventoryIds.has(item.inventoryItemId)) {
          return res.status(400).json({ error: "You no longer have requested items" });
        }
      }
      
      const batch = db.batch();
      
      const newInitiatorInventory = [...initiator.inventory];
      const newRecipientInventory = [...recipient.inventory];
      
      for (const item of trade.initiatorOffer.items) {
        const index = newInitiatorInventory.findIndex(i => i.id === item.inventoryItemId);
        if (index !== -1) {
          const inventoryItem = newInitiatorInventory.splice(index, 1)[0];
          newRecipientInventory.push(inventoryItem);
        }
      }
      
      for (const item of trade.recipientOffer.items) {
        const index = newRecipientInventory.findIndex(i => i.id === item.inventoryItemId);
        if (index !== -1) {
          const inventoryItem = newRecipientInventory.splice(index, 1)[0];
          newInitiatorInventory.push(inventoryItem);
        }
      }
      
      const newInitiatorCash = initiator.cash - trade.initiatorOffer.cash + trade.recipientOffer.cash;
      const newRecipientCash = recipient.cash - trade.recipientOffer.cash + trade.initiatorOffer.cash;
      
      const now = Date.now();
      
      const tradeHistoryEntry = {
        id: tradeId,
        status: "accepted" as const,
        isInitiator: false,
        otherUserId: trade.initiatorId,
        otherUsername: trade.initiatorUsername,
        myOffer: {
          items: trade.recipientOffer.items,
          cash: trade.recipientOffer.cash,
        },
        theirOffer: {
          items: trade.initiatorOffer.items,
          cash: trade.initiatorOffer.cash,
        },
        createdAt: trade.createdAt,
        completedAt: now,
        message: trade.message,
      };
      
      const initiatorHistoryEntry = {
        ...tradeHistoryEntry,
        isInitiator: true,
        otherUserId: trade.recipientId,
        otherUsername: trade.recipientUsername,
        myOffer: {
          items: trade.initiatorOffer.items,
          cash: trade.initiatorOffer.cash,
        },
        theirOffer: {
          items: trade.recipientOffer.items,
          cash: trade.recipientOffer.cash,
        },
      };
      
      const initiatorHistory = [...(initiator.tradeHistory || []), initiatorHistoryEntry].slice(-50);
      const recipientHistory = [...(recipient.tradeHistory || []), tradeHistoryEntry].slice(-50);
      
      batch.update(initiatorDoc.ref, {
        inventory: newInitiatorInventory,
        cash: newInitiatorCash,
        tradeHistory: initiatorHistory,
      });
      
      batch.update(recipientDoc.ref, {
        inventory: newRecipientInventory,
        cash: newRecipientCash,
        tradeHistory: recipientHistory,
      });
      
      batch.update(tradeDoc.ref, {
        status: "accepted",
        completedAt: now,
        lastActionAt: now,
      });
      
      await batch.commit();
      
      res.json({ success: true, trade: { ...trade, status: "accepted", completedAt: now } });
    } catch (error) {
      console.error("Error accepting trade:", error);
      res.status(500).json({ error: "Failed to accept trade" });
    }
  });
  
  // Decline a trade
  app.post("/api/trades/:id/decline", requireAuth, async (req, res) => {
    try {
      const userId = req.user.uid;
      const tradeId = req.params.id;
      
      const tradeDoc = await db.collection("trades").doc(tradeId).get();
      
      if (!tradeDoc.exists) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      const trade = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
      
      if (trade.recipientId !== userId) {
        return res.status(403).json({ error: "Only the recipient can decline a trade" });
      }
      
      if (trade.status !== "pending") {
        return res.status(400).json({ error: "Trade is no longer active" });
      }
      
      const now = Date.now();
      await tradeDoc.ref.update({
        status: "declined",
        lastActionAt: now,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error declining trade:", error);
      res.status(500).json({ error: "Failed to decline trade" });
    }
  });
  
  // Cancel a trade (initiator only)
  app.post("/api/trades/:id/cancel", requireAuth, async (req, res) => {
    try {
      const userId = req.user.uid;
      const tradeId = req.params.id;
      
      const tradeDoc = await db.collection("trades").doc(tradeId).get();
      
      if (!tradeDoc.exists) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      const trade = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
      
      if (trade.initiatorId !== userId) {
        return res.status(403).json({ error: "Only the initiator can cancel a trade" });
      }
      
      if (trade.status !== "pending") {
        return res.status(400).json({ error: "Trade is no longer active" });
      }
      
      const now = Date.now();
      await tradeDoc.ref.update({
        status: "cancelled",
        lastActionAt: now,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling trade:", error);
      res.status(500).json({ error: "Failed to cancel trade" });
    }
  });
  
  // Counter a trade (creates a new trade with offers swapped/modified)
  app.post("/api/trades/:id/counter", requireAuth, async (req, res) => {
    try {
      const userId = req.user.uid;
      const originalTradeId = req.params.id;
      
      const tradeDoc = await db.collection("trades").doc(originalTradeId).get();
      
      if (!tradeDoc.exists) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      const originalTrade = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
      
      if (originalTrade.recipientId !== userId) {
        return res.status(403).json({ error: "Only the recipient can counter a trade" });
      }
      
      if (originalTrade.status !== "pending") {
        return res.status(400).json({ error: "Trade is no longer active" });
      }
      
      const validation = createTradeSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors[0].message });
      }
      
      const { initiatorOffer, recipientOffer, message } = validation.data;
      
      const initiatorDoc = await db.collection("users").doc(userId).get();
      const recipientDoc = await db.collection("users").doc(originalTrade.initiatorId).get();
      
      if (!initiatorDoc.exists || !recipientDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const initiator = initiatorDoc.data() as User;
      const recipient = recipientDoc.data() as User;
      
      if (initiator.isBanned || recipient.isBanned) {
        return res.status(403).json({ error: "Cannot trade with banned users" });
      }
      
      if (initiatorOffer.cash > initiator.cash) {
        return res.status(400).json({ error: "Insufficient cash" });
      }
      
      const initiatorInventoryIds = new Set(initiator.inventory.map(item => item.id));
      for (const item of initiatorOffer.items) {
        if (!initiatorInventoryIds.has(item.inventoryItemId)) {
          return res.status(400).json({ error: "Invalid inventory item" });
        }
      }
      
      const recipientInventoryIds = new Set(recipient.inventory.map(item => item.id));
      for (const item of recipientOffer.items) {
        if (!recipientInventoryIds.has(item.inventoryItemId)) {
          return res.status(400).json({ error: "Invalid inventory item for recipient" });
        }
      }
      
      const initiatorValue = initiatorOffer.items.reduce((sum, item) => sum + item.itemValue, 0) + initiatorOffer.cash;
      const recipientValue = recipientOffer.items.reduce((sum, item) => sum + item.itemValue, 0) + recipientOffer.cash;
      
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      const counterTrade: Omit<Trade, "id"> = {
        status: "pending",
        initiatorId: userId,
        initiatorUsername: initiator.username,
        recipientId: originalTrade.initiatorId,
        recipientUsername: originalTrade.initiatorUsername,
        initiatorOffer,
        recipientOffer,
        message: message || "",
        createdAt: now,
        expiresAt: now + sevenDays,
        counterCount: (originalTrade.counterCount || 0) + 1,
        originalTradeId,
        initiatorOfferValue: initiatorValue,
        recipientOfferValue: recipientValue,
      };
      
      const batch = db.batch();
      
      batch.update(tradeDoc.ref, {
        status: "declined",
        lastActionAt: now,
      });
      
      const newTradeRef = db.collection("trades").doc();
      batch.set(newTradeRef, counterTrade);
      
      await batch.commit();
      
      res.json({ id: newTradeRef.id, ...counterTrade });
    } catch (error) {
      console.error("Error countering trade:", error);
      res.status(500).json({ error: "Failed to counter trade" });
    }
  });


  const httpServer = createServer(app);

  return httpServer;
}
