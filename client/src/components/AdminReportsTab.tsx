import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

export function AdminReportsTab() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">User Reports</h3>
        <p className="text-sm text-muted-foreground">
          View and manage user-submitted reports
        </p>
      </div>

      <div className="text-center py-16 text-muted-foreground">
        <AlertCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium mb-2">Reports System Coming Soon</p>
        <p className="text-sm">
          This feature will allow users to report issues and admins to review and take action on them.
        </p>
      </div>
    </div>
  );
}
