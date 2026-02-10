"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { Sparkles, MessageSquareText } from "lucide-react"
import { BaseNode } from "./base-node"
import { NodeType, type LlmNodeData } from "@/lib/workflow/types"

function LlmNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LlmNodeData
  const Icon = nodeData.nodeType === NodeType.PROMPT ? MessageSquareText : Sparkles

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Icon className="h-3.5 w-3.5" />}
    >
      {nodeData.model && (
        <span className="inline-block bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
          {nodeData.model.split("/").pop()}
        </span>
      )}
    </BaseNode>
  )
}

export const LlmNode = memo(LlmNodeComponent)
