import { useEffect, useState, memo } from "react";
import { Route, Switch, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import UsernameSetup from "./pages/UsernameSetup";
import RollScreen from "./pages/RollScreen";
import Inventory from "./pages/Inventory";
import ItemIndex from "./pages/ItemIndex";
import Settings from "./pages/Settings";
import Players from "./pages/Players";
import Leaderboard from "./pages/Leaderboard";
import Trading from "./pages/Trading";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/AdminPanel";
import { BanOverlay } from "@/components/BanOverlay";
import { PendingSaveIndicator } from "@/components/PendingSaveIndicator";
import { Dices, Package, Database, Shield, LogOut, Sparkles, Settings as SettingsIcon, Users, Trophy, ArrowLeftRight } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "./lib/firebase";
import type { Item } from "@shared/schema";

const MemoizedRollScreen = memo(RollScreen);

function AppContent() {
  const { firebaseUser, user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  useEffect(() => {
    document.title = "Limited Empire";
  }, []);

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
    <div className="min-h-screen bg-background flex flex-col">
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
                R${(user.cash ?? 1000).toLocaleString()}
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

      <div className="flex-1 container mx-auto px-4 py-4 pb-8">
        <Tabs value={currentTab} onValueChange={(value) => setLocation(value === "roll" ? "/" : `/${value}`)}>
          <TabsList className="grid w-full max-w-6xl mx-auto grid-cols-7 mb-6">
            <TabsTrigger value="roll" data-testid="tab-roll" className="flex items-center gap-1 md:gap-2">
              <Dices className="w-4 h-4" />
              <span className="hidden sm:inline">Roll</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" data-testid="tab-inventory" className="flex items-center gap-1 md:gap-2">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Inventory</span>
            </TabsTrigger>
            <TabsTrigger value="trading" data-testid="tab-trading" className="flex items-center gap-1 md:gap-2">
              <ArrowLeftRight className="w-4 h-4" />
              <span className="hidden sm:inline">Trading</span>
            </TabsTrigger>
            <TabsTrigger value="players" data-testid="tab-players" className="flex items-center gap-1 md:gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Players</span>
            </TabsTrigger>
            <TabsTrigger value="leaderboard" data-testid="tab-leaderboard" className="flex items-center gap-1 md:gap-2">
              <Trophy className="w-4 h-4" />
              <span className="hidden sm:inline">Leaderboard</span>
            </TabsTrigger>
            <TabsTrigger value="index" data-testid="tab-index" className="flex items-center gap-1 md:gap-2">
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline">Index</span>
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings" className="flex items-center gap-1 md:gap-2">
              <SettingsIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div style={{ display: currentTab === "roll" ? "block" : "none" }}>
          <MemoizedRollScreen />
        </div>

        <div style={{ display: currentTab !== "roll" ? "block" : "none" }}>
          <Switch>
            <Route path="/inventory" component={Inventory} />
            <Route path="/trading" component={Trading} />
            <Route path="/players" component={Players} />
            <Route path="/leaderboard" component={Leaderboard} />
            <Route path="/index">
              {() => <ItemIndex onEditItem={openAdminPanel} />}
            </Route>
            <Route path="/settings" component={Settings} />
          </Switch>
        </div>
      </div>

      <footer className="w-full border-t bg-muted/30 py-6 mt-auto">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong>Disclaimer:</strong> Item thumbnails and names displayed on this platform are property of <strong>Roblox Corporation</strong> and are used here under <strong>Fair Use</strong> for educational and non-commercial purposes. All other content, including the platform design, code, and functionality, is the intellectual property of Limited Empire.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Limited Empire is not affiliated with, endorsed by, or sponsored by Roblox Corporation.
            </p>
            <p className="text-xs text-muted-foreground/50">
              © {new Date().getFullYear()} Limited Empire. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <BanOverlay />

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

      <PendingSaveIndicator />
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
