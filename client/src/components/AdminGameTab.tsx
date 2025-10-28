import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { collection, getDocs, writeBatch, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function AdminGameTab() {
  const { toast } = useToast();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const handleResetEconomyClick = () => {
    setShowPasswordDialog(true);
  };

  const verifyPassword = () => {
    const devPassword = import.meta.env.VITE_DEV_PASSWORD || "admin123";
    
    if (password === devPassword) {
      setShowPasswordDialog(false);
      setShowResetDialog(true);
      setPassword("");
    } else {
      toast({
        title: "Invalid password",
        description: "The developer password is incorrect",
        variant: "destructive",
      });
      setPassword("");
    }
  };

  const handleResetEconomy = async () => {
    setResetting(true);
    try {
      const itemsSnapshot = await getDocs(collection(db, "items"));
      const inventorySnapshot = await getDocs(collection(db, "inventory"));
      const globalRollsSnapshot = await getDocs(collection(db, "globalRolls"));

      let ownershipMarkerCount = 0;
      for (const itemDoc of itemsSnapshot.docs) {
        const ownersSnapshot = await getDocs(collection(db, "items", itemDoc.id, "owners"));
        ownershipMarkerCount += ownersSnapshot.size;
      }

      const totalDocs = inventorySnapshot.size + globalRollsSnapshot.size + itemsSnapshot.size + ownershipMarkerCount;
      if (totalDocs > 400) {
        toast({
          title: "Too many documents",
          description: `Cannot reset ${totalDocs} documents in a single batch (limit: 400). Contact developer for manual reset.`,
          variant: "destructive",
        });
        setResetting(false);
        setShowResetDialog(false);
        return;
      }

      const batch = writeBatch(db);
      
      inventorySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      globalRollsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      for (const itemDoc of itemsSnapshot.docs) {
        const ownersSnapshot = await getDocs(collection(db, "items", itemDoc.id, "owners"));
        ownersSnapshot.forEach((ownerDoc) => {
          batch.delete(ownerDoc.ref);
        });

        const item = itemDoc.data();
        const updates: any = { totalOwners: 0 };
        
        if (item.stockType === "limited" && item.totalStock) {
          updates.remainingStock = item.totalStock;
        }
        
        batch.update(itemDoc.ref, updates);
      }

      await batch.commit();

      toast({
        title: "Economy reset complete",
        description: `Deleted ${inventorySnapshot.size} inventory items, ${globalRollsSnapshot.size} global rolls, ${ownershipMarkerCount} ownership markers, and reset ${itemsSnapshot.size} items`,
      });

      setShowResetDialog(false);
    } catch (error: any) {
      console.error("Error resetting economy:", error);
      toast({
        title: "Reset failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-destructive/10 border border-destructive rounded-lg p-6">
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-destructive mt-1" />
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-destructive">Danger Zone</h3>
              <p className="text-sm text-muted-foreground mt-1">
                These actions are irreversible and will affect all users in the game
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Reset Economy</p>
                  <p className="text-sm text-muted-foreground">
                    Delete all inventories, reset item stocks and owner counts
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleResetEconomyClick}
                  disabled={resetting}
                  data-testid="button-reset-economy"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reset Economy
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Developer Password Required</AlertDialogTitle>
            <AlertDialogDescription>
              This is a dangerous operation. Enter the developer password to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              type="password"
              placeholder="Enter developer password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && verifyPassword()}
              data-testid="input-dev-password"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPassword("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={verifyPassword}>
              Verify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Entire Economy?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2 text-destructive font-semibold">
                <p>⚠️ This will permanently:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Delete ALL user inventories</li>
                  <li>Delete ALL global roll records</li>
                  <li>Reset all item stocks to maximum</li>
                  <li>Reset all totalOwners counts to 0</li>
                </ul>
                <p className="mt-4">This action CANNOT be undone!</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetEconomy}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? "Resetting..." : "Reset Everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
