import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Item } from "@shared/schema";
import { getRarityClass, getRarityGlow, formatValue, getRarityColor } from "@/lib/rarity";
import { RARITY_TIERS, calculateRollChance } from "@shared/schema";
import { useAuth } from "@/contexts/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sellItems } from "@/lib/sellService";
import { useToast } from "@/hooks/use-toast";
import { DollarSign } from "lucide-react";

interface ItemDetailModalProps {
  item: Item | null;
  serialNumber?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  inventoryIds?: string[];
  stackCount?: number;
  onSellComplete?: () => void;
}

export function ItemDetailModal({ item, serialNumber, open, onOpenChange, onEdit, inventoryIds = [], stackCount = 1, onSellComplete }: ItemDetailModalProps) {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [creatorUsername, setCreatorUsername] = useState<string>("");
  const [showSellDialog, setShowSellDialog] = useState(false);
  const [sellQuantity, setSellQuantity] = useState(1);
  const [selling, setSelling] = useState(false);

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

  useEffect(() => {
    if (open) {
      setSellQuantity(1);
    }
  }, [open]);

  if (!item) return null;

  const rarityClass = getRarityClass(item.rarity);
  const rarityGlow = getRarityGlow(item.rarity);
  const rarityColor = getRarityColor(item.rarity);
  const rollChance = calculateRollChance(item.value);
  const isInsane = item.rarity === "INSANE";
  const canSell = inventoryIds.length > 0;
  const sellValue = Math.floor(item.value * 0.8);

  const handleSellClick = () => {
    setShowSellDialog(true);
  };

  const handleSellConfirm = async () => {
    if (!user || !canSell) return;

    setSelling(true);
    try {
      const result = await sellItems(user, inventoryIds, item.value, sellQuantity);
      
      toast({
        title: "Items sold!",
        description: `Sold ${result.soldCount}x ${item.name} for ${formatValue(result.playerEarned)}`,
      });

      setShowSellDialog(false);
      onOpenChange(false);
      
      await refetchUser();
      
      if (onSellComplete) {
        onSellComplete();
      }
    } catch (error: any) {
      console.error("Sell error:", error);
      toast({
        title: "Sell failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSelling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="modal-item-detail">
        <DialogHeader>
          <DialogTitle className="text-2xl">{item.name}</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-[300px,1fr] gap-6">
          <div className={`aspect-square border-2 rounded-lg relative bg-black overflow-hidden ${rarityClass} ${rarityGlow}`}>
            {isInsane && (
              <div 
                className="absolute inset-0 opacity-30 z-[0] animate-gradient-slow pointer-events-none"
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
              className="absolute top-3 left-3 text-sm font-bold z-[20] backdrop-blur-sm"
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
              <Badge variant="secondary" className="absolute top-3 right-3 text-sm z-[20] bg-secondary/90 backdrop-blur-sm" data-testid="text-stock-info">
                {item.remainingStock}/{item.totalStock}
              </Badge>
            )}
            {serialNumber !== undefined && (
              <Badge variant="secondary" className="absolute bottom-3 right-3 text-sm z-[20] bg-secondary/90 backdrop-blur-sm" data-testid="badge-serial-number">
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
            
            {canSell && (
              <div className="space-y-2">
                <Card className="rounded-xl bg-green-500/10 border-green-500/20">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Sell Value (80%)</h3>
                    <p className="text-2xl tabular-nums font-bold text-green-500" data-testid="text-sell-value">
                      {formatValue(sellValue)}
                      {stackCount > 1 && (
                        <span className="text-sm text-muted-foreground ml-2">
                          each
                        </span>
                      )}
                    </p>
                  </CardContent>
                </Card>
                
                <Button 
                  onClick={handleSellClick} 
                  className="w-full" 
                  variant="outline"
                  data-testid="button-sell-item"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Sell Item{stackCount > 1 ? "s" : ""}
                </Button>
              </div>
            )}

            {user?.isAdmin && onEdit && (
              <Button onClick={onEdit} className="w-full" data-testid="button-edit-item">
                Edit Item
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={showSellDialog} onOpenChange={setShowSellDialog}>
        <AlertDialogContent data-testid="dialog-sell-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Sell {item.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Choose how many to sell. You'll receive 80% of the item value ({formatValue(sellValue)} each).
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sell-quantity">Quantity</Label>
              <Input
                id="sell-quantity"
                type="number"
                min={1}
                max={stackCount}
                value={sellQuantity}
                onChange={(e) => setSellQuantity(Math.max(1, Math.min(stackCount, parseInt(e.target.value) || 1)))}
                data-testid="input-sell-quantity"
              />
              <p className="text-sm text-muted-foreground">
                Available: {stackCount}
              </p>
            </div>
            
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total earnings:</span>
                  <span className="text-lg font-bold text-green-500" data-testid="text-total-earnings">
                    {formatValue(sellValue * sellQuantity)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={selling} data-testid="button-cancel-sell">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSellConfirm}
              disabled={selling || sellQuantity < 1}
              data-testid="button-confirm-sell"
            >
              {selling ? "Selling..." : "Confirm Sale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
