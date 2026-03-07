"use client"

import { Shield, Check, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

interface ApprovalItem {
  id: string
  requestType: string
  title: string
  description: string | null
  content: unknown
  options: unknown
  status: string
  respondedBy: string | null
  response: string | null
  createdAt: string
  respondedAt: string | null
}

interface TabInboxProps {
  pendingApprovals: ApprovalItem[]
  historyApprovals: ApprovalItem[]
  respondToApproval: (
    approvalId: string,
    response: { status: string; response?: string; responseData?: Record<string, unknown> }
  ) => Promise<void>
}

export function TabInbox({ pendingApprovals, historyApprovals, respondToApproval }: TabInboxProps) {
  return (
    <div className="flex-1 overflow-auto p-5 space-y-6">
      {/* Pending */}
      <div>
        <h2 className="text-sm font-medium mb-3">
          Pending ({pendingApprovals.length})
        </h2>
        {pendingApprovals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Shield className="h-8 w-8 mb-3 opacity-30" />
            <p className="text-sm">No pending approvals</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingApprovals.map((approval) => (
              <div
                key={approval.id}
                className="rounded-lg border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-medium">{approval.title}</h4>
                    {approval.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{approval.description}</p>
                    )}
                    <Badge variant="outline" className="text-[10px] mt-1.5">{approval.requestType}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(approval.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      respondToApproval(approval.id, { status: "APPROVED" })
                        .then(() => toast.success("Approved"))
                        .catch(() => toast.error("Failed"))
                    }
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      respondToApproval(approval.id, { status: "REJECTED" })
                        .then(() => toast.success("Rejected"))
                        .catch(() => toast.error("Failed"))
                    }
                  >
                    <X className="h-4 w-4 mr-1.5" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {historyApprovals.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">History</h3>
          <div className="space-y-2">
            {historyApprovals.map((approval) => (
              <div
                key={approval.id}
                className="rounded-lg border bg-card p-3 flex items-center gap-3 text-sm"
              >
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 shrink-0",
                    approval.status === "APPROVED"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-red-500/10 text-red-500"
                  )}
                >
                  {approval.status}
                </Badge>
                <span className="truncate">{approval.title}</span>
                <span className="text-muted-foreground ml-auto text-xs shrink-0">
                  {approval.respondedAt
                    ? formatDistanceToNow(new Date(approval.respondedAt), { addSuffix: true })
                    : "-"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
