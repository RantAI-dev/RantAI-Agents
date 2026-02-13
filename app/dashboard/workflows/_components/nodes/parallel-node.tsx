"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { GitBranch, Merge } from "lucide-react"
import { BaseNode } from "./base-node"
import { NodeType, type ParallelNodeData, type MergeNodeData } from "@/lib/workflow/types"

function ParallelNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ParallelNodeData | MergeNodeData
  const isMerge = nodeData.nodeType === NodeType.MERGE
  const Icon = isMerge ? Merge : GitBranch

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Icon className="h-3.5 w-3.5" />}
    >
      {isMerge && (
        <span className="inline-block bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
          {(nodeData as MergeNodeData).mergeStrategy}
        </span>
      )}
    </BaseNode>
  )
}

export const ParallelNode = memo(ParallelNodeComponent)
