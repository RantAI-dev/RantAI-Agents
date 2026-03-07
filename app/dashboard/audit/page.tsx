"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { Search, Shield, Clock, Loader2, ChevronDown, Eye } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { BlurText } from "@/components/reactbits/blur-text"
import { useAuditLogs, type AuditLogItem } from "@/hooks/use-audit-logs"
import { formatDistanceToNow } from "date-fns"

const RISK_LEVELS = [
  { value: undefined, label: "All" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const

const RISK_BADGE_STYLES: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/10 text-amber-500",
  high: "bg-red-500/10 text-red-500",
  critical: "bg-purple-500/10 text-purple-500",
}

const ACTION_GROUPS = [
  { value: undefined, label: "All Actions" },
  { value: "tool.execute", label: "Tool Execute" },
  { value: "approval.respond", label: "Approval" },
  { value: "credential.access", label: "Credential Access" },
  { value: "credential.store", label: "Credential Store" },
  { value: "message.send", label: "Message Send" },
  { value: "employee.create", label: "Employee Create" },
  { value: "employee.update", label: "Employee Update" },
  { value: "employee.delete", label: "Employee Delete" },
  { value: "employee.deploy", label: "Employee Deploy" },
  { value: "run.start", label: "Run Start" },
  { value: "run.complete", label: "Run Complete" },
  { value: "run.fail", label: "Run Fail" },
  { value: "integration.connect", label: "Integration Connect" },
  { value: "integration.disconnect", label: "Integration Disconnect" },
] as const

export default function AuditPage() {
  const [riskFilter, setRiskFilter] = useState<string | undefined>(undefined)
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showActionDropdown, setShowActionDropdown] = useState(false)

  const { logs, isLoading, hasMore, loadMore } = useAuditLogs({
    riskLevel: riskFilter,
    action: actionFilter,
  })

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return logs
    const q = searchQuery.toLowerCase()
    return logs.filter(
      (log) =>
        log.action.toLowerCase().includes(q) ||
        log.resource.toLowerCase().includes(q) ||
        (log.employeeId && log.employeeId.toLowerCase().includes(q))
    )
  }, [logs, searchQuery])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <motion.div
        className="px-6 pt-6 pb-4 space-y-1"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        <BlurText
          text="Audit Log"
          className="text-3xl font-bold tracking-tight"
          delay={40}
        />
        <p className="text-sm text-muted-foreground">
          Track all actions performed by employees and users across your organization
        </p>
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        className="px-6 pb-4 flex items-center gap-3 flex-wrap"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 24 }}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actions, resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Risk Level Filters */}
        <div className="flex items-center gap-1">
          {RISK_LEVELS.map((rl) => (
            <Button
              key={rl.label}
              variant={riskFilter === rl.value ? "secondary" : "ghost"}
              size="sm"
              className="h-8 text-xs px-2.5"
              onClick={() => setRiskFilter(rl.value)}
            >
              {rl.value && (
                <span
                  className={cn(
                    "inline-block w-2 h-2 rounded-full mr-1.5",
                    rl.value === "low" && "bg-muted-foreground",
                    rl.value === "medium" && "bg-amber-500",
                    rl.value === "high" && "bg-red-500",
                    rl.value === "critical" && "bg-purple-500"
                  )}
                />
              )}
              {rl.label}
            </Button>
          ))}
        </div>

        {/* Action Type Selector */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setShowActionDropdown(!showActionDropdown)}
          >
            {ACTION_GROUPS.find((a) => a.value === actionFilter)?.label || "All Actions"}
            <ChevronDown className="h-3 w-3" />
          </Button>
          {showActionDropdown && (
            <div className="absolute top-full mt-1 right-0 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[180px] max-h-[300px] overflow-y-auto">
              {ACTION_GROUPS.map((ag) => (
                <button
                  key={ag.label}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                    actionFilter === ag.value && "bg-accent font-medium"
                  )}
                  onClick={() => {
                    setActionFilter(ag.value)
                    setShowActionDropdown(false)
                  }}
                >
                  {ag.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, type: "spring", stiffness: 260, damping: 24 }}
        >
          {isLoading && filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-3 mb-4">
                <Shield className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium mb-1">No audit entries found</h3>
              <p className="text-sm text-muted-foreground">
                Audit entries will appear here as actions are performed
              </p>
            </div>
          ) : (
            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 inline mr-1.5" />
                      Time
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                      Employee
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                      Action
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                      Resource
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                      Risk
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <AuditRow
                      key={log.id}
                      log={log}
                      isExpanded={expandedId === log.id}
                      onToggle={() =>
                        setExpandedId(expandedId === log.id ? null : log.id)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={isLoading}
                className="text-xs"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}

function AuditRow({
  log,
  isExpanded,
  onToggle,
}: {
  log: AuditLogItem
  isExpanded: boolean
  onToggle: () => void
}) {
  const hasDetail =
    log.detail && typeof log.detail === "object" && Object.keys(log.detail).length > 0

  return (
    <>
      <tr className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
        </td>
        <td className="px-4 py-3 text-xs">
          {log.employeeId ? (
            <span className="font-mono text-muted-foreground">
              {log.employeeId.slice(0, 8)}...
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
        <td className="px-4 py-3">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 font-mono">
            {log.action}
          </Badge>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground font-mono max-w-[200px] truncate">
          {log.resource}
        </td>
        <td className="px-4 py-3">
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] px-1.5 py-0.5 capitalize",
              RISK_BADGE_STYLES[log.riskLevel] || RISK_BADGE_STYLES.low
            )}
          >
            {log.riskLevel}
          </Badge>
        </td>
        <td className="px-4 py-3">
          {hasDetail ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={onToggle}
            >
              <Eye className="h-3 w-3 mr-1" />
              {isExpanded ? "Hide" : "View"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </td>
      </tr>
      {isExpanded && hasDetail && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="px-4 py-3">
            <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-[200px] overflow-auto">
              {JSON.stringify(log.detail, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}
