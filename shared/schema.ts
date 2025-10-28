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
export const userSchema = z.object({
  id: z.string(), // Firestore document ID
  firebaseUid: z.string(),
  username: z.string(),
  userId: z.number(), // Sequential ID (1, 2, 3, etc.)
  isAdmin: z.boolean(),
  isBanned: z.boolean().default(false),
  banReason: z.string().optional(),
  createdAt: z.number(), // timestamp
  rollCount: z.number().default(0), // Total number of rolls performed
  cash: z.number().default(1000), // User's currency
  settings: z.object({
    autoSellRarities: z.array(z.enum(["COMMON", "UNCOMMON", "RARE", "ULTRA_RARE", "EPIC", "ULTRA_EPIC", "MYTHIC", "INSANE"])).default([]),
  }).default({ autoSellRarities: [] }),
  inventory: z.array(z.object({
    id: z.string(),
    itemId: z.string(),
    serialNumber: z.number().nullable(),
    rolledAt: z.number(),
  })).default([]),
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
export const itemSchema = z.object({
  id: z.string(), // Firestore document ID
  name: z.string(),
  description: z.string(),
  imageUrl: z.string().url(),
  value: z.number().positive(),
  rarity: z.enum(["COMMON", "UNCOMMON", "RARE", "ULTRA_RARE", "EPIC", "ULTRA_EPIC", "MYTHIC", "INSANE"]),
  offSale: z.boolean(),
  stockType: z.enum(["limited", "infinite"]),
  totalStock: z.number().nullable(), // null for infinite stock
  remainingStock: z.number().nullable(), // null for infinite stock
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
