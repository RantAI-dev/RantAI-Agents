import { NodeType } from "./types"

// ─── Port Types ─────────────────────────────────────────

export type PortType = "any" | "string" | "number" | "object" | "array" | "boolean" | "stream"

export interface NodeIOSpec {
  inputs: PortType[]   // accepted input types (empty = no input)
  outputs: PortType[]  // emitted output types (empty = no output)
}

// ─── Node IO Definitions ────────────────────────────────

export const NODE_IO_TYPES: Record<NodeType, NodeIOSpec> = {
  // Triggers — no input, output any
  [NodeType.TRIGGER_MANUAL]:   { inputs: [],      outputs: ["any"] },
  [NodeType.TRIGGER_WEBHOOK]:  { inputs: [],      outputs: ["object"] },
  [NodeType.TRIGGER_SCHEDULE]: { inputs: [],      outputs: ["any"] },
  [NodeType.TRIGGER_EVENT]:    { inputs: [],      outputs: ["object"] },

  // AI — accept any input, output string/object
  [NodeType.AGENT]:  { inputs: ["any"],    outputs: ["object"] },
  [NodeType.LLM]:    { inputs: ["any"],    outputs: ["object"] },

  // Tools — accept any, output varies
  [NodeType.TOOL]:     { inputs: ["any"],    outputs: ["any"] },
  [NodeType.MCP_TOOL]: { inputs: ["any"],    outputs: ["any"] },
  [NodeType.CODE]:     { inputs: ["any"],    outputs: ["any"] },
  [NodeType.HTTP]:     { inputs: ["any"],    outputs: ["object"] },

  // Flow control
  [NodeType.CONDITION]: { inputs: ["any"],    outputs: ["any"] },
  [NodeType.SWITCH]:    { inputs: ["any"],    outputs: ["any"] },
  [NodeType.LOOP]:      { inputs: ["array", "any"], outputs: ["array"] },
  [NodeType.PARALLEL]:  { inputs: ["any"],    outputs: ["any"] },
  [NodeType.MERGE]:     { inputs: ["any"],    outputs: ["array", "object"] },
  [NodeType.ERROR_HANDLER]: { inputs: ["any"], outputs: ["any"] },
  [NodeType.SUB_WORKFLOW]:  { inputs: ["any"], outputs: ["any"] },

  // Human
  [NodeType.HUMAN_INPUT]: { inputs: ["any"],    outputs: ["any"] },
  [NodeType.APPROVAL]:    { inputs: ["any"],    outputs: ["object"] },
  [NodeType.HANDOFF]:     { inputs: ["any"],    outputs: ["object"] },

  // Data
  [NodeType.TRANSFORM]: { inputs: ["any"],    outputs: ["any"] },
  [NodeType.FILTER]:    { inputs: ["any"],    outputs: ["any"] },
  [NodeType.AGGREGATE]:     { inputs: ["array"],  outputs: ["any"] },
  [NodeType.OUTPUT_PARSER]: { inputs: ["any"],    outputs: ["object", "string"] },

  // Integration
  [NodeType.RAG_SEARCH]: { inputs: ["any"],    outputs: ["object"] },
  [NodeType.DATABASE]:   { inputs: ["any"],    outputs: ["object"] },
  [NodeType.STORAGE]:    { inputs: ["any"],    outputs: ["object"] },

  // Output
  [NodeType.STREAM_OUTPUT]: { inputs: ["any"], outputs: ["stream"] },
}

// ─── Compatibility Check ────────────────────────────────

/**
 * Check if two port types are compatible for connection.
 * "any" is compatible with everything.
 */
function areTypesCompatible(sourceType: PortType, targetType: PortType): boolean {
  if (sourceType === "any" || targetType === "any") return true
  return sourceType === targetType
}

/**
 * Check if a connection from sourceNodeType to targetNodeType is valid.
 * Returns true if at least one source output type is compatible with
 * at least one target input type.
 */
export function isConnectionValid(
  sourceNodeType: NodeType,
  targetNodeType: NodeType
): boolean {
  const sourceSpec = NODE_IO_TYPES[sourceNodeType]
  const targetSpec = NODE_IO_TYPES[targetNodeType]

  if (!sourceSpec || !targetSpec) return true // unknown types: allow

  // Source must have outputs
  if (sourceSpec.outputs.length === 0) return false

  // Target must have inputs
  if (targetSpec.inputs.length === 0) return false

  // Check compatibility
  for (const out of sourceSpec.outputs) {
    for (const inp of targetSpec.inputs) {
      if (areTypesCompatible(out, inp)) return true
    }
  }

  return false
}

/**
 * Check structural rules beyond type compatibility.
 * - Triggers cannot receive connections (no input handle)
 * - STREAM_OUTPUT cannot have outgoing connections
 * - A node cannot connect to itself
 */
export function validateConnection(
  sourceNodeType: NodeType,
  targetNodeType: NodeType,
  sourceId: string,
  targetId: string
): { valid: boolean; reason?: string } {
  // Self-connection
  if (sourceId === targetId) {
    return { valid: false, reason: "Cannot connect a node to itself" }
  }

  // Triggers have no input
  const triggerTypes: NodeType[] = [
    NodeType.TRIGGER_MANUAL,
    NodeType.TRIGGER_WEBHOOK,
    NodeType.TRIGGER_SCHEDULE,
    NodeType.TRIGGER_EVENT,
  ]

  if (triggerTypes.includes(targetNodeType)) {
    return { valid: false, reason: "Trigger nodes cannot receive connections" }
  }

  // Stream output has no successors
  if (sourceNodeType === NodeType.STREAM_OUTPUT) {
    return { valid: false, reason: "Stream Output is a terminal node" }
  }

  // Type compatibility
  if (!isConnectionValid(sourceNodeType, targetNodeType)) {
    return { valid: false, reason: "Incompatible node types" }
  }

  return { valid: true }
}
