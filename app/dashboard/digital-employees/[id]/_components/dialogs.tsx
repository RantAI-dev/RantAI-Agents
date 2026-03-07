"use client"

import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { Check, Loader2, Trash2, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { cn } from "@/lib/utils"
import type { DeployProgressEvent } from "@/hooks/use-digital-employee"

// ─── Create Tool Dialog ─────────────────────────────────────

interface CreateToolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateTool: (input: { name: string; description?: string; code: string }) => Promise<void>
}

export function CreateToolDialog({ open, onOpenChange, onCreateTool }: CreateToolDialogProps) {
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [code, setCode] = useState("")

  const handleCreate = useCallback(async () => {
    await onCreateTool({ name, description: desc || undefined, code })
    setName("")
    setDesc("")
    setCode("")
  }, [name, desc, code, onCreateTool])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Custom Tool</DialogTitle>
          <DialogDescription>
            Define a new tool for this digital employee.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tool-name">Name</Label>
            <Input
              id="tool-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_tool"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tool-desc">Description (optional)</Label>
            <Input
              id="tool-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What does this tool do?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tool-code">Code</Label>
            <Textarea
              id="tool-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="// Tool implementation..."
              className="font-mono text-sm"
              rows={8}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || !code.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Archive Confirm ─────────────────────────────────────

interface ArchiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeName: string
  onArchive: () => void
}

export function ArchiveDialog({ open, onOpenChange, employeeName, onArchive }: ArchiveDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive Employee?</AlertDialogTitle>
          <AlertDialogDescription>
            This will archive &quot;{employeeName}&quot; and stop all running tasks.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onArchive}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Delete Confirm ─────────────────────────────────────

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeName: string
  onDelete: () => void
  isDeleting: boolean
}

export function DeleteDialog({ open, onOpenChange, employeeName, onDelete, isDeleting }: DeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Employee Permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete &quot;{employeeName}&quot; and all associated data.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1.5" />
            )}
            Delete Permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Deploy Progress Dialog ─────────────────────────────────

interface DeployProgressDialogProps {
  isDeploying: boolean
  deployProgress: DeployProgressEvent | null
  deployStepMessages: Record<number, string>
}

export function DeployProgressDialog({ isDeploying, deployProgress, deployStepMessages }: DeployProgressDialogProps) {
  return (
    <Dialog open={isDeploying} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {deployProgress?.status === "completed" ? (
              <Check className="h-5 w-5 text-emerald-500" />
            ) : deployProgress?.status === "error" ? (
              <X className="h-5 w-5 text-red-500" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
            {deployProgress?.status === "completed"
              ? "Deployment Complete"
              : deployProgress?.status === "error"
                ? "Deployment Failed"
                : "Deploying Employee..."}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  deployProgress?.status === "completed"
                    ? "bg-emerald-500"
                    : deployProgress?.status === "error"
                      ? "bg-red-500"
                      : "bg-primary"
                )}
                initial={{ width: 0 }}
                animate={{
                  width: deployProgress
                    ? `${(deployProgress.step / deployProgress.total) * 100}%`
                    : "0%",
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{deployProgress?.message || "Initializing..."}</span>
              {deployProgress && deployProgress.total > 0 && (
                <span>{deployProgress.step}/{deployProgress.total}</span>
              )}
            </div>
          </div>

          {deployProgress && deployProgress.total > 0 && (
            <div className="space-y-1.5">
              {Array.from({ length: deployProgress.total }, (_, i) => {
                const stepNum = i + 1
                const isDone = deployProgress.step > stepNum ||
                  (deployProgress.step === stepNum && deployProgress.status === "completed")
                const isActive = deployProgress.step === stepNum && deployProgress.status === "in_progress"
                const isPending = stepNum > deployProgress.step

                return (
                  <div
                    key={stepNum}
                    className={cn(
                      "flex items-center gap-2.5 text-sm py-1 px-2 rounded transition-colors",
                      isActive && "bg-primary/5"
                    )}
                  >
                    {isDone ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : isActive ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                    )}
                    <span
                      className={cn(
                        isPending && "text-muted-foreground/50",
                        isActive && "text-foreground font-medium",
                        isDone && "text-muted-foreground"
                      )}
                    >
                      {deployStepMessages[stepNum] || (isPending ? `Step ${stepNum}` : deployProgress.message)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
