"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Trash2,
  Play,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { WorkflowTemplateGallery } from "./_components/workflow-template-gallery"
import type { WorkflowTemplate } from "@/lib/templates/workflow-templates"
import { formatDistanceToNow } from "date-fns"

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-600" },
  PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-600" },
  ARCHIVED: { label: "Archived", className: "bg-slate-500/10 text-slate-500" },
}

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
          await updateWorkflow(workflow.id, {
            nodes: template.nodes as unknown as unknown[],
            edges: template.edges as unknown as unknown[],
            trigger: template.trigger as unknown as { type: string },
            variables: template.variables as unknown as {
              inputs: unknown[]
              outputs: unknown[]
            },
          })
          router.push(`/dashboard/workflows/${workflow.id}`)
        }
      } finally {
        setIsCreatingTemplate(false)
      }
    },
    [createWorkflow, updateWorkflow, router]
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deleteWorkflow(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteWorkflow])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pl-14 pr-6 py-4 border-b shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Build visual automation pipelines with drag-and-drop nodes
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Workflow
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Template Gallery */}
        <WorkflowTemplateGallery
          onUseTemplate={handleUseTemplate}
          isCreating={isCreatingTemplate}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <GitBranch className="h-12 w-12 text-muted-foreground/30" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">No workflows yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first workflow to automate tasks with visual pipelines.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Workflow
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((workflow) => {
              const status = STATUS_STYLES[workflow.status] || STATUS_STYLES.DRAFT
              return (
                <div
                  key={workflow.id}
                  className="group border rounded-lg p-4 hover:border-foreground/20 transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/workflows/${workflow.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
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
                        <DropdownMenuSeparator />
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

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", status.className)}>
                      {status.label}
                    </Badge>
                    <span className="flex items-center gap-1">
                      <Play className="h-3 w-3" />
                      {workflow._count.runs} runs
                    </span>
                    <span className="flex items-center gap-1">
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
