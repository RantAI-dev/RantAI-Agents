import type { StepLogEntry } from "./types"

// ─── FlowState ──────────────────────────────────────────
// Shared runtime context during a single workflow execution.
// Analogous to $flow.state in Flowise.

export interface FlowState {
  /** Shared mutable state — any node can read/write.
   *  Access via $flow.state.key in templates. */
  state: Record<string, unknown>

  /** Output of each executed node, indexed by nodeId.
   *  Immutable after node completes. */
  nodeOutputs: Record<string, unknown>

  /** Workflow input variables (from trigger/manual input + defaults).
   *  Access via $variables.name in templates. */
  variables: Record<string, unknown>

  /** Original workflow input (read-only).
   *  Used by downstream nodes (e.g. RAG, STREAM_OUTPUT) to access
   *  the user's original message regardless of intermediate processing. */
  input: Record<string, unknown>

  /** Execution metadata (read-only). */
  meta: {
    workflowId: string
    runId: string
    startedAt: string
    triggerType: string
  }
}

export function createFlowState(
  workflowId: string,
  runId: string,
  input: Record<string, unknown>,
  triggerType: string
): FlowState {
  return {
    state: {},
    nodeOutputs: {},
    variables: { ...input },
    input: { ...input },
    meta: {
      workflowId,
      runId,
      startedAt: new Date().toISOString(),
      triggerType,
    },
  }
}

/**
 * Resolve a dot-notation reference against FlowState.
 *
 * Examples:
 *   "customerLookup_1.output.email" → flow.nodeOutputs["customerLookup_1"].email
 *   "$flow.state.classification"    → flow.state.classification
 *   "$variables.maxRetries"         → flow.variables.maxRetries
 *   "$meta.runId"                   → flow.meta.runId
 */
export function resolveReference(path: string, flow: FlowState): unknown {
  const parts = path.split(".")

  // $flow.state.key
  if (parts[0] === "$flow" && parts[1] === "state") {
    return getNestedValue(flow.state, parts.slice(2))
  }

  // $variables.key
  if (parts[0] === "$variables") {
    return getNestedValue(flow.variables, parts.slice(1))
  }

  // $meta.key
  if (parts[0] === "$meta") {
    return getNestedValue(flow.meta as Record<string, unknown>, parts.slice(1))
  }

  // nodeId.output.field — "output" is optional sugar
  const nodeId = parts[0]
  const output = flow.nodeOutputs[nodeId]
  if (output === undefined) return undefined

  const rest = parts[1] === "output" ? parts.slice(2) : parts.slice(1)
  if (rest.length === 0) return output
  return getNestedValue(output as Record<string, unknown>, rest)
}

/** Set a value on $flow.state */
export function setFlowState(key: string, value: unknown, flow: FlowState): void {
  flow.state[key] = value
}

/**
 * Rebuild FlowState from existing step logs (for resume).
 * Reconstructs nodeOutputs from completed step logs.
 */
export function rebuildFlowState(
  workflowId: string,
  runId: string,
  input: Record<string, unknown>,
  stepLogs: StepLogEntry[],
  triggerType: string = "manual"
): FlowState {
  const flow = createFlowState(workflowId, runId, input, triggerType)

  for (const step of stepLogs) {
    if (step.status === "success" && step.output !== null && step.output !== undefined) {
      flow.nodeOutputs[step.nodeId] = step.output
    }
  }

  return flow
}

// ─── Helpers ────────────────────────────────────────────

function getNestedValue(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}
