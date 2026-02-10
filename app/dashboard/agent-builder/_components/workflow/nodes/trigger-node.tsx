"use client"

import { memo } from "react"
import type { NodeProps } from "@xyflow/react"
import { Zap, Webhook, Clock, Radio } from "lucide-react"
import { BaseNode } from "./base-node"
import { NodeType, type TriggerNodeData } from "@/lib/workflow/types"

const TRIGGER_ICONS: Record<string, typeof Zap> = {
  [NodeType.TRIGGER_MANUAL]: Zap,
  [NodeType.TRIGGER_WEBHOOK]: Webhook,
  [NodeType.TRIGGER_SCHEDULE]: Clock,
  [NodeType.TRIGGER_EVENT]: Radio,
}

function TriggerNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData
  const Icon = TRIGGER_ICONS[nodeData.nodeType] || Zap

  return (
    <BaseNode
      id={id}
      data={nodeData}
      selected={!!selected}
      icon={<Icon className="h-3.5 w-3.5" />}
      hasInput={false}
      hasOutput={true}
    >
      {nodeData.config?.schedule && (
        <p className="truncate">Cron: {nodeData.config.schedule}</p>
      )}
      {nodeData.config?.webhookPath && (
        <p className="truncate">Path: {nodeData.config.webhookPath}</p>
      )}
      {nodeData.config?.eventName && (
        <p className="truncate">Event: {nodeData.config.eventName}</p>
      )}
    </BaseNode>
  )
}

export const TriggerNode = memo(TriggerNodeComponent)
