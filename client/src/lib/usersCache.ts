import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import type { User } from "@shared/schema";

class UsersCache {
  private allUsers: Map<string, User> = new Map();
  private lastFetchTime: number = 0;
  private isFetching: boolean = false;
  private fetchPromise: Promise<void> | null = null;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized || this.isFetching) {
      return this.fetchPromise || Promise.resolve();
    }

    this.isFetching = true;
    this.fetchPromise = this.loadAllUsers();
    
    try {
      await this.fetchPromise;
      this.initialized = true;
    } finally {
      this.isFetching = false;
      this.fetchPromise = null;
    }
  }

  private async loadAllUsers(): Promise<void> {
    try {
      console.log('%c[USERS CACHE] Loading all users...', 'color: #8b5cf6; font-weight: bold');
      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);
      
      this.allUsers.clear();
      snapshot.forEach((doc) => {
        const userData = { id: doc.id, ...doc.data() } as User;
        this.allUsers.set(doc.id, userData);
      });
      
      this.lastFetchTime = Date.now();
      console.log(`%c[USERS CACHE] Loaded ${this.allUsers.size} users`, 'color: #10b981; font-weight: bold');
    } catch (error) {
      console.error("[USERS CACHE] Error loading users:", error);
      throw error;
    }
  }

  async getAllUsers(): Promise<Map<string, User>> {
    if (!this.initialized) {
      await this.initialize();
    }
    return new Map(this.allUsers);
  }

  async getOnlineUsers(): Promise<User[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const onlineUsers: User[] = [];

    this.allUsers.forEach((user) => {
      if (user.lastActive && user.lastActive >= fiveMinutesAgo) {
        onlineUsers.push(user);
      }
    });

    return onlineUsers.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
  }

  async searchUsers(searchTerm: string): Promise<User[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!searchTerm) return [];

    const searchLower = searchTerm.toLowerCase();
    const results: User[] = [];

    this.allUsers.forEach((user) => {
      if (user.usernameLower && user.usernameLower.includes(searchLower)) {
        results.push(user);
      }
    });

    return results.slice(0, 50);
  }

  updateUser(userId: string, userData: Partial<User>): void {
    const existing = this.allUsers.get(userId);
    if (existing) {
      this.allUsers.set(userId, { ...existing, ...userData });
    }
  }

  addUser(userId: string, userData: User): void {
    this.allUsers.set(userId, userData);
    console.log(`%c[USERS CACHE] New user added: ${userData.username}`, 'color: #8b5cf6');
  }

  getUser(userId: string): User | undefined {
    return this.allUsers.get(userId);
  }

  async refresh(): Promise<void> {
    console.log('%c[USERS CACHE] Refreshing users...', 'color: #f59e0b');
    await this.loadAllUsers();
  }

  invalidate(): void {
    console.log('%c[USERS CACHE] Cache invalidated', 'color: #ef4444');
    this.initialized = false;
    this.allUsers.clear();
    this.lastFetchTime = 0;
  }

  getStats() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    let onlineCount = 0;
    this.allUsers.forEach((user) => {
      if (user.lastActive && user.lastActive >= fiveMinutesAgo) {
        onlineCount++;
      }
    });

    return {
      totalUsers: this.allUsers.size,
      onlineUsers: onlineCount,
      initialized: this.initialized,
      lastFetchTime: this.lastFetchTime,
    };
  }
}

export const usersCache = new UsersCache();

if (typeof window !== 'undefined') {
  (window as any).usersCache = usersCache;
  (window as any).usersCacheStats = () => {
    const stats = usersCache.getStats();
    console.log('%c📊 Users Cache Stats', 'color: #8b5cf6; font-weight: bold; font-size: 14px');
    console.table(stats);
    return stats;
  };
}
