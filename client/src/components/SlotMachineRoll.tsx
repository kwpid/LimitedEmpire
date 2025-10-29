import { useState, useEffect, useRef } from "react";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue } from "@/lib/rarity";

interface SlotMachineRollProps {
  items: Item[];
  finalItem: Item | null;
  isRolling: boolean;
}

export function SlotMachineRoll({ items, finalItem, isRolling }: SlotMachineRollProps) {
  const [currentItem, setCurrentItem] = useState<Item | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const itemsRef = useRef<Item[]>([]);

  useEffect(() => {
    if (isRolling && items.length > 0 && finalItem) {
      // Build array of items to cycle through
      const shuffledItems = [...items].sort(() => Math.random() - 0.5);
      const repeatedItems: Item[] = [];
      
      // Create a sequence of 25 items ending with the final item
      for (let i = 0; i < 24; i++) {
        repeatedItems.push(shuffledItems[i % shuffledItems.length]);
      }
      repeatedItems.push(finalItem);
      
      itemsRef.current = repeatedItems;
      startTimeRef.current = Date.now();
      setCurrentItem(repeatedItems[0]);
      
      // Start animation
      animate();
    }
    
    if (!isRolling) {
      setCurrentItem(null);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }
  }, [isRolling, items, finalItem]);

  const animate = () => {
    const totalDuration = 3500; // 3.5 seconds
    const elapsed = Date.now() - startTimeRef.current;
    
    // Calculate progress
    const progress = Math.min(elapsed / totalDuration, 1);
    
    if (progress >= 1) {
      // Animation complete - immediately show final item
      setCurrentItem(itemsRef.current[itemsRef.current.length - 1]);
      return;
    }
    
    // Use cubic ease out for smoother deceleration
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    
    // Map eased progress to item indices, capped at second-to-last during animation
    const maxIndex = itemsRef.current.length - 2;
    const targetIndex = Math.min(maxIndex, Math.floor(easeProgress * itemsRef.current.length));
    setCurrentItem(itemsRef.current[targetIndex]);
    
    // Continue animation
    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (!isRolling || !currentItem) {
    return null;
  }

  const rarityClass = getRarityClass(currentItem.rarity);
  const rarityGlow = getRarityGlow(currentItem.rarity);

  return (
    <div className="relative flex items-center justify-center w-full max-w-2xl mx-auto">
      <div className="relative overflow-hidden rounded-xl border-4 border-primary/40 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-md shadow-2xl" 
           style={{ width: '100%', maxWidth: '500px', height: '600px' }}>
        
        {/* Item display */}
        <div className="relative w-full h-full flex items-center justify-center p-8">
          <div className="w-full max-w-[400px]">
            <div className={`rounded-2xl overflow-hidden border-4 ${rarityClass} ${rarityGlow} bg-card shadow-2xl transition-all duration-75`}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
