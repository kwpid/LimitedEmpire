import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { sendItemReleaseWebhook, sendAdminLogWebhook } from "./lib/discord-webhooks";
import { verifyIdToken, checkIsAdmin, initializeFirebaseAdmin, getFirebaseAdmin } from "./lib/firebase-admin";
import { type User, type Item, createTradeRequestSchema, type Trade } from "@shared/schema";
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

  app.post("/api/trades", requireAuth, async (req, res) => {
    try {
      const data = createTradeRequestSchema.parse(req.body);
      const senderUid = req.user.uid;
      
      const senderDoc = await db.collection('users').doc(senderUid).get();
      const receiverDoc = await db.collection('users').doc(data.receiverId).get();
      
      if (!senderDoc.exists || !receiverDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const sender = senderDoc.data() as User;
      const receiver = receiverDoc.data() as User;
      
      if (sender.isBanned) {
        return res.status(403).json({ error: "You are banned and cannot send trades" });
      }
      
      if (receiver.isBanned) {
        return res.status(403).json({ error: "This user is banned and cannot receive trades" });
      }
      
      if (data.senderCash > sender.cash) {
        return res.status(400).json({ error: "Insufficient cash" });
      }
      
      const senderInventoryMap = new Map(sender.inventory.map(item => [item.id, item]));
      const receiverInventoryMap = new Map(receiver.inventory.map(item => [item.id, item]));
      
      const senderTradeItems = [];
      for (const item of data.senderItems) {
        const invItem = senderInventoryMap.get(item.inventoryItemId);
        if (!invItem) {
          return res.status(400).json({ error: "Item not found in your inventory" });
        }
        if (invItem.nftLocked) {
          return res.status(400).json({ error: "Cannot trade NFT-locked items" });
        }
        if (invItem.amount < item.amount) {
          return res.status(400).json({ error: "Insufficient item quantity" });
        }
        
        const itemDoc = await db.collection('items').doc(invItem.itemId).get();
        if (!itemDoc.exists) {
          return res.status(400).json({ error: "Item not found" });
        }
        const itemData = itemDoc.data() as Item;
        
        senderTradeItems.push({
          inventoryItemId: invItem.id,
          itemId: invItem.itemId,
          itemName: itemData.name,
          itemImageUrl: itemData.imageUrl,
          itemValue: itemData.value,
          serialNumber: invItem.serialNumber,
          amount: item.amount,
        });
      }
      
      const receiverTradeItems = [];
      for (const item of data.receiverItems) {
        const invItem = receiverInventoryMap.get(item.inventoryItemId);
        if (!invItem) {
          return res.status(400).json({ error: "Item not found in receiver's inventory" });
        }
        if (invItem.nftLocked) {
          return res.status(400).json({ error: "Cannot request NFT-locked items" });
        }
        if (invItem.amount < item.amount) {
          return res.status(400).json({ error: "Insufficient item quantity in receiver's inventory" });
        }
        
        const itemDoc = await db.collection('items').doc(invItem.itemId).get();
        if (!itemDoc.exists) {
          return res.status(400).json({ error: "Item not found" });
        }
        const itemData = itemDoc.data() as Item;
        
        receiverTradeItems.push({
          inventoryItemId: invItem.id,
          itemId: invItem.itemId,
          itemName: itemData.name,
          itemImageUrl: itemData.imageUrl,
          itemValue: itemData.value,
          serialNumber: invItem.serialNumber,
          amount: item.amount,
        });
      }
      
      const now = Date.now();
      const trade: Omit<Trade, 'id'> = {
        status: "pending",
        senderId: senderUid,
        senderUsername: sender.username,
        receiverId: data.receiverId,
        receiverUsername: receiver.username,
        senderItems: senderTradeItems,
        receiverItems: receiverTradeItems,
        senderCash: data.senderCash,
        receiverCash: data.receiverCash,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + (7 * 24 * 60 * 60 * 1000),
      };
      
      const tradeDoc = await db.collection('trades').add(trade);
      
      res.json({ success: true, tradeId: tradeDoc.id });
    } catch (error: any) {
      console.error("Error creating trade:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid trade data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create trade" });
    }
  });

  app.get("/api/trades", requireAuth, async (req, res) => {
    try {
      const userId = req.user.uid;
      const type = req.query.type as string;
      
      let query;
      if (type === 'inbound') {
        query = db.collection('trades').where('receiverId', '==', userId).where('status', '==', 'pending');
      } else if (type === 'outbound') {
        query = db.collection('trades').where('senderId', '==', userId).where('status', 'in', ['pending', 'active']);
      } else if (type === 'completed') {
        query = db.collection('trades').where('status', '==', 'completed')
          .where('senderId', '==', userId);
        const receiverQuery = db.collection('trades').where('status', '==', 'completed')
          .where('receiverId', '==', userId);
        
        const [senderDocs, receiverDocs] = await Promise.all([
          query.get(),
          receiverQuery.get()
        ]);
        
        const trades = [
          ...senderDocs.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<Trade, 'id'> })),
          ...receiverDocs.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<Trade, 'id'> }))
        ].sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt));
        
        return res.json(trades);
      } else if (type === 'inactive') {
        query = db.collection('trades').where('status', 'in', ['declined', 'countered'])
          .where('senderId', '==', userId);
        const receiverQuery = db.collection('trades').where('status', 'in', ['declined', 'countered'])
          .where('receiverId', '==', userId);
        
        const [senderDocs, receiverDocs] = await Promise.all([
          query.get(),
          receiverQuery.get()
        ]);
        
        const trades = [
          ...senderDocs.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<Trade, 'id'> })),
          ...receiverDocs.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<Trade, 'id'> }))
        ].sort((a, b) => b.updatedAt - a.updatedAt);
        
        return res.json(trades);
      } else {
        return res.status(400).json({ error: "Invalid trade type" });
      }
      
      const snapshot = await query.orderBy('createdAt', 'desc').get();
      const trades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<Trade, 'id'> }));
      
      res.json(trades);
    } catch (error) {
      console.error("Error fetching trades:", error);
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  app.post("/api/trades/:id/accept", requireAuth, async (req, res) => {
    try {
      const tradeId = req.params.id;
      const userId = req.user.uid;
      
      await db.runTransaction(async (transaction) => {
        const tradeRef = db.collection('trades').doc(tradeId);
        const tradeDoc = await transaction.get(tradeRef);
        
        if (!tradeDoc.exists) {
          throw new Error("Trade not found");
        }
        
        const trade = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
        
        if (trade.receiverId !== userId) {
          throw new Error("You are not the receiver of this trade");
        }
        
        if (trade.status !== 'pending') {
          throw new Error("Trade is not pending");
        }
        
        if (trade.expiresAt < Date.now()) {
          throw new Error("Trade has expired");
        }
        
        const senderRef = db.collection('users').doc(trade.senderId);
        const receiverRef = db.collection('users').doc(trade.receiverId);
        
        const [senderDoc, receiverDoc] = await Promise.all([
          transaction.get(senderRef),
          transaction.get(receiverRef)
        ]);
        
        if (!senderDoc.exists || !receiverDoc.exists) {
          throw new Error("User not found");
        }
        
        const sender = senderDoc.data() as User;
        const receiver = receiverDoc.data() as User;
        
        if (sender.cash < trade.senderCash) {
          throw new Error("Sender has insufficient cash");
        }
        
        if (receiver.cash < trade.receiverCash) {
          throw new Error("Receiver has insufficient cash");
        }
        
        const senderInventoryMap = new Map(sender.inventory.map(item => [item.id, item]));
        const receiverInventoryMap = new Map(receiver.inventory.map(item => [item.id, item]));
        
        for (const item of trade.senderItems) {
          const invItem = senderInventoryMap.get(item.inventoryItemId);
          if (!invItem || invItem.amount < item.amount) {
            throw new Error("Sender no longer has the items");
          }
        }
        
        for (const item of trade.receiverItems) {
          const invItem = receiverInventoryMap.get(item.inventoryItemId);
          if (!invItem || invItem.amount < item.amount) {
            throw new Error("Receiver no longer has the items");
          }
        }
        
        const newSenderInventory = [...sender.inventory];
        const newReceiverInventory = [...receiver.inventory];
        
        for (const item of trade.senderItems) {
          const idx = newSenderInventory.findIndex(i => i.id === item.inventoryItemId);
          if (idx !== -1) {
            if (newSenderInventory[idx].amount === item.amount) {
              newSenderInventory.splice(idx, 1);
            } else {
              newSenderInventory[idx] = {
                ...newSenderInventory[idx],
                amount: newSenderInventory[idx].amount - item.amount
              };
            }
          }
          
          const existingIdx = newReceiverInventory.findIndex(i => 
            i.itemId === item.itemId && 
            i.serialNumber === item.serialNumber
          );
          
          if (existingIdx !== -1) {
            newReceiverInventory[existingIdx] = {
              ...newReceiverInventory[existingIdx],
              amount: newReceiverInventory[existingIdx].amount + item.amount
            };
          } else {
            newReceiverInventory.push({
              id: db.collection('users').doc().id,
              itemId: item.itemId,
              serialNumber: item.serialNumber,
              rolledAt: Date.now(),
              amount: item.amount,
              nftLocked: false,
            });
          }
        }
        
        for (const item of trade.receiverItems) {
          const idx = newReceiverInventory.findIndex(i => i.id === item.inventoryItemId);
          if (idx !== -1) {
            if (newReceiverInventory[idx].amount === item.amount) {
              newReceiverInventory.splice(idx, 1);
            } else {
              newReceiverInventory[idx] = {
                ...newReceiverInventory[idx],
                amount: newReceiverInventory[idx].amount - item.amount
              };
            }
          }
          
          const existingIdx = newSenderInventory.findIndex(i => 
            i.itemId === item.itemId && 
            i.serialNumber === item.serialNumber
          );
          
          if (existingIdx !== -1) {
            newSenderInventory[existingIdx] = {
              ...newSenderInventory[existingIdx],
              amount: newSenderInventory[existingIdx].amount + item.amount
            };
          } else {
            newSenderInventory.push({
              id: db.collection('users').doc().id,
              itemId: item.itemId,
              serialNumber: item.serialNumber,
              rolledAt: Date.now(),
              amount: item.amount,
              nftLocked: false,
            });
          }
        }
        
        const newSenderCash = sender.cash - trade.senderCash + trade.receiverCash;
        const newReceiverCash = receiver.cash - trade.receiverCash + trade.senderCash;
        
        transaction.update(senderRef, { 
          inventory: newSenderInventory,
          cash: newSenderCash
        });
        transaction.update(receiverRef, { 
          inventory: newReceiverInventory,
          cash: newReceiverCash
        });
        transaction.update(tradeRef, { 
          status: 'completed',
          updatedAt: Date.now(),
          completedAt: Date.now()
        });
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error accepting trade:", error);
      res.status(400).json({ error: error.message || "Failed to accept trade" });
    }
  });

  app.post("/api/trades/:id/decline", requireAuth, async (req, res) => {
    try {
      const tradeId = req.params.id;
      const userId = req.user.uid;
      
      const tradeRef = db.collection('trades').doc(tradeId);
      const tradeDoc = await tradeRef.get();
      
      if (!tradeDoc.exists) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      const trade = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
      
      if (trade.receiverId !== userId && trade.senderId !== userId) {
        return res.status(403).json({ error: "You are not part of this trade" });
      }
      
      if (trade.status !== 'pending' && trade.status !== 'active') {
        return res.status(400).json({ error: "Trade is not active" });
      }
      
      await tradeRef.update({ 
        status: 'declined',
        updatedAt: Date.now()
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error declining trade:", error);
      res.status(500).json({ error: "Failed to decline trade" });
    }
  });

  app.post("/api/trades/:id/counter", requireAuth, async (req, res) => {
    try {
      const tradeId = req.params.id;
      const userId = req.user.uid;
      const data = createTradeRequestSchema.parse(req.body);
      
      const tradeRef = db.collection('trades').doc(tradeId);
      const tradeDoc = await tradeRef.get();
      
      if (!tradeDoc.exists) {
        return res.status(404).json({ error: "Trade not found" });
      }
      
      const trade = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
      
      if (trade.receiverId !== userId) {
        return res.status(403).json({ error: "Only the receiver can counter a trade" });
      }
      
      if (trade.status !== 'pending') {
        return res.status(400).json({ error: "Trade is not pending" });
      }
      
      await tradeRef.update({ 
        status: 'countered',
        updatedAt: Date.now()
      });
      
      const receiverDoc = await db.collection('users').doc(userId).get();
      const senderDoc = await db.collection('users').doc(trade.senderId).get();
      
      if (!receiverDoc.exists || !senderDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const receiver = receiverDoc.data() as User;
      const sender = senderDoc.data() as User;
      
      if (data.senderCash > receiver.cash) {
        return res.status(400).json({ error: "Insufficient cash" });
      }
      
      const receiverInventoryMap = new Map(receiver.inventory.map(item => [item.id, item]));
      const senderInventoryMap = new Map(sender.inventory.map(item => [item.id, item]));
      
      const senderTradeItems = [];
      for (const item of data.senderItems) {
        const invItem = receiverInventoryMap.get(item.inventoryItemId);
        if (!invItem) {
          return res.status(400).json({ error: "Item not found in your inventory" });
        }
        if (invItem.nftLocked) {
          return res.status(400).json({ error: "Cannot trade NFT-locked items" });
        }
        if (invItem.amount < item.amount) {
          return res.status(400).json({ error: "Insufficient item quantity" });
        }
        
        const itemDoc = await db.collection('items').doc(invItem.itemId).get();
        if (!itemDoc.exists) {
          return res.status(400).json({ error: "Item not found" });
        }
        const itemData = itemDoc.data() as Item;
        
        senderTradeItems.push({
          inventoryItemId: invItem.id,
          itemId: invItem.itemId,
          itemName: itemData.name,
          itemImageUrl: itemData.imageUrl,
          itemValue: itemData.value,
          serialNumber: invItem.serialNumber,
          amount: item.amount,
        });
      }
      
      const receiverTradeItems = [];
      for (const item of data.receiverItems) {
        const invItem = senderInventoryMap.get(item.inventoryItemId);
        if (!invItem) {
          return res.status(400).json({ error: "Item not found in receiver's inventory" });
        }
        if (invItem.nftLocked) {
          return res.status(400).json({ error: "Cannot request NFT-locked items" });
        }
        if (invItem.amount < item.amount) {
          return res.status(400).json({ error: "Insufficient item quantity in receiver's inventory" });
        }
        
        const itemDoc = await db.collection('items').doc(invItem.itemId).get();
        if (!itemDoc.exists) {
          return res.status(400).json({ error: "Item not found" });
        }
        const itemData = itemDoc.data() as Item;
        
        receiverTradeItems.push({
          inventoryItemId: invItem.id,
          itemId: invItem.itemId,
          itemName: itemData.name,
          itemImageUrl: itemData.imageUrl,
          itemValue: itemData.value,
          serialNumber: invItem.serialNumber,
          amount: item.amount,
        });
      }
      
      const now = Date.now();
      const counterTrade: Omit<Trade, 'id'> = {
        status: "pending",
        senderId: userId,
        senderUsername: receiver.username,
        receiverId: trade.senderId,
        receiverUsername: sender.username,
        senderItems: senderTradeItems,
        receiverItems: receiverTradeItems,
        senderCash: data.senderCash,
        receiverCash: data.receiverCash,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + (7 * 24 * 60 * 60 * 1000),
        originalTradeId: tradeId,
      };
      
      const counterTradeDoc = await db.collection('trades').add(counterTrade);
      
      res.json({ success: true, tradeId: counterTradeDoc.id });
    } catch (error: any) {
      console.error("Error countering trade:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid trade data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to counter trade" });
    }
  });


  const httpServer = createServer(app);

  return httpServer;
}
