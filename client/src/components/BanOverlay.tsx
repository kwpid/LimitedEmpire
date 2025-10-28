import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ban, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function BanOverlay() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) {
      setShow(false);
      return;
    }

    if (user.isBanned) {
      if (user.isPermanentBan) {
        setShow(true);
      } else if (user.banExpiresAt) {
        const isExpired = Date.now() >= user.banExpiresAt;
        setShow(!isExpired);
      } else {
        setShow(true);
      }
    } else {
      setShow(false);
    }
  }, [user]);

  if (!show || !user?.isBanned) {
    return null;
  }

  const banExpiryText = user.banExpiresAt && !user.isPermanentBan
    ? formatDistanceToNow(new Date(user.banExpiresAt), { addSuffix: true })
    : null;

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="overlay-ban"
    >
      <Card className="max-w-lg w-full border-destructive">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-destructive/10 rounded-full">
              <Ban className="w-16 h-16 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-3xl flex items-center justify-center gap-2">
            Account {user.isPermanentBan ? "Permanently " : ""}Banned
          </CardTitle>
          <CardDescription className="text-lg">
            You cannot access the game at this time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Username</p>
                <p className="font-semibold" data-testid="text-username">{user.username}</p>
              </div>
              <Badge variant="destructive" className="ml-2" data-testid="badge-ban-type">
                {user.isPermanentBan ? "Permanent" : "Temporary"}
              </Badge>
            </div>

            {banExpiryText && (
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Ban Expires</p>
                  <p className="font-semibold" data-testid="text-ban-expiry">{banExpiryText}</p>
                </div>
              </div>
            )}

            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm font-medium text-muted-foreground mb-2">Reason</p>
              <p className="text-foreground" data-testid="text-ban-reason">
                {user.banReason || "No reason provided"}
              </p>
            </div>

            {user.isPermanentBan && (
              <div className="p-4 bg-destructive/20 border border-destructive rounded-lg">
                <p className="text-sm font-semibold text-destructive">
                  This is a permanent ban. Your inventory has been wiped and transferred to the Admin account.
                </p>
              </div>
            )}
          </div>

          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
            <p>If you believe this ban was issued in error, please contact an administrator.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
