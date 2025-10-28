import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue } from "@/lib/rarity";
import { RARITY_TIERS, calculateRollChance } from "@shared/schema";
import { useAuth } from "@/contexts/AuthContext";

interface ItemDetailModalProps {
  item: Item | null;
  serialNumber?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
}

export function ItemDetailModal({ item, serialNumber, open, onOpenChange, onEdit }: ItemDetailModalProps) {
  const { user } = useAuth();

  if (!item) return null;

  const rarityClass = getRarityClass(item.rarity);
  const rarityGlow = getRarityGlow(item.rarity);
  const rollChance = calculateRollChance(item.value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="modal-item-detail">
        <DialogHeader>
          <DialogTitle className="text-2xl">{item.name}</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-[300px,1fr] gap-6">
          <div className={`aspect-square border-2 rounded-lg overflow-hidden ${rarityClass} ${rarityGlow}`}>
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='72' font-weight='bold'%3E%3F%3C/text%3E%3C/svg%3E";
              }}
            />
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
              <p className="text-sm" data-testid="text-item-description">{item.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Rarity</h3>
                <Badge variant="outline" data-testid="badge-item-rarity">
                  {RARITY_TIERS[item.rarity].name}
                </Badge>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Value</h3>
                <p className="font-bold text-lg tabular-nums" data-testid="text-detail-value">
                  {formatValue(item.value)}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Roll Chance</h3>
                <p className="text-sm tabular-nums" data-testid="text-roll-chance">
                  {rollChance.toFixed(Math.max(2, Math.ceil(-Math.log10(rollChance))))}%
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Stock</h3>
                <p className="text-sm" data-testid="text-stock-info">
                  {item.stockType === "infinite"
                    ? "Infinite"
                    : `${item.remainingStock}/${item.totalStock}`}
                </p>
              </div>
            </div>
            {serialNumber !== undefined && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Serial Number</h3>
                <Badge variant="secondary" data-testid="badge-serial-number">
                  #{serialNumber}
                </Badge>
              </div>
            )}
            {item.offSale && (
              <Badge variant="destructive">Currently Off-Sale</Badge>
            )}
            {user?.isAdmin && onEdit && (
              <Button onClick={onEdit} className="w-full" data-testid="button-edit-item">
                Edit Item
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
