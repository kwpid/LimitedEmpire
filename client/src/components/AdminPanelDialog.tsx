import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input as InputComponent } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, updateDoc, runTransaction, collection, getDocs, query, where, getDoc } from "firebase/firestore";
import type { User } from "@shared/schema";
import { createAuditLog } from "@/lib/audit-log";
import { sendWebhookRequest } from "@/lib/webhook-client";
import { Ban, UserX, Trash2, Gift, AlertTriangle } from "lucide-react";
import { AdminGiveItemsDialog } from "@/components/AdminGiveItemsDialog";

const sendWebhook = async (action: string, targetUsername: string, details: string[], color?: number) => {
  console.log(`[AdminPanel] Sending webhook: ${action} for ${targetUsername}`);
  await sendWebhookRequest('/api/webhooks/admin-log', {
    action,
    targetUsername,
    details,
    color,
  });
};

const BAN_PRESETS = [
  { name: "Alt Farming", reason: "Alt Farming", days: 7, isPermanent: false, wipeInventory: true },
  { name: "Toxicity", reason: "Toxicity", days: 3, isPermanent: false, wipeInventory: false },
  { name: "Scamming", reason: "Scamming", days: 0, isPermanent: true, wipeInventory: true },
  { name: "Glitch Abuse", reason: "Glitch Abuse", days: 30, isPermanent: false, wipeInventory: false },
  { name: "Inappropriate Content", reason: "Inappropriate Content", days: 0, isPermanent: true, wipeInventory: false },
];

const WARN_PRESETS = ["Trolling", "Harassment", "Spam", "Inappropriate Language", "Minor Rule Violation"];

interface AdminPanelDialogProps {
  player: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete?: () => void;
}

export function AdminPanelDialog({ player, open, onOpenChange, onActionComplete }: AdminPanelDialogProps) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [actionType, setActionType] = useState<"warn" | "ban" | "unban" | "wipe" | "give" | null>(null);
  const [processing, setProcessing] = useState(false);

  const [warnReason, setWarnReason] = useState("");
  const [warnMessage, setWarnMessage] = useState("");
  
  const [banReason, setBanReason] = useState("");
  const [isPermanentBan, setIsPermanentBan] = useState(false);
  const [banDays, setBanDays] = useState(7);
  const [wipeInventoryOnBan, setWipeInventoryOnBan] = useState(false);
  const [banNotes, setBanNotes] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");

  const [giveItemsOpen, setGiveItemsOpen] = useState(false);

  const handleClose = () => {
    setActionType(null);
    setWarnReason("");
    setWarnMessage("");
    setBanReason("");
    setIsPermanentBan(false);
    setBanDays(7);
    setWipeInventoryOnBan(false);
    setBanNotes("");
    setSelectedPreset("custom");
    onOpenChange(false);
  };

  const handleWarn = async () => {
    if (!player) return;

    setProcessing(true);
    try {
      toast({
        title: "Warning sent",
        description: `${player.username} has been warned for: ${warnReason}`,
      });

      if (currentUser) {
        await createAuditLog({
          timestamp: Date.now(),
          adminId: currentUser.id,
          adminUsername: currentUser.username,
          actionType: "user_warn",
          targetUserId: player.id,
          targetUsername: player.username,
          details: {
            action: "User warned",
            reason: warnReason || "No reason provided",
            message: warnMessage || "",
          },
        });
      }

      const webhookDetails = [
        `**User:** ${player.username}`,
        `**Reason:** ${warnReason || "No reason provided"}`,
        `**Type:** Warning (No Ban)`,
      ];
      if (warnMessage) {
        webhookDetails.push(`**Message:** ${warnMessage}`);
      }
      await sendWebhook("User Warned", player.username, webhookDetails, 0xFEE75C);

      handleClose();
      onActionComplete?.();
    } catch (error: any) {
      console.error("Error warning user:", error);
      toast({
        title: "Warning failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleBan = async () => {
    if (!player) return;

    setProcessing(true);
    try {
      const usersRef = collection(db, "users");
      const userQuery = query(usersRef, where("userId", "==", player.userId));
      const userSnapshot = await getDocs(userQuery);

      if (userSnapshot.empty) {
        throw new Error("User not found");
      }

      const userDocId = userSnapshot.docs[0].id;
      const userRef = doc(db, "users", userDocId);

      let banExpiresAt = null;
      if (!isPermanentBan) {
        banExpiresAt = Date.now() + banDays * 24 * 60 * 60 * 1000;
      }

      const updateData: any = {
        isBanned: true,
        banReason: banReason || "No reason provided",
        banNotes: banNotes || "",
        banExpires: banExpiresAt,
      };

      if (banExpiresAt) {
        updateData.banExpiresAt = banExpiresAt;
      }

      const shouldWipeInventory = wipeInventoryOnBan;

      if (currentUser) {
        await createAuditLog({
          timestamp: Date.now(),
          adminId: currentUser.id,
          adminUsername: currentUser.username,
          actionType: "user_ban",
          targetUserId: player.id,
          targetUsername: player.username,
          details: {
            isPermanent: isPermanentBan,
            duration: banDays,
            wipeInventory: shouldWipeInventory,
            banReason: banReason || "No reason provided",
            banNotes: banNotes || "",
          },
        });
      }

      if (shouldWipeInventory) {
        await runTransaction(db, async (transaction) => {
          const userDoc = await transaction.get(userRef);

          if (!userDoc.exists()) {
            throw new Error("User not found in transaction");
          }

          const userData = userDoc.data();
          const userInventory = userData.inventory || [];

          const adminQuery = query(collection(db, "users"), where("userId", "==", 1));
          const adminSnapshot = await getDocs(adminQuery);

          if (adminSnapshot.empty) {
            throw new Error("Admin user not found");
          }

          const adminDocId = adminSnapshot.docs[0].id;
          const adminRef = doc(db, "users", adminDocId);
          const adminDoc = await transaction.get(adminRef);

          if (!adminDoc.exists()) {
            throw new Error("Admin document not found");
          }

          const adminData = adminDoc.data();
          const adminInventory = adminData.inventory || [];

          transaction.update(userRef, {
            ...updateData,
            inventory: [],
            cashBalance: 0,
          });

          transaction.update(adminRef, {
            inventory: [...adminInventory, ...userInventory],
          });
        });

        toast({
          title: isPermanentBan ? "User permanently banned" : "User banned",
          description: `${player.username} has been banned and their inventory wiped`,
        });
      } else {
        await updateDoc(userRef, updateData);

        toast({
          title: "User banned",
          description: isPermanentBan 
            ? `${player.username} has been permanently banned`
            : `${player.username} has been banned for ${banDays} days`,
        });
      }

      const webhookDetails = [
        `**User:** ${player.username}`,
        `**Reason:** ${banReason || "No reason provided"}`,
        `**Type:** ${isPermanentBan ? "Permanent Ban" : `${banDays} Day Ban`}`,
        `**Inventory Wiped:** ${shouldWipeInventory ? "Yes" : "No"}`,
      ];
      if (banNotes) {
        webhookDetails.push(`**Notes:** ${banNotes}`);
      }
      await sendWebhook("User Banned", player.username, webhookDetails, 0xED4245);

      handleClose();
      onActionComplete?.();
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
    if (!player) return;

    setProcessing(true);
    try {
      const usersRef = collection(db, "users");
      const userQuery = query(usersRef, where("userId", "==", player.userId));
      const userSnapshot = await getDocs(userQuery);

      if (userSnapshot.empty) {
        throw new Error("User not found");
      }

      const userDocId = userSnapshot.docs[0].id;
      const userRef = doc(db, "users", userDocId);

      await updateDoc(userRef, {
        isBanned: false,
        banReason: "",
        banNotes: "",
        banExpires: null,
        banExpiresAt: null,
      });

      if (currentUser) {
        await createAuditLog({
          timestamp: Date.now(),
          adminId: currentUser.id,
          adminUsername: currentUser.username,
          actionType: "user_unban",
          targetUserId: player.id,
          targetUsername: player.username,
          details: {},
        });
      }

      await sendWebhook("User Unbanned", player.username, [`**User:** ${player.username}`], 0x57F287);

      toast({
        title: "User unbanned",
        description: `${player.username} can now access the game`,
      });

      handleClose();
      onActionComplete?.();
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
    if (!player) return;

    setProcessing(true);
    try {
      const usersRef = collection(db, "users");
      const userQuery = query(usersRef, where("userId", "==", player.userId));
      const userSnapshot = await getDocs(userQuery);

      if (userSnapshot.empty) {
        throw new Error("User not found");
      }

      const userDocId = userSnapshot.docs[0].id;
      const userRef = doc(db, "users", userDocId);

      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists()) {
          throw new Error("User not found in transaction");
        }

        const userData = userDoc.data();
        const userInventory = userData.inventory || [];

        const adminQuery = query(collection(db, "users"), where("userId", "==", 1));
        const adminSnapshot = await getDocs(adminQuery);

        if (adminSnapshot.empty) {
          throw new Error("Admin user not found");
        }

        const adminDocId = adminSnapshot.docs[0].id;
        const adminRef = doc(db, "users", adminDocId);
        const adminDoc = await transaction.get(adminRef);

        if (!adminDoc.exists()) {
          throw new Error("Admin document not found");
        }

        const adminData = adminDoc.data();
        const adminInventory = adminData.inventory || [];

        transaction.update(userRef, {
          inventory: [],
          cashBalance: 0,
        });

        transaction.update(adminRef, {
          inventory: [...adminInventory, ...userInventory],
        });
      });

      if (currentUser) {
        await createAuditLog({
          timestamp: Date.now(),
          adminId: currentUser.id,
          adminUsername: currentUser.username,
          actionType: "user_wipe_inventory",
          targetUserId: player.id,
          targetUsername: player.username,
          details: {},
        });
      }

      await sendWebhook("Inventory Wiped", player.username, [`**User:** ${player.username}`], 0xFEE75C);

      toast({
        title: "Inventory wiped",
        description: `${player.username}'s inventory has been transferred to Admin`,
      });

      handleClose();
      onActionComplete?.();
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

  if (!player) return null;

  return (
    <>
      <AlertDialog open={open && !actionType && !giveItemsOpen} onOpenChange={handleClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Admin Actions: {player.username}</AlertDialogTitle>
            <AlertDialogDescription>
              Select an action to perform on this user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-4">
            <Button
              variant="outline"
              onClick={() => setActionType("warn")}
              data-testid="button-panel-warn"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Warn User
            </Button>
            {player.isBanned ? (
              <Button
                variant="outline"
                onClick={() => setActionType("unban")}
                data-testid="button-panel-unban"
              >
                <UserX className="w-4 h-4 mr-2" />
                Unban User
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => setActionType("ban")}
                data-testid="button-panel-ban"
              >
                <Ban className="w-4 h-4 mr-2" />
                Ban User
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setActionType("wipe")}
              data-testid="button-panel-wipe"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Wipe Inventory
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setGiveItemsOpen(true);
              }}
              data-testid="button-panel-give"
            >
              <Gift className="w-4 h-4 mr-2" />
              Give Item
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!actionType} onOpenChange={() => setActionType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "warn" && `Warn ${player.username}?`}
              {actionType === "ban" && `Ban ${player.username}?`}
              {actionType === "unban" && `Unban ${player.username}?`}
              {actionType === "wipe" && `Wipe ${player.username}'s Inventory?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "warn" && (
                <div className="space-y-4">
                  <p>Send a warning to this user. This does NOT ban them.</p>
                  
                  <div className="space-y-2">
                    <Label htmlFor="warn-preset">Quick Select</Label>
                    <Select value={warnReason} onValueChange={setWarnReason}>
                      <SelectTrigger data-testid="select-warn-preset">
                        <SelectValue placeholder="Choose a warning..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom Warning</SelectItem>
                        {WARN_PRESETS.map((preset) => (
                          <SelectItem key={preset} value={preset}>
                            {preset}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="warn-message">Custom Message (Optional)</Label>
                    <InputComponent
                      id="warn-message"
                      placeholder="Additional message for the user..."
                      value={warnMessage}
                      onChange={(e) => setWarnMessage(e.target.value)}
                      data-testid="input-warn-message"
                    />
                  </div>
                </div>
              )}
              {actionType === "ban" && (
                <div className="space-y-4">
                  <p>This will prevent the user from accessing the game.</p>

                  <div className="space-y-2">
                    <Label>Ban Preset</Label>
                    <Select
                      value={selectedPreset}
                      onValueChange={(value) => {
                        setSelectedPreset(value);
                        if (value === "custom") {
                          setBanReason("");
                          setIsPermanentBan(false);
                          setBanDays(7);
                          setWipeInventoryOnBan(false);
                          setBanNotes("");
                        } else {
                          const preset = BAN_PRESETS.find((p) => p.name === value);
                          if (preset) {
                            setBanReason(preset.reason);
                            setIsPermanentBan(preset.isPermanent);
                            setBanDays(preset.days);
                            setWipeInventoryOnBan(preset.wipeInventory);
                            setBanNotes("");
                          }
                        }
                      }}
                      data-testid="select-ban-preset"
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a preset or custom" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom Ban</SelectItem>
                        {BAN_PRESETS.map((preset) => (
                          <SelectItem key={preset.name} value={preset.name}>
                            {preset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Ban Type</Label>
                    <RadioGroup
                      value={isPermanentBan ? "permanent" : "temporary"}
                      onValueChange={(value) => {
                        setIsPermanentBan(value === "permanent");
                        if (selectedPreset !== "custom") setSelectedPreset("custom");
                      }}
                      data-testid="radio-ban-type"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="temporary" id="temporary" />
                        <Label htmlFor="temporary" className="font-normal cursor-pointer">
                          Temporary Ban
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="permanent" id="permanent" />
                        <Label htmlFor="permanent" className="font-normal cursor-pointer">
                          Permanent Ban
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {!isPermanentBan && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="ban-days">Ban Duration (Days)</Label>
                        <InputComponent
                          id="ban-days"
                          type="number"
                          min="1"
                          value={banDays}
                          onChange={(e) => {
                            setBanDays(parseInt(e.target.value) || 1);
                            if (selectedPreset !== "custom") setSelectedPreset("custom");
                          }}
                          data-testid="input-ban-days"
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="wipe-inventory-temp"
                          checked={wipeInventoryOnBan}
                          onCheckedChange={(checked) => {
                            setWipeInventoryOnBan(!!checked);
                            if (selectedPreset !== "custom") setSelectedPreset("custom");
                          }}
                          data-testid="checkbox-wipe-inventory"
                        />
                        <Label htmlFor="wipe-inventory-temp" className="font-normal cursor-pointer">
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

                  <div className="space-y-2">
                    <Label htmlFor="ban-notes">Moderator Notes (visible to user)</Label>
                    <InputComponent
                      id="ban-notes"
                      placeholder="Optional notes that the user can see..."
                      value={banNotes}
                      onChange={(e) => {
                        setBanNotes(e.target.value);
                        if (selectedPreset !== "custom") setSelectedPreset("custom");
                      }}
                      data-testid="input-ban-notes"
                    />
                  </div>

                  {isPermanentBan && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="wipe-inventory-perm"
                        checked={wipeInventoryOnBan}
                        onCheckedChange={(checked) => {
                          setWipeInventoryOnBan(!!checked);
                          if (selectedPreset !== "custom") setSelectedPreset("custom");
                        }}
                        data-testid="checkbox-wipe-inventory-perm"
                      />
                      <Label htmlFor="wipe-inventory-perm" className="font-normal cursor-pointer">
                        Wipe inventory (transfer all items to Admin)
                      </Label>
                    </div>
                  )}

                  {(wipeInventoryOnBan) && (
                    <p className="text-sm text-destructive font-semibold">
                      ⚠️ This ban will transfer all of this user's items to the Admin account.
                    </p>
                  )}
                </div>
              )}
              {actionType === "unban" && "This will allow the user to access the game again."}
              {actionType === "wipe" && (
                <div className="space-y-2">
                  <p>This will transfer all of this user's items to the Admin account and set their cash balance to $0.</p>
                  <p className="text-destructive font-semibold">This action cannot be undone!</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (actionType === "warn") handleWarn();
                if (actionType === "ban") handleBan();
                if (actionType === "unban") handleUnban();
                if (actionType === "wipe") handleWipeInventory();
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
        targetUser={player}
        open={giveItemsOpen}
        onOpenChange={setGiveItemsOpen}
        onSuccess={onActionComplete}
      />
    </>
  );
}
