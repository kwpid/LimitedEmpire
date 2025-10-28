import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import UsernameSetup from "./pages/UsernameSetup";
import RollScreen from "./pages/RollScreen";
import Inventory from "./pages/Inventory";
import ItemIndex from "./pages/ItemIndex";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/AdminPanel";
import { GlobalRollToast } from "@/components/GlobalRollToast";
import { Dices, Package, Database, Shield, LogOut, Sparkles } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "./lib/firebase";
import type { Item } from "@shared/schema";

function AppContent() {
  const { firebaseUser, user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const openAdminPanel = (item?: Item) => {
    if (item) {
      setEditingItem(item);
    }
    setAdminPanelOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10">
        <div className="text-center">
          <Sparkles className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-lg text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Login />;
  }

  if (!user) {
    return <UsernameSetup />;
  }

  const currentTab = location === "/" ? "roll" : location.slice(1);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Limited Empire</h1>
              <p className="text-xs text-muted-foreground" data-testid="text-username">
                {user.username} {user.isAdmin && "• Admin"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-primary/10 rounded-md border border-primary/20">
              <span className="text-sm font-bold text-primary tabular-nums">
                ${(user.cash ?? 1000).toLocaleString()}
              </span>
            </div>
            {user.isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openAdminPanel()}
                data-testid="button-open-admin"
              >
                <Shield className="w-4 h-4 mr-2" />
                Admin
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4">
        <Tabs value={currentTab} onValueChange={(value) => setLocation(value === "roll" ? "/" : `/${value}`)}>
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-6">
            <TabsTrigger value="roll" data-testid="tab-roll">
              <Dices className="w-4 h-4 mr-2" />
              Roll
            </TabsTrigger>
            <TabsTrigger value="inventory" data-testid="tab-inventory">
              <Package className="w-4 h-4 mr-2" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="index" data-testid="tab-index">
              <Database className="w-4 h-4 mr-2" />
              Index
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Switch>
          <Route path="/" component={RollScreen} />
          <Route path="/inventory" component={Inventory} />
          <Route path="/index">
            {() => <ItemIndex onEditItem={openAdminPanel} />}
          </Route>
        </Switch>
      </div>

      <GlobalRollToast />

      {user.isAdmin && (
        <AdminPanel
          open={adminPanelOpen}
          onOpenChange={(open) => {
            setAdminPanelOpen(open);
            if (!open) setEditingItem(null);
          }}
          editingItem={editingItem}
          onItemSaved={() => {
            setAdminPanelOpen(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
