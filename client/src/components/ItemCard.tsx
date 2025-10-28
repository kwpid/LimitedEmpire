import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue, getRarityColor } from "@/lib/rarity";
import { RARITY_TIERS } from "@shared/schema";

interface ItemCardProps {
  item: Item;
  serialNumber?: number;
  onClick?: () => void;
  stackCount?: number;
}

export function ItemCard({ item, serialNumber, onClick, stackCount }: ItemCardProps) {
  const rarityClass = getRarityClass(item.rarity);
  const rarityGlow = getRarityGlow(item.rarity);
  const isInsane = item.rarity === "INSANE";
  const rarityColor = getRarityColor(item.rarity);

  return (
    <Card
      className={`overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-all duration-300 border-2 ${rarityClass} ${rarityGlow} h-full flex flex-col`}
      onClick={onClick}
      data-testid={`card-item-${item.id}`}
    >
      <div className="aspect-square relative bg-black">
        {isInsane && (
          <div 
            className="absolute inset-0 opacity-30 z-[5] animate-gradient-slow pointer-events-none"
            style={{
              background: "linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)",
              backgroundSize: "400% 400%",
            }}
          />
        )}
        <img
          src={item.imageUrl}
          alt={item.name}
          className="absolute inset-0 w-full h-full object-cover z-[1]"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='48' font-weight='bold'%3E%3F%3C/text%3E%3C/svg%3E";
          }}
        />
        <Badge 
          variant="outline" 
          className="absolute top-2 left-2 text-xs font-bold z-[20]"
          style={!isInsane ? { 
            backgroundColor: `${rarityColor}20`,
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
        {serialNumber !== undefined ? (
          <Badge variant="secondary" className="absolute top-2 right-2 text-xs z-[20] bg-secondary/90 backdrop-blur-sm" data-testid={`badge-serial-${serialNumber}`}>
            #{serialNumber}
          </Badge>
        ) : (
          item.stockType === "limited" && (
            <Badge variant="secondary" className="absolute top-2 right-2 text-xs z-[20] bg-secondary/90 backdrop-blur-sm" data-testid={`badge-stock-${item.id}`}>
              {item.remainingStock}/{item.totalStock}
            </Badge>
          )
        )}
        {item.offSale && (
          <Badge variant="destructive" className="absolute bottom-2 right-2 z-[20] bg-destructive/90 backdrop-blur-sm">
            Off-Sale
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
