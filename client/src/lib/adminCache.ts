import { collection, query, where } from "firebase/firestore";
import { db, getDocs } from "./firebase";

class AdminCache {
  private adminDocId: string | null = null;
  private initialized = false;
  private fetchPromise: Promise<void> | null = null;

  private async fetchAdminId(): Promise<void> {
    const usersRef = collection(db, "users");
    const adminQuery = query(usersRef, where("userId", "==", 1));
    const adminSnapshot = await getDocs(adminQuery);
    
    this.adminDocId = !adminSnapshot.empty ? adminSnapshot.docs[0].id : null;
    this.initialized = true;
  }

  async getAdminDocId(): Promise<string | null> {
    if (this.initialized) {
      return this.adminDocId;
    }

    if (this.fetchPromise) {
      await this.fetchPromise;
      return this.adminDocId;
    }

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
  }
}

export const adminCache = new AdminCache();
