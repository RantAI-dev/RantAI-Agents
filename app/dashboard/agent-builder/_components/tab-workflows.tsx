"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Search,
  GitBranch,
  Check,
  ExternalLink,
  Play,
  X,
} from "@/lib/icons"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useWorkflows, type WorkflowItem } from "@/hooks/use-workflows"

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-600" },
  PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-600" },
}

const MODE_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  CHATFLOW: "Chatflow",
}

interface TabWorkflowsProps {
  selectedWorkflowIds: string[]
  onToggleWorkflow: (workflowId: string) => void
  isNew?: boolean
}

export function TabWorkflows({
  selectedWorkflowIds,
  onToggleWorkflow,
}: TabWorkflowsProps) {
  const { workflows, isLoading } = useWorkflows()
  const [search, setSearch] = useState("")

  // Only show TASK-category, non-archived workflows
  const availableWorkflows = useMemo(() => {
    return workflows.filter(
      (w) => w.category === "TASK" && w.status !== "ARCHIVED"
    )
  }, [workflows])

  const filteredWorkflows = useMemo(() => {
    let result = [...availableWorkflows]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.description && w.description.toLowerCase().includes(q))
      )
    }

    // Show selected first
    result.sort((a, b) => {
      const aSelected = selectedWorkflowIds.includes(a.id) ? 0 : 1
      const bSelected = selectedWorkflowIds.includes(b.id) ? 0 : 1
      return aSelected - bSelected
    })

    return result
  }, [availableWorkflows, search, selectedWorkflowIds])

  const hasActiveFilters = search.trim().length > 0

  const getNodeCount = (w: WorkflowItem) => {
    return Array.isArray(w.nodes) ? w.nodes.length : 0
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Agent Workflows</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Attach task workflows this agent can execute. Only workflows with the &quot;Task&quot; category are shown.
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search workflows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Workflows list */}
      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading workflows...</p>
        ) : filteredWorkflows.length === 0 ? (
          hasActiveFilters ? (
            <div className="text-center py-8">
              <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No workflows match your search</p>
              <button
                onClick={() => setSearch("")}
                className="mt-2 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors cursor-pointer"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <GitBranch className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No task workflows available</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a workflow with the &quot;Task&quot; category to make it attachable to agents.
              </p>
            </div>
          )
        ) : (
          <>
            {hasActiveFilters && (
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground">{filteredWorkflows.length}</span>
                {" "}of {availableWorkflows.length} workflows
              </p>
            )}
            {filteredWorkflows.map((workflow) => {
              const isSelected = selectedWorkflowIds.includes(workflow.id)
              const statusStyle = STATUS_STYLES[workflow.status]
              const nodeCount = getNodeCount(workflow)

              return (
                <button
                  key={workflow.id}
                  type="button"
                  onClick={() => onToggleWorkflow(workflow.id)}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-lg text-left transition-all w-full border",
                    isSelected
                      ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                      isSelected ? "bg-primary/10" : "bg-muted"
                    )}
                  >
                    <GitBranch
                      className={cn(
                        "h-4 w-4",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{workflow.name}</span>
                      {statusStyle && (
                        <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", statusStyle.className)}>
                          {statusStyle.label}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {MODE_LABELS[workflow.mode] ?? workflow.mode}
                      </Badge>
                    </div>
                    {workflow.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {workflow.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {nodeCount} node{nodeCount !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Play className="h-3 w-3" />
                        {workflow._count.runs} run{workflow._count.runs !== 1 ? "s" : ""}
                      </span>
                      {workflow.trigger?.type && (
                        <span className="capitalize">
                          {workflow.trigger.type.replace(/_/g, " ")} trigger
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 mt-1">
                    <div
                      className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                  </div>
                </button>
              )
            })}
          </>
        )}
      </div>

      {selectedWorkflowIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedWorkflowIds.length} workflow{selectedWorkflowIds.length !== 1 ? "s" : ""} attached
        </p>
      )}

      {/* Link to manage workflows */}
      <Button variant="link" size="sm" className="px-0 text-xs" asChild>
        <Link href="/dashboard/workflows">
          Manage Workflows
          <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </Button>
    </div>
  )
}
