import { collection, query, where } from "firebase/firestore";
import { db, getDocs } from "./firebase";

class AdminCache {
  private adminDocId: string | null = null;
  private initialized = false;
  private fetchPromise: Promise<void> | null = null;
  private lastFetchTime = 0;
  private readonly RETRY_DELAY = 30000; // Retry after 30 seconds if admin not found

  private async fetchAdminId(): Promise<void> {
    const usersRef = collection(db, "users");
    const adminQuery = query(usersRef, where("userId", "==", 1));
    const adminSnapshot = await getDocs(adminQuery);
    
    this.adminDocId = !adminSnapshot.empty ? adminSnapshot.docs[0].id : null;
    this.lastFetchTime = Date.now();
    
    // Only mark as initialized if admin was found
    // This allows retries if admin is missing
    if (this.adminDocId !== null) {
      this.initialized = true;
    } else {
      console.warn('[AdminCache] Admin user (userId=1) not found in database');
    }
  }

  async getAdminDocId(): Promise<string | null> {
    // If initialized and admin was found, return cached value
    if (this.initialized && this.adminDocId !== null) {
      return this.adminDocId;
    }

    // If admin not found but we recently tried, return null to avoid spam
    const timeSinceLastFetch = Date.now() - this.lastFetchTime;
    if (this.adminDocId === null && this.lastFetchTime > 0 && timeSinceLastFetch < this.RETRY_DELAY) {
      return null;
    }

    // If already fetching, wait for that fetch
    if (this.fetchPromise) {
      await this.fetchPromise;
      return this.adminDocId;
    }

    // Fetch admin ID (will retry if enough time has passed)
    this.fetchPromise = this.fetchAdminId();
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }

    return this.adminDocId;
  }

  invalidate(): void {
    this.initialized = false;
    this.adminDocId = null;
    this.lastFetchTime = 0;
  }
}

export const adminCache = new AdminCache();
