import type { WorkflowNodeData } from "../types"
import type { ExecutionContext } from "../engine"

/**
 * Trigger node handler — pass through the initial input.
 */
export async function executeTrigger(
  _data: WorkflowNodeData,
  input: unknown,
  _context: ExecutionContext
): Promise<{ output: unknown }> {
  return { output: input }
}
