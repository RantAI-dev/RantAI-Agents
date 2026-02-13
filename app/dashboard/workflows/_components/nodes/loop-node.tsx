"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { Repeat } from "lucide-react"
import { BaseNode } from "./base-node"
import type { LoopNodeData } from "@/lib/workflow/types"

function LoopNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LoopNodeData

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Repeat className="h-3.5 w-3.5" />}
      outputHandles={[
        { id: "loop", label: "Loop Body" },
        { id: "done", label: "Done" },
      ]}
    >
      <span className="inline-block bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-medium">
        {nodeData.loopType}
      </span>
    </BaseNode>
  )
}

export const LoopNode = memo(LoopNodeComponent)
