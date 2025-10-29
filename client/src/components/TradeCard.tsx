import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Trade } from "@shared/schema";
import { formatValue } from "@/lib/rarity";
import { ArrowLeftRight, Check, X, RefreshCw, Clock } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TradeModal } from "./TradeModal";
import { useAuth } from "@/contexts/AuthContext";

interface TradeCardProps {
  trade: Trade;
  type: "inbound" | "outbound" | "completed" | "inactive";
}

export function TradeCard({ trade, type }: TradeCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [targetUser, setTargetUser] = useState<any>(null);

  const isReceiver = trade.receiverId === user?.uid;
  const isSender = trade.senderId === user?.uid;

  const myItems = isReceiver ? trade.receiverItems : trade.senderItems;
  const theirItems = isReceiver ? trade.senderItems : trade.receiverItems;
  const myCash = isReceiver ? trade.receiverCash : trade.senderCash;
  const theirCash = isReceiver ? trade.senderCash : trade.receiverCash;
  const otherUsername = isReceiver ? trade.senderUsername : trade.receiverUsername;

  const myValue = myItems.reduce((sum, item) => sum + item.itemValue * item.amount, 0) + myCash;
  const theirValue = theirItems.reduce((sum, item) => sum + item.itemValue * item.amount, 0) + theirCash;

  const acceptTradeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest({
        url: `/api/trades/${trade.id}/accept`,
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "Trade Accepted",
        description: "The trade has been completed successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const declineTradeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest({
        url: `/api/trades/${trade.id}/decline`,
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "Trade Declined",
        description: "The trade has been declined.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCounter = () => {
    setTargetUser({
      id: isReceiver ? trade.senderId : trade.receiverId,
      username: otherUsername,
    });
    setShowCounterModal(true);
  };

  const getStatusBadge = () => {
    switch (trade.status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-green-600"><Check className="h-3 w-3 mr-1" />Completed</Badge>;
      case "declined":
        return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />Declined</Badge>;
      case "countered":
        return <Badge variant="outline"><RefreshCw className="h-3 w-3 mr-1" />Countered</Badge>;
      default:
        return null;
    }
  };

  const renderItems = (items: typeof myItems, cash: number) => (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={`${item.inventoryItemId}-${idx}`} className="flex items-center gap-2">
          <img
            src={item.itemImageUrl}
            alt={item.itemName}
            className="w-10 h-10 object-cover rounded"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.itemName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatValue(item.itemValue)}</span>
              {item.serialNumber !== null && (
                <span>#{item.serialNumber}</span>
              )}
              {item.amount > 1 && (
                <span>x{item.amount}</span>
              )}
            </div>
          </div>
        </div>
      ))}
      {cash > 0 && (
        <div className="flex items-center gap-2 py-1">
          <div className="w-10 h-10 bg-green-600/20 rounded flex items-center justify-center">
            <span className="text-lg">💵</span>
          </div>
          <div>
            <p className="text-sm font-medium">{formatValue(cash)}</p>
            <p className="text-xs text-muted-foreground">Cash</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Card data-testid={`trade-card-${trade.id}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              Trade with {otherUsername}
            </CardTitle>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(trade.createdAt).toLocaleDateString()} at {new Date(trade.createdAt).toLocaleTimeString()}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2 text-sm">
                {isReceiver ? "They Offer" : "You Offer"} ({formatValue(theirValue)})
              </h4>
              {renderItems(theirItems, theirCash)}
            </div>
            <div>
              <h4 className="font-semibold mb-2 text-sm">
                {isReceiver ? "You Give" : "They Give"} ({formatValue(myValue)})
              </h4>
              {renderItems(myItems, myCash)}
            </div>
          </div>
        </CardContent>
        {type === "inbound" && trade.status === "pending" && (
          <CardFooter className="flex gap-2">
            <Button
              onClick={() => acceptTradeMutation.mutate()}
              disabled={acceptTradeMutation.isPending}
              className="flex-1"
              data-testid={`trade-accept-${trade.id}`}
            >
              <Check className="h-4 w-4 mr-2" />
              Accept
            </Button>
            <Button
              onClick={handleCounter}
              variant="outline"
              className="flex-1"
              data-testid={`trade-counter-${trade.id}`}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Counter
            </Button>
            <Button
              onClick={() => declineTradeMutation.mutate()}
              disabled={declineTradeMutation.isPending}
              variant="destructive"
              className="flex-1"
              data-testid={`trade-decline-${trade.id}`}
            >
              <X className="h-4 w-4 mr-2" />
              Decline
            </Button>
          </CardFooter>
        )}
        {type === "outbound" && trade.status === "pending" && (
          <CardFooter>
            <Button
              onClick={() => declineTradeMutation.mutate()}
              disabled={declineTradeMutation.isPending}
              variant="destructive"
              className="w-full"
              data-testid={`trade-cancel-${trade.id}`}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel Trade
            </Button>
          </CardFooter>
        )}
      </Card>

      {showCounterModal && targetUser && (
        <TradeModal
          targetUser={targetUser}
          open={showCounterModal}
          onOpenChange={setShowCounterModal}
          counterTrade={trade}
        />
      )}
    </>
  );
}
