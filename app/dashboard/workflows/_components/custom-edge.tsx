"use client"

import { memo } from "react"
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react"

function CustomEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  style = {},
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        strokeWidth: selected ? 2.5 : 2,
        stroke: selected ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.5)",
        transition: "stroke 0.2s, stroke-width 0.2s",
        ...style,
      }}
    />
  )
}

export const CustomEdge = memo(CustomEdgeComponent)
