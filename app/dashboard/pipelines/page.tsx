"use client"

import { useState } from "react"
import { Plus, Play, Trash2, Loader2, GitBranch } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import { usePipelines } from "@/hooks/use-pipelines"
import { toast } from "sonner"
import Link from "next/link"

export default function PipelinesPage() {
  const { pipelines, isLoading, createPipeline, deletePipeline, runPipeline } = usePipelines()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      await createPipeline({ name: newName.trim(), description: newDesc.trim() || undefined })
      setShowCreate(false)
      setNewName("")
      setNewDesc("")
      toast.success("Pipeline created")
    } catch {
      toast.error("Failed to create pipeline")
    }
  }

  const handleRun = async (id: string) => {
    try {
      await runPipeline(id)
      toast.success("Pipeline started")
    } catch {
      toast.error("Failed to start pipeline")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deletePipeline(id)
      toast.success("Pipeline deleted")
    } catch {
      toast.error("Failed to delete pipeline")
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <DashboardPageHeader
        title="Pipelines"
        subtitle="Multi-employee handoff workflows"
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="flex justify-end mb-4">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Pipeline
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : pipelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <GitBranch className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">No pipelines yet</p>
            <p className="text-xs mt-1">Create a pipeline to chain work across employees</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pipelines.map((pipeline) => (
              <div
                key={pipeline.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/dashboard/pipelines/${pipeline.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {pipeline.name}
                  </Link>
                  {pipeline.description && (
                    <p className="text-xs text-muted-foreground truncate">{pipeline.description}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {pipeline.steps.length} step{pipeline.steps.length !== 1 ? "s" : ""}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    pipeline.status === "active" ? "text-emerald-500" : "text-muted-foreground"
                  )}
                >
                  {pipeline.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(pipeline.updatedAt), { addSuffix: true })}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRun(pipeline.id)}
                    disabled={pipeline.steps.length === 0}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(pipeline.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Pipeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Pipeline name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
