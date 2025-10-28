import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow } from "@/lib/rarity";

interface SlotMachineRollProps {
  items: Item[];
  finalItem: Item | null;
  isRolling: boolean;
}

export function SlotMachineRoll({ items, finalItem, isRolling }: SlotMachineRollProps) {
  const [displayItems, setDisplayItems] = useState<Item[]>([]);

  useEffect(() => {
    if (isRolling && items.length > 0) {
      const shuffledItems = [...items].sort(() => Math.random() - 0.5);
      const repeatedItems = [];
      
      for (let i = 0; i < 20; i++) {
        repeatedItems.push(shuffledItems[i % shuffledItems.length]);
      }
      
      if (finalItem) {
        const finalIndex = 14;
        repeatedItems[finalIndex] = finalItem;
      }
      
      setDisplayItems(repeatedItems);
    }
  }, [isRolling, items, finalItem]);

  if (!isRolling || displayItems.length === 0) {
    return null;
  }

  const itemHeight = 280;
  const visibleHeight = 320;
  const finalPosition = -(14 * itemHeight);

  return (
    <div className="relative overflow-hidden rounded-lg border-4 border-primary/30 bg-black/40 backdrop-blur-sm" style={{ height: `${visibleHeight}px`, width: '280px' }}>
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center">
        <div className="w-full h-[280px] border-y-4 border-primary/50 shadow-[0_0_20px_rgba(124,58,237,0.5)]" />
      </div>
      
      <motion.div
        initial={{ y: 0 }}
        animate={{ y: finalPosition }}
        transition={{
          duration: 2,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="flex flex-col"
      >
        {displayItems.map((item, idx) => {
          const rarityClass = getRarityClass(item.rarity);
          const rarityGlow = getRarityGlow(item.rarity);
          
          return (
            <div
              key={`${item.id}-${idx}`}
              className="flex-shrink-0"
              style={{ height: `${itemHeight}px` }}
            >
              <div className={`m-2 h-[264px] rounded-lg overflow-hidden border-4 ${rarityClass} ${rarityGlow} bg-card`}>
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-[180px] object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='48' font-weight='bold'%3E%3F%3C/text%3E%3C/svg%3E";
                  }}
                />
                <div className="p-3 text-center">
                  <h3 className="font-bold text-sm truncate">{item.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{item.rarity}</p>
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>
      
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black to-transparent pointer-events-none z-20" />
    </div>
  );
}
