import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RARITY_TIERS, type RarityTier } from "@shared/schema";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, DollarSign, ArrowRightLeft, Save } from "lucide-react";
import { getRarityColor } from "@/lib/rarity";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [autoSellRarities, setAutoSellRarities] = useState<RarityTier[]>(
    user?.settings?.autoSellRarities || []
  );
  const [saving, setSaving] = useState(false);

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
          <Tabs defaultValue="sell" orientation="vertical" className="h-full">
            <TabsList className="flex flex-col h-auto w-full bg-transparent space-y-1">
              <TabsTrigger 
                value="sell" 
                className="w-full justify-start data-[state=active]:bg-primary/10"
                data-testid="tab-sell-settings"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Sell Settings
              </TabsTrigger>
              <TabsTrigger 
                value="trade" 
                className="w-full justify-start data-[state=active]:bg-primary/10"
                data-testid="tab-trade-settings"
                disabled
              >
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Trade Settings
                <Badge variant="secondary" className="ml-auto text-xs">Coming Soon</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1">
          <Tabs defaultValue="sell">
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

            <TabsContent value="trade">
              <Card>
                <CardHeader>
                  <CardTitle>Trade Settings</CardTitle>
                  <CardDescription>
                    Trading features are coming soon!
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Stay tuned for updates on trading functionality.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
