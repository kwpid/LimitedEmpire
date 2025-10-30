import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      let updateInterval: NodeJS.Timeout | null = null;
      
      const handleControllerChange = () => {
        window.location.reload();
      };

      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          setRegistration(reg);

          // Check if there's already a waiting service worker
          if (reg.waiting && navigator.serviceWorker.controller) {
            setShowUpdate(true);
          }

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setShowUpdate(true);
                  dismissedRef.current = false; // Reset dismissed state for new updates
                }
              });
            }
          });

          // Check for updates every 60 seconds
          updateInterval = setInterval(() => {
            reg.update().then(() => {
              // After checking, if there's a waiting worker and it was dismissed, show again
              if (reg.waiting && navigator.serviceWorker.controller && dismissedRef.current) {
                setShowUpdate(true);
                dismissedRef.current = false;
              }
            });
          }, 60000);
        })
        .catch((error) => {
          console.error('Service worker registration failed:', error);
        });

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      // Cleanup function
      return () => {
        if (updateInterval) {
          clearInterval(updateInterval);
        }
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      };
    }
  }, []);

  const handleUpdate = () => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  const handleDismiss = () => {
    setShowUpdate(false);
    dismissedRef.current = true;
  };

  return (
    <AnimatePresence>
      {showUpdate && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
          data-testid="notification-update"
        >
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <div>
                <p className="font-semibold text-sm">New Update Available!</p>
                <p className="text-xs opacity-90">Click to refresh and get the latest features</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleUpdate}
                size="sm"
                className="bg-white text-blue-600 hover:bg-gray-100 font-semibold"
                data-testid="button-refresh-now"
              >
                Refresh
              </Button>
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                data-testid="button-dismiss-update"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
