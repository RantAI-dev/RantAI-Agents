"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { Workflow } from "lucide-react"
import { BaseNode } from "./base-node"
import type { SubWorkflowNodeData } from "@/lib/workflow/types"

function SubWorkflowNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as SubWorkflowNodeData

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Workflow className="h-3.5 w-3.5" />}
    >
      {nodeData.workflowName ? (
        <span className="inline-block bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-medium truncate max-w-full">
          {nodeData.workflowName}
        </span>
      ) : (
        <p className="text-[10px] text-muted-foreground/50 italic">No workflow selected</p>
      )}
    </BaseNode>
  )
}

export const SubWorkflowNode = memo(SubWorkflowNodeComponent)
