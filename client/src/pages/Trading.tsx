import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { collection, query, where, getDocs, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Trade } from "@shared/schema";
import { ArrowLeftRight, Check, X, Clock, Archive, DollarSign, Hash } from "lucide-react";
import { formatValue, getRarityClass } from "@/lib/rarity";

export default function Trading() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [inboundTrades, setInboundTrades] = useState<Trade[]>([]);
  const [outboundTrades, setOutboundTrades] = useState<Trade[]>([]);
  const [inactiveTrades, setInactiveTrades] = useState<Trade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingTradeId, setProcessingTradeId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadTrades();
    }
  }, [user]);

  const loadTrades = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const tradesRef = collection(db, "trades");
      
      const inboundQuery = query(
        tradesRef,
        where("receiverId", "==", user.firebaseUid),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
      
      const outboundQuery = query(
        tradesRef,
        where("senderId", "==", user.firebaseUid),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
      
      // For inactive trades, we need separate queries for sender and receiver
      // because Firebase rules are not filters
      const inactiveSenderQuery = query(
        tradesRef,
        where("senderId", "==", user.firebaseUid),
        where("status", "in", ["declined", "cancelled"]),
        orderBy("updatedAt", "desc")
      );
      
      const inactiveReceiverQuery = query(
        tradesRef,
        where("receiverId", "==", user.firebaseUid),
        where("status", "in", ["declined", "cancelled"]),
        orderBy("updatedAt", "desc")
      );
      
      // For completed trades, we need separate queries for sender and receiver
      const completedSenderQuery = query(
        tradesRef,
        where("senderId", "==", user.firebaseUid),
        where("status", "==", "completed"),
        orderBy("completedAt", "desc")
      );
      
      const completedReceiverQuery = query(
        tradesRef,
        where("receiverId", "==", user.firebaseUid),
        where("status", "==", "completed"),
        orderBy("completedAt", "desc")
      );

      const [
        inboundSnapshot, 
        outboundSnapshot, 
        inactiveSenderSnapshot, 
        inactiveReceiverSnapshot,
        completedSenderSnapshot,
        completedReceiverSnapshot
      ] = await Promise.all([
        getDocs(inboundQuery),
        getDocs(outboundQuery),
        getDocs(inactiveSenderQuery),
        getDocs(inactiveReceiverQuery),
        getDocs(completedSenderQuery),
        getDocs(completedReceiverQuery),
      ]);

      const inbound: Trade[] = [];
      inboundSnapshot.forEach((doc) => {
        inbound.push({ id: doc.id, ...doc.data() } as Trade);
      });

      const outbound: Trade[] = [];
      outboundSnapshot.forEach((doc) => {
        outbound.push({ id: doc.id, ...doc.data() } as Trade);
      });

      // Combine inactive trades from sender and receiver queries
      const inactive: Trade[] = [];
      inactiveSenderSnapshot.forEach((doc) => {
        inactive.push({ id: doc.id, ...doc.data() } as Trade);
      });
      inactiveReceiverSnapshot.forEach((doc) => {
        inactive.push({ id: doc.id, ...doc.data() } as Trade);
      });
      // Sort by updatedAt descending
      inactive.sort((a, b) => b.updatedAt - a.updatedAt);

      // Combine completed trades from sender and receiver queries
      const completed: Trade[] = [];
      completedSenderSnapshot.forEach((doc) => {
        completed.push({ id: doc.id, ...doc.data() } as Trade);
      });
      completedReceiverSnapshot.forEach((doc) => {
        completed.push({ id: doc.id, ...doc.data() } as Trade);
      });
      // Sort by completedAt descending
      completed.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

      setInboundTrades(inbound);
      setOutboundTrades(outbound);
      setInactiveTrades(inactive);
      setCompletedTrades(completed);
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

  const handleAcceptTrade = async (trade: Trade) => {
    if (!user) return;
    
    setProcessingTradeId(trade.id);
    
    try {
      const tradeRef = doc(db, "trades", trade.id);
      await updateDoc(tradeRef, {
        status: "completed",
        updatedAt: Date.now(),
        completedAt: Date.now(),
      });

      toast({
        title: "Trade Accepted",
        description: "The trade has been completed successfully",
      });

      await loadTrades();
    } catch (error) {
      console.error("Error accepting trade:", error);
      toast({
        title: "Error",
        description: "Failed to accept trade",
        variant: "destructive",
      });
    } finally {
      setProcessingTradeId(null);
    }
  };

  const handleDeclineTrade = async (trade: Trade) => {
    if (!user) return;
    
    setProcessingTradeId(trade.id);
    
    try {
      const tradeRef = doc(db, "trades", trade.id);
      await updateDoc(tradeRef, {
        status: "declined",
        updatedAt: Date.now(),
      });

      toast({
        title: "Trade Declined",
        description: "The trade offer has been declined",
      });

      await loadTrades();
    } catch (error) {
      console.error("Error declining trade:", error);
      toast({
        title: "Error",
        description: "Failed to decline trade",
        variant: "destructive",
      });
    } finally {
      setProcessingTradeId(null);
    }
  };

  const handleCancelTrade = async (trade: Trade) => {
    if (!user) return;
    
    setProcessingTradeId(trade.id);
    
    try {
      const tradeRef = doc(db, "trades", trade.id);
      await updateDoc(tradeRef, {
        status: "cancelled",
        updatedAt: Date.now(),
      });

      toast({
        title: "Trade Cancelled",
        description: "Your trade offer has been cancelled",
      });

      await loadTrades();
    } catch (error) {
      console.error("Error cancelling trade:", error);
      toast({
        title: "Error",
        description: "Failed to cancel trade",
        variant: "destructive",
      });
    } finally {
      setProcessingTradeId(null);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const renderTradeCard = (trade: Trade, isInbound: boolean, showActions: boolean) => {
    const otherUser = isInbound ? trade.senderUsername : trade.receiverUsername;
    
    // Handle both old and new trade structure for backwards compatibility
    let offering: { items: any[], cash: number };
    let requesting: { items: any[], cash: number };
    
    if (trade.senderOffer && trade.receiverRequest) {
      // New structure
      offering = trade.senderOffer;
      requesting = trade.receiverRequest;
    } else {
      // Old structure - convert to new format
      offering = {
        items: (trade as any).senderItems || [],
        cash: (trade as any).senderCash || 0,
      };
      requesting = {
        items: (trade as any).receiverItems || [],
        cash: (trade as any).receiverCash || 0,
      };
    }
    
    // Validate the data
    if (!offering.items || !requesting.items) {
      console.error("Invalid trade data - missing items arrays:", trade);
      return null;
    }
    
    const offerValue = offering.items.reduce((sum, item) => sum + item.itemValue, 0) + offering.cash;
    const requestValue = requesting.items.reduce((sum, item) => sum + item.itemValue, 0) + requesting.cash;

    return (
      <Card key={trade.id} className="hover:shadow-lg transition-all" data-testid={`card-trade-${trade.id}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5" />
              Trade with {otherUser}
            </CardTitle>
            <Badge
              variant={
                trade.status === "pending" ? "default" :
                trade.status === "completed" ? "secondary" :
                trade.status === "declined" ? "destructive" :
                "outline"
              }
              data-testid={`badge-status-${trade.status}`}
            >
              {trade.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{formatDate(trade.createdAt)}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                {isInbound ? "They Offer" : "You Offer"}
                <span className="text-xs text-muted-foreground font-normal">
                  (${formatValue(offerValue)})
                </span>
              </h4>
              <ScrollArea className="h-32 border rounded-lg p-2">
                <div className="space-y-2">
                  {offering.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <img
                        src={item.itemImageUrl}
                        alt={item.itemName}
                        className="w-10 h-10 rounded object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.itemName}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className={`${getRarityClass(item.itemRarity)} text-[10px] px-1`}>
                            {item.itemRarity}
                          </Badge>
                          {item.serialNumber !== null && (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Hash className="w-3 h-3" />
                              {item.serialNumber}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        ${formatValue(item.itemValue)}
                      </span>
                    </div>
                  ))}
                  {offering.cash > 0 && (
                    <div className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded">
                      <DollarSign className="w-4 h-4 text-green-600" />
                      <span className="font-semibold">${offering.cash.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                {isInbound ? "They Request" : "You Request"}
                <span className="text-xs text-muted-foreground font-normal">
                  (${formatValue(requestValue)})
                </span>
              </h4>
              <ScrollArea className="h-32 border rounded-lg p-2">
                <div className="space-y-2">
                  {requesting.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <img
                        src={item.itemImageUrl}
                        alt={item.itemName}
                        className="w-10 h-10 rounded object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.itemName}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className={`${getRarityClass(item.itemRarity)} text-[10px] px-1`}>
                            {item.itemRarity}
                          </Badge>
                          {item.serialNumber !== null && (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Hash className="w-3 h-3" />
                              {item.serialNumber}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        ${formatValue(item.itemValue)}
                      </span>
                    </div>
                  ))}
                  {requesting.cash > 0 && (
                    <div className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded">
                      <DollarSign className="w-4 h-4 text-green-600" />
                      <span className="font-semibold">${requesting.cash.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {showActions && trade.status === "pending" && (
            <div className="flex gap-2 pt-2 border-t">
              {isInbound ? (
                <>
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={() => handleAcceptTrade(trade)}
                    disabled={processingTradeId === trade.id}
                    data-testid="button-accept-trade"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Accept
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleDeclineTrade(trade)}
                    disabled={processingTradeId === trade.id}
                    data-testid="button-decline-trade"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Decline
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleCancelTrade(trade)}
                  disabled={processingTradeId === trade.id}
                  data-testid="button-cancel-trade"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel Trade
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <ArrowLeftRight className="w-8 h-8" />
          Trading
        </h1>
        <p className="text-muted-foreground">Manage your trade offers and exchanges</p>
      </div>

      <Tabs defaultValue="inbound" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="inbound" data-testid="tab-inbound">
            Inbound ({inboundTrades.length})
          </TabsTrigger>
          <TabsTrigger value="outbound" data-testid="tab-outbound">
            Outbound ({outboundTrades.length})
          </TabsTrigger>
          <TabsTrigger value="inactive" data-testid="tab-inactive">
            Inactive ({inactiveTrades.length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed ({completedTrades.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-20 animate-spin" />
                <p className="text-muted-foreground">Loading trades...</p>
              </CardContent>
            </Card>
          ) : inboundTrades.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ArrowLeftRight className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No incoming trade offers</p>
              </CardContent>
            </Card>
          ) : (
            inboundTrades.map(trade => renderTradeCard(trade, true, true))
          )}
        </TabsContent>

        <TabsContent value="outbound" className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-20 animate-spin" />
                <p className="text-muted-foreground">Loading trades...</p>
              </CardContent>
            </Card>
          ) : outboundTrades.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ArrowLeftRight className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No outgoing trade offers</p>
              </CardContent>
            </Card>
          ) : (
            outboundTrades.map(trade => renderTradeCard(trade, false, true))
          )}
        </TabsContent>

        <TabsContent value="inactive" className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-20 animate-spin" />
                <p className="text-muted-foreground">Loading trades...</p>
              </CardContent>
            </Card>
          ) : inactiveTrades.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Archive className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No inactive trades</p>
              </CardContent>
            </Card>
          ) : (
            inactiveTrades.map(trade => renderTradeCard(trade, trade.receiverId === user?.firebaseUid, false))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-20 animate-spin" />
                <p className="text-muted-foreground">Loading trades...</p>
              </CardContent>
            </Card>
          ) : completedTrades.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Check className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No completed trades</p>
              </CardContent>
            </Card>
          ) : (
            completedTrades.map(trade => renderTradeCard(trade, trade.receiverId === user?.firebaseUid, false))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
