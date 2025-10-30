import { createContext, useContext, useEffect, useState, useRef } from "react";
import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { autoSaveManager } from "@/lib/autoSaveManager";
import type { User } from "@shared/schema";

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  refetchUser: () => Promise<void>;
  updateUserLocal: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionStartRef = useRef<number>(Date.now());

  const fetchUserData = async (uid: string) => {
    try {
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        setUser({ id: userDoc.id, ...userDoc.data() } as User);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setUser(null);
    }
  };

  const refetchUser = async () => {
    if (firebaseUser) {
      await fetchUserData(firebaseUser.uid);
    }
  };

  // Update user locally and queue for auto-save
  const updateUserLocal = (updates: Partial<User>) => {
    if (!user) return;
    
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    
    // Queue the update for auto-save (remove id from updates)
    const { id, ...dataToSave } = updates;
    autoSaveManager.queueUpdate("users", user.id, dataToSave);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await fetchUserData(fbUser.uid);
        sessionStartRef.current = Date.now();
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Auto-save manager - only depends on user identity, not full user object
  useEffect(() => {
    if (!user?.id) {
      autoSaveManager.stop();
      return;
    }

    const userId = user.id;
    
    // Start auto-save manager
    autoSaveManager.start();

    // Queue activity update every 60 seconds (instead of writing immediately)
    const activityInterval = setInterval(() => {
      autoSaveManager.queueUpdate("users", userId, {
        lastActive: Date.now(),
      });
    }, 60000);

    return () => {
      clearInterval(activityInterval);
    };
  }, [user?.id]);

  // Session duration tracking - separate effect
  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;
    const currentTimeSpent = user.timeSpentOnSite || 0;
    
    const handleBeforeUnload = async () => {
      if (!sessionStartRef.current) return;
      
      const sessionDuration = Date.now() - sessionStartRef.current;
      if (sessionDuration <= 0) return;
      
      // Queue final updates
      autoSaveManager.queueUpdate("users", userId, {
        timeSpentOnSite: currentTimeSpent + sessionDuration,
        lastActive: Date.now(),
      });
      
      // Flush immediately on page unload
      await autoSaveManager.flush();
      sessionStartRef.current = Date.now();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
      // Don't call handleBeforeUnload on cleanup - only on actual page unload
    };
  }, [user?.id, user?.timeSpentOnSite]);

  return (
    <AuthContext.Provider value={{ firebaseUser, user, loading, refetchUser, updateUserLocal }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
