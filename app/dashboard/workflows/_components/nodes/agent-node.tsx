"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { Bot } from "lucide-react"
import { BaseNode } from "./base-node"
import type { AgentNodeData } from "@/lib/workflow/types"

function AgentNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Bot className="h-3.5 w-3.5" />}
    >
      {nodeData.assistantName ? (
        <div className="flex items-center gap-1.5">
          {nodeData.assistantEmoji && <span>{nodeData.assistantEmoji}</span>}
          <span className="truncate">{nodeData.assistantName}</span>
        </div>
      ) : (
        <p className="text-muted-foreground/60 italic">No agent selected</p>
      )}
    </BaseNode>
  )
}

export const AgentNode = memo(AgentNodeComponent)
