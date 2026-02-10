"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { Wrench, Plug, Code, Globe } from "lucide-react"
import { BaseNode } from "./base-node"
import { NodeType, type ToolNodeData, type CodeNodeData, type HttpNodeData } from "@/lib/workflow/types"

const TOOL_ICONS: Record<string, typeof Wrench> = {
  [NodeType.TOOL]: Wrench,
  [NodeType.MCP_TOOL]: Plug,
  [NodeType.CODE]: Code,
  [NodeType.HTTP]: Globe,
}

function ToolNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ToolNodeData | CodeNodeData | HttpNodeData
  const Icon = TOOL_ICONS[nodeData.nodeType] || Wrench

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Icon className="h-3.5 w-3.5" />}
    >
      {nodeData.nodeType === NodeType.HTTP && (
        <span className="inline-block bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
          {(nodeData as HttpNodeData).method}
        </span>
      )}
      {(nodeData.nodeType === NodeType.TOOL || nodeData.nodeType === NodeType.MCP_TOOL) &&
        (nodeData as ToolNodeData).toolName && (
          <p className="truncate">{(nodeData as ToolNodeData).toolName}</p>
        )}
    </BaseNode>
  )
}

export const ToolNode = memo(ToolNodeComponent)
