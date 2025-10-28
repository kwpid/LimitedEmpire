import { useState, useEffect, useRef } from "react";
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
  const [hasBuiltArray, setHasBuiltArray] = useState(false);
  const rollKeyRef = useRef<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateContainerWidth();
    window.addEventListener('resize', updateContainerWidth);
    
    return () => window.removeEventListener('resize', updateContainerWidth);
  }, []);

  useEffect(() => {
    if (isRolling && items.length > 0 && finalItem && !hasBuiltArray) {
      const shuffledItems = [...items].sort(() => Math.random() - 0.5);
      const repeatedItems = [];
      
      for (let i = 0; i < 20; i++) {
        repeatedItems.push(shuffledItems[i % shuffledItems.length]);
      }
      
      const finalIndex = 14;
      repeatedItems[finalIndex] = finalItem;
      
      setDisplayItems(repeatedItems);
      setHasBuiltArray(true);
      rollKeyRef.current = `roll-${finalItem.id}-${Date.now()}`;
    }
    
    if (!isRolling) {
      setHasBuiltArray(false);
    }
  }, [isRolling, items, finalItem, hasBuiltArray]);

  if (!isRolling || displayItems.length === 0) {
    return null;
  }

  const itemWidth = 280;
  const visibleHeight = 320;
  const finalItemIndex = 14;
  const centerOffset = containerWidth / 2 - itemWidth / 2;
  const finalPosition = -(finalItemIndex * itemWidth - centerOffset);

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-lg border-4 border-primary/30 bg-black/40 backdrop-blur-sm" style={{ width: '100%', maxWidth: '900px', height: `${visibleHeight}px` }}>
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
        <div className="w-[280px] h-full border-x-4 border-primary/50 shadow-[0_0_20px_rgba(124,58,237,0.5)]" />
      </div>
      
      <motion.div
        key={rollKeyRef.current}
        initial={{ x: 0 }}
        animate={{ x: finalPosition }}
        transition={{
          duration: 3.5,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="flex flex-row h-full items-center"
      >
        {displayItems.map((item, idx) => {
          const rarityClass = getRarityClass(item.rarity);
          const rarityGlow = getRarityGlow(item.rarity);
          
          return (
            <div
              key={`${item.id}-${idx}`}
              className="flex-shrink-0"
              style={{ width: `${itemWidth}px` }}
            >
              <div className={`m-2 h-[300px] rounded-lg overflow-hidden border-4 ${rarityClass} ${rarityGlow} bg-card`}>
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-[200px] object-cover"
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
      
      <div className="absolute top-0 left-0 bottom-0 w-32 bg-gradient-to-r from-black to-transparent pointer-events-none z-20" />
      <div className="absolute top-0 right-0 bottom-0 w-32 bg-gradient-to-l from-black to-transparent pointer-events-none z-20" />
    </div>
  );
}
