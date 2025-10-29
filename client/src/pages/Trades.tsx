import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { TradeCard } from "@/components/TradeCard";
import type { Trade } from "@shared/schema";
import { ArrowDownUp, Send, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Trades() {
  const { user } = useAuth();

  const { data: inboundTrades, isLoading: inboundLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades", "inbound"],
    enabled: !!user,
  });

  const { data: outboundTrades, isLoading: outboundLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades", "outbound"],
    enabled: !!user,
  });

  const { data: completedTrades, isLoading: completedLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades", "completed"],
    enabled: !!user,
  });

  const { data: inactiveTrades, isLoading: inactiveLoading } = useQuery<Trade[]>({
    queryKey: ["/api/trades", "inactive"],
    enabled: !!user,
  });

  const renderTradesList = (
    trades: Trade[] | undefined,
    loading: boolean,
    type: "inbound" | "outbound" | "completed" | "inactive",
    emptyMessage: string
  ) => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!trades || trades.length === 0) {
      return (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <p>{emptyMessage}</p>
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {trades.map((trade) => (
          <TradeCard key={trade.id} trade={trade} type={type} />
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Trades</h1>
        <p className="text-muted-foreground">Manage your trades and offers</p>
      </div>

      <Tabs defaultValue="inbound" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="inbound" data-testid="tab-inbound">
            <ArrowDownUp className="h-4 w-4 mr-2" />
            Inbound
            {inboundTrades && inboundTrades.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                {inboundTrades.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="outbound" data-testid="tab-outbound">
            <Send className="h-4 w-4 mr-2" />
            Outbound
            {outboundTrades && outboundTrades.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                {outboundTrades.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Completed
          </TabsTrigger>
          <TabsTrigger value="inactive" data-testid="tab-inactive">
            <XCircle className="h-4 w-4 mr-2" />
            Inactive
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="space-y-4">
          {renderTradesList(
            inboundTrades,
            inboundLoading,
            "inbound",
            "No pending trade offers"
          )}
        </TabsContent>

        <TabsContent value="outbound" className="space-y-4">
          {renderTradesList(
            outboundTrades,
            outboundLoading,
            "outbound",
            "No outgoing trades"
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {renderTradesList(
            completedTrades,
            completedLoading,
            "completed",
            "No completed trades"
          )}
        </TabsContent>

        <TabsContent value="inactive" className="space-y-4">
          {renderTradesList(
            inactiveTrades,
            inactiveLoading,
            "inactive",
            "No inactive trades"
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
