"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { UserCheck, HandHelping, ArrowRightLeft } from "lucide-react"
import { BaseNode } from "./base-node"
import { NodeType, type HumanInputNodeData } from "@/lib/workflow/types"

const HUMAN_ICONS: Record<string, typeof UserCheck> = {
  [NodeType.HUMAN_INPUT]: UserCheck,
  [NodeType.APPROVAL]: HandHelping,
  [NodeType.HANDOFF]: ArrowRightLeft,
}

function HumanNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as HumanInputNodeData
  const Icon = HUMAN_ICONS[nodeData.nodeType] || UserCheck

  const outputHandles =
    nodeData.nodeType === NodeType.APPROVAL
      ? [
          { id: "approved", label: "Approved" },
          { id: "rejected", label: "Rejected" },
        ]
      : undefined

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Icon className="h-3.5 w-3.5" />}
      outputHandles={outputHandles}
    >
      {nodeData.prompt && (
        <p className="truncate">{nodeData.prompt}</p>
      )}
      {nodeData.assignTo && (
        <p className="truncate text-muted-foreground/60">
          Assign: {nodeData.assignTo}
        </p>
      )}
    </BaseNode>
  )
}

export const HumanNode = memo(HumanNodeComponent)
