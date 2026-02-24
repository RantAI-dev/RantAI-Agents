"use client"

import { memo, useState, useCallback, type ReactNode } from "react"
import { Handle, Position } from "@xyflow/react"
import { X, StickyNote, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { getNodeHeaderColor, type WorkflowNodeData } from "@/lib/workflow/types"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"

const HANDLE_CLASS = "!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"

interface BaseNodeProps {
  id: string
  data: WorkflowNodeData
  selected: boolean
  icon: ReactNode
  children?: ReactNode
  hasInput?: boolean
  hasOutput?: boolean
  outputHandles?: { id: string; label: string; position?: number }[]
}

function BaseNodeComponent({
  id,
  data,
  selected,
  icon,
  children,
  hasInput = true,
  hasOutput = true,
  outputHandles,
}: BaseNodeProps) {
  const deleteNode = useWorkflowEditor((s) => s.deleteNode)
  const executionStatus = useWorkflowEditor((s) => s.nodeExecutionStatus[id])
  const headerColor = getNodeHeaderColor(data.nodeType)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (confirmDelete) {
        deleteNode(id)
        setConfirmDelete(false)
      } else {
        setConfirmDelete(true)
        // Reset after 2s if not confirmed
        setTimeout(() => setConfirmDelete(false), 2000)
      }
    },
    [confirmDelete, deleteNode, id]
  )

  return (
    <div
      className={cn(
        "relative bg-background rounded-lg shadow-md border-2 w-[240px] transition-all",
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border"
      )}
    >
      {/* Execution status indicator */}
      {executionStatus === "success" && (
        <div className="absolute -top-2.5 -right-2.5 z-10">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 fill-background" />
        </div>
      )}
      {executionStatus === "failed" && (
        <div className="absolute -top-2.5 -right-2.5 z-10">
          <XCircle className="h-5 w-5 text-destructive fill-background" />
        </div>
      )}
      {executionStatus === "suspended" && (
        <div className="absolute -top-2.5 -right-2.5 z-10">
          <AlertCircle className="h-5 w-5 text-amber-500 fill-background" />
        </div>
      )}

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-white text-xs font-medium"
        style={{ backgroundColor: headerColor }}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate flex-1" title={data.label}>{data.label}</span>
        {data.notes && (
          <span className="shrink-0 opacity-70" title={data.notes}>
            <StickyNote className="h-3 w-3" />
          </span>
        )}
        <button
          onClick={handleDelete}
          className={cn(
            "shrink-0 p-0.5 rounded transition-all",
            confirmDelete
              ? "opacity-100 bg-white/30"
              : "opacity-0 group-hover:opacity-100 hover:opacity-100 hover:bg-white/20"
          )}
          style={{ opacity: selected && !confirmDelete ? 1 : undefined }}
          title={confirmDelete ? "Click again to delete" : "Delete node"}
        >
          <X className={cn("h-3 w-3", confirmDelete && "text-red-200")} />
        </button>
      </div>

      {/* Body */}
      {children && (
        <div className="px-3 py-2 text-xs text-muted-foreground">{children}</div>
      )}

      {/* Input handle */}
      {hasInput && (
        <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />
      )}

      {/* Output handles */}
      {outputHandles ? (
        <>
          {outputHandles.map((h, i) => (
            <Handle
              key={h.id}
              type="source"
              position={Position.Bottom}
              id={h.id}
              className={HANDLE_CLASS}
              style={{ left: `${((i + 1) / (outputHandles.length + 1)) * 100}%` }}
            />
          ))}
          <div className="flex justify-around px-1 pb-0.5 -mt-0.5">
            {outputHandles.map((h) => (
              <span key={h.id} className="text-[11px] text-muted-foreground/80 text-center">
                {h.label}
              </span>
            ))}
          </div>
        </>
      ) : hasOutput ? (
        <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} />
      ) : null}
    </div>
  )
}

export const BaseNode = memo(BaseNodeComponent)
