import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue, getRarityColor, getRarityBadgeColor } from "@/lib/rarity";
import { RARITY_TIERS } from "@shared/schema";

interface ItemCardProps {
  item: Item;
  serialNumber?: number;
  onClick?: () => void;
}

export function ItemCard({ item, serialNumber, onClick }: ItemCardProps) {
  const rarityClass = getRarityClass(item.rarity);
  const rarityGlow = getRarityGlow(item.rarity);
  const isInsane = item.rarity === "INSANE";
  const rarityColor = getRarityColor(item.rarity);

  const insaneGradientStyle = isInsane
    ? {
        background: "linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)",
        backgroundSize: "400% 400%",
      }
    : {};

  return (
    <Card
      className={`overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-all duration-300 border-2 ${rarityClass} ${rarityGlow} ${isInsane ? "animate-chroma-gradient" : ""}`}
      onClick={onClick}
      data-testid={`card-item-${item.id}`}
      style={insaneGradientStyle}
    >
      <div className="aspect-square relative">
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='48' font-weight='bold'%3E%3F%3C/text%3E%3C/svg%3E";
          }}
        />
        <Badge 
          variant="outline" 
          className="absolute top-2 left-2 text-xs font-bold"
          style={!isInsane ? { 
            backgroundColor: getRarityBadgeColor(item.rarity),
            borderColor: rarityColor,
            color: rarityColor
          } : {
            background: "linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff)",
            color: "white",
            borderColor: "white"
          }}
        >
          {RARITY_TIERS[item.rarity].name}
        </Badge>
        {item.stockType === "limited" && (
          <Badge variant="secondary" className="absolute top-2 right-2 text-xs">
            {item.remainingStock}/{item.totalStock}
          </Badge>
        )}
        {item.offSale && (
          <Badge variant="destructive" className="absolute bottom-2 right-2">
            Off-Sale
          </Badge>
        )}
        {serialNumber !== undefined && (
          <Badge variant="secondary" className="absolute bottom-2 left-2">
            #{serialNumber}
          </Badge>
        )}
      </div>
      <div className="p-3 space-y-1">
        <h3 className="font-semibold text-sm truncate" data-testid={`text-item-name-${item.id}`}>
          {item.name}
        </h3>
        <div className="flex items-center justify-end gap-2">
          <span className="font-bold text-sm tabular-nums" data-testid={`text-item-value-${item.id}`}>
            {formatValue(item.value)}
          </span>
        </div>
      </div>
    </Card>
  );
}
