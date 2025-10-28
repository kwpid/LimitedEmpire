import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue } from "@/lib/rarity";
import { RARITY_TIERS } from "@shared/schema";

interface ItemCardProps {
  item: Item;
  serialNumber?: number;
  onClick?: () => void;
}

export function ItemCard({ item, serialNumber, onClick }: ItemCardProps) {
  const rarityClass = getRarityClass(item.rarity);
  const rarityGlow = getRarityGlow(item.rarity);

  return (
    <Card
      className={`overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-all duration-300 border-2 ${rarityClass} ${rarityGlow}`}
      onClick={onClick}
      data-testid={`card-item-${item.id}`}
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
        {item.offSale && (
          <Badge variant="destructive" className="absolute top-2 right-2">
            Off-Sale
          </Badge>
        )}
        {serialNumber !== undefined && (
          <Badge variant="secondary" className="absolute top-2 left-2">
            #{serialNumber}
          </Badge>
        )}
      </div>
      <div className="p-3 space-y-1">
        <h3 className="font-semibold text-sm truncate" data-testid={`text-item-name-${item.id}`}>
          {item.name}
        </h3>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="text-xs">
            {RARITY_TIERS[item.rarity].name}
          </Badge>
          <span className="font-bold text-sm tabular-nums" data-testid={`text-item-value-${item.id}`}>
            {formatValue(item.value)}
          </span>
        </div>
        {item.stockType === "limited" && (
          <p className="text-xs text-muted-foreground">
            Stock: {item.remainingStock}/{item.totalStock}
          </p>
        )}
      </div>
    </Card>
  );
}
