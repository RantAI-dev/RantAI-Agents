"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { Shuffle, Filter, Layers, Braces } from "lucide-react"
import { BaseNode } from "./base-node"
import {
  NodeType,
  type TransformNodeData,
  type FilterNodeData,
  type AggregateNodeData,
  type OutputParserNodeData,
} from "@/lib/workflow/types"

const DATA_ICONS: Record<string, typeof Shuffle> = {
  [NodeType.TRANSFORM]: Shuffle,
  [NodeType.FILTER]: Filter,
  [NodeType.AGGREGATE]: Layers,
  [NodeType.OUTPUT_PARSER]: Braces,
}

function DataNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as TransformNodeData | FilterNodeData | AggregateNodeData | OutputParserNodeData
  const Icon = DATA_ICONS[nodeData.nodeType] || Shuffle

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Icon className="h-3.5 w-3.5" />}
    >
      {nodeData.nodeType === NodeType.TRANSFORM && (nodeData as TransformNodeData).expression && (
        <p className="truncate font-mono text-[10px] text-muted-foreground/70">
          {(nodeData as TransformNodeData).expression}
        </p>
      )}
      {nodeData.nodeType === NodeType.FILTER && (nodeData as FilterNodeData).condition && (
        <p className="truncate font-mono text-[10px] text-muted-foreground/70">
          {(nodeData as FilterNodeData).condition}
        </p>
      )}
      {nodeData.nodeType === NodeType.AGGREGATE && (
        <span className="inline-block bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
          {(nodeData as AggregateNodeData).operation}
        </span>
      )}
      {nodeData.nodeType === NodeType.OUTPUT_PARSER && (nodeData as OutputParserNodeData).strict && (
        <span className="inline-block bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
          strict
        </span>
      )}
    </BaseNode>
  )
}

export const DataNode = memo(DataNodeComponent)
