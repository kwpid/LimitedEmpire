import { collection, query, where } from "firebase/firestore";
import { db, getDocs } from "./firebase";
import type { Item } from "@shared/schema";

class RollableItemsCache {
  private items: Item[] = [];
  private lastFetch: number = 0;
  private fetchPromise: Promise<void> | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
  private readonly STORAGE_KEY = "rollableItemsCache";
  private readonly STORAGE_TIMESTAMP_KEY = "rollableItemsCacheTimestamp";
  private initialized: boolean = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      const timestamp = localStorage.getItem(this.STORAGE_TIMESTAMP_KEY);
      
      if (cached && timestamp) {
        const age = Date.now() - parseInt(timestamp, 10);
        if (age < this.CACHE_DURATION) {
          this.items = JSON.parse(cached);
          this.lastFetch = parseInt(timestamp, 10);
          this.initialized = true;
          console.log(`%c[CACHE] Loaded ${this.items.length} rollable items from localStorage`, 'color: #10b981; font-weight: bold');
        }
      }
    } catch (error) {
      console.error("Error loading rollable items from localStorage:", error);
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.items));
      localStorage.setItem(this.STORAGE_TIMESTAMP_KEY, this.lastFetch.toString());
    } catch (error) {
      console.error("Error saving rollable items to localStorage:", error);
    }
  }

  async getItems(): Promise<Item[]> {
    const now = Date.now();
    const age = now - this.lastFetch;

    // If cache is fresh, return immediately
    if (this.initialized && age < this.CACHE_DURATION && this.items.length > 0) {
      return this.items;
    }

    // If already fetching, wait for that fetch
    if (this.fetchPromise) {
      await this.fetchPromise;
      return this.items;
    }

    // Fetch new data
    this.fetchPromise = this.fetchItems();
    await this.fetchPromise;
    this.fetchPromise = null;

    return this.items;
  }

  private async fetchItems() {
    console.log('%c[CACHE] Fetching rollable items from Firestore...', 'color: #f59e0b; font-weight: bold');
    
    try {
      const itemsRef = collection(db, "items");
      const q = query(itemsRef, where("offSale", "==", false));
      const snapshot = await getDocs(q);

      const fetchedItems: Item[] = [];
      snapshot.forEach((doc) => {
        const item = { id: doc.id, ...doc.data() } as Item;
        // Only include items that are actually rollable
        if (item.stockType === "infinite" || (item.remainingStock && item.remainingStock > 0)) {
          fetchedItems.push(item);
        }
      });

      this.items = fetchedItems;
      this.lastFetch = Date.now();
      this.initialized = true;
      this.saveToStorage();

      console.log(`%c[CACHE] Cached ${this.items.length} rollable items (valid for 5 minutes)`, 'color: #10b981; font-weight: bold');
    } catch (error) {
      console.error("Error fetching rollable items:", error);
      throw error;
    }
  }

  // Force refresh the cache
  async refresh(): Promise<Item[]> {
    this.lastFetch = 0;
    return this.getItems();
  }

  // Clear the cache
  clear() {
    this.items = [];
    this.lastFetch = 0;
    this.initialized = false;
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.STORAGE_TIMESTAMP_KEY);
    }
    
    console.log('%c[CACHE] Rollable items cache cleared', 'color: #ef4444; font-weight: bold');
  }

  // Get cache status
  getStatus() {
    const age = Date.now() - this.lastFetch;
    return {
      itemCount: this.items.length,
      lastFetch: this.lastFetch,
      age: age,
      isValid: age < this.CACHE_DURATION && this.items.length > 0,
      expiresIn: Math.max(0, this.CACHE_DURATION - age),
    };
  }
}

export const rollableItemsCache = new RollableItemsCache();

// Add global debug commands
if (typeof window !== 'undefined') {
  (window as any).rollableCacheStatus = () => {
    const status = rollableItemsCache.getStatus();
    console.log('%c📦 Rollable Items Cache Status', 'color: #8b5cf6; font-weight: bold; font-size: 14px');
    console.log('Items cached:', status.itemCount);
    console.log('Last fetched:', new Date(status.lastFetch).toLocaleString());
    console.log('Cache age:', `${(status.age / 1000).toFixed(0)}s`);
    console.log('Valid:', status.isValid);
    console.log('Expires in:', `${(status.expiresIn / 1000).toFixed(0)}s`);
  };
  
  (window as any).rollableCacheRefresh = () => rollableItemsCache.refresh();
  (window as any).rollableCacheClear = () => rollableItemsCache.clear();
  
  console.log('%cRollable items cache initialized. Commands: rollableCacheStatus(), rollableCacheRefresh(), rollableCacheClear()', 'color: #8b5cf6; font-weight: bold');
}
