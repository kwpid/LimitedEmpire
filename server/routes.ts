import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { sendItemReleaseWebhook, sendAdminLogWebhook } from "./lib/discord-webhooks";

// Simple admin verification middleware
// In production, this should validate Firebase Admin tokens
const requireAdmin = (req: any, res: any, next: any) => {
  // For now, we'll add a simple secret key check
  // The client will need to send this in headers
  const adminSecret = req.headers['x-admin-secret'];
  const expectedSecret = process.env.ADMIN_WEBHOOK_SECRET || 'change-this-in-production';
  
  if (adminSecret !== expectedSecret) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
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
