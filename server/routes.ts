import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { sendItemReleaseWebhook, sendAdminLogWebhook } from "./lib/discord-webhooks";
import { verifyIdToken, checkIsAdmin, initializeFirebaseAdmin, getFirebaseAdmin } from "./lib/firebase-admin";
import { insertTradeSchema, type Trade, type User, type Item } from "@shared/schema";
import { z } from "zod";
import { registerTradeRoutes } from "./routes-trades";

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

  // Create a new trade
  app.post("/api/trades", requireAuth, async (req: any, res: any) => {
    try {
      console.log("[Trade Creation] Starting trade creation");
      
      const parsed = insertTradeSchema.parse(req.body);
      
      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        return res.status(403).json({ error: "User not found" });
      }
      const userData = userDoc.docs[0].data();
      
      if (userData.id !== parsed.initiatorId) {
        return res.status(403).json({ error: "Cannot create trades for other users" });
      }
      
      const tradeDoc = db.collection("trades").doc();
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

      await tradeDoc.set(trade);
      console.log("[Trade Creation] ✓ Created trade:", tradeDoc.id);
      
      res.json(trade);
    } catch (error) {
      console.error("[Trade Creation] ERROR:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create trade" });
    }
  });

  // Get trades for a user
  app.get("/api/trades", requireAuth, async (req: any, res: any) => {
    try {
      const { userId, box } = req.query;
      
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId is required" });
      }

      const userDoc = await db.collection("users").where("firebaseUid", "==", req.user.uid).limit(1).get();
      if (userDoc.empty) {
        return res.status(403).json({ error: "User not found" });
      }
      const userData = userDoc.docs[0].data() as User;
      
      if (userData.id !== userId) {
        return res.status(403).json({ error: "Cannot view trades for other users" });
      }

      if (box === "inbound") {
        const snapshot = await db.collection("trades")
          .where("recipientId", "==", userId)
          .where("status", "==", "pending")
          .orderBy("createdAt", "desc")
          .get();
        
        const trades: Trade[] = [];
        snapshot.forEach(doc => trades.push({ id: doc.id, ...doc.data() } as Trade));
        console.log("[Get Trades] Inbound:", trades.length);
        return res.json(trades);
        
      } else if (box === "outbound") {
        const snapshot = await db.collection("trades")
          .where("initiatorId", "==", userId)
          .where("status", "==", "pending")
          .orderBy("createdAt", "desc")
          .get();
        
        const trades: Trade[] = [];
        snapshot.forEach(doc => trades.push({ id: doc.id, ...doc.data() } as Trade));
        console.log("[Get Trades] Outbound:", trades.length);
        return res.json(trades);
        
      } else if (box === "completed" || box === "inactive") {
        const tradeHistory = userData.tradeHistory || [];
        const filtered = tradeHistory.filter(trade => {
          if (box === "completed") {
            return trade.status === "accepted";
          } else {
            return trade.status === "declined" || trade.status === "cancelled" || trade.status === "expired";
          }
        }).sort((a, b) => b.completedAt - a.createdAt);
        
        const trades: Trade[] = filtered.map(h => ({
          id: h.id,
          status: h.status,
          initiatorId: h.isInitiator ? userId : "",
          initiatorUsername: h.isInitiator ? userData.username : h.otherUsername,
          recipientId: h.isInitiator ? "" : userId,
          recipientUsername: h.isInitiator ? h.otherUsername : userData.username,
          createdAt: h.createdAt,
          updatedAt: h.completedAt,
          expiresAt: 0,
          initiatorOffer: h.isInitiator ? h.myOffer : h.theirOffer,
          recipientOffer: h.isInitiator ? h.theirOffer : h.myOffer,
          message: h.message,
        }));
        
        console.log("[Get Trades]", box + ":", trades.length);
        return res.json(trades);
      }

      return res.json([]);
    } catch (error) {
      console.error("[Get Trades] ERROR:", error);
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  // Trade action routes (accept, decline, cancel)
  registerTradeRoutes(app, db, requireAuth);

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
