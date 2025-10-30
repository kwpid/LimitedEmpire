import { useEffect, useState } from "react";
import { tabManager } from "@/lib/tabManager";
import { AlertTriangle } from "lucide-react";

export function InactiveTabOverlay() {
  const [isInactive, setIsInactive] = useState(false);

  useEffect(() => {
    const checkStatus = () => {
      setIsInactive(tabManager.getStatus() === "inactive");
    };

    checkStatus();

    const unsubscribe = tabManager.onStatusChange((status) => {
      setIsInactive(status === "inactive");
    });

    return unsubscribe;
  }, []);

  if (!isInactive) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center backdrop-blur-sm"
      data-testid="overlay-inactive-tab"
    >
      <div className="max-w-md mx-4 text-center space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <AlertTriangle className="w-24 h-24 text-yellow-500 animate-pulse" />
            <div className="absolute inset-0 bg-yellow-500/20 blur-xl rounded-full" />
          </div>
        </div>
        
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-white" data-testid="text-inactive-title">
            Multiple Tabs Detected
          </h2>
          <p className="text-lg text-gray-300" data-testid="text-inactive-description">
            You have multiple tabs of Limited Empire open. To prevent cheating and ensure fair gameplay, only one tab can be active at a time.
          </p>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <p className="text-yellow-200 font-medium">
              Please close this tab and use your other active tab to continue playing.
            </p>
          </div>
        </div>

        <div className="pt-4 text-sm text-gray-400">
          This tab has been automatically disabled to maintain game integrity.
        </div>
      </div>
    </div>
  );
}
