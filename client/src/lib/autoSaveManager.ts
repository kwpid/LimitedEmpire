import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface PendingUpdate {
  collection: string;
  docId: string;
  data: Record<string, any>;
}

class AutoSaveManager {
  private pendingUpdates: Map<string, PendingUpdate> = new Map();
  private saveInterval: NodeJS.Timeout | null = null;
  private isSaving: boolean = false;

  start() {
    if (this.saveInterval) return;
    
    // Save every 60 seconds
    this.saveInterval = setInterval(() => {
      this.flush();
    }, 60000);
  }

  stop() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  queueUpdate(collection: string, docId: string, data: Record<string, any>) {
    const key = `${collection}/${docId}`;
    
    // Merge with existing pending updates
    if (this.pendingUpdates.has(key)) {
      const existing = this.pendingUpdates.get(key)!;
      this.pendingUpdates.set(key, {
        ...existing,
        data: { ...existing.data, ...data },
      });
    } else {
      this.pendingUpdates.set(key, { collection, docId, data });
    }
  }

  async flush(): Promise<void> {
    if (this.isSaving || this.pendingUpdates.size === 0) return;
    
    this.isSaving = true;
    const updates = Array.from(this.pendingUpdates.values());
    this.pendingUpdates.clear();

    try {
      // Process all updates in parallel
      await Promise.all(
        updates.map(async (update) => {
          try {
            const docRef = doc(db, update.collection, update.docId);
            await updateDoc(docRef, update.data);
          } catch (error) {
            console.error(`Error saving ${update.collection}/${update.docId}:`, error);
            // Re-queue failed updates
            this.queueUpdate(update.collection, update.docId, update.data);
          }
        })
      );
    } finally {
      this.isSaving = false;
    }
  }

  hasPendingUpdates(): boolean {
    return this.pendingUpdates.size > 0;
  }
}

export const autoSaveManager = new AutoSaveManager();
