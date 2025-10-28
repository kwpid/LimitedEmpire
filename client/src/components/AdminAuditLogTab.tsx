import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AuditLog } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Clock, User, FileText, AlertCircle } from "lucide-react";

const ACTION_LABELS: Record<string, { label: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
  user_ban: { label: "User Banned", variant: "destructive" },
  user_unban: { label: "User Unbanned", variant: "secondary" },
  user_wipe_inventory: { label: "Inventory Wiped", variant: "destructive" },
  user_give_items: { label: "Items Given", variant: "default" },
  item_create: { label: "Item Created", variant: "default" },
  item_edit: { label: "Item Edited", variant: "outline" },
  item_delete: { label: "Item Deleted", variant: "destructive" },
  game_reset_economy: { label: "Economy Reset", variant: "destructive" },
};

export function AdminAuditLogTab() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const logsRef = collection(db, "auditLogs");
      const q = query(logsRef, orderBy("timestamp", "desc"), limit(100));
      const snapshot = await getDocs(q);
      
      const auditLogs: AuditLog[] = [];
      snapshot.forEach((doc) => {
        auditLogs.push({ id: doc.id, ...doc.data() } as AuditLog);
      });

      setLogs(auditLogs);
      console.log(`Loaded ${auditLogs.length} audit logs successfully`);
    } catch (error: any) {
      console.error("Error loading audit logs:", error);
      
      // Check if it's an index error
      if (error.code === 'failed-precondition' && error.message.includes('index')) {
        console.error("INDEX ERROR: You need to create a Firestore index. Check the console for the index creation link.");
        toast({
          title: "Index Required",
          description: "Check the browser console for a link to create the required Firestore index",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to load audit logs",
          description: error.message || "An error occurred while loading the audit logs",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDetails = (log: AuditLog) => {
    const details: string[] = [];

    if (log.metadata?.banReason) {
      details.push(`Reason: ${log.metadata.banReason}`);
    }

    if (log.metadata?.isPermanentBan !== undefined) {
      details.push(log.metadata.isPermanentBan ? "Permanent Ban" : "Temporary Ban");
    }

    if (log.metadata?.banDuration) {
      const days = Math.floor(log.metadata.banDuration / (1000 * 60 * 60 * 24));
      details.push(`Duration: ${days} days`);
    }

    if (log.metadata?.itemsWiped) {
      details.push(`Items Wiped: ${log.metadata.itemsWiped}`);
    }

    if (log.metadata?.itemsGiven && log.metadata.itemsGiven.length > 0) {
      const itemsList = log.metadata.itemsGiven
        .map(item => `${item.itemName} (x${item.quantity})`)
        .join(", ");
      details.push(`Items: ${itemsList}`);
    }

    if (log.metadata?.itemData) {
      const item = log.metadata.itemData;
      details.push(`Item: ${item.itemName}`);
      details.push(`Value: ${item.value.toLocaleString()}`);
      details.push(`Rarity: ${item.rarity}`);
      if (item.stock !== null) {
        details.push(`Stock: ${item.stock}`);
      }
    }

    return details;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Audit Log</h3>
          <p className="text-sm text-muted-foreground">
            Track all administrative actions performed in the system
          </p>
        </div>
        <button
          onClick={loadAuditLogs}
          className="text-sm text-muted-foreground hover:text-foreground"
          data-testid="button-refresh-audit-log"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading audit logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No audit logs found</p>
        </div>
      ) : (
        <ScrollArea className="h-[600px] rounded-lg border">
          <div className="space-y-2 p-4">
            {logs.map((log) => {
              const actionInfo = ACTION_LABELS[log.actionType] || { label: log.actionType, variant: "outline" as const };
              const details = formatDetails(log);

              return (
                <div
                  key={log.id}
                  className="p-4 bg-card rounded-lg border hover:bg-accent/50 transition-colors"
                  data-testid={`audit-log-${log.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={actionInfo.variant} data-testid={`badge-action-${log.actionType}`}>
                          {actionInfo.label}
                        </Badge>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span data-testid={`text-timestamp-${log.id}`}>
                            {format(new Date(log.timestamp), "MMM dd, yyyy 'at' h:mm a")}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span className="font-medium">{log.adminUsername}</span>
                        </div>
                        {log.targetUsername && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <span>→</span>
                            <span>{log.targetUsername}</span>
                          </div>
                        )}
                      </div>

                      {details.length > 0 && (
                        <div className="flex items-start gap-2 text-sm">
                          <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <div className="space-y-0.5">
                            {details.map((detail, idx) => (
                              <div key={idx} className="text-muted-foreground">
                                {detail}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
