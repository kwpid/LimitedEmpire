import { createContext, useContext, useEffect, useState, useRef } from "react";
import { User as FirebaseUser, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { User } from "@shared/schema";

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionStartRef = useRef<number>(Date.now());
  const activityIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    if (!user) return;

    const updateActivity = async () => {
      try {
        const userRef = doc(db, "users", user.id);
        await updateDoc(userRef, {
          lastActive: Date.now(),
        });
      } catch (error) {
        console.error("Error updating activity:", error);
      }
    };

    updateActivity();

    activityIntervalRef.current = setInterval(updateActivity, 30000);

    const handleBeforeUnload = async () => {
      if (!user) return;
      
      const sessionDuration = Date.now() - sessionStartRef.current;
      try {
        const userRef = doc(db, "users", user.id);
        await updateDoc(userRef, {
          timeSpentOnSite: (user.timeSpentOnSite || 0) + sessionDuration,
          lastActive: Date.now(),
        });
      } catch (error) {
        console.error("Error saving session duration:", error);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (activityIntervalRef.current) {
        clearInterval(activityIntervalRef.current);
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ firebaseUser, user, loading, refetchUser }}>
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
