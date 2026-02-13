"use client"

import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Trash2,
  Play,
  Clock,
  Search,
  Copy,
  Download,
  Archive,
  MessageSquare,
  Zap,
  Rocket,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useWorkflows, type WorkflowItem } from "@/hooks/use-workflows"
import { DashboardPageHeader } from "../_components/dashboard-page-header"
import { WorkflowTemplateGallery } from "./_components/workflow-template-gallery"
import type { WorkflowTemplate } from "@/lib/templates/workflow-templates"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-600" },
  PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-600" },
  ARCHIVED: { label: "Archived", className: "bg-slate-500/10 text-slate-500" },
}

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
]

const SORT_OPTIONS = [
  { value: "updated", label: "Last Modified" },
  { value: "created", label: "Created Date" },
  { value: "name", label: "Name A-Z" },
  { value: "runs", label: "Most Runs" },
]

export default function WorkflowsPage() {
  const router = useRouter()
  const {
    workflows,
    isLoading,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
  } = useWorkflows()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<WorkflowItem | null>(null)
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)

  // Search, filter, sort state
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [sortBy, setSortBy] = useState("updated")

  // Filtered and sorted workflows
  const filteredWorkflows = useMemo(() => {
    let result = [...workflows]

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.description && w.description.toLowerCase().includes(q))
      )
    }

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((w) => w.status === statusFilter)
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case "name":
          return a.name.localeCompare(b.name)
        case "runs":
          return b._count.runs - a._count.runs
        default: // updated
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      }
    })

    return result
  }, [workflows, search, statusFilter, sortBy])

  const handleCreate = useCallback(async () => {
    const workflow = await createWorkflow({
      name: newName || "Untitled Workflow",
      description: newDescription || undefined,
    })
    setCreateOpen(false)
    setNewName("")
    setNewDescription("")
    if (workflow) {
      router.push(`/dashboard/workflows/${workflow.id}`)
    }
  }, [newName, newDescription, createWorkflow, router])

  const handleUseTemplate = useCallback(
    async (template: WorkflowTemplate) => {
      setIsCreatingTemplate(true)
      try {
        const workflow = await createWorkflow({
          name: template.name,
          description: template.description,
        })
        if (workflow) {
          // Add visual properties to edges for React Flow
          const enhancedEdges = template.edges.map((edge) => ({
            ...edge,
            animated: true,
            style: { stroke: "#64748b", strokeWidth: 2 },
          }))

          const updated = await updateWorkflow(workflow.id, {
            nodes: template.nodes as unknown as unknown[],
            edges: enhancedEdges as unknown as unknown[],
            trigger: template.trigger as unknown as { type: string },
            variables: template.variables as unknown as {
              inputs: unknown[]
              outputs: unknown[]
            },
            mode: template.mode || "STANDARD",
          } as Partial<WorkflowItem>)

          // Small delay to ensure state is synced before navigation
          await new Promise((resolve) => setTimeout(resolve, 100))
          router.push(`/dashboard/workflows/${workflow.id}`)
        }
      } finally {
        setIsCreatingTemplate(false)
      }
    },
    [createWorkflow, updateWorkflow, router]
  )

  const handleDuplicate = useCallback(
    async (workflow: WorkflowItem) => {
      try {
        const newWorkflow = await createWorkflow({
          name: `${workflow.name} (Copy)`,
          description: workflow.description || undefined,
        })
        if (newWorkflow) {
          await updateWorkflow(newWorkflow.id, {
            nodes: workflow.nodes,
            edges: workflow.edges,
            trigger: workflow.trigger,
            variables: workflow.variables,
          })
          toast.success("Workflow duplicated")
        }
      } catch {
        toast.error("Failed to duplicate workflow")
      }
    },
    [createWorkflow, updateWorkflow]
  )

  const handleExport = useCallback((workflow: WorkflowItem) => {
    const exportData = {
      version: 1,
      name: workflow.name,
      description: workflow.description,
      mode: workflow.mode,
      trigger: workflow.trigger,
      variables: workflow.variables,
      nodes: workflow.nodes,
      edges: workflow.edges,
      metadata: {
        exportedAt: new Date().toISOString(),
        nodeCount: workflow.nodes.length,
      },
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${workflow.name.replace(/\s+/g, "-").toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Workflow exported")
  }, [])

  const handleArchive = useCallback(
    async (workflow: WorkflowItem) => {
      try {
        const newStatus = workflow.status === "ARCHIVED" ? "DRAFT" : "ARCHIVED"
        await updateWorkflow(workflow.id, { status: newStatus } as Partial<WorkflowItem>)
        toast.success(newStatus === "ARCHIVED" ? "Workflow archived" : "Workflow unarchived")
      } catch {
        toast.error("Failed to update workflow")
      }
    },
    [updateWorkflow]
  )

  const handleToggleStatus = useCallback(
    async (workflow: WorkflowItem) => {
      try {
        const newStatus = workflow.status === "ACTIVE" ? "DRAFT" : "ACTIVE"
        await updateWorkflow(workflow.id, { status: newStatus } as Partial<WorkflowItem>)
        toast.success(newStatus === "ACTIVE" ? "Workflow deployed" : "Workflow deactivated")
      } catch {
        toast.error("Failed to update status")
      }
    },
    [updateWorkflow]
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deleteWorkflow(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteWorkflow])

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <DashboardPageHeader title="Workflows" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader
        title="Workflows"
        actions={
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            New Workflow
          </Button>
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Template Gallery */}
        <WorkflowTemplateGallery
          onUseTemplate={handleUseTemplate}
          isCreating={isCreatingTemplate}
        />

        {/* Search & Filter Bar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search workflows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((sf) => (
              <Button
                key={sf.value}
                variant={statusFilter === sf.value ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs px-2.5"
                onClick={() => setStatusFilter(sf.value)}
              >
                {sf.label}
                {sf.value !== "ALL" && (
                  <span className="ml-1 text-muted-foreground">
                    {workflows.filter((w) => w.status === sf.value).length}
                  </span>
                )}
              </Button>
            ))}
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <GitBranch className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium mb-1">No workflows yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Create your first workflow or start from a template above to build visual automation pipelines.
            </p>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Create Workflow
            </Button>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium mb-1">No matching workflows</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your search or filter criteria
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("")
                setStatusFilter("ALL")
              }}
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkflows.map((workflow) => {
              const status = STATUS_STYLES[workflow.status] || STATUS_STYLES.DRAFT
              const nodeCount = workflow.nodes?.length || 0
              return (
                <div
                  key={workflow.id}
                  className="group border rounded-lg p-4 hover:border-foreground/30 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => router.push(`/dashboard/workflows/${workflow.id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                      <h3 className="text-sm font-medium truncate">{workflow.name}</h3>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() => router.push(`/dashboard/workflows/${workflow.id}`)}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Open Editor
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleStatus(workflow)}>
                          <Rocket className="mr-2 h-4 w-4" />
                          {workflow.status === "ACTIVE" ? "Deactivate" : "Deploy"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(workflow)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport(workflow)}>
                          <Download className="mr-2 h-4 w-4" />
                          Export JSON
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleArchive(workflow)}>
                          <Archive className="mr-2 h-4 w-4" />
                          {workflow.status === "ARCHIVED" ? "Unarchive" : "Archive"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(workflow)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {workflow.description && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                      {workflow.description}
                    </p>
                  )}

                  {/* Badges row */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0.5", status.className)}>
                      {status.label}
                    </Badge>
                    {workflow.mode === "CHATFLOW" && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
                        <MessageSquare className="h-2.5 w-2.5 mr-1" />
                        Chatflow
                      </Badge>
                    )}
                    {workflow.apiEnabled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                        <Zap className="h-2.5 w-2.5 mr-1" />
                        API
                      </Badge>
                    )}
                  </div>

                  {/* Footer stats */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{nodeCount} nodes</span>
                    <span className="flex items-center gap-1">
                      <Play className="h-3 w-3" />
                      {workflow._count.runs} runs
                    </span>
                    <span className="flex items-center gap-1 ml-auto">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(workflow.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Workflow</DialogTitle>
            <DialogDescription>
              Create a new workflow to automate tasks with visual pipelines.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="workflow-name">Name</Label>
              <Input
                id="workflow-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Workflow"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workflow-desc">Description (optional)</Label>
              <Textarea
                id="workflow-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.name}&quot; and all its run history.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
