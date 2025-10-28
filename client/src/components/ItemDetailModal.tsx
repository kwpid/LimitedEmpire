import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue, getRarityColor } from "@/lib/rarity";
import { RARITY_TIERS, calculateRollChance } from "@shared/schema";
import { useAuth } from "@/contexts/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface ItemDetailModalProps {
  item: Item | null;
  serialNumber?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
}

export function ItemDetailModal({ item, serialNumber, open, onOpenChange, onEdit }: ItemDetailModalProps) {
  const { user } = useAuth();
  const [creatorUsername, setCreatorUsername] = useState<string>("");

  useEffect(() => {
    async function fetchCreator() {
      if (!item?.createdBy) {
        setCreatorUsername("");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", item.createdBy));
        if (userDoc.exists()) {
          setCreatorUsername(userDoc.data().username || "Unknown");
        } else {
          setCreatorUsername("Unknown");
        }
      } catch (error) {
        console.error("Error fetching creator:", error);
        setCreatorUsername("Unknown");
      }
    }

    if (open && item) {
      fetchCreator();
    }
  }, [item, open]);

  if (!item) return null;

  const rarityClass = getRarityClass(item.rarity);
  const rarityGlow = getRarityGlow(item.rarity);
  const rarityColor = getRarityColor(item.rarity);
  const rollChance = calculateRollChance(item.value);
  const isInsane = item.rarity === "INSANE";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="modal-item-detail">
        <DialogHeader>
          <DialogTitle className="text-2xl">{item.name}</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-[300px,1fr] gap-6">
          <div className={`aspect-square border-2 rounded-lg overflow-hidden relative bg-black ${rarityClass} ${rarityGlow}`}>
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
                e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='72' font-weight='bold'%3E%3F%3C/text%3E%3C/svg%3E";
              }}
            />
            <Badge 
              variant="outline" 
              className="absolute top-3 left-3 text-sm font-bold z-[30] backdrop-blur-sm"
              style={!isInsane ? { 
                backgroundColor: `${rarityColor}20`,
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
              <Badge variant="secondary" className="absolute bottom-3 left-3 text-sm z-[30] bg-secondary/90 backdrop-blur-sm" data-testid="text-stock-info">
                {item.remainingStock}/{item.totalStock}
              </Badge>
            )}
            {serialNumber !== undefined && (
              <Badge variant="secondary" className="absolute top-3 right-3 text-sm z-[30] bg-secondary/90 backdrop-blur-sm" data-testid="badge-serial-number">
                #{serialNumber}
              </Badge>
            )}
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Card className="rounded-xl">
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Value</h3>
                  <p className="font-bold text-2xl tabular-nums" data-testid="text-detail-value">
                    {formatValue(item.value)}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-xl">
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Roll Chance</h3>
                  <p className="text-2xl tabular-nums font-bold" data-testid="text-roll-chance">
                    {rollChance.toFixed(Math.max(2, Math.ceil(-Math.log10(rollChance))))}%
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-xl">
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
                <p className="text-sm" data-testid="text-item-description">{item.description}</p>
              </CardContent>
            </Card>

            {creatorUsername && (
              <Card className="rounded-xl">
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Uploaded By</h3>
                  <p className="text-sm font-medium" data-testid="text-creator-username">
                    {creatorUsername}
                  </p>
                </CardContent>
              </Card>
            )}

            {item.offSale && (
              <Badge variant="destructive" className="w-full justify-center py-2">
                Currently Off-Sale
              </Badge>
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
