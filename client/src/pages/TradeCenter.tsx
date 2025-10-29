import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArrowLeftRight, Check, X, Clock, PackageX, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Trade, User, Item } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function TradeCenter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("inbound");

  const { data: inboundTrades, isLoading: inboundLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades?userId=" + user?.id + "&box=inbound"],
    enabled: !!user?.id && selectedTab === "inbound",
  });

  const { data: outboundTrades, isLoading: outboundLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades?userId=" + user?.id + "&box=outbound"],
    enabled: !!user?.id && selectedTab === "outbound",
  });

  const { data: completedTrades, isLoading: completedLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades?userId=" + user?.id + "&box=completed"],
    enabled: !!user?.id && selectedTab === "completed",
  });

  const { data: inactiveTrades, isLoading: inactiveLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades?userId=" + user?.id + "&box=inactive"],
    enabled: !!user?.id && selectedTab === "inactive",
  });

  const acceptTradeMutation = useMutation({
    mutationFn: async (tradeId: string) => {
      return await apiRequest("POST", `/api/trades/${tradeId}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      toast({
        title: "Trade accepted",
        description: "The trade has been completed successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Trade failed",
        description: error.message || "Failed to accept trade",
        variant: "destructive",
      });
    },
  });

  const declineTradeMutation = useMutation({
    mutationFn: async (tradeId: string) => {
      return await apiRequest("POST", `/api/trades/${tradeId}/decline`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      toast({
        title: "Trade declined",
        description: "The trade has been declined.",
      });
    },
  });

  const cancelTradeMutation = useMutation({
    mutationFn: async (tradeId: string) => {
      return await apiRequest("POST", `/api/trades/${tradeId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      toast({
        title: "Trade cancelled",
        description: "The trade has been cancelled.",
      });
    },
  });

  if (!user) {
    return null;
  }

  const renderTrade = (trade: Trade, isInbound: boolean, isCompleted: boolean = false, isInactive: boolean = false) => {
    const otherUsername = isInbound ? trade.initiatorUsername : trade.recipientUsername;
    const otherOffer = isInbound ? trade.initiatorOffer : trade.recipientOffer;
    const myOffer = isInbound ? trade.recipientOffer : trade.initiatorOffer;

    const getTotalValue = (items: typeof otherOffer.items) => {
      return items.reduce((sum, item) => sum + item.valueAtOffer, 0);
    };

    const otherOfferValue = getTotalValue(otherOffer.items) + otherOffer.cash;
    const myOfferValue = getTotalValue(myOffer.items) + myOffer.cash;

    return (
      <Card key={trade.id} className="mb-4" data-testid={`card-trade-${trade.id}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5" />
                Trade with {otherUsername}
              </CardTitle>
              <CardDescription>
                {formatDistanceToNow(trade.createdAt, { addSuffix: true })}
                {trade.status !== "pending" && (
                  <Badge className="ml-2" variant={
                    trade.status === "accepted" ? "default" :
                    trade.status === "declined" ? "destructive" :
                    "secondary"
                  }>
                    {trade.status}
                  </Badge>
                )}
              </CardDescription>
            </div>
            {!isCompleted && !isInactive && trade.status === "pending" && (
              <div className="flex gap-2">
                {isInbound && (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => acceptTradeMutation.mutate(trade.id)}
                      disabled={acceptTradeMutation.isPending}
                      data-testid={`button-accept-trade-${trade.id}`}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => declineTradeMutation.mutate(trade.id)}
                      disabled={declineTradeMutation.isPending}
                      data-testid={`button-decline-trade-${trade.id}`}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Decline
                    </Button>
                  </>
                )}
                {!isInbound && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancelTradeMutation.mutate(trade.id)}
                    disabled={cancelTradeMutation.isPending}
                    data-testid={`button-cancel-trade-${trade.id}`}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2 text-sm">
                {isInbound ? "They're offering:" : "You're offering:"}
              </h4>
              <div className="space-y-2">
                {otherOffer.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-muted/50 rounded" data-testid={`item-offered-${idx}`}>
                    <img src={item.itemImageUrl} alt={item.itemName} className="w-10 h-10 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.itemName}</p>
                      <p className="text-xs text-muted-foreground">
                        ${item.valueAtOffer.toLocaleString()}
                        {item.serialNumber !== null && ` • #${item.serialNumber}`}
                      </p>
                    </div>
                  </div>
                ))}
                {otherOffer.cash > 0 && (
                  <div className="p-2 bg-green-500/10 rounded" data-testid="cash-offered">
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                      + ${otherOffer.cash.toLocaleString()} cash
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Total value: ${otherOfferValue.toLocaleString()}
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2 text-sm">
                {isInbound ? "You're offering:" : "They're offering:"}
              </h4>
              <div className="space-y-2">
                {myOffer.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-muted/50 rounded" data-testid={`item-requested-${idx}`}>
                    <img src={item.itemImageUrl} alt={item.itemName} className="w-10 h-10 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.itemName}</p>
                      <p className="text-xs text-muted-foreground">
                        ${item.valueAtOffer.toLocaleString()}
                        {item.serialNumber !== null && ` • #${item.serialNumber}`}
                      </p>
                    </div>
                  </div>
                ))}
                {myOffer.cash > 0 && (
                  <div className="p-2 bg-green-500/10 rounded" data-testid="cash-requested">
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                      + ${myOffer.cash.toLocaleString()} cash
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Total value: ${myOfferValue.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          {trade.message && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-sm text-muted-foreground">Message:</p>
                <p className="text-sm">{trade.message}</p>
              </div>
            </>
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
          Trade Center
        </h1>
        <p className="text-muted-foreground">Manage your trades with other players</p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="inbound" data-testid="tab-inbound">
            <Clock className="w-4 h-4 mr-2" />
            Inbound
            {inboundTrades && inboundTrades.length > 0 && (
              <Badge variant="default" className="ml-2">{inboundTrades.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outbound" data-testid="tab-outbound">
            <ArrowLeftRight className="w-4 h-4 mr-2" />
            Outbound
            {outboundTrades && outboundTrades.length > 0 && (
              <Badge variant="secondary" className="ml-2">{outboundTrades.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="inactive" data-testid="tab-inactive">
            <PackageX className="w-4 h-4 mr-2" />
            Inactive
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            <Check className="w-4 h-4 mr-2" />
            Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbound">
          {inboundLoading ? (
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary animate-pulse" />
              <p className="text-muted-foreground">Loading inbound trades...</p>
            </div>
          ) : !inboundTrades || inboundTrades.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No pending inbound trades</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[600px]">
              {inboundTrades.map(trade => renderTrade(trade, true))}
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="outbound">
          {outboundLoading ? (
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary animate-pulse" />
              <p className="text-muted-foreground">Loading outbound trades...</p>
            </div>
          ) : !outboundTrades || outboundTrades.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <ArrowLeftRight className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No pending outbound trades</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[600px]">
              {outboundTrades.map(trade => renderTrade(trade, false))}
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="inactive">
          {inactiveLoading ? (
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary animate-pulse" />
              <p className="text-muted-foreground">Loading inactive trades...</p>
            </div>
          ) : !inactiveTrades || inactiveTrades.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <PackageX className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No inactive trades</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[600px]">
              {inactiveTrades.map(trade => {
                const isInbound = trade.recipientId === user.id;
                return renderTrade(trade, isInbound, false, true);
              })}
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedLoading ? (
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary animate-pulse" />
              <p className="text-muted-foreground">Loading completed trades...</p>
            </div>
          ) : !completedTrades || completedTrades.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Check className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No completed trades</p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[600px]">
              {completedTrades.map(trade => {
                const isInbound = trade.recipientId === user.id;
                return renderTrade(trade, isInbound, true);
              })}
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
