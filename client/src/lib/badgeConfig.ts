import type { User } from "@shared/schema";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface BadgeConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export const BADGE_ICONS = {
  developer: "https://cdn-icons-png.flaticon.com/512/8847/8847419.png",
  admin: "https://cdn-icons-png.flaticon.com/512/9187/9187604.png",
  veteran: "https://cdn-icons-png.flaticon.com/512/744/744922.png",
  millionaire: "https://cdn-icons-png.flaticon.com/512/3135/3135706.png",
  roller: "https://cdn-icons-png.flaticon.com/512/566/566109.png",
  advancedGambler: "https://cdn-icons-png.flaticon.com/512/2917/2917995.png",
  veteranGambler: "https://cdn-icons-png.flaticon.com/512/879/879757.png",
  leaderboardTop30: "https://cdn-icons-png.flaticon.com/512/7501/7501287.png",
  leaderboardTop10: "https://cdn-icons-png.flaticon.com/512/2583/2583988.png",
  leaderboardTop3: "https://cdn-icons-png.flaticon.com/512/3845/3845876.png",
  leaderboardTop1: "https://cdn-icons-png.flaticon.com/512/744/744984.png",
  serialOwner: "https://cdn-icons-png.flaticon.com/512/9195/9195842.png",
  dominusOwner: "https://cdn-icons-png.flaticon.com/512/2592/2592115.png",
  rareOwner: "https://cdn-icons-png.flaticon.com/512/1785/1785380.png",
};

export interface LeaderboardPositions {
  topValue?: number;
  topItems?: number;
  topCash?: number;
  topRolls?: number;
}

async function calculateLeaderboardPositions(userId: number): Promise<LeaderboardPositions> {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    const itemsSnapshot = await getDocs(collection(db, "items"));
    
    const itemsMap = new Map<string, any>();
    itemsSnapshot.forEach((doc) => {
      itemsMap.set(doc.id, doc.data());
    });
    
    const usersWithStats: Array<{
      userId: number;
      totalValue: number;
      itemCount: number;
      cash: number;
      rolls: number;
    }> = [];
    
    usersSnapshot.forEach((doc) => {
      const userData = { id: doc.id, ...doc.data() } as User;
      if (userData.userId === 1) return;
      
      let totalValue = 0;
      if (userData.inventory && userData.inventory.length > 0) {
        userData.inventory.forEach((invItem) => {
          const item = itemsMap.get(invItem.itemId);
          if (item) {
            totalValue += item.value * (invItem.amount || 1);
          }
        });
      }
      
      usersWithStats.push({
        userId: userData.userId,
        totalValue,
        itemCount: userData.inventory?.reduce((sum, inv) => sum + (inv.amount || 1), 0) || 0,
        cash: userData.cash ?? 0,
        rolls: userData.rollCount ?? 0,
      });
    });
    
    const valueRanking = [...usersWithStats].sort((a, b) => b.totalValue - a.totalValue);
    const itemsRanking = [...usersWithStats].sort((a, b) => b.itemCount - a.itemCount);
    const cashRanking = [...usersWithStats].sort((a, b) => b.cash - a.cash);
    const rollsRanking = [...usersWithStats].sort((a, b) => b.rolls - a.rolls);
    
    const valueIndex = valueRanking.findIndex(u => u.userId === userId);
    const itemsIndex = itemsRanking.findIndex(u => u.userId === userId);
    const cashIndex = cashRanking.findIndex(u => u.userId === userId);
    const rollsIndex = rollsRanking.findIndex(u => u.userId === userId);
    
    return {
      topValue: valueIndex !== -1 ? valueIndex + 1 : undefined,
      topItems: itemsIndex !== -1 ? itemsIndex + 1 : undefined,
      topCash: cashIndex !== -1 ? cashIndex + 1 : undefined,
      topRolls: rollsIndex !== -1 ? rollsIndex + 1 : undefined,
    };
  } catch (error) {
    console.error("Error calculating leaderboard positions:", error);
    return {};
  }
}

export async function calculateUserBadges(user: User, inventoryValue: number, leaderboardPositions?: LeaderboardPositions): Promise<BadgeConfig[]> {
  const badges: BadgeConfig[] = [];
  
  if (user.userId === 2) {
    badges.push({
      id: "developer",
      name: "Developer",
      description: "Platform Developer",
      icon: BADGE_ICONS.developer,
      color: "#3b82f6",
    });
  }
  
  if (user.isAdmin) {
    badges.push({
      id: "admin",
      name: "Admin",
      description: "Platform Administrator",
      icon: BADGE_ICONS.admin,
      color: "#ef4444",
    });
  }
  
  if (user.userId < 100) {
    badges.push({
      id: "veteran",
      name: "Veteran",
      description: "Early Adopter",
      icon: BADGE_ICONS.veteran,
      color: "#8b5cf6",
    });
  }
  
  if (inventoryValue >= 1000000) {
    badges.push({
      id: "millionaire",
      name: "Millionaire",
      description: "Inventory worth over 1M",
      icon: BADGE_ICONS.millionaire,
      color: "#eab308",
    });
  }
  
  const rollCount = user.rollCount ?? 0;
  if (rollCount >= 50000) {
    badges.push({
      id: "veteranGambler",
      name: "Veteran Gambler",
      description: "50,000+ rolls",
      icon: BADGE_ICONS.veteranGambler,
      color: "#dc2626",
    });
  } else if (rollCount >= 10000) {
    badges.push({
      id: "advancedGambler",
      name: "Advanced Gambler",
      description: "10,000+ rolls",
      icon: BADGE_ICONS.advancedGambler,
      color: "#f59e0b",
    });
  } else if (rollCount >= 1000) {
    badges.push({
      id: "roller",
      name: "Roller",
      description: "1,000+ rolls",
      icon: BADGE_ICONS.roller,
      color: "#10b981",
    });
  }
  
  if (leaderboardPositions) {
    const positions = [
      leaderboardPositions.topValue,
      leaderboardPositions.topItems,
      leaderboardPositions.topCash,
      leaderboardPositions.topRolls
    ].filter((pos): pos is number => pos !== undefined);
    
    if (positions.length > 0) {
      const bestPosition = Math.min(...positions);
      
      if (bestPosition === 1) {
        badges.push({
          id: "leaderboardTop1",
          name: "#1 on Leaderboard",
          description: "Top player in a category",
          icon: BADGE_ICONS.leaderboardTop1,
          color: "#fbbf24",
        });
      } else if (bestPosition <= 3) {
        badges.push({
          id: "leaderboardTop3",
          name: "Top 3 on Leaderboard",
          description: "Top 3 player in a category",
          icon: BADGE_ICONS.leaderboardTop3,
          color: "#fb923c",
        });
      } else if (bestPosition <= 10) {
        badges.push({
          id: "leaderboardTop10",
          name: "Top 10 on Leaderboard",
          description: "Top 10 player in a category",
          icon: BADGE_ICONS.leaderboardTop10,
          color: "#a78bfa",
        });
      } else if (bestPosition <= 30) {
        badges.push({
          id: "leaderboardTop30",
          name: "Top 30 on Leaderboard",
          description: "Top 30 player in a category",
          icon: BADGE_ICONS.leaderboardTop30,
          color: "#60a5fa",
        });
      }
    }
  }
  
  if (user.inventory && user.inventory.length > 0) {
    const hasSerialItem = user.inventory.some(invItem => invItem.serialNumber !== null && invItem.serialNumber !== undefined);
    if (hasSerialItem) {
      badges.push({
        id: "serialOwner",
        name: "Serial Owner",
        description: "Own a serial # item",
        icon: BADGE_ICONS.serialOwner,
        color: "#06b6d4",
      });
    }
    
    const itemsSnapshot = await getDocs(collection(db, "items"));
    const itemsMap = new Map<string, any>();
    itemsSnapshot.forEach((doc) => {
      itemsMap.set(doc.id, doc.data());
    });
    
    const hasDominusItem = user.inventory.some(invItem => {
      const item = itemsMap.get(invItem.itemId);
      return item && item.name && item.name.includes("Dominus");
    });
    if (hasDominusItem) {
      badges.push({
        id: "dominusOwner",
        name: "Dominus Owner",
        description: "Own a Dominus item",
        icon: BADGE_ICONS.dominusOwner,
        color: "#a855f7",
      });
    }
    
    const hasRareItem = user.inventory.some(invItem => {
      const item = itemsMap.get(invItem.itemId);
      if (!item) return false;
      const isStockOrTimer = item.stockType === "limited" || item.stockType === "timer";
      const hasLowOwners = (item.totalOwners || 0) < 15;
      return isStockOrTimer && hasLowOwners;
    });
    if (hasRareItem) {
      badges.push({
        id: "rareOwner",
        name: "Rare Owner",
        description: "Own an item with less than 15 owners",
        icon: BADGE_ICONS.rareOwner,
        color: "#ec4899",
      });
    }
  }
  
  return badges;
}

export { calculateLeaderboardPositions };
