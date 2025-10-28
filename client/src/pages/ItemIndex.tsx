import { useState, useEffect } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemCard } from "@/components/ItemCard";
import { ItemDetailModal } from "@/components/ItemDetailModal";
import type { Item } from "@shared/schema";
import { Search, Database } from "lucide-react";
import { RARITY_TIERS } from "@shared/schema";
import { useAuth } from "@/contexts/AuthContext";

interface ItemIndexProps {
  onEditItem?: (item: Item) => void;
}

export default function ItemIndex({ onEditItem }: ItemIndexProps = {}) {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    filterItems();
  }, [items, searchTerm, rarityFilter, statusFilter]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const itemsRef = collection(db, "items");
      const q = query(itemsRef, orderBy("value", "desc"));
      const snapshot = await getDocs(q);

      const loadedItems: Item[] = [];
      snapshot.forEach((doc) => {
        loadedItems.push({ id: doc.id, ...doc.data() } as Item);
      });

      setItems(loadedItems);
    } catch (error) {
      console.error("Error loading items:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterItems = () => {
    let filtered = [...items];

    if (searchTerm) {
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (rarityFilter !== "all") {
      filtered = filtered.filter((item) => item.rarity === rarityFilter);
    }

    if (statusFilter === "on-sale") {
      filtered = filtered.filter((item) => !item.offSale);
    } else if (statusFilter === "off-sale") {
      filtered = filtered.filter((item) => item.offSale);
    }

    setFilteredItems(filtered);
  };

  const handleEdit = () => {
    if (selectedItem && onEditItem) {
      onEditItem(selectedItem);
      setSelectedItem(null);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Item Index</h1>
        <p className="text-muted-foreground">
          {items.length} item{items.length !== 1 ? "s" : ""} in database
        </p>
      </div>

      <div className="sticky top-0 z-10 bg-background pb-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-index"
            />
          </div>
          <Select value={rarityFilter} onValueChange={setRarityFilter}>
            <SelectTrigger className="w-full sm:w-48" data-testid="select-rarity-filter-index">
              <SelectValue placeholder="Filter by rarity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rarities</SelectItem>
              {Object.keys(RARITY_TIERS).map((rarity) => (
                <SelectItem key={rarity} value={rarity}>
                  {RARITY_TIERS[rarity as keyof typeof RARITY_TIERS].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              <SelectItem value="on-sale">On Sale</SelectItem>
              <SelectItem value="off-sale">Off Sale</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Database className="w-16 h-16 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading items...</p>
        </div>
      ) : filteredItems.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onClick={() => setSelectedItem(item)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Database className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {searchTerm || rarityFilter !== "all" || statusFilter !== "all"
              ? "No items match your filters"
              : "No items in database yet"}
          </p>
        </div>
      )}

      <ItemDetailModal
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        onEdit={user?.isAdmin ? handleEdit : undefined}
      />
    </div>
  );
}
