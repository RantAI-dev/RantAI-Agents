import type { WorkflowNodeData, LoopNodeData } from "../types"
import type { ExecutionContext } from "../engine"
import vm from "vm"

/**
 * Loop node handler — iterates over data.
 * For 'foreach': expects input to be an array.
 * For 'dowhile'/'dountil': evaluates condition in sandbox.
 *
 * Note: The actual iteration is handled by the engine (executeStep),
 * not this handler. This handler returns the items/condition result
 * and the engine does the looping.
 */
export async function executeLoop(
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
): Promise<{ output: unknown; branch?: string }> {
  const loopData = data as LoopNodeData

  switch (loopData.loopType) {
    case "foreach": {
      // Extract items from input using itemsPath if specified
      let items: unknown[]
      if (loopData.itemsPath && typeof input === "object" && input !== null) {
        // Navigate nested path (e.g., "documents" or "data.items")
        const pathParts = loopData.itemsPath.split(".")
        let current: unknown = input
        for (const part of pathParts) {
          current = (current as Record<string, unknown>)?.[part]
        }
        items = Array.isArray(current) ? current : [current]
      } else {
        items = Array.isArray(input) ? input : [input]
      }

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
        const sandbox = {
          input,
          $flow: context.flow,
          JSON, Math, Array, Object, String, Number, Boolean,
        }
        const result = vm.runInNewContext(`(${condition})`, sandbox, { timeout: 5000 })
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
