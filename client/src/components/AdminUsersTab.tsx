import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { collection, query, where, getDocs, doc, updateDoc, writeBatch, runTransaction, deleteField } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, Ban, UserX, Trash2, Gift } from "lucide-react";
import { createAuditLog } from "@/lib/audit-log";
import { useAuth } from "@/contexts/AuthContext";
import { sendWebhookRequest } from "@/lib/webhook-client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input as InputComponent } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { User } from "@shared/schema";
import { AdminGiveItemsDialog } from "@/components/AdminGiveItemsDialog";

type BanPreset = {
  name: string;
  reason: string;
  days: number;
  isPermanent: boolean;
  wipeInventory: boolean;
};

const BAN_PRESETS: BanPreset[] = [
  {
    name: "Alt Farming",
    reason: "Alt Farming",
    days: 7,
    isPermanent: false,
    wipeInventory: true,
  },
  {
    name: "Toxicity",
    reason: "Toxicity",
    days: 3,
    isPermanent: false,
    wipeInventory: false,
  },
  {
    name: "Scamming",
    reason: "Scamming",
    days: 0,
    isPermanent: true,
    wipeInventory: true,
  },
  {
    name: "Glitch Abuse",
    reason: "Glitch Abuse",
    days: 30,
    isPermanent: false,
    wipeInventory: false,
  },
  {
    name: "Inappropriate Content",
    reason: "Inappropriate Content",
    days: 0,
    isPermanent: true,
    wipeInventory: false,
  },
];

export function AdminUsersTab() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    type: "ban" | "unban" | "wipe" | null;
    user: User | null;
  }>({ type: null, user: null });
  const [banReason, setBanReason] = useState("");
  const [isPermanentBan, setIsPermanentBan] = useState(false);
  const [banDays, setBanDays] = useState(7);
  const [wipeInventoryOnBan, setWipeInventoryOnBan] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");
  const [banNotes, setBanNotes] = useState("");
  const [giveItemsUser, setGiveItemsUser] = useState<User | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      searchUsers();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const sendWebhook = async (action: string, targetUsername: string, details: string[], color?: number) => {
    if (!currentUser) return;
    
    await sendWebhookRequest('/api/webhooks/admin-log', {
      action,
      adminUsername: currentUser.username,
      targetUsername,
      details,
      color,
    });
  };

  const applyBanPreset = (presetName: string) => {
    setSelectedPreset(presetName);
    
    if (presetName === "custom") {
      setBanReason("");
      setBanNotes("");
      setIsPermanentBan(false);
      setBanDays(7);
      setWipeInventoryOnBan(false);
      return;
    }

    const preset = BAN_PRESETS.find(p => p.name === presetName);
    if (preset) {
      setBanReason(preset.reason);
      setIsPermanentBan(preset.isPermanent);
      setBanDays(preset.days);
      setWipeInventoryOnBan(preset.wipeInventory);
    }
  };

  const searchUsers = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);
      
      const searchLower = searchTerm.toLowerCase();
      const users: User[] = [];
      snapshot.forEach((docSnap) => {
        const userData = docSnap.data() as User;
        const username = userData.username || "";
        if (username.toLowerCase().includes(searchLower)) {
          users.push({ ...userData, id: docSnap.id });
        }
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


  const handleBan = async () => {
    if (!actionDialog.user) return;

    if (actionDialog.user.userId === 1) {
      toast({
        title: "Cannot ban Admin",
        description: "Admin user cannot be banned",
        variant: "destructive",
      });
      setActionDialog({ type: null, user: null });
      return;
    }

    setProcessing(true);
    try {
      const userRef = doc(db, "users", actionDialog.user.id);
      const banExpiresAt = isPermanentBan ? undefined : Date.now() + (banDays * 24 * 60 * 60 * 1000);

      const updateData: any = {
        isBanned: true,
        isPermanentBan: isPermanentBan,
        banReason: banReason || "No reason provided",
      };

      if (banNotes.trim()) {
        updateData.banNotes = banNotes.trim();
      }

      if (banExpiresAt) {
        updateData.banExpiresAt = banExpiresAt;
      }

      const shouldWipeInventory = isPermanentBan || wipeInventoryOnBan;

      // Create audit log
      if (currentUser) {
        await createAuditLog({
          timestamp: Date.now(),
          adminId: currentUser.id,
          adminUsername: currentUser.username,
          actionType: "user_ban",
          targetUserId: actionDialog.user.id,
          targetUsername: actionDialog.user.username,
          details: {
            reason: banReason || "No reason provided",
            isPermanent: isPermanentBan,
            duration: isPermanentBan ? 0 : banDays,
            wipeInventory: shouldWipeInventory,
          },
          metadata: {
            banReason: banReason || "No reason provided",
            banDuration: isPermanentBan ? undefined : banDays * 24 * 60 * 60 * 1000,
            isPermanentBan,
          },
        });
      }

      // Send Discord webhook
      const webhookDetails: string[] = [
        `**User:** ${actionDialog.user.username}`,
        `**Reason:** ${banReason || "No reason provided"}`,
        `**Type:** ${isPermanentBan ? "Permanent Ban" : `Temporary (${banDays} days)`}`,
      ];
      if (shouldWipeInventory) {
        webhookDetails.push("**Inventory:** Wiped");
      }
      await sendWebhook("User Banned", actionDialog.user.username, webhookDetails, 0xED4245);

      if (shouldWipeInventory) {
        const usersRef = collection(db, "users");
        const adminQuery = query(usersRef, where("userId", "==", 1));
        const adminSnapshot = await getDocs(adminQuery);
        
        if (adminSnapshot.empty) {
          throw new Error("Admin user not found. Cannot process ban with inventory wipe.");
        }

        const adminDocId = adminSnapshot.docs[0].id;

        await runTransaction(db, async (transaction) => {
          const targetUserRef = doc(db, "users", actionDialog.user!.id);
          const adminRef = doc(db, "users", adminDocId);

          const targetUserDoc = await transaction.get(targetUserRef);
          const adminDoc = await transaction.get(adminRef);

          if (!targetUserDoc.exists() || !adminDoc.exists()) {
            throw new Error("User or Admin not found");
          }

          const targetUserInventory = targetUserDoc.data().inventory || [];
          const adminInventory = adminDoc.data().inventory || [];

          transaction.update(targetUserRef, {
            ...updateData,
            inventory: [],
          });

          transaction.update(adminRef, {
            inventory: [...adminInventory, ...targetUserInventory],
          });
        });

        toast({
          title: isPermanentBan ? "User permanently banned" : "User banned",
          description: `${actionDialog.user.username} has been banned and their inventory wiped`,
        });
      } else {
        await updateDoc(userRef, updateData);

        toast({
          title: "User banned",
          description: `${actionDialog.user.username} has been banned for ${banDays} days`,
        });
      }

      searchUsers();
      setActionDialog({ type: null, user: null });
      setBanReason("");
      setBanNotes("");
      setIsPermanentBan(false);
      setBanDays(7);
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
        isPermanentBan: false,
        banReason: "",
        banExpiresAt: deleteField(),
      });

      // Create audit log
      if (currentUser) {
        await createAuditLog({
          timestamp: Date.now(),
          adminId: currentUser.id,
          adminUsername: currentUser.username,
          actionType: "user_unban",
          targetUserId: actionDialog.user.id,
          targetUsername: actionDialog.user.username,
          details: {
            action: "User unbanned",
          },
        });
      }

      // Send Discord webhook
      const webhookDetails: string[] = [
        `**User:** ${actionDialog.user.username}`,
        `**Status:** Unbanned`,
      ];
      await sendWebhook("User Unbanned", actionDialog.user.username, webhookDetails, 0x57F287);

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

    if (actionDialog.user.userId === 1) {
      toast({
        title: "Cannot wipe Admin",
        description: "Admin user's inventory cannot be wiped",
        variant: "destructive",
      });
      setActionDialog({ type: null, user: null });
      return;
    }

    setProcessing(true);
    try {
      const usersRef = collection(db, "users");
      const adminQuery = query(usersRef, where("userId", "==", 1));
      const adminSnapshot = await getDocs(adminQuery);
      
      if (adminSnapshot.empty) {
        throw new Error("Admin user not found. Cannot wipe inventory.");
      }

      const adminDocId = adminSnapshot.docs[0].id;

      const itemCount = await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", actionDialog.user!.id);
        const adminRef = doc(db, "users", adminDocId);

        const userDoc = await transaction.get(userRef);
        const adminDoc = await transaction.get(adminRef);

        if (!userDoc.exists() || !adminDoc.exists()) {
          throw new Error("User or Admin not found");
        }

        const userInventory = userDoc.data().inventory || [];
        const adminInventory = adminDoc.data().inventory || [];

        transaction.update(adminRef, {
          inventory: [...adminInventory, ...userInventory],
        });

        transaction.update(userRef, {
          inventory: [],
        });

        return userInventory.length;
      });

      // Create audit log
      if (currentUser) {
        await createAuditLog({
          timestamp: Date.now(),
          adminId: currentUser.id,
          adminUsername: currentUser.username,
          actionType: "user_wipe_inventory",
          targetUserId: actionDialog.user.id,
          targetUsername: actionDialog.user.username,
          details: {
            action: "Inventory wiped",
            itemsTransferred: itemCount,
          },
          metadata: {
            itemsWiped: itemCount,
          },
        });
      }

      // Send Discord webhook
      const webhookDetails: string[] = [
        `**User:** ${actionDialog.user.username}`,
        `**Items Wiped:** ${itemCount}`,
        `**Transferred to:** Admin`,
      ];
      await sendWebhook("Inventory Wiped", actionDialog.user.username, webhookDetails, 0xFEE75C);

      toast({
        title: "Inventory wiped",
        description: `All items from ${actionDialog.user.username}'s inventory have been transferred to Admin`,
      });

      setActionDialog({ type: null, user: null });
      searchUsers();
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
                  <Badge variant="destructive" data-testid={`badge-banned-${user.userId}`}>
                    {user.isPermanentBan ? "Permanently Banned" : "Banned"}
                  </Badge>
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
                  onClick={() => setGiveItemsUser(user)}
                  data-testid={`button-give-item-${user.userId}`}
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
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog.type === "ban" && (
                <div className="space-y-4">
                  <p>This will prevent the user from accessing the game.</p>

                  <div className="space-y-2">
                    <Label htmlFor="ban-preset">Quick Select</Label>
                    <Select value={selectedPreset} onValueChange={applyBanPreset}>
                      <SelectTrigger data-testid="select-ban-preset">
                        <SelectValue placeholder="Choose a preset..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom Ban</SelectItem>
                        {BAN_PRESETS.map((preset) => (
                          <SelectItem key={preset.name} value={preset.name}>
                            {preset.name} ({preset.isPermanent ? "Permanent" : `${preset.days} days`}
                            {preset.wipeInventory && ", Wipe"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-3">
                    <Label>Ban Type</Label>
                    <RadioGroup 
                      value={isPermanentBan ? "permanent" : "temporary"} 
                      onValueChange={(value) => {
                        setIsPermanentBan(value === "permanent");
                        if (selectedPreset !== "custom") setSelectedPreset("custom");
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="temporary" id="ban-temporary" data-testid="radio-temporary-ban" />
                        <Label htmlFor="ban-temporary" className="font-normal cursor-pointer">
                          Temporary Ban
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="permanent" id="ban-permanent" data-testid="radio-permanent-ban" />
                        <Label htmlFor="ban-permanent" className="font-normal cursor-pointer">
                          Permanent Ban (Auto-wipes inventory)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {!isPermanentBan && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="ban-days">Ban Duration (days)</Label>
                        <InputComponent
                          id="ban-days"
                          type="number"
                          min="1"
                          value={banDays}
                          onChange={(e) => {
                            setBanDays(Math.max(1, parseInt(e.target.value) || 1));
                            if (selectedPreset !== "custom") setSelectedPreset("custom");
                          }}
                          data-testid="input-ban-days"
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="wipe-inventory"
                          checked={wipeInventoryOnBan}
                          onCheckedChange={(checked) => {
                            setWipeInventoryOnBan(!!checked);
                            if (selectedPreset !== "custom") setSelectedPreset("custom");
                          }}
                          data-testid="checkbox-wipe-inventory"
                        />
                        <Label htmlFor="wipe-inventory" className="font-normal cursor-pointer">
                          Wipe inventory (transfer all items to Admin)
                        </Label>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="ban-reason">Ban Reason</Label>
                    <InputComponent
                      id="ban-reason"
                      placeholder="Enter reason for ban..."
                      value={banReason}
                      onChange={(e) => {
                        setBanReason(e.target.value);
                        if (selectedPreset !== "custom") setSelectedPreset("custom");
                      }}
                      data-testid="input-ban-reason"
                    />
                  </div>

                  {(isPermanentBan || wipeInventoryOnBan) && (
                    <p className="text-sm text-destructive font-semibold">
                      ⚠️ This ban will transfer all of this user's items to the Admin account.
                    </p>
                  )}
                </div>
              )}
              {actionDialog.type === "unban" && "This will allow the user to access the game again."}
              {actionDialog.type === "wipe" && (
                <span className="text-destructive font-semibold">
                  This will transfer all items from this user's inventory to the Admin account. This action cannot be undone.
                </span>
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
              }}
              disabled={processing}
              data-testid="button-confirm-action"
            >
              {processing ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminGiveItemsDialog
        open={!!giveItemsUser}
        onOpenChange={(open) => !open && setGiveItemsUser(null)}
        targetUser={giveItemsUser}
        onSuccess={() => {
          searchUsers();
          setGiveItemsUser(null);
        }}
      />
    </div>
  );
}
