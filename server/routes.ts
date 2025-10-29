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

  const httpServer = createServer(app);

  return httpServer;
}
