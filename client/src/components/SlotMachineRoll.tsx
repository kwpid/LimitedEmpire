import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue } from "@/lib/rarity";

interface SlotMachineRollProps {
  items: Item[];
  finalItem: Item | null;
  isRolling: boolean;
}

export function SlotMachineRoll({ items, finalItem, isRolling }: SlotMachineRollProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayItems, setDisplayItems] = useState<Item[]>([]);
  const [hasBuiltArray, setHasBuiltArray] = useState(false);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const rollKeyRef = useRef<string>("");

  useEffect(() => {
    if (isRolling && items.length > 0 && finalItem && !hasBuiltArray) {
      // Build array of items to flip through
      const shuffledItems = [...items].sort(() => Math.random() - 0.5);
      const repeatedItems: Item[] = [];
      
      // Create a sequence of 30 items ending with the final item
      for (let i = 0; i < 29; i++) {
        repeatedItems.push(shuffledItems[i % shuffledItems.length]);
      }
      repeatedItems.push(finalItem);
      
      setDisplayItems(repeatedItems);
      setHasBuiltArray(true);
      setCurrentIndex(0);
      rollKeyRef.current = `roll-${finalItem.id}-${Date.now()}`;
      startTimeRef.current = Date.now();
      
      // Start the flip animation
      animateFlip();
    }
    
    if (!isRolling) {
      setHasBuiltArray(false);
      setCurrentIndex(0);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }
  }, [isRolling, items, finalItem, hasBuiltArray]);

  const animateFlip = () => {
    const totalDuration = 3500; // 3.5 seconds
    const elapsed = Date.now() - startTimeRef.current;
    
    if (elapsed >= totalDuration) {
      // Animation complete - show final item
      setCurrentIndex(displayItems.length - 1);
      return;
    }
    
    // Calculate speed that decreases over time (starts fast, ends slow)
    // Using quadratic easing out for deceleration
    const progress = elapsed / totalDuration;
    const easeProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease out
    
    // Map progress to index (0 to displayItems.length - 1)
    const targetIndex = Math.floor(easeProgress * (displayItems.length - 1));
    
    if (targetIndex !== currentIndex && targetIndex < displayItems.length) {
      setCurrentIndex(targetIndex);
    }
    
    animationRef.current = requestAnimationFrame(animateFlip);
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (!isRolling || displayItems.length === 0 || currentIndex >= displayItems.length) {
    return null;
  }

  const currentItem = displayItems[currentIndex];
  const rarityClass = getRarityClass(currentItem.rarity);
  const rarityGlow = getRarityGlow(currentItem.rarity);

  return (
    <div className="relative flex items-center justify-center w-full max-w-2xl mx-auto">
      <div className="relative overflow-hidden rounded-xl border-4 border-primary/40 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-md shadow-2xl" 
           style={{ width: '100%', maxWidth: '500px', height: '600px' }}>
        
        {/* Center indicator */}
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
          <div className="w-full h-[400px] border-y-4 border-primary/60 shadow-[0_0_30px_rgba(124,58,237,0.6)]" />
        </div>
        
        {/* Item display area */}
        <div className="relative w-full h-full flex items-center justify-center p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentItem.id}-${currentIndex}`}
              initial={{ y: -100, opacity: 0, scale: 0.8, rotateX: -90 }}
              animate={{ y: 0, opacity: 1, scale: 1, rotateX: 0 }}
              exit={{ y: 100, opacity: 0, scale: 0.8, rotateX: 90 }}
              transition={{ 
                duration: 0.15,
                ease: "easeOut"
              }}
              className="w-full max-w-[400px]"
            >
              <div className={`rounded-2xl overflow-hidden border-4 ${rarityClass} ${rarityGlow} bg-card shadow-2xl`}>
                <div className="relative aspect-square">
                  <img
                    src={currentItem.imageUrl}
                    alt={currentItem.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='120' font-weight='bold'%3E%3F%3C/text%3E%3C/svg%3E";
                    }}
                  />
                </div>
                <div className="p-6 text-center bg-gradient-to-t from-background to-transparent">
                  <h3 className="font-bold text-2xl mb-2 truncate">{currentItem.name}</h3>
                  <div className="flex items-center justify-center gap-4">
                    <p className={`text-sm font-semibold px-3 py-1 rounded-full ${rarityClass}`}>
                      {currentItem.rarity}
                    </p>
                    <p className="text-lg font-bold text-primary">
                      ${formatValue(currentItem.value)}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        
        {/* Top gradient fade */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black via-black/50 to-transparent pointer-events-none z-20" />
        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none z-20" />
        
        {/* Progress indicator */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-30">
          <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 border border-primary/30">
            <p className="text-xs text-muted-foreground font-mono">
              {currentIndex + 1} / {displayItems.length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
