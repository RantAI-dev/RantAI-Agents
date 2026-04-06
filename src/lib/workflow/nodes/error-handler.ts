import type { WorkflowNodeData, ErrorHandlerNodeData } from "../types"
import type { ExecutionContext } from "../engine"

/**
 * ERROR_HANDLER node handler — passes input through.
 *
 * The actual try-catch logic is in the engine's executeStep method,
 * which catches errors from "success" branch children and routes to "error" branch.
 * This handler just passes input through with branch="success" to indicate
 * that the engine should execute the success branch first.
 */
export async function executeErrorHandler(
  data: WorkflowNodeData,
  input: unknown,
  _context: ExecutionContext
): Promise<{ output: unknown; branch?: string }> {
  const nodeData = data as ErrorHandlerNodeData

  return {
    output: {
      input,
      retryCount: nodeData.retryCount ?? 0,
      retryDelay: nodeData.retryDelay ?? 1000,
      fallbackValue: nodeData.fallbackValue,
    },
    branch: "success",
  }
}
