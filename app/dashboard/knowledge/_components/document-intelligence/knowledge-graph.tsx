"use client"

import { memo, useMemo, useCallback, useRef, useEffect, useState } from "react"
import { useTheme } from "next-themes"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"

// Dynamic import to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Loading graph...
    </div>
  ),
})

interface Entity {
  id: string
  name: string
  type: string
  confidence: number
}

interface Relation {
  id: string
  in: string
  out: string
  relation_type: string
  confidence: number
}

interface KnowledgeGraphProps {
  entities: Entity[]
  relations: Relation[]
  loading?: boolean
}

// Entity type colors for the graph - vibrant, distinct colors
const ENTITY_COLORS: Record<string, string> = {
  // Support both uppercase and capitalized type names
  PERSON: "#0ea5e9",      // sky-500
  Person: "#0ea5e9",
  ORG: "#f43f5e",         // rose-500
  Organization: "#f43f5e",
  LOCATION: "#10b981",    // emerald-500
  Location: "#10b981",
  PRODUCT: "#f59e0b",     // amber-500
  Product: "#f59e0b",
  Technology: "#8b5cf6",  // violet-500
  DATE: "#6366f1",        // indigo-500
  Date: "#6366f1",
  Money: "#22c55e",       // green-500
  Email: "#ec4899",       // pink-500
  URL: "#14b8a6",         // teal-500
  Phone: "#f97316",       // orange-500
  EVENT: "#84cc16",       // lime-500
  Event: "#84cc16",
  CONCEPT: "#06b6d4",     // cyan-500
  Concept: "#06b6d4",
  Document: "#d946ef",    // fuchsia-500
  REGULATION: "#9333ea",  // purple-600
  Regulation: "#9333ea",
  OTHER: "#64748b",       // slate-500
  Other: "#64748b",
}

interface GraphNode {
  id: string
  name: string
  type: string
  confidence: number
  degree: number
  x?: number
  y?: number
}

interface GraphLink {
  source: string
  target: string
  type: string
  confidence: number
}

const KnowledgeGraph = memo<KnowledgeGraphProps>(({ entities, relations, loading }) => {
  const graphRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 })
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === "dark"

  // Update dimensions when container resizes
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        setDimensions({ width: width || 400, height: height - 60 || 300 })
      }
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [])

  // Build graph data from entities and relations
  const graphData = useMemo(() => {
    // Create entity ID to entity map
    const entityMap = new Map<string, Entity>()
    entities.forEach((e) => entityMap.set(e.id, e))

    // Calculate node degrees (number of connections)
    const degreeMap = new Map<string, number>()
    relations.forEach((r) => {
      degreeMap.set(r.in, (degreeMap.get(r.in) || 0) + 1)
      degreeMap.set(r.out, (degreeMap.get(r.out) || 0) + 1)
    })

    // Create nodes from entities
    const nodes: GraphNode[] = entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      confidence: e.confidence,
      degree: degreeMap.get(e.id) || 0,
    }))

    // Create links from relations
    const links: GraphLink[] = relations
      .filter((r) => entityMap.has(r.in) && entityMap.has(r.out))
      .map((r) => ({
        source: r.in,
        target: r.out,
        type: r.relation_type,
        confidence: r.confidence,
      }))

    return { nodes, links }
  }, [entities, relations])

  // Get unique entity types for legend
  const entityTypes = useMemo(() => {
    const types = new Set(entities.map((e) => e.type))
    return Array.from(types).sort()
  }, [entities])

  // Custom node painting
  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name
      const fontSize = Math.max(12 / globalScale, 4)
      const nodeSize = Math.max(6 + (node.degree || 0) * 0.8, 6)

      // Draw circle with glow effect
      ctx.beginPath()
      ctx.arc(node.x || 0, node.y || 0, nodeSize, 0, 2 * Math.PI)
      ctx.fillStyle = ENTITY_COLORS[node.type] || ENTITY_COLORS.Other
      ctx.fill()

      // Draw border - white for visibility
      ctx.strokeStyle = isDarkMode ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 1)"
      ctx.lineWidth = 2 / globalScale
      ctx.stroke()

      // Draw label (only if zoomed in enough)
      if (globalScale > 0.5) {
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "top"

        // Text shadow/outline for better readability
        const textY = (node.y || 0) + nodeSize + 3
        ctx.strokeStyle = isDarkMode ? "rgba(0, 0, 0, 0.8)" : "rgba(255, 255, 255, 0.9)"
        ctx.lineWidth = 3 / globalScale
        ctx.strokeText(label, node.x || 0, textY)

        // Text fill - light for dark mode, dark for light mode
        ctx.fillStyle = isDarkMode ? "#f1f5f9" : "#1e293b"
        ctx.fillText(label, node.x || 0, textY)
      }
    },
    [isDarkMode]
  )

  // Custom link painting
  const paintLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const start = link.source
      const end = link.target

      if (!start.x || !start.y || !end.x || !end.y) return

      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      // Better visibility for both modes
      ctx.strokeStyle = isDarkMode ? "rgba(148, 163, 184, 0.6)" : "rgba(100, 116, 139, 0.5)"
      ctx.lineWidth = 1.5 / globalScale
      ctx.stroke()
    },
    [isDarkMode]
  )

  const handleZoomIn = () => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom()
      graphRef.current.zoom(currentZoom * 1.5, 400)
    }
  }

  const handleZoomOut = () => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom()
      graphRef.current.zoom(currentZoom / 1.5, 400)
    }
  }

  const handleZoomToFit = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 50)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading graph...
      </div>
    )
  }

  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">No entities to visualize</p>
        <p className="text-xs mt-1">Upload a document with enhanced processing enabled</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <Button variant="outline" size="sm" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleZoomToFit}>
          <Maximize2 className="h-4 w-4" />
        </Button>

        {/* Legend */}
        <div className="flex items-center gap-1 ml-auto flex-wrap">
          {entityTypes.slice(0, 5).map((type) => (
            <div key={type} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: ENTITY_COLORS[type] || ENTITY_COLORS.Other }}
              />
              <span className="text-xs text-muted-foreground">{type}</span>
            </div>
          ))}
          {entityTypes.length > 5 && (
            <span className="text-xs text-muted-foreground">+{entityTypes.length - 5}</span>
          )}
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 border rounded-lg overflow-hidden bg-muted/20">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeCanvasObject={paintNode}
          linkCanvasObject={paintLink}
          nodePointerAreaPaint={(node: GraphNode, color, ctx) => {
            const nodeSize = 4 + (node.degree || 0) * 0.5
            ctx.beginPath()
            ctx.arc(node.x || 0, node.y || 0, nodeSize + 2, 0, 2 * Math.PI)
            ctx.fillStyle = color
            ctx.fill()
          }}
          onNodeClick={(node: GraphNode) => {
            // Center on clicked node
            if (graphRef.current) {
              graphRef.current.centerAt(node.x, node.y, 500)
              graphRef.current.zoom(2, 500)
            }
          }}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground flex-shrink-0">
        <span>{graphData.nodes.length} nodes</span>
        <span>{graphData.links.length} edges</span>
      </div>
    </div>
  )
})

KnowledgeGraph.displayName = "KnowledgeGraph"

export default KnowledgeGraph
