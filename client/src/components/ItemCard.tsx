import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue, getRarityColor } from "@/lib/rarity";
import { RARITY_TIERS } from "@shared/schema";
import { useState, useEffect } from "react";
import { Clock, Users } from "lucide-react";

interface ItemCardProps {
  item: Item;
  serialNumber?: number;
  onClick?: () => void;
  stackCount?: number;
  showStock?: boolean; // Show stock badge (for index)
}

function formatTimerCountdown(expiresAt: number): string {
  const timeLeft = expiresAt - Date.now();
  if (timeLeft <= 0) return "EXPIRED";
  
  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${days}d ${hours}h ${minutes}m`;
}

export function ItemCard({ item, serialNumber, onClick, stackCount, showStock = false }: ItemCardProps) {
  const rarityClass = getRarityClass(item.rarity);
  const rarityGlow = getRarityGlow(item.rarity);
  const isInsane = item.rarity === "INSANE";
  const rarityColor = getRarityColor(item.rarity);
  const [timerDisplay, setTimerDisplay] = useState<string>("");

  // Update timer countdown every minute for timer items
  useEffect(() => {
    if (item.stockType === "timer" && item.timerExpiresAt) {
      const updateTimer = () => {
        setTimerDisplay(formatTimerCountdown(item.timerExpiresAt!));
      };
      
      updateTimer();
      const interval = setInterval(updateTimer, 60000); // Update every minute
      
      return () => clearInterval(interval);
    }
  }, [item.stockType, item.timerExpiresAt]);

  return (
    <Card
      className={`overflow-visible cursor-pointer hover-elevate active-elevate-2 transition-all duration-300 border-2 ${rarityClass} ${rarityGlow} h-full flex flex-col`}
      onClick={onClick}
      data-testid={`card-item-${item.id}`}
    >
      <div className="aspect-square relative bg-black overflow-hidden rounded-t-lg">
        {isInsane && (
          <div 
            className="absolute inset-0 opacity-30 z-[1] animate-gradient-slow pointer-events-none"
            style={{
              background: "linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)",
              backgroundSize: "400% 400%",
            }}
          />
        )}
        <img
          src={item.imageUrl}
          alt={item.name}
          className="absolute inset-0 w-full h-full object-cover z-0"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='48' font-weight='bold'%3E%3F%3C/text%3E%3C/svg%3E";
          }}
        />
        {/* Rarity badge - Top left */}
        <Badge 
          variant="outline" 
          className="absolute top-2 left-2 text-xs font-bold z-[15] backdrop-blur-md whitespace-nowrap"
          style={!isInsane ? { 
            backgroundColor: `${rarityColor}40`,
            borderColor: rarityColor,
            color: rarityColor
          } : {
            background: "linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff)",
            color: "white",
            borderColor: "white"
          }}
          data-testid={`badge-rarity-${item.id}`}
        >
          {RARITY_TIERS[item.rarity].name}
        </Badge>

        {/* Off-sale badge - Below rarity on left */}
        {item.offSale && (
          <Badge variant="destructive" className="absolute top-10 left-2 text-xs z-[15] bg-destructive backdrop-blur-md whitespace-nowrap">
            Off-Sale
          </Badge>
        )}

        {/* Serial badge - Top right (only when serialNumber is provided) */}
        {serialNumber !== undefined && (
          <Badge variant="secondary" className="absolute top-2 right-2 text-xs z-[15] bg-secondary backdrop-blur-md whitespace-nowrap" data-testid={`badge-serial-${serialNumber}`}>
            #{serialNumber}
          </Badge>
        )}

        {/* Stock badge - Top right (only when showStock is true and item is limited) */}
        {showStock && item.stockType === "limited" && serialNumber === undefined && (
          <Badge variant="secondary" className="absolute top-2 right-2 text-xs z-[15] bg-secondary backdrop-blur-md whitespace-nowrap" data-testid={`badge-stock-${item.id}`}>
            {item.remainingStock}/{item.totalStock}
          </Badge>
        )}

        {/* Timer countdown badge - Top right (only when showStock is true and item is timer) */}
        {showStock && item.stockType === "timer" && serialNumber === undefined && (
          <Badge 
            variant="secondary" 
            className="absolute top-2 right-2 text-xs z-[15] bg-blue-500/80 text-white backdrop-blur-md whitespace-nowrap flex items-center gap-1" 
            data-testid={`badge-timer-${item.id}`}
          >
            <Clock className="w-3 h-3" />
            {timerDisplay}
          </Badge>
        )}

        {/* Owners badge - Bottom right (for timer items only on index) */}
        {showStock && item.stockType === "timer" && item.totalOwners > 0 && (
          <Badge 
            variant="secondary" 
            className="absolute bottom-2 right-2 text-xs z-[15] bg-purple-500/80 text-white backdrop-blur-md whitespace-nowrap flex items-center gap-1" 
            data-testid={`badge-owners-${item.id}`}
          >
            <Users className="w-3 h-3" />
            {item.totalOwners}
          </Badge>
        )}
      </div>
      <div className="p-3 space-y-1 flex-1 flex flex-col justify-between">
        <h3 className="font-semibold text-sm truncate" data-testid={`text-item-name-${item.id}`}>
          {item.name}
        </h3>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-sm tabular-nums" data-testid={`text-item-value-${item.id}`}>
            {formatValue(item.value)}
          </span>
          {stackCount && stackCount > 1 && (
            <span className="text-xs text-muted-foreground" data-testid={`text-stack-total-${item.id}`}>
              x{stackCount} ({formatValue(item.value * stackCount)})
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
