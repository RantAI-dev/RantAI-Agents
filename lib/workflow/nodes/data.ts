import {
  NodeType,
  type WorkflowNodeData,
  type TransformNodeData,
  type FilterNodeData,
  type AggregateNodeData,
} from "../types"
import type { ExecutionContext } from "../engine"

/**
 * Data node handler — transform, filter, aggregate, parallel pass-through, merge.
 */
export async function executeData(
  data: WorkflowNodeData,
  input: unknown,
  _context: ExecutionContext
): Promise<{ output: unknown }> {
  switch (data.nodeType) {
    case NodeType.TRANSFORM: {
      const transformData = data as TransformNodeData
      try {
        const fn = new Function("input", transformData.expression)
        const result = fn(input)
        return { output: result }
      } catch (err) {
        throw new Error(`Transform error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    case NodeType.FILTER: {
      const filterData = data as FilterNodeData
      try {
        const fn = new Function("input", filterData.condition)
        const result = fn(input)
        if (result) {
          return { output: input }
        }
        return { output: null }
      } catch (err) {
        throw new Error(`Filter error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    case NodeType.AGGREGATE: {
      const aggData = data as AggregateNodeData
      if (!Array.isArray(input)) {
        return { output: input }
      }

      switch (aggData.operation) {
        case "concat":
          return { output: input.flat() }
        case "sum":
          return { output: input.reduce((a: number, b: number) => a + b, 0) }
        case "count":
          return { output: input.length }
        case "merge":
          return { output: Object.assign({}, ...input) }
        case "custom": {
          if (!aggData.expression) return { output: input }
          try {
            const fn = new Function("input", aggData.expression)
            return { output: fn(input) }
          } catch (err) {
            throw new Error(`Aggregate error: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        default:
          return { output: input }
      }
    }

    // Parallel and Merge nodes just pass through
    case NodeType.PARALLEL:
    case NodeType.MERGE:
      return { output: input }

    default:
      return { output: input }
  }
}
