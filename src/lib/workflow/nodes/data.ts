import {
  NodeType,
  type WorkflowNodeData,
  type TransformNodeData,
  type FilterNodeData,
  type AggregateNodeData,
  type MergeNodeData,
  type OutputParserNodeData,
} from "../types"
import type { ExecutionContext } from "../engine"
import vm from "vm"

/**
 * Run user code in a sandbox with timeout.
 */
function runSandboxed(code: string, input: unknown, context: ExecutionContext): unknown {
  const sandbox = {
    input,
    $flow: context.flow,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    undefined,
  }
  const wrappedCode = `(function() { ${code} })()`
  return vm.runInNewContext(wrappedCode, sandbox, { timeout: 5000 })
}

/**
 * Data node handler — transform, filter, aggregate, parallel pass-through, merge.
 */
export async function executeData(
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
): Promise<{ output: unknown }> {
  switch (data.nodeType) {
    case NodeType.TRANSFORM: {
      const transformData = data as TransformNodeData
      try {
        const result = runSandboxed(transformData.expression, input, context)
        return { output: result }
      } catch (err) {
        if (err instanceof Error && err.message.includes("Script execution timed out")) {
          throw new Error("Transform execution timed out (5s limit)")
        }
        throw new Error(`Transform error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    case NodeType.FILTER: {
      const filterData = data as FilterNodeData
      try {
        const result = runSandboxed(filterData.condition, input, context)
        if (result) {
          return { output: input }
        }
        return { output: null }
      } catch (err) {
        if (err instanceof Error && err.message.includes("Script execution timed out")) {
          throw new Error("Filter execution timed out (5s limit)")
        }
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
            const result = runSandboxed(aggData.expression, input, context)
            return { output: result }
          } catch (err) {
            if (err instanceof Error && err.message.includes("Script execution timed out")) {
              throw new Error("Aggregate execution timed out (5s limit)")
            }
            throw new Error(`Aggregate error: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        default:
          return { output: input }
      }
    }

    // Parallel just passes through — actual parallel execution handled by engine
    case NodeType.PARALLEL:
      return { output: input }

    // Merge collects predecessor outputs — engine provides collected input
    case NodeType.MERGE: {
      const mergeData = data as MergeNodeData
      if (!Array.isArray(input)) return { output: input }

      switch (mergeData.mergeStrategy) {
        case "all":
          return { output: input }
        case "first":
          return { output: input[0] }
        case "any":
          return { output: input.find((item: unknown) => item !== null && item !== undefined) ?? null }
        default:
          return { output: input }
      }
    }

    // Output Parser — parse LLM JSON output into structured data (Flowise pattern)
    case NodeType.OUTPUT_PARSER: {
      const parserData = data as OutputParserNodeData

      // Extract text to parse — from input.text (LLM output) or direct string
      let textToParse: string
      if (typeof input === "string") {
        textToParse = input
      } else if (input && typeof input === "object" && typeof (input as Record<string, unknown>).text === "string") {
        textToParse = (input as Record<string, unknown>).text as string
      } else {
        if (parserData.strict) throw new Error("Output Parser: no text field to parse")
        return { output: input }
      }

      // Strip markdown code fences (```json ... ``` or ``` ... ```)
      let jsonCandidate = textToParse.trim()
      const fenceMatch = jsonCandidate.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m)
      if (fenceMatch) jsonCandidate = fenceMatch[1].trim()

      try {
        if (jsonCandidate.startsWith("{") || jsonCandidate.startsWith("[")) {
          const parsed = JSON.parse(jsonCandidate)
          // Object: spread fields + keep clean text for downstream compat
          if (typeof parsed === "object" && !Array.isArray(parsed)) {
            return { output: { ...parsed, text: jsonCandidate } }
          }
          return { output: parsed }
        }
        if (parserData.strict) throw new Error("Output Parser: text is not JSON")
        return { output: input }
      } catch (err) {
        if (parserData.strict) {
          throw new Error(`Output Parser: ${err instanceof Error ? err.message : String(err)}`)
        }
        return { output: input }
      }
    }

    default:
      return { output: input }
  }
}
