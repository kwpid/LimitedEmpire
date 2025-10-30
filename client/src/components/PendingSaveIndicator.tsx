import { useState, useEffect } from "react";
import { autoSaveManager } from "@/lib/autoSaveManager";
import { Cloud, CloudOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function PendingSaveIndicator() {
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    const checkPending = () => {
      setHasPending(autoSaveManager.hasPendingUpdates());
    };

    // Check every 2 seconds
    const interval = setInterval(checkPending, 2000);
    
    // Initial check
    checkPending();

    return () => clearInterval(interval);
  }, []);

  if (!hasPending) {
    return null;
  }

  return (
    <Badge 
      variant="outline" 
      className="fixed bottom-4 right-4 z-50 bg-background/95 backdrop-blur-sm border-primary/50 shadow-lg"
      data-testid="badge-pending-save"
    >
      <Cloud className="w-3 h-3 mr-1.5 animate-pulse" />
      <span className="text-xs">Saving changes...</span>
    </Badge>
  );
}
