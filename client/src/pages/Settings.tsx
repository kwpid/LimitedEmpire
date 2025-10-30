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
import { Settings as SettingsIcon, DollarSign, Save, User } from "lucide-react";
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

  return (
    <div className="container mx-auto p-3 md:p-6 max-w-5xl">
      <div className="mb-4 md:mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 md:w-8 md:h-8" />
          Settings
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">Customize your gameplay experience</p>
      </div>

      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="profile" data-testid="tab-profile-settings" className="text-xs md:text-sm">
              <User className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Profile</span>
              <span className="sm:hidden">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="sell" data-testid="tab-sell-settings" className="text-xs md:text-sm">
              <DollarSign className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Sell Settings</span>
              <span className="sm:hidden">Sell</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-0">
              <Card>
                <CardHeader className="px-4 md:px-6 py-4 md:py-6">
                  <CardTitle className="text-base md:text-lg">Profile Settings</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    Customize your public profile that other players can view
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-4 md:px-6 pb-4 md:pb-6">
                  <div className="space-y-2">
                    <Label htmlFor="custom-status" className="text-sm md:text-base">Custom Status</Label>
                    <Input
                      id="custom-status"
                      placeholder="What's on your mind?"
                      value={customStatus}
                      onChange={(e) => setCustomStatus(e.target.value.slice(0, 120))}
                      maxLength={120}
                      className="text-sm md:text-base"
                      data-testid="input-custom-status"
                    />
                    <p className="text-xs text-muted-foreground">
                      {customStatus.length}/120 characters
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm md:text-base">Profile Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Tell others about yourself..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
                      maxLength={1000}
                      rows={6}
                      className="resize-none text-sm md:text-base"
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
                      className="flex-1 text-sm md:text-base"
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
                <CardHeader className="px-4 md:px-6 py-4 md:py-6">
                  <CardTitle className="text-base md:text-lg">Auto-Sell Settings</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    Automatically sell items when you roll them based on their rarity.
                    You'll receive 80% of the item value.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-4 md:px-6 pb-4 md:pb-6">
                  <div className="space-y-3">
                    {Object.entries(RARITY_TIERS).map(([key, tier]) => {
                      const rarity = key as RarityTier;
                      const isChecked = autoSellRarities.includes(rarity);
                      const rarityColor = getRarityColor(rarity);

                      return (
                        <div
                          key={rarity}
                          className="flex items-center space-x-2 md:space-x-3 p-2 md:p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            id={`auto-sell-${rarity}`}
                            checked={isChecked}
                            onCheckedChange={() => toggleRarity(rarity)}
                            data-testid={`checkbox-auto-sell-${rarity}`}
                          />
                          <Label
                            htmlFor={`auto-sell-${rarity}`}
                            className="flex-1 cursor-pointer flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3"
                          >
                            <Badge
                              variant="outline"
                              className="text-xs md:text-sm w-fit"
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
                            <span className="text-xs md:text-sm text-muted-foreground">
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
                      className="flex-1 text-sm md:text-base"
                      data-testid="button-save-settings"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? "Saving..." : "Save Settings"}
                    </Button>
                  </div>

                  {autoSellRarities.length > 0 && (
                    <Card className="bg-muted/50">
                      <CardContent className="p-3 md:p-4">
                        <p className="text-xs md:text-sm text-muted-foreground">
                          <strong>Note:</strong> When you roll an item with any of the selected rarities, 
                          it will be automatically sold for 80% of its value. The remaining 20% goes to the admin account.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
