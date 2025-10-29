import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RARITY_TIERS, type RarityTier } from "@shared/schema";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, DollarSign, ArrowRightLeft, Save, User } from "lucide-react";
import { getRarityColor } from "@/lib/rarity";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("profile");
  const [autoSellRarities, setAutoSellRarities] = useState<RarityTier[]>(
    user?.settings?.autoSellRarities || []
  );
  const [customStatus, setCustomStatus] = useState(user?.customStatus || "");
  const [description, setDescription] = useState(user?.description || "");
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTradeSettings, setSavingTradeSettings] = useState(false);
  const [autoDeclineHugeLoss, setAutoDeclineHugeLoss] = useState(
    user?.settings?.tradeSettings?.autoDeclineHugeLoss || false
  );
  const [tradeRequirement, setTradeRequirement] = useState<"none" | "low" | "mid" | "high">(
    user?.settings?.tradeSettings?.tradeRequirement || "none"
  );

  const toggleRarity = (rarity: RarityTier) => {
    setAutoSellRarities((prev) => {
      if (prev.includes(rarity)) {
        return prev.filter((r) => r !== rarity);
      } else {
        return [...prev, rarity];
      }
    });
  };

  const saveSettings = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const userRef = doc(db, "users", user.id);
      await updateDoc(userRef, {
        "settings.autoSellRarities": autoSellRarities,
      });

      await refetchUser();

      toast({
        title: "Settings saved",
        description: "Your preferences have been updated",
      });
    } catch (error: any) {
      console.error("Save settings error:", error);
      toast({
        title: "Save failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify(autoSellRarities) !== JSON.stringify(user?.settings?.autoSellRarities || []);
  const hasProfileChanges = 
    customStatus !== (user?.customStatus || "") || 
    description !== (user?.description || "");
  const hasTradeSettingsChanges = 
    autoDeclineHugeLoss !== (user?.settings?.tradeSettings?.autoDeclineHugeLoss || false) ||
    tradeRequirement !== (user?.settings?.tradeSettings?.tradeRequirement || "none");

  const saveProfile = async () => {
    if (!user) return;

    setSavingProfile(true);
    try {
      const userRef = doc(db, "users", user.id);
      await updateDoc(userRef, {
        customStatus,
        description,
      });

      await refetchUser();

      toast({
        title: "Profile saved",
        description: "Your profile has been updated",
      });
    } catch (error: any) {
      console.error("Save profile error:", error);
      toast({
        title: "Save failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveTradeSettings = async () => {
    if (!user) return;

    setSavingTradeSettings(true);
    try {
      const userRef = doc(db, "users", user.id);
      await updateDoc(userRef, {
        "settings.tradeSettings": {
          autoDeclineHugeLoss,
          tradeRequirement,
        },
      });

      await refetchUser();

      toast({
        title: "Trade settings saved",
        description: "Your trade preferences have been updated",
      });
    } catch (error: any) {
      console.error("Save trade settings error:", error);
      toast({
        title: "Save failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSavingTradeSettings(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <SettingsIcon className="w-8 h-8" />
          Settings
        </h1>
        <p className="text-muted-foreground">Customize your gameplay experience</p>
      </div>

      <div className="flex gap-6">
        <div className="w-64 space-y-2">
          <div className="flex flex-col h-auto w-full bg-transparent space-y-1">
            <Button 
              variant={activeTab === "profile" ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab("profile")}
              data-testid="tab-profile-settings"
            >
              <User className="w-4 h-4 mr-2" />
              Profile
            </Button>
            <Button 
              variant={activeTab === "sell" ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab("sell")}
              data-testid="tab-sell-settings"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Sell Settings
            </Button>
            <Button 
              variant={activeTab === "trade" ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab("trade")}
              data-testid="tab-trade-settings"
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Trade Settings
            </Button>
          </div>
        </div>

        <div className="flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="profile" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Profile Settings</CardTitle>
                  <CardDescription>
                    Customize your public profile that other players can view
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="custom-status">Custom Status</Label>
                    <Input
                      id="custom-status"
                      placeholder="What's on your mind?"
                      value={customStatus}
                      onChange={(e) => setCustomStatus(e.target.value.slice(0, 120))}
                      maxLength={120}
                      data-testid="input-custom-status"
                    />
                    <p className="text-xs text-muted-foreground">
                      {customStatus.length}/120 characters
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Profile Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Tell others about yourself..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
                      maxLength={1000}
                      rows={6}
                      className="resize-none"
                      data-testid="textarea-description"
                    />
                    <p className="text-xs text-muted-foreground">
                      {description.length}/1000 characters
                    </p>
                  </div>

                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={saveProfile}
                      disabled={!hasProfileChanges || savingProfile}
                      className="flex-1"
                      data-testid="button-save-profile"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {savingProfile ? "Saving..." : "Save Profile"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sell" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Auto-Sell Settings</CardTitle>
                  <CardDescription>
                    Automatically sell items when you roll them based on their rarity.
                    You'll receive 80% of the item value.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {Object.entries(RARITY_TIERS).map(([key, tier]) => {
                      const rarity = key as RarityTier;
                      const isChecked = autoSellRarities.includes(rarity);
                      const rarityColor = getRarityColor(rarity);

                      return (
                        <div
                          key={rarity}
                          className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            id={`auto-sell-${rarity}`}
                            checked={isChecked}
                            onCheckedChange={() => toggleRarity(rarity)}
                            data-testid={`checkbox-auto-sell-${rarity}`}
                          />
                          <Label
                            htmlFor={`auto-sell-${rarity}`}
                            className="flex-1 cursor-pointer flex items-center gap-3"
                          >
                            <Badge
                              variant="outline"
                              style={{
                                backgroundColor: rarity !== "INSANE" ? `${rarityColor}20` : undefined,
                                borderColor: rarityColor,
                                color: rarity !== "INSANE" ? rarityColor : "white",
                                background: rarity === "INSANE" 
                                  ? "linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff)" 
                                  : undefined,
                              }}
                            >
                              {tier.name}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {tier.min.toLocaleString()} - {tier.max === Infinity ? "∞" : tier.max.toLocaleString()}
                            </span>
                          </Label>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={saveSettings}
                      disabled={!hasChanges || saving}
                      className="flex-1"
                      data-testid="button-save-settings"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? "Saving..." : "Save Settings"}
                    </Button>
                  </div>

                  {autoSellRarities.length > 0 && (
                    <Card className="bg-muted/50">
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">
                          <strong>Note:</strong> When you roll an item with any of the selected rarities, 
                          it will be automatically sold for 80% of its value. The remaining 20% goes to the admin account.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trade" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Trade Settings</CardTitle>
                  <CardDescription>
                    Configure how you want to handle incoming trade offers
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3 p-4 rounded-lg border">
                      <Checkbox
                        id="auto-decline-huge-loss"
                        checked={autoDeclineHugeLoss}
                        onCheckedChange={(checked) => setAutoDeclineHugeLoss(checked as boolean)}
                        data-testid="checkbox-auto-decline"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor="auto-decline-huge-loss"
                          className="cursor-pointer font-medium"
                        >
                          Automatically decline huge losses
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          When enabled, trades where you're offering significantly more value than you're receiving will be automatically declined.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Trade Requirements</Label>
                      <p className="text-sm text-muted-foreground">
                        Set the minimum requirements for players who want to trade with you
                      </p>
                      <div className="space-y-2">
                        {[
                          { value: "none", label: "None", description: "Anyone can send you trade offers" },
                          { value: "low", label: "Low", description: "Requires 10+ rolls and 1,000+ cash" },
                          { value: "mid", label: "Mid", description: "Requires 100+ rolls and 10,000+ cash" },
                          { value: "high", label: "High", description: "Requires 1,000+ rolls and 100,000+ cash" },
                        ].map((req) => (
                          <div
                            key={req.value}
                            className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              tradeRequirement === req.value ? "bg-muted/50 border-primary" : "hover:bg-muted/30"
                            }`}
                            onClick={() => setTradeRequirement(req.value as typeof tradeRequirement)}
                          >
                            <div className="flex items-center h-5">
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                  tradeRequirement === req.value
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground"
                                }`}
                              >
                                {tradeRequirement === req.value && (
                                  <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                                )}
                              </div>
                            </div>
                            <div className="flex-1">
                              <Label className="cursor-pointer font-medium">{req.label}</Label>
                              <p className="text-xs text-muted-foreground mt-1">{req.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={saveTradeSettings}
                      disabled={!hasTradeSettingsChanges || savingTradeSettings}
                      className="flex-1"
                      data-testid="button-save-trade-settings"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {savingTradeSettings ? "Saving..." : "Save Trade Settings"}
                    </Button>
                  </div>

                  <Card className="bg-muted/50">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">
                        <strong>Note:</strong> These settings help protect you from unfair trades and spam. 
                        You can always manually accept or decline any trade offer you receive.
                      </p>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
