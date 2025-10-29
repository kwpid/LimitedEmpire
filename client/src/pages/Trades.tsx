import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type Trade } from "@shared/schema";
import { ArrowRight, X, RefreshCw, Clock, CheckCircle, XCircle } from "lucide-react";
import { TradeWindow } from "@/components/TradeWindow";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function Trades() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<"inbound" | "outbound" | "completed" | "inactive">("inbound");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  
  const [counterTradeOpen, setCounterTradeOpen] = useState(false);
  const [counterTrade, setCounterTrade] = useState<Trade | null>(null);
  const [counterTargetUser, setCounterTargetUser] = useState<any>(null);
  
  const loadTrades = async (type: typeof activeTab) => {
    if (!user) return;
    
    setLoading(true);
    try {
      await apiRequest({
        url: "/api/trades/expire",
        method: "POST",
      });
      
      const data = await apiRequest<Trade[]>({
        url: `/api/trades?type=${type}`,
        method: "GET",
      });
      
      setTrades(data);
    } catch (error) {
      console.error("Error loading trades:", error);
      toast({
        title: "Error",
        description: "Failed to load trades",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (user) {
      loadTrades(activeTab);
    }
  }, [user, activeTab]);
  
  const handleAcceptTrade = async (tradeId: string) => {
    setProcessing(tradeId);
    try {
      await apiRequest({
        url: `/api/trades/${tradeId}/accept`,
        method: "POST",
      });
      
      toast({
        title: "Trade accepted!",
        description: "The trade has been completed successfully",
      });
      
      await loadTrades(activeTab);
    } catch (error: any) {
      console.error("Error accepting trade:", error);
      toast({
        title: "Failed to accept trade",
        description: error.response?.data?.error || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };
  
  const handleDeclineTrade = async (tradeId: string) => {
    setProcessing(tradeId);
    try {
      await apiRequest({
        url: `/api/trades/${tradeId}/decline`,
        method: "POST",
      });
      
      toast({
        title: "Trade declined",
        description: "The trade has been declined",
      });
      
      await loadTrades(activeTab);
    } catch (error: any) {
      console.error("Error declining trade:", error);
      toast({
        title: "Failed to decline trade",
        description: error.response?.data?.error || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };
  
  const handleCancelTrade = async (tradeId: string) => {
    setProcessing(tradeId);
    try {
      await apiRequest({
        url: `/api/trades/${tradeId}/cancel`,
        method: "POST",
      });
      
      toast({
        title: "Trade cancelled",
        description: "Your trade has been cancelled",
      });
      
      await loadTrades(activeTab);
    } catch (error: any) {
      console.error("Error cancelling trade:", error);
      toast({
        title: "Failed to cancel trade",
        description: error.response?.data?.error || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };
  
  const openCounterWindow = async (trade: Trade) => {
    try {
      const userDocRef = doc(db, "users", trade.initiatorId);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        setCounterTargetUser({ id: userDoc.id, ...userDoc.data() });
        setCounterTrade(trade);
        setCounterTradeOpen(true);
      }
    } catch (error) {
      console.error("Error loading user for counter:", error);
      toast({
        title: "Error",
        description: "Failed to load user information",
        variant: "destructive",
      });
    }
  };
  
  const formatCash = (value: number) => {
    return value.toLocaleString();
  };
  
  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };
  
  const formatTimeRemaining = (expiresAt: number) => {
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) return "Expired";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h left`;
    return "< 1h left";
  };
  
  const renderTradeCard = (trade: Trade) => {
    const isInbound = activeTab === "inbound";
    const isOutbound = activeTab === "outbound";
    const otherUsername = user?.id === trade.initiatorId ? trade.recipientUsername : trade.initiatorUsername;
    const myOffer = user?.id === trade.initiatorId ? trade.initiatorOffer : trade.recipientOffer;
    const theirOffer = user?.id === trade.initiatorId ? trade.recipientOffer : trade.initiatorOffer;
    
    return (
      <Card key={trade.id} className="p-4 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700" data-testid={`card-trade-${trade.id}`}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-black dark:text-white">
                {isInbound ? "From" : "To"}: {otherUsername}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatTimeAgo(trade.createdAt)}
                {trade.status === "pending" && ` • ${formatTimeRemaining(trade.expiresAt)}`}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {trade.status === "pending" && <Clock className="h-4 w-4 text-yellow-500" />}
              {trade.status === "accepted" && <CheckCircle className="h-4 w-4 text-green-500" />}
              {trade.status === "declined" && <XCircle className="h-4 w-4 text-red-500" />}
              {trade.status === "cancelled" && <X className="h-4 w-4 text-gray-500" />}
              {trade.status === "expired" && <Clock className="h-4 w-4 text-gray-500" />}
              <span className="text-xs capitalize px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-black dark:text-white">
                {trade.status}
              </span>
            </div>
          </div>
          
          {trade.message && (
            <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-700 dark:text-gray-300">
              <span className="font-semibold">Message:</span> {trade.message}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold mb-2 text-black dark:text-white">Your {isInbound ? "Receive" : "Offer"}</h4>
              <div className="space-y-1">
                {theirOffer.items.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <img src={item.itemImageUrl} alt={item.itemName} className="h-8 w-8 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-black dark:text-white">{item.itemName}</p>
                      <p className="text-gray-500 dark:text-gray-400">
                        {formatCash(item.itemValue)}
                        {item.serialNumber !== null && ` #${item.serialNumber}`}
                      </p>
                    </div>
                  </div>
                ))}
                {theirOffer.items.length > 3 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    +{theirOffer.items.length - 3} more items
                  </p>
                )}
                {theirOffer.cash > 0 && (
                  <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                    Cash: {formatCash(theirOffer.cash)}
                  </p>
                )}
                {theirOffer.items.length === 0 && theirOffer.cash === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Nothing</p>
                )}
              </div>
              <p className="text-xs mt-2 font-semibold text-gray-600 dark:text-gray-400">
                Total: {formatCash(user?.id === trade.initiatorId ? trade.recipientOfferValue : trade.initiatorOfferValue)}
              </p>
            </div>
            
            <div>
              <h4 className="text-sm font-semibold mb-2 text-black dark:text-white">Your {isInbound ? "Give" : "Request"}</h4>
              <div className="space-y-1">
                {myOffer.items.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <img src={item.itemImageUrl} alt={item.itemName} className="h-8 w-8 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-black dark:text-white">{item.itemName}</p>
                      <p className="text-gray-500 dark:text-gray-400">
                        {formatCash(item.itemValue)}
                        {item.serialNumber !== null && ` #${item.serialNumber}`}
                      </p>
                    </div>
                  </div>
                ))}
                {myOffer.items.length > 3 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    +{myOffer.items.length - 3} more items
                  </p>
                )}
                {myOffer.cash > 0 && (
                  <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                    Cash: {formatCash(myOffer.cash)}
                  </p>
                )}
                {myOffer.items.length === 0 && myOffer.cash === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Nothing</p>
                )}
              </div>
              <p className="text-xs mt-2 font-semibold text-gray-600 dark:text-gray-400">
                Total: {formatCash(user?.id === trade.initiatorId ? trade.initiatorOfferValue : trade.recipientOfferValue)}
              </p>
            </div>
          </div>
          
          {isInbound && trade.status === "pending" && (
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDeclineTrade(trade.id)}
                disabled={processing === trade.id}
                className="border-gray-300 dark:border-gray-700 text-black dark:text-white"
                data-testid={`button-decline-${trade.id}`}
              >
                Decline
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openCounterWindow(trade)}
                disabled={processing === trade.id}
                className="border-gray-300 dark:border-gray-700 text-black dark:text-white"
                data-testid={`button-counter-${trade.id}`}
              >
                Counter
              </Button>
              <Button
                size="sm"
                onClick={() => handleAcceptTrade(trade.id)}
                disabled={processing === trade.id}
                className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white"
                data-testid={`button-accept-${trade.id}`}
              >
                {processing === trade.id ? "Processing..." : "Accept"}
              </Button>
            </div>
          )}
          
          {isOutbound && trade.status === "pending" && (
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCancelTrade(trade.id)}
                disabled={processing === trade.id}
                className="border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400"
                data-testid={`button-cancel-${trade.id}`}
              >
                {processing === trade.id ? "Cancelling..." : "Cancel Trade"}
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  };
  
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600 dark:text-gray-400">
        Please sign in to view trades
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-black dark:text-white">Trades</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadTrades(activeTab)}
          disabled={loading}
          className="border-gray-300 dark:border-gray-700 text-black dark:text-white"
          data-testid="button-refresh"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gray-100 dark:bg-gray-800">
          <TabsTrigger value="inbound" className="data-[state=active]:bg-white data-[state=active]:dark:bg-gray-700 text-black dark:text-white" data-testid="tab-inbound">
            Inbound
          </TabsTrigger>
          <TabsTrigger value="outbound" className="data-[state=active]:bg-white data-[state=active]:dark:bg-gray-700 text-black dark:text-white" data-testid="tab-outbound">
            Outbound
          </TabsTrigger>
          <TabsTrigger value="completed" className="data-[state=active]:bg-white data-[state=active]:dark:bg-gray-700 text-black dark:text-white" data-testid="tab-completed">
            Completed
          </TabsTrigger>
          <TabsTrigger value="inactive" className="data-[state=active]:bg-white data-[state=active]:dark:bg-gray-700 text-black dark:text-white" data-testid="tab-inactive">
            Inactive
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="inbound" className="mt-6">
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading trades...</div>
              ) : trades.length === 0 ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">No inbound trades</div>
              ) : (
                trades.map(renderTradeCard)
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="outbound" className="mt-6">
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading trades...</div>
              ) : trades.length === 0 ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">No outbound trades</div>
              ) : (
                trades.map(renderTradeCard)
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="completed" className="mt-6">
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading trades...</div>
              ) : trades.length === 0 ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">No completed trades</div>
              ) : (
                trades.map(renderTradeCard)
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="inactive" className="mt-6">
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading trades...</div>
              ) : trades.length === 0 ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">No inactive trades</div>
              ) : (
                trades.map(renderTradeCard)
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      
      {counterTradeOpen && counterTargetUser && (
        <TradeWindow
          open={counterTradeOpen}
          onOpenChange={setCounterTradeOpen}
          targetUser={counterTargetUser}
          onTradeSent={() => {
            setCounterTradeOpen(false);
            loadTrades(activeTab);
          }}
        />
      )}
    </div>
  );
}
