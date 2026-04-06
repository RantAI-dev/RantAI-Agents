import dagre from "dagre"
import type { Node, Edge } from "@xyflow/react"

const NODE_WIDTH = 220
const NODE_HEIGHT = 80

export type LayoutDirection = "TB" | "LR"

/**
 * Auto-layout workflow nodes using dagre's directed graph algorithm.
 * Returns new nodes array with updated positions (does not mutate originals).
 */
export function autoLayout<T extends Record<string, unknown> = Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  direction: LayoutDirection = "TB"
): Node<T>[] {
  if (nodes.length === 0) return nodes

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  })

  // Add nodes
  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  // Add edges
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  // Map positions back, centering nodes on dagre's center coordinates
  return nodes.map((node) => {
    const pos = g.node(node.id)
    if (!pos) return node
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    }
  })
}
