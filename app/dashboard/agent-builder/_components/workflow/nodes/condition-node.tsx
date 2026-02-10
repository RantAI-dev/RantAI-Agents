"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { GitFork, ArrowRightLeft } from "lucide-react"
import { BaseNode } from "./base-node"
import { NodeType, type ConditionNodeData, type SwitchNodeData } from "@/lib/workflow/types"

function ConditionNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ConditionNodeData | SwitchNodeData
  const isSwitch = nodeData.nodeType === NodeType.SWITCH
  const Icon = isSwitch ? ArrowRightLeft : GitFork

  const handles = isSwitch
    ? [
        ...(nodeData as SwitchNodeData).cases.map((c) => ({
          id: c.id,
          label: c.label,
        })),
        ...(nodeData as SwitchNodeData).defaultCase
          ? [{ id: "default", label: "Default" }]
          : [],
      ]
    : (nodeData as ConditionNodeData).conditions.map((c) => ({
        id: c.id,
        label: c.label,
      }))

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Icon className="h-3.5 w-3.5" />}
      outputHandles={handles}
    >
      <div className="flex flex-wrap gap-1">
        {handles.map((h) => (
          <span
            key={h.id}
            className="inline-block bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0.5 rounded"
          >
            {h.label}
          </span>
        ))}
      </div>
    </BaseNode>
  )
}

export const ConditionNode = memo(ConditionNodeComponent)
