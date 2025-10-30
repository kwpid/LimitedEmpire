import { collection } from "firebase/firestore";
import { db, getDocs } from "./firebase";
import type { Item } from "@shared/schema";

class ItemsCache {
  private items: Map<string, Item> = new Map();
  private lastFetch: number = 0;
  private fetchPromise: Promise<void> | null = null;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours for persistent cache
  private readonly STORAGE_KEY = "itemsCache";
  private readonly STORAGE_TIMESTAMP_KEY = "itemsCacheTimestamp";
  private initialized: boolean = false;

  private loadFromLocalStorage(): void {
    if (this.initialized) return;
    
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      const timestamp = localStorage.getItem(this.STORAGE_TIMESTAMP_KEY);
      
      if (cached && timestamp) {
        const cachedItems = JSON.parse(cached) as Array<[string, Item]>;
        this.items = new Map(cachedItems);
        this.lastFetch = parseInt(timestamp, 10);
      }
    } catch (error) {
      console.error("Error loading items from localStorage:", error);
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.STORAGE_TIMESTAMP_KEY);
    }
    
    this.initialized = true;
  }

  private saveToLocalStorage(): void {
    try {
      const itemsArray = Array.from(this.items.entries());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(itemsArray));
      localStorage.setItem(this.STORAGE_TIMESTAMP_KEY, this.lastFetch.toString());
    } catch (error) {
      console.error("Error saving items to localStorage:", error);
    }
  }

  async getItems(): Promise<Map<string, Item>> {
    this.loadFromLocalStorage();
    
    const now = Date.now();
    
    // If cache is fresh, return it
    if (this.items.size > 0 && now - this.lastFetch < this.CACHE_DURATION) {
      return this.items;
    }

    // If already fetching, wait for that fetch to complete
    if (this.fetchPromise) {
      try {
        await this.fetchPromise;
      } catch (error) {
        // Error already logged in fetchItems, just continue
      }
      return this.items;
    }

    // Start new fetch
    this.fetchPromise = this.fetchItems();
    try {
      await this.fetchPromise;
    } finally {
      // Always reset fetchPromise so errors don't brick the cache
      this.fetchPromise = null;
    }
    
    return this.items;
  }

  async getItem(itemId: string): Promise<Item | null> {
    const items = await this.getItems();
    return items.get(itemId) || null;
  }

  async getItemsBatch(itemIds: string[]): Promise<Map<string, Item>> {
    const items = await this.getItems();
    const result = new Map<string, Item>();
    
    itemIds.forEach(itemId => {
      const item = items.get(itemId);
      if (item) {
        result.set(itemId, item);
      }
    });
    
    return result;
  }

  private async fetchItems(): Promise<void> {
    try {
      const itemsSnapshot = await getDocs(collection(db, "items"));
      const newItems = new Map<string, Item>();
      
      itemsSnapshot.forEach((doc) => {
        newItems.set(doc.id, { id: doc.id, ...doc.data() } as Item);
      });
      
      this.items = newItems;
      this.lastFetch = Date.now();
      this.saveToLocalStorage();
    } catch (error) {
      console.error("Error fetching items:", error);
      // Don't update lastFetch on error, so next call will retry
      throw error;
    }
  }

  // Force refresh the cache
  async refresh(): Promise<void> {
    this.lastFetch = 0;
    localStorage.removeItem(this.STORAGE_TIMESTAMP_KEY);
    await this.getItems();
  }

  // Clear the cache
  clear(): void {
    this.items.clear();
    this.lastFetch = 0;
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.STORAGE_TIMESTAMP_KEY);
  }
}

export const itemsCache = new ItemsCache();
