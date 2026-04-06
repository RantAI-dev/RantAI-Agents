"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, X } from "@/lib/icons"
import { usePendingApprovals } from "@/hooks/use-pending-approvals"

export function GlobalApprovalBanner() {
  const { totalPending, byEmployee } = usePendingApprovals()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || totalPending === 0) return null

  const employeeCount = byEmployee.length
  const message = employeeCount === 1
    ? `${totalPending} approval${totalPending > 1 ? "s" : ""} pending from ${byEmployee[0].name}`
    : `${totalPending} approvals pending across ${employeeCount} employees`

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-chart-4/15 border-b border-chart-4/30 text-sm shrink-0">
      <AlertTriangle className="h-4 w-4 text-chart-4 shrink-0" />
      <span className="flex-1 text-foreground/80">{message}</span>
      <Link
        href="/dashboard/digital-employees"
        className="text-xs font-medium text-chart-4 hover:underline shrink-0"
      >
        View
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="text-foreground/40 hover:text-foreground/60 shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
