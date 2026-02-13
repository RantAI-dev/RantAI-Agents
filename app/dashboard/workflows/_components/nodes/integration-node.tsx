"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { Search, Database, HardDrive } from "lucide-react"
import { BaseNode } from "./base-node"
import {
  NodeType,
  type RagSearchNodeData,
  type DatabaseNodeData,
  type StorageNodeData,
} from "@/lib/workflow/types"

const INT_ICONS: Record<string, typeof Search> = {
  [NodeType.RAG_SEARCH]: Search,
  [NodeType.DATABASE]: Database,
  [NodeType.STORAGE]: HardDrive,
}

function IntegrationNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as RagSearchNodeData | DatabaseNodeData | StorageNodeData
  const Icon = INT_ICONS[nodeData.nodeType] || Search

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Icon className="h-3.5 w-3.5" />}
    >
      {nodeData.nodeType === NodeType.RAG_SEARCH && (
        <div className="flex flex-col gap-0.5">
          <span className="inline-block bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 text-[10px] px-1.5 py-0.5 rounded font-medium w-fit">
            Top-K: {(nodeData as RagSearchNodeData).topK || 5}
          </span>
          {(nodeData as RagSearchNodeData).queryTemplate && (
            <p className="truncate text-[10px] text-muted-foreground/70">{(nodeData as RagSearchNodeData).queryTemplate}</p>
          )}
        </div>
      )}
      {nodeData.nodeType === NodeType.DATABASE && (
        <div className="flex flex-col gap-0.5">
          <span className="inline-block bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 text-[10px] px-1.5 py-0.5 rounded font-medium w-fit">
            {(nodeData as DatabaseNodeData).operation}
          </span>
          {(nodeData as DatabaseNodeData).query && (
            <p className="truncate font-mono text-[10px] text-muted-foreground/70">{(nodeData as DatabaseNodeData).query}</p>
          )}
        </div>
      )}
      {nodeData.nodeType === NodeType.STORAGE && (
        <span className="inline-block bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
          {(nodeData as StorageNodeData).operation}
        </span>
      )}
    </BaseNode>
  )
}

export const IntegrationNode = memo(IntegrationNodeComponent)
