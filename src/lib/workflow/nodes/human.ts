import type { WorkflowNodeData, HumanInputNodeData } from "../types"
import type { ExecutionContext } from "../engine"

/**
 * Human Input / Approval / Handoff node handler.
 * Suspends the workflow to wait for human interaction.
 */
export async function executeHuman(
  data: WorkflowNodeData,
  input: unknown,
  _context: ExecutionContext
): Promise<{ output: unknown; suspend?: boolean }> {
  const humanData = data as HumanInputNodeData

  // Signal the engine to suspend execution
  return {
    output: {
      prompt: humanData.prompt,
      type: humanData.nodeType,
      assignTo: humanData.assignTo,
      input,
    },
    suspend: true,
  }
}
