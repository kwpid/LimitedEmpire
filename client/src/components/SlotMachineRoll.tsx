import { useState, useEffect, useRef } from "react";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue } from "@/lib/rarity";

interface SlotMachineRollProps {
  items: Item[];
  finalItem: Item | null;
  isRolling: boolean;
  onAnimationComplete?: () => void;
}

export function SlotMachineRoll({ items, finalItem, isRolling, onAnimationComplete }: SlotMachineRollProps) {
  const [rollItems, setRollItems] = useState<Item[]>([]);
  const [scrollPosition, setScrollPosition] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const hasCalledComplete = useRef<boolean>(false);

  const ITEM_HEIGHT = 520; // Height of each item card
  const VISIBLE_ITEMS = 1;
  const TOTAL_DURATION = 4000; // 4 seconds for smooth animation

  useEffect(() => {
    if (isRolling && items.length > 0 && finalItem) {
      hasCalledComplete.current = false;
      
      // Create a sequence of items for the roll
      const shuffledItems = [...items].sort(() => Math.random() - 0.5);
      const sequence: Item[] = [];
      
      // Add 40 random items for the spin
      for (let i = 0; i < 40; i++) {
        sequence.push(shuffledItems[i % shuffledItems.length]);
      }
      
      // Add the final item at the end
      sequence.push(finalItem);
      
      setRollItems(sequence);
      setScrollPosition(0);
    }
    
    if (!isRolling) {
      setRollItems([]);
      setScrollPosition(0);
      hasCalledComplete.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }
  }, [isRolling, items, finalItem]);

  // Start animation after rollItems state has been updated
  useEffect(() => {
    if (isRolling && rollItems.length > 0) {
      startTimeRef.current = Date.now();
      animate();
    }
  }, [rollItems, isRolling]);

  const easeOutCubic = (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  };

  const animate = () => {
    const elapsed = Date.now() - startTimeRef.current;
    const progress = Math.min(elapsed / TOTAL_DURATION, 1);
    
    if (progress >= 1) {
      // Animation complete
      const finalPosition = (rollItems.length - 1) * ITEM_HEIGHT;
      setScrollPosition(finalPosition);
      
      if (!hasCalledComplete.current && onAnimationComplete) {
        hasCalledComplete.current = true;
        // Delay callback slightly to ensure UI has updated
        setTimeout(() => onAnimationComplete(), 100);
      }
      return;
    }
    
    // Apply easing to progress
    const easedProgress = easeOutCubic(progress);
    
    // Calculate target scroll position (scroll to the last item)
    const targetPosition = (rollItems.length - 1) * ITEM_HEIGHT;
    const currentPosition = easedProgress * targetPosition;
    
    setScrollPosition(currentPosition);
    
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

  if (!isRolling || rollItems.length === 0) {
    return null;
  }

  return (
    <div className="relative flex items-center justify-center w-full max-w-2xl mx-auto">
      <div 
        className="relative rounded-xl border-4 border-primary/40 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-md shadow-2xl overflow-hidden" 
        style={{ width: '100%', maxWidth: '500px', height: `${ITEM_HEIGHT}px` }}
      >
        {/* Center indicator lines */}
        <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
          <div className="w-full h-1 bg-primary/50 absolute top-1/2 -translate-y-1/2" />
          <div className="w-full h-1 bg-primary/50 absolute top-1/2 -translate-y-1/2 translate-y-[-260px]" />
          <div className="w-full h-1 bg-primary/50 absolute top-1/2 -translate-y-1/2 translate-y-[260px]" />
        </div>
        
        {/* Scrolling items container */}
        <div
          ref={containerRef}
          className="relative"
          style={{
            transform: `translateY(${-scrollPosition}px)`,
            transition: 'none',
          }}
        >
          {rollItems.map((item, index) => {
            const rarityClass = getRarityClass(item.rarity);
            const rarityGlow = getRarityGlow(item.rarity);
            
            return (
              <div
                key={`${item.id}-${index}`}
                className="flex items-center justify-center p-8"
                style={{ height: `${ITEM_HEIGHT}px` }}
              >
                <div className="w-full max-w-[400px]">
                  <div className={`rounded-2xl overflow-hidden border-4 ${rarityClass} ${rarityGlow} bg-card shadow-2xl`}>
                    <div className="relative aspect-square">
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='120' font-weight='bold'%3E%3F%3C/text%3E%3C/svg%3E";
                        }}
                      />
                    </div>
                    <div className="p-6 text-center bg-gradient-to-t from-background to-transparent">
                      <h3 className="font-bold text-2xl mb-2 truncate">{item.name}</h3>
                      <div className="flex items-center justify-center gap-4">
                        <p className={`text-sm font-semibold px-3 py-1 rounded-full ${rarityClass}`}>
                          {item.rarity}
                        </p>
                        <p className="text-lg font-bold text-primary">
                          ${formatValue(item.value)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
