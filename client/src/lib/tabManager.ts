type TabStatus = "active" | "inactive";
type TabManagerListener = (status: TabStatus) => void;

class TabManager {
  private tabId: string;
  private channel: BroadcastChannel | null = null;
  private listeners: Set<TabManagerListener> = new Set();
  private status: TabStatus = "active";
  private heartbeatInterval: number | null = null;
  private checkInterval: number | null = null;
  private myStartTime: number = Date.now();
  private lastSeenActiveTab: number = Date.now();
  private activeTabId: string = "";

  constructor() {
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeTabId = this.tabId;
    this.init();
  }

  private init() {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("limited_empire_tabs");
      
      this.channel.addEventListener("message", (event) => {
        const { type, tabId, createdAt } = event.data;

        if (type === "ping") {
          // Another tab is pinging
          if (tabId !== this.tabId) {
            // Update when we last saw any tab
            this.lastSeenActiveTab = Date.now();

            // Compare creation times to determine which tab is newer
            if (createdAt > this.myStartTime) {
              // The other tab was created after us, it should be active
              this.setStatus("inactive");
              this.activeTabId = tabId;
            } else if (createdAt < this.myStartTime) {
              // We were created after the other tab, we should be active
              this.setStatus("active");
              this.activeTabId = this.tabId;
            }
            // If createdAt === myStartTime (extremely rare), use tabId as tiebreaker
            else if (createdAt === this.myStartTime) {
              if (tabId > this.tabId) {
                this.setStatus("inactive");
                this.activeTabId = tabId;
              } else {
                this.setStatus("active");
                this.activeTabId = this.tabId;
              }
            }
          }
        } else if (type === "newer") {
          // Deprecated - no longer needed with creation time comparison
          if (tabId !== this.tabId) {
            this.setStatus("inactive");
            this.activeTabId = tabId;
            this.lastSeenActiveTab = Date.now();
          }
        } else if (type === "closing") {
          // A tab is closing
          if (tabId === this.activeTabId && tabId !== this.tabId) {
            // The active tab is closing, we can become active
            this.setStatus("active");
            this.activeTabId = this.tabId;
            this.sendPing();
          }
        }
      });

      // Send initial ping to detect other tabs
      this.sendPing();

      // Send periodic heartbeats
      this.heartbeatInterval = window.setInterval(() => {
        if (this.status === "active") {
          this.sendPing();
        }
      }, 2000);

      // Check for inactive tabs periodically
      this.checkInterval = window.setInterval(() => {
        // If we haven't heard from ANY tab in a while and we're inactive, the active tab probably closed
        if (this.status === "inactive" && Date.now() - this.lastSeenActiveTab > 5000) {
          this.setStatus("active");
          this.activeTabId = this.tabId;
          this.sendPing();
        }
      }, 3000);

      // Notify other tabs when this tab is closing
      window.addEventListener("beforeunload", () => {
        this.sendMessage("closing");
      });
    }

    // Fallback using localStorage for browsers without BroadcastChannel
    if (!this.channel) {
      this.initLocalStorageFallback();
    }
  }

  private initLocalStorageFallback() {
    const storageKey = "limited_empire_active_tab";
    
    const claimActiveTab = () => {
      localStorage.setItem(storageKey, JSON.stringify({
        tabId: this.tabId,
        timestamp: Date.now(),
        createdAt: this.myStartTime,
      }));
      this.setStatus("active");
      this.activeTabId = this.tabId;
    };

    const checkActiveTab = () => {
      const activeTab = localStorage.getItem(storageKey);
      const activeData = activeTab ? JSON.parse(activeTab) : null;
      
      if (!activeData || Date.now() - activeData.timestamp > 5000) {
        // No active tab or stale, claim it
        claimActiveTab();
      } else if (activeData.tabId !== this.tabId) {
        // Another tab exists - compare creation times
        this.lastSeenActiveTab = Date.now();
        
        if (activeData.createdAt > this.myStartTime) {
          // The other tab is newer, stay inactive
          this.setStatus("inactive");
          this.activeTabId = activeData.tabId;
        } else if (activeData.createdAt < this.myStartTime) {
          // We're newer, claim active
          claimActiveTab();
        } else {
          // Same creation time (very rare), use tabId as tiebreaker
          if (activeData.tabId > this.tabId) {
            this.setStatus("inactive");
            this.activeTabId = activeData.tabId;
          } else {
            claimActiveTab();
          }
        }
      } else {
        // We're the active tab, update timestamp
        this.lastSeenActiveTab = Date.now();
      }
    };

    // Check immediately
    checkActiveTab();

    // Update our timestamp periodically if we're active
    this.heartbeatInterval = window.setInterval(() => {
      if (this.status === "active") {
        claimActiveTab();
      }
    }, 2000);

    // Check for other tabs periodically
    this.checkInterval = window.setInterval(() => {
      checkActiveTab();
    }, 3000);

    // Listen for storage events from other tabs
    window.addEventListener("storage", (event) => {
      if (event.key === storageKey) {
        checkActiveTab();
      }
    });

    // Clean up on unload
    window.addEventListener("beforeunload", () => {
      if (this.status === "active") {
        localStorage.removeItem(storageKey);
      }
    });
  }

  private sendMessage(type: string) {
    if (this.channel) {
      this.channel.postMessage({
        type,
        tabId: this.tabId,
        timestamp: Date.now(),
        createdAt: this.myStartTime,
      });
    }
  }

  private sendPing() {
    this.sendMessage("ping");
  }

  private setStatus(status: TabStatus) {
    if (this.status !== status) {
      this.status = status;
      this.notifyListeners();
    }
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.status));
  }

  public getStatus(): TabStatus {
    return this.status;
  }

  public onStatusChange(listener: TabManagerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public destroy() {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
    }
    if (this.channel) {
      this.sendMessage("closing");
      this.channel.close();
    }
  }
}

export const tabManager = new TabManager();
