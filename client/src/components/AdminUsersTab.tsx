import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { collection, query, where, getDocs, doc, updateDoc, writeBatch, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, Ban, UserX, Trash2, Gift } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { User, Item } from "@shared/schema";

export function AdminUsersTab() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    type: "ban" | "unban" | "wipe" | "give" | null;
    user: User | null;
  }>({ type: null, user: null });
  const [banReason, setBanReason] = useState("");
  const [giveItemId, setGiveItemId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [processing, setProcessing] = useState(false);

  const searchUsers = async () => {
    if (!searchTerm.trim()) return;

    setSearching(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("username", ">=", searchTerm), where("username", "<=", searchTerm + "\uf8ff"));
      const snapshot = await getDocs(q);
      
      const users: User[] = [];
      snapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() } as User);
      });

      setSearchResults(users);
    } catch (error) {
      console.error("Error searching users:", error);
      toast({
        title: "Search failed",
        description: "Could not search users",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const loadItems = async () => {
    try {
      const itemsSnapshot = await getDocs(collection(db, "items"));
      const itemsList: Item[] = [];
      itemsSnapshot.forEach((doc) => {
        itemsList.push({ id: doc.id, ...doc.data() } as Item);
      });
      setItems(itemsList);
    } catch (error) {
      console.error("Error loading items:", error);
    }
  };

  const handleBan = async () => {
    if (!actionDialog.user) return;

    setProcessing(true);
    try {
      const userRef = doc(db, "users", actionDialog.user.id);
      await updateDoc(userRef, {
        isBanned: true,
        banReason: banReason || "No reason provided",
      });

      toast({
        title: "User banned",
        description: `${actionDialog.user.username} has been banned`,
      });

      searchUsers();
      setActionDialog({ type: null, user: null });
      setBanReason("");
    } catch (error: any) {
      console.error("Error banning user:", error);
      toast({
        title: "Ban failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleUnban = async () => {
    if (!actionDialog.user) return;

    setProcessing(true);
    try {
      const userRef = doc(db, "users", actionDialog.user.id);
      await updateDoc(userRef, {
        isBanned: false,
        banReason: "",
      });

      toast({
        title: "User unbanned",
        description: `${actionDialog.user.username} has been unbanned`,
      });

      searchUsers();
      setActionDialog({ type: null, user: null });
    } catch (error: any) {
      console.error("Error unbanning user:", error);
      toast({
        title: "Unban failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleWipeInventory = async () => {
    if (!actionDialog.user) return;

    setProcessing(true);
    try {
      const inventoryQuery = query(
        collection(db, "inventory"),
        where("userId", "==", actionDialog.user.firebaseUid)
      );
      const snapshot = await getDocs(inventoryQuery);

      const batch = writeBatch(db);
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      toast({
        title: "Inventory wiped",
        description: `Deleted ${snapshot.size} items from ${actionDialog.user.username}'s inventory`,
      });

      setActionDialog({ type: null, user: null });
    } catch (error: any) {
      console.error("Error wiping inventory:", error);
      toast({
        title: "Wipe failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleGiveItem = async () => {
    if (!actionDialog.user || !giveItemId) return;

    setProcessing(true);
    try {
      const itemDoc = await getDocs(query(collection(db, "items"), where("__name__", "==", giveItemId)));
      if (itemDoc.empty) {
        throw new Error("Item not found");
      }

      const item = { id: itemDoc.docs[0].id, ...itemDoc.docs[0].data() } as Item;

      await addDoc(collection(db, "inventory"), {
        itemId: item.id,
        userId: actionDialog.user.firebaseUid,
        serialNumber: null,
        rolledAt: Date.now(),
      });

      toast({
        title: "Item given",
        description: `Gave ${item.name} to ${actionDialog.user.username}`,
      });

      setActionDialog({ type: null, user: null });
      setGiveItemId("");
    } catch (error: any) {
      console.error("Error giving item:", error);
      toast({
        title: "Give failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchUsers()}
            className="pl-10"
            data-testid="input-search-users"
          />
        </div>
        <Button onClick={searchUsers} disabled={searching} data-testid="button-search-users">
          {searching ? "Searching..." : "Search"}
        </Button>
      </div>

      {searchResults.length > 0 && (
        <div className="space-y-2">
          {searchResults.map((user) => (
            <div key={user.id} className="flex items-center justify-between p-4 bg-card rounded-lg border">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-semibold">{user.username}</p>
                  <p className="text-sm text-muted-foreground">User ID: {user.userId}</p>
                </div>
                {user.isBanned && (
                  <Badge variant="destructive">Banned</Badge>
                )}
                {user.isAdmin && (
                  <Badge variant="secondary">Admin</Badge>
                )}
              </div>
              <div className="flex gap-2">
                {user.isBanned ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActionDialog({ type: "unban", user })}
                  >
                    <UserX className="w-4 h-4 mr-2" />
                    Unban
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActionDialog({ type: "ban", user })}
                  >
                    <Ban className="w-4 h-4 mr-2" />
                    Ban
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActionDialog({ type: "wipe", user })}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Wipe Inventory
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await loadItems();
                    setActionDialog({ type: "give", user });
                  }}
                >
                  <Gift className="w-4 h-4 mr-2" />
                  Give Item
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!actionDialog.type} onOpenChange={() => setActionDialog({ type: null, user: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog.type === "ban" && `Ban ${actionDialog.user?.username}?`}
              {actionDialog.type === "unban" && `Unban ${actionDialog.user?.username}?`}
              {actionDialog.type === "wipe" && `Wipe ${actionDialog.user?.username}'s Inventory?`}
              {actionDialog.type === "give" && `Give Item to ${actionDialog.user?.username}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog.type === "ban" && (
                <div className="space-y-2">
                  <p>This will prevent the user from accessing the game.</p>
                  <Input
                    placeholder="Ban reason (optional)"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                  />
                </div>
              )}
              {actionDialog.type === "unban" && "This will allow the user to access the game again."}
              {actionDialog.type === "wipe" && (
                <span className="text-destructive font-semibold">
                  This will permanently delete all items from this user's inventory. This action cannot be undone.
                </span>
              )}
              {actionDialog.type === "give" && (
                <div className="space-y-2">
                  <p>Select an item to give to this user:</p>
                  <Select value={giveItemId} onValueChange={setGiveItemId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (actionDialog.type === "ban") handleBan();
                if (actionDialog.type === "unban") handleUnban();
                if (actionDialog.type === "wipe") handleWipeInventory();
                if (actionDialog.type === "give") handleGiveItem();
              }}
              disabled={processing || (actionDialog.type === "give" && !giveItemId)}
            >
              {processing ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
