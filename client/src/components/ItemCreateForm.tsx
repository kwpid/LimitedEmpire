import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertItemSchema, getRarityFromValue, calculateRollChance, RARITY_TIERS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { getRarityClass, getRarityGlow, formatValue } from "@/lib/rarity";
import { z } from "zod";

export function ItemCreateForm({ onSuccess }: { onSuccess?: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState("");

  const form = useForm<z.infer<typeof insertItemSchema>>({
    resolver: zodResolver(insertItemSchema),
    defaultValues: {
      name: "",
      description: "",
      imageUrl: "",
      value: 100,
      offSale: false,
      stockType: "infinite",
      totalStock: null,
      createdBy: user?.id || "",
    },
  });

  const watchedValue = form.watch("value");
  const watchedImageUrl = form.watch("imageUrl");
  const watchedStockType = form.watch("stockType");

  useEffect(() => {
    setImagePreview(watchedImageUrl);
  }, [watchedImageUrl]);

  const rarity = getRarityFromValue(watchedValue || 100);
  const rollChance = calculateRollChance(watchedValue || 100);
  const rarityClass = getRarityClass(rarity);
  const rarityGlow = getRarityGlow(rarity);

  const onSubmit = async (values: z.infer<typeof insertItemSchema>) => {
    if (!user) return;

    setLoading(true);
    try {
      const rarity = getRarityFromValue(values.value);
      
      await addDoc(collection(db, "items"), {
        ...values,
        rarity,
        remainingStock: values.stockType === "limited" ? values.totalStock : null,
        createdAt: Date.now(),
        createdBy: user.id,
      });

      toast({
        title: "Item created!",
        description: `${values.name} has been added to the database.`,
      });

      form.reset();
      setImagePreview("");
      onSuccess?.();
    } catch (error: any) {
      console.error("Error creating item:", error);
      toast({
        title: "Creation failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-[300px,1fr] gap-6">
      <div className="space-y-4">
        <div className={`aspect-square border-2 rounded-lg overflow-hidden ${rarityClass} ${rarityGlow} bg-muted flex items-center justify-center`}>
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-size='48'%3EError%3C/text%3E%3C/svg%3E";
              }}
            />
          ) : (
            <p className="text-muted-foreground">Image Preview</p>
          )}
        </div>
        <div className="space-y-2 p-4 bg-muted rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Rarity</p>
            <Badge variant="outline" data-testid="preview-rarity">
              {RARITY_TIERS[rarity].name}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Value</p>
            <p className="font-bold" data-testid="preview-value">{formatValue(watchedValue || 100)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Roll Chance</p>
            <p className="text-sm tabular-nums" data-testid="preview-chance">
              {rollChance < 0.01 ? rollChance.toExponential(2) : rollChance.toFixed(4)}%
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Item Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Epic Sword" data-testid="input-item-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Image URL</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="https://..." data-testid="input-item-image" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={4} placeholder="A legendary weapon..." data-testid="textarea-item-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Value</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    data-testid="input-item-value"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stockType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stock Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-stock-type">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="infinite">Infinite</SelectItem>
                    <SelectItem value="limited">Limited</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {watchedStockType === "limited" && (
            <FormField
              control={form.control}
              name="totalStock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Stock</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                      data-testid="input-total-stock"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="offSale"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <Label htmlFor="offSale" className="cursor-pointer">Off-Sale (Cannot be rolled)</Label>
                <FormControl>
                  <Switch
                    id="offSale"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid="switch-off-sale"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={loading} data-testid="button-create-item">
            {loading ? "Creating..." : "Create Item"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
