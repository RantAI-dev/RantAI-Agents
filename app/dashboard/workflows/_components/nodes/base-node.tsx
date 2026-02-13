"use client"

import { memo, type ReactNode } from "react"
import { Handle, Position } from "@xyflow/react"
import { X, StickyNote } from "lucide-react"
import { cn } from "@/lib/utils"
import { getNodeHeaderColor, type WorkflowNodeData } from "@/lib/workflow/types"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"

const EXEC_STATUS_BORDER: Record<string, string> = {
  running: "border-blue-500 animate-pulse",
  success: "border-emerald-500",
  failed: "border-destructive",
  suspended: "border-amber-500",
  pending: "border-muted-foreground/40",
}

const EXEC_STATUS_DOT: Record<string, string> = {
  running: "bg-blue-500 animate-pulse",
  success: "bg-emerald-500",
  failed: "bg-destructive",
  suspended: "bg-amber-500",
  pending: "bg-muted-foreground/40",
}

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

/** Format node output for inline preview (1-2 lines max) */
function formatOutputPreview(output: unknown): string | null {
  if (output === null || output === undefined) return null
  if (typeof output === "string") return output
  if (typeof output === "object") {
    const obj = output as Record<string, unknown>
    if (typeof obj.text === "string") return obj.text
    if (typeof obj.message === "string") return obj.message
    if (typeof obj.context === "string") return obj.context
    return JSON.stringify(output)
  }
  return String(output)
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
  const nodeOutput = useWorkflowEditor((s) => s.nodeOutputs[id])
  const headerColor = getNodeHeaderColor(data.nodeType)

  const borderClass = executionStatus
    ? EXEC_STATUS_BORDER[executionStatus]
    : selected
      ? "border-primary"
      : "border-border"

  return (
    <div
      className={cn(
        "relative bg-background rounded-lg shadow-md border-2 w-[220px] transition-colors",
        borderClass
      )}
    >
      {/* Execution status dot */}
      {executionStatus && (
        <div
          className={cn(
            "absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full border-2 border-background z-10",
            EXEC_STATUS_DOT[executionStatus]
          )}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-t-md text-white text-xs font-medium"
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
          onClick={(e) => {
            e.stopPropagation()
            deleteNode(id)
          }}
          className="opacity-0 group-hover:opacity-100 hover:opacity-100 shrink-0 p-0.5 rounded hover:bg-white/20 transition-opacity"
          style={{ opacity: selected ? 1 : undefined }}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Body */}
      {children && (
        <div className="px-3 py-2 text-xs text-muted-foreground">{children}</div>
      )}

      {/* Output preview after execution */}
      {executionStatus === "success" && nodeOutput !== undefined && (() => {
        const preview = formatOutputPreview(nodeOutput)
        if (!preview) return null
        const truncated = preview.length > 80 ? preview.slice(0, 80) + "..." : preview
        return (
          <div className="px-3 pb-2 pt-0.5" title={preview.slice(0, 500)}>
            <div className="text-[10px] font-mono bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 rounded px-1.5 py-1 truncate">
              {truncated}
            </div>
          </div>
        )
      })()}

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
              <span key={h.id} className="text-[10px] text-muted-foreground/80 text-center">
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
