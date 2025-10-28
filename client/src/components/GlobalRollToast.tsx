import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { GlobalRollEvent } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue } from "@/lib/rarity";
import { Sparkles } from "lucide-react";

export function GlobalRollToast() {
  const [recentRolls, setRecentRolls] = useState<GlobalRollEvent[]>([]);
  const [displayedRolls, setDisplayedRolls] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const rollsRef = collection(db, "globalRolls");
    const q = query(
      rollsRef,
      where("timestamp", ">=", fiveMinutesAgo),
      orderBy("timestamp", "desc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rolls: GlobalRollEvent[] = [];
      snapshot.forEach((doc) => {
        rolls.push(doc.data() as GlobalRollEvent);
      });
      setRecentRolls(rolls);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (recentRolls.length > 0) {
      const latestRoll = recentRolls[0];
      const rollId = `${latestRoll.username}-${latestRoll.timestamp}`;
      
      if (!displayedRolls.has(rollId)) {
        setDisplayedRolls((prev) => {
          const newSet = new Set(prev);
          newSet.add(rollId);
          return newSet;
        });
        
        setTimeout(() => {
          setDisplayedRolls((prev) => {
            const newSet = new Set(prev);
            newSet.delete(rollId);
            return newSet;
          });
        }, 5000);
      }
    }
  }, [recentRolls]);

  const visibleRolls = recentRolls.filter((roll) => {
    const rollId = `${roll.username}-${roll.timestamp}`;
    return Array.from(displayedRolls).includes(rollId);
  });

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {visibleRolls.map((roll) => {
        const rarityClass = getRarityClass(roll.rarity);
        const rarityGlow = getRarityGlow(roll.rarity);
        
        return (
          <div
            key={`${roll.username}-${roll.timestamp}`}
            className={`bg-card border-2 ${rarityClass} ${rarityGlow} rounded-lg p-4 shadow-xl animate-in slide-in-from-right-full duration-500 pointer-events-auto max-w-sm`}
            data-testid="toast-global-roll"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {roll.username} rolled {roll.itemName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Value: {formatValue(roll.itemValue)}
                  {roll.serialNumber && ` • #${roll.serialNumber}`}
                </p>
              </div>
              <img
                src={roll.itemImageUrl}
                alt={roll.itemName}
                className="w-12 h-12 rounded-md object-cover shrink-0"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
