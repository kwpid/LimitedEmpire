import { doc, collection } from "firebase/firestore";
import { db, getDoc, setDoc, getDocs } from "./firebase";
import type { User, Item } from "@shared/schema";
import { itemsCache } from "./itemsCache";

export interface LeaderboardPlayer {
  user: User;
  value: number;
  rank: number;
}

export interface LeaderboardData {
  topValue: LeaderboardPlayer[];
  topItems: LeaderboardPlayer[];
  topCash: LeaderboardPlayer[];
  topRolls: LeaderboardPlayer[];
  lastUpdated: number;
  updatedBy: string;
}

class LeaderboardCache {
  private cache: LeaderboardData | null = null;
  private fetchPromise: Promise<LeaderboardData> | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly CACHE_DOC_ID = "current";
  private isUpdating = false;

  async getLeaderboard(): Promise<LeaderboardData> {
    // If we have a valid cache in memory, return it
    if (this.cache && Date.now() - this.cache.lastUpdated < this.CACHE_DURATION) {
      console.log('%c[LEADERBOARD CACHE] Using in-memory cache', 'color: #10b981; font-weight: bold');
      return this.cache;
    }

    // If already fetching, wait for that fetch
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Fetch from Firestore cache
    this.fetchPromise = this.fetchFromFirestore();
    const data = await this.fetchPromise;
    this.fetchPromise = null;

    return data;
  }

  private async fetchFromFirestore(): Promise<LeaderboardData> {
    try {
      const cacheRef = doc(db, "leaderboardCache", this.CACHE_DOC_ID);
      const cacheDoc = await getDoc(cacheRef);

      if (cacheDoc.exists()) {
        const data = cacheDoc.data() as LeaderboardData;
        const age = Date.now() - data.lastUpdated;

        console.log(`%c[LEADERBOARD CACHE] Loaded from Firestore (age: ${(age / 1000).toFixed(0)}s)`, 'color: #3b82f6; font-weight: bold');

        // If cache is still fresh, use it
        if (age < this.CACHE_DURATION) {
          this.cache = data;
          return data;
        }

        // Cache is stale, trigger background update but return stale data
        console.log('%c[LEADERBOARD CACHE] Cache is stale, triggering background update...', 'color: #f59e0b; font-weight: bold');
        this.triggerBackgroundUpdate();
        
        // Return stale data for now
        this.cache = data;
        return data;
      }

      // No cache exists, calculate fresh
      console.log('%c[LEADERBOARD CACHE] No cache found, calculating fresh leaderboard...', 'color: #f59e0b; font-weight: bold');
      return await this.calculateAndStore();
    } catch (error) {
      console.error("Error fetching leaderboard from Firestore:", error);
      
      // If we have stale cache, return it as fallback
      if (this.cache) {
        console.log('%c[LEADERBOARD CACHE] Error fetching, using stale cache as fallback', 'color: #ef4444; font-weight: bold');
        return this.cache;
      }
      
      throw error;
    }
  }

  private async triggerBackgroundUpdate() {
    // Prevent multiple simultaneous updates
    if (this.isUpdating) {
      console.log('%c[LEADERBOARD CACHE] Update already in progress, skipping', 'color: #6b7280');
      return;
    }

    this.isUpdating = true;

    try {
      // Run update in background (don't await)
      this.calculateAndStore().then((data) => {
        this.cache = data;
        console.log('%c[LEADERBOARD CACHE] Background update completed', 'color: #10b981; font-weight: bold');
      }).catch((error) => {
        console.error("Background leaderboard update failed:", error);
      }).finally(() => {
        this.isUpdating = false;
      });
    } catch (error) {
      this.isUpdating = false;
      console.error("Error triggering background update:", error);
    }
  }

  private async calculateAndStore(): Promise<LeaderboardData> {
    console.log('%c[LEADERBOARD CACHE] Calculating fresh leaderboard data...', 'color: #8b5cf6; font-weight: bold');
    
    // Fetch all users
    const usersSnapshot = await getDocs(collection(db, "users"));
    const users: User[] = [];
    usersSnapshot.forEach((doc) => {
      const userData = { id: doc.id, ...doc.data() } as User;
      if (userData.userId !== 1) { // Exclude admin
        users.push(userData);
      }
    });

    // Get items from cache
    const itemsMap = await itemsCache.getItems();

    // Calculate values for all users
    const playersWithValues = users.map((user) => {
      let totalValue = 0;
      if (user.inventory && user.inventory.length > 0) {
        user.inventory.forEach((invItem) => {
          const item = itemsMap.get(invItem.itemId);
          if (item) {
            totalValue += item.value * (invItem.amount || 1);
          }
        });
      }

      return {
        user,
        totalValue,
        itemCount: user.inventory?.reduce((sum, inv) => sum + (inv.amount || 1), 0) || 0,
        cash: user.cash ?? 0,
        rolls: user.rollCount ?? 0,
      };
    });

    // Create all leaderboards
    const topValue = playersWithValues
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 30)
      .map((p, idx) => ({ user: p.user, value: p.totalValue, rank: idx + 1 }));

    const topItems = playersWithValues
      .sort((a, b) => b.itemCount - a.itemCount)
      .slice(0, 30)
      .map((p, idx) => ({ user: p.user, value: p.itemCount, rank: idx + 1 }));

    const topCash = playersWithValues
      .sort((a, b) => b.cash - a.cash)
      .slice(0, 30)
      .map((p, idx) => ({ user: p.user, value: p.cash, rank: idx + 1 }));

    const topRolls = playersWithValues
      .sort((a, b) => b.rolls - a.rolls)
      .slice(0, 30)
      .map((p, idx) => ({ user: p.user, value: p.rolls, rank: idx + 1 }));

    const leaderboardData: LeaderboardData = {
      topValue,
      topItems,
      topCash,
      topRolls,
      lastUpdated: Date.now(),
      updatedBy: 'system'
    };

    // Store in Firestore
    try {
      const cacheRef = doc(db, "leaderboardCache", this.CACHE_DOC_ID);
      await setDoc(cacheRef, leaderboardData);
      console.log(`%c[LEADERBOARD CACHE] Stored fresh leaderboard (${users.length} users processed)`, 'color: #10b981; font-weight: bold');
    } catch (error) {
      console.error("Error storing leaderboard cache:", error);
      // Continue anyway, we can still return the calculated data
    }

    return leaderboardData;
  }

  // Force refresh
  async forceRefresh(): Promise<LeaderboardData> {
    console.log('%c[LEADERBOARD CACHE] Force refresh requested', 'color: #f59e0b; font-weight: bold');
    const data = await this.calculateAndStore();
    this.cache = data;
    return data;
  }

  // Clear cache
  clear() {
    this.cache = null;
    console.log('%c[LEADERBOARD CACHE] Cache cleared', 'color: #ef4444; font-weight: bold');
  }

  // Get cache status
  getStatus() {
    if (!this.cache) {
      return {
        cached: false,
        lastUpdated: null,
        age: null,
        isValid: false,
      };
    }

    const age = Date.now() - this.cache.lastUpdated;
    return {
      cached: true,
      lastUpdated: this.cache.lastUpdated,
      age,
      isValid: age < this.CACHE_DURATION,
      expiresIn: Math.max(0, this.CACHE_DURATION - age),
    };
  }
}

export const leaderboardCache = new LeaderboardCache();

// Add global debug commands
if (typeof window !== 'undefined') {
  (window as any).leaderboardCacheStatus = () => {
    const status = leaderboardCache.getStatus();
    console.log('%c📊 Leaderboard Cache Status', 'color: #8b5cf6; font-weight: bold; font-size: 14px');
    console.log('Cached:', status.cached);
    if (status.lastUpdated) {
      console.log('Last updated:', new Date(status.lastUpdated).toLocaleString());
      console.log('Cache age:', `${((status.age || 0) / 1000).toFixed(0)}s`);
      console.log('Valid:', status.isValid);
      console.log('Expires in:', `${((status.expiresIn || 0) / 1000).toFixed(0)}s`);
    }
  };
  
  (window as any).leaderboardCacheRefresh = () => leaderboardCache.forceRefresh();
  (window as any).leaderboardCacheClear = () => leaderboardCache.clear();
  
  console.log('%cLeaderboard cache initialized. Commands: leaderboardCacheStatus(), leaderboardCacheRefresh(), leaderboardCacheClear()', 'color: #8b5cf6; font-weight: bold');
}
