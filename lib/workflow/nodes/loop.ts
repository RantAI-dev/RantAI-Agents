import type { WorkflowNodeData, LoopNodeData } from "../types"
import type { ExecutionContext } from "../engine"

/**
 * Loop node handler — iterates over data.
 * For 'foreach': expects input to be an array.
 * For 'dowhile'/'dountil': evaluates condition.
 */
export async function executeLoop(
  data: WorkflowNodeData,
  input: unknown,
  _context: ExecutionContext
): Promise<{ output: unknown; branch?: string }> {
  const loopData = data as LoopNodeData

  switch (loopData.loopType) {
    case "foreach": {
      const items = Array.isArray(input) ? input : [input]
      // Return items to be iterated over by the engine
      // The engine will execute the "loop" branch for each item
      return {
        output: {
          items,
          currentIndex: 0,
          totalItems: items.length,
        },
        branch: "loop",
      }
    }

    case "dowhile":
    case "dountil": {
      const condition = loopData.condition || "false"
      try {
        const fn = new Function("input", `return (${condition})`)
        const result = fn(input)
        const shouldContinue =
          loopData.loopType === "dowhile" ? !!result : !result

        if (shouldContinue) {
          return { output: input, branch: "loop" }
        }
        return { output: input, branch: "done" }
      } catch {
        return { output: input, branch: "done" }
      }
    }

    default:
      return { output: input }
  }
}
