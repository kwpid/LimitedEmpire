import { z } from "zod";

// Rarity tiers based on item value
export const RARITY_TIERS = {
  COMMON: { min: 1, max: 2499, name: "Common", color: "#ffffff" },
  UNCOMMON: { min: 2500, max: 9999, name: "Uncommon", color: "#90ee90" },
  RARE: { min: 10000, max: 49999, name: "Rare", color: "#87ceeb" },
  ULTRA_RARE: { min: 50000, max: 250999, name: "Ultra Rare", color: "#1e3a8a" },
  EPIC: { min: 250000, max: 750000, name: "Epic", color: "#a855f7" },
  ULTRA_EPIC: { min: 750000, max: 2500000, name: "Ultra Epic", color: "#6b21a8" },
  MYTHIC: { min: 2500000, max: 9999999, name: "Mythic", color: "#dc2626" },
  INSANE: { min: 10000000, max: Infinity, name: "Insane", color: "rainbow" }
} as const;

export type RarityTier = keyof typeof RARITY_TIERS;

export function getRarityFromValue(value: number): RarityTier {
  if (value >= RARITY_TIERS.INSANE.min) return "INSANE";
  if (value >= RARITY_TIERS.MYTHIC.min) return "MYTHIC";
  if (value >= RARITY_TIERS.ULTRA_EPIC.min) return "ULTRA_EPIC";
  if (value >= RARITY_TIERS.EPIC.min) return "EPIC";
  if (value >= RARITY_TIERS.ULTRA_RARE.min) return "ULTRA_RARE";
  if (value >= RARITY_TIERS.RARE.min) return "RARE";
  if (value >= RARITY_TIERS.UNCOMMON.min) return "UNCOMMON";
  return "COMMON";
}

export function calculateRollChance(value: number): number {
  // Base chance calculation using logarithmic scaling
  // 100 value = 20%, 1000 = 5%, 10000 = 0.5%, etc.
  if (value <= 0) return 0;
  
  const baseChance = 20 / Math.pow(10, Math.log10(value) - 2);
  return Math.max(0.000001, Math.min(100, baseChance));
}

// User Schema
// PERFORMANCE OPTIMIZATION: Inventory is stored as an array in the user document
// Benefits:
// 1. Single document read instead of N+1 queries (1 user doc + N inventory docs)
// 2. Atomic updates with Firestore transactions
// 3. Reduced read costs (1 read vs. potentially hundreds per user)
// 4. Inventory cached with user data, reducing latency
// 
// LIMITATION: Firestore documents have a 1 MB size limit. Each inventory item is ~100-200 bytes,
// so this supports ~5000-10000 items per user. For users with larger inventories, consider:
// - Implementing inventory pagination/chunking
// - Using a subcollection for overflow items
// - Adding auto-cleanup of old/low-value items
export const userSchema = z.object({
  id: z.string(), // Firestore document ID
  firebaseUid: z.string(),
  username: z.string(),
  userId: z.number(), // Sequential ID (1, 2, 3, etc.)
  isAdmin: z.boolean(),
  isModerator: z.boolean().default(false),
  isBanned: z.boolean().default(false),
  isPermanentBan: z.boolean().default(false), // If true, user is permanently banned and auto-wiped
  banReason: z.string().optional(),
  banExpiresAt: z.number().optional(), // timestamp for temporary bans
  banNotes: z.string().max(500).optional(), // Moderator notes visible to the banned user
  createdAt: z.number(), // timestamp
  dateJoined: z.number().default(1730079600000), // Oct 28 2025 USA (midnight EST) - for existing users
  rollCount: z.number().default(0), // Total number of rolls performed
  cash: z.number().default(1000), // User's currency
  customStatus: z.string().max(120).default(""), // User's custom status message
  description: z.string().max(1000).default(""), // User's profile description
  showcaseItems: z.array(z.string()).max(5).default([]), // Array of inventory item IDs (max 5)
  timeSpentOnSite: z.number().default(0), // Total time spent on site in milliseconds
  lastActive: z.number().default(Date.now), // Last activity timestamp for online/offline tracking
  settings: z.object({
    autoSellRarities: z.array(z.enum(["COMMON", "UNCOMMON", "RARE", "ULTRA_RARE", "EPIC", "ULTRA_EPIC", "MYTHIC", "INSANE"])).default([]),
  }).default({ autoSellRarities: [] }),
  inventory: z.array(z.object({
    id: z.string(),
    itemId: z.string(),
    serialNumber: z.number().nullable(), // null for infinite items, 0 for admin's special copy, 1+ for user copies
    rolledAt: z.number(),
    amount: z.number().default(1),
    nftLocked: z.boolean().default(false), // NFT (Not For Trade) marking
  })).default([]),
  bestRolls: z.array(z.object({
    itemId: z.string(),
    itemName: z.string(),
    itemImageUrl: z.string(),
    itemValue: z.number(),
    itemRarity: z.enum(["COMMON", "UNCOMMON", "RARE", "ULTRA_RARE", "EPIC", "ULTRA_EPIC", "MYTHIC", "INSANE"]),
    serialNumber: z.number().nullable().optional(),
    timestamp: z.number(),
  })).optional().default([]), // Last 10 high-value rolls (250K+)
});

export const insertUserSchema = userSchema.omit({ id: true });

export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Username validation
export const usernameSchema = z
  .string()
  .min(2, "Username must be at least 2 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain English letters, numbers, and underscores")
  .refine((val) => {
    const underscoreCount = (val.match(/_/g) || []).length;
    return underscoreCount <= 2;
  }, "Username can have at most 2 underscores")
  .refine((val) => !/\s/.test(val), "Username cannot contain spaces");

// Item Schema
// ADMIN SERIAL #0 BEHAVIOR:
// - When an item is created, Admin (userId 1) automatically receives serial #0
// - For limited items: serial #0 does NOT count towards totalStock/remainingStock
//   Example: Creating item with 100 stock gives admin #0, users can get #1-100
// - For infinite items: admin gets a regular copy (serialNumber: null)
// - Serial #0 cannot be transferred via "Pick Serial" - it's permanently admin's
export const itemSchema = z.object({
  id: z.string(), // Firestore document ID
  name: z.string(),
  description: z.string(),
  imageUrl: z.string().url(),
  value: z.number().positive(),
  rarity: z.enum(["COMMON", "UNCOMMON", "RARE", "ULTRA_RARE", "EPIC", "ULTRA_EPIC", "MYTHIC", "INSANE"]),
  offSale: z.boolean(),
  stockType: z.enum(["limited", "infinite"]),
  totalStock: z.number().nullable(), // null for infinite stock; for limited, does NOT include admin's #0
  remainingStock: z.number().nullable(), // null for infinite stock; for limited, does NOT include admin's #0
  totalOwners: z.number().nonnegative().default(0), // Track unique users who own this item
  createdAt: z.number(),
  createdBy: z.string(), // userId who created it
});

export const insertItemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  description: z.string().min(1, "Item description is required"),
  imageUrl: z.string().url("Must be a valid image URL"),
  value: z.number().positive("Value must be positive"),
  offSale: z.boolean().default(false),
  stockType: z.enum(["limited", "infinite"]),
  totalStock: z.number().positive().nullable(),
  createdBy: z.string(),
});

export type Item = z.infer<typeof itemSchema>;
export type InsertItem = z.infer<typeof insertItemSchema>;

// Inventory Item Schema (individual rolled items)
export const inventoryItemSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  userId: z.string(),
  serialNumber: z.number().nullable(), // Serial number for limited items (1, 2, 3, etc.)
  rolledAt: z.number(),
});

export const insertInventoryItemSchema = inventoryItemSchema.omit({ id: true });

export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;

// Global Roll Event (for displaying recent high-value rolls)
export type GlobalRollEvent = {
  username: string;
  itemName: string;
  itemImageUrl: string;
  itemValue: number;
  rarity: RarityTier;
  timestamp: number;
  serialNumber?: number;
};

// Combined inventory item with full item details
export type InventoryItemWithDetails = InventoryItem & {
  item: Item;
};

// Audit Log Schema
export const auditLogSchema = z.object({
  id: z.string(), // Firestore document ID
  timestamp: z.number(), // When the action occurred
  adminId: z.string(), // Firestore ID of the admin who performed the action
  adminUsername: z.string(), // Username of the admin
  actionType: z.enum([
    "user_ban",
    "user_unban",
    "user_warn",
    "user_wipe_inventory",
    "user_give_items",
    "item_create",
    "item_edit",
    "item_delete",
    "game_reset_economy",
  ]),
  targetUserId: z.string().optional(), // Firestore ID of the affected user (if applicable)
  targetUsername: z.string().optional(), // Username of the affected user
  details: z.record(z.any()), // Additional details about the action
  metadata: z.object({
    banReason: z.string().optional(),
    banDuration: z.number().optional(), // in milliseconds
    isPermanentBan: z.boolean().optional(),
    itemsWiped: z.number().optional(),
    itemsGiven: z.array(z.object({
      itemId: z.string(),
      itemName: z.string(),
      quantity: z.number(),
    })).optional(),
    itemData: z.object({
      itemId: z.string(),
      itemName: z.string(),
      value: z.number(),
      rarity: z.string(),
      stock: z.number().nullable(),
    }).optional(),
  }).optional(),
});

export const insertAuditLogSchema = auditLogSchema.omit({ id: true });

export type AuditLog = z.infer<typeof auditLogSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export const tradeItemSchema = z.object({
  inventoryItemId: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  itemImageUrl: z.string(),
  itemValue: z.number(),
  serialNumber: z.number().nullable(),
  amount: z.number().default(1),
});

export const tradeSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "active", "completed", "declined", "countered"]),
  senderId: z.string(),
  senderUsername: z.string(),
  receiverId: z.string(),
  receiverUsername: z.string(),
  senderItems: z.array(tradeItemSchema).max(7).default([]),
  receiverItems: z.array(tradeItemSchema).max(7).default([]),
  senderCash: z.number().min(0).max(50000).default(0),
  receiverCash: z.number().min(0).max(10000).default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
  expiresAt: z.number(),
  completedAt: z.number().optional(),
  originalTradeId: z.string().optional(),
});

export const insertTradeSchema = tradeSchema.omit({ 
  id: true,
  updatedAt: true,
  completedAt: true,
});

export const createTradeRequestSchema = z.object({
  receiverId: z.string(),
  senderItems: z.array(z.object({
    inventoryItemId: z.string(),
    amount: z.number().min(1).default(1),
  })).min(1).max(7),
  receiverItems: z.array(z.object({
    inventoryItemId: z.string(),
    amount: z.number().min(1).default(1),
  })).min(1).max(7),
  senderCash: z.number().min(0).max(50000).default(0),
  receiverCash: z.number().min(0).max(10000).default(0),
});

export type Trade = z.infer<typeof tradeSchema>;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type TradeItem = z.infer<typeof tradeItemSchema>;
export type CreateTradeRequest = z.infer<typeof createTradeRequestSchema>;

