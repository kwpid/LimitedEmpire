import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemCreateForm } from "@/components/ItemCreateForm";
import { ItemEditForm } from "@/components/ItemEditForm";
import type { Item } from "@shared/schema";

interface AdminPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem?: Item | null;
  onItemSaved?: () => void;
}

export function AdminPanel({ open, onOpenChange, editingItem, onItemSaved }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState(editingItem ? "edit" : "create");

  useEffect(() => {
    if (open && editingItem) {
      setActiveTab("edit");
    }
  }, [open, editingItem]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="modal-admin-panel">
        <DialogHeader>
          <DialogTitle className="text-2xl">Admin Panel</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create" data-testid="tab-create-item">
              Create Item
            </TabsTrigger>
            <TabsTrigger value="edit" data-testid="tab-edit-item">
              Edit Item
            </TabsTrigger>
          </TabsList>
          <TabsContent value="create" className="space-y-4 mt-6">
            <ItemCreateForm onSuccess={onItemSaved} />
          </TabsContent>
          <TabsContent value="edit" className="space-y-4 mt-6">
            {editingItem ? (
              <ItemEditForm item={editingItem} onSuccess={onItemSaved} />
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Select an item from the Item Index to edit
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
