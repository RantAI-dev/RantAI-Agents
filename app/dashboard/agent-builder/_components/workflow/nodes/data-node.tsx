"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { Shuffle, Filter, Layers } from "lucide-react"
import { BaseNode } from "./base-node"
import {
  NodeType,
  type TransformNodeData,
  type FilterNodeData,
  type AggregateNodeData,
} from "@/lib/workflow/types"

const DATA_ICONS: Record<string, typeof Shuffle> = {
  [NodeType.TRANSFORM]: Shuffle,
  [NodeType.FILTER]: Filter,
  [NodeType.AGGREGATE]: Layers,
}

function DataNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as TransformNodeData | FilterNodeData | AggregateNodeData
  const Icon = DATA_ICONS[nodeData.nodeType] || Shuffle

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Icon className="h-3.5 w-3.5" />}
    >
      {nodeData.nodeType === NodeType.AGGREGATE && (
        <span className="inline-block bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
          {(nodeData as AggregateNodeData).operation}
        </span>
      )}
    </BaseNode>
  )
}

export const DataNode = memo(DataNodeComponent)
