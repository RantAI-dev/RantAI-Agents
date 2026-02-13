"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { ShieldAlert } from "lucide-react"
import { BaseNode } from "./base-node"
import type { ErrorHandlerNodeData } from "@/lib/workflow/types"

function ErrorHandlerNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ErrorHandlerNodeData

  const handles = [
    { id: "success", label: "Success" },
    { id: "error", label: "Error" },
  ]

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<ShieldAlert className="h-3.5 w-3.5" />}
      outputHandles={handles}
    >
      <div className="flex flex-wrap gap-1">
        <span className="inline-block bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] px-1.5 py-0.5 rounded">
          Success
        </span>
        <span className="inline-block bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-[10px] px-1.5 py-0.5 rounded">
          Error
        </span>
        {(nodeData.retryCount ?? 0) > 0 && (
          <span className="inline-block bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded">
            {nodeData.retryCount}x retry
          </span>
        )}
      </div>
    </BaseNode>
  )
}

export const ErrorHandlerNode = memo(ErrorHandlerNodeComponent)
