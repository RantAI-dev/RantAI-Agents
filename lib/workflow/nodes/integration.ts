import { NodeType, type WorkflowNodeData, type RagSearchNodeData } from "../types"
import type { ExecutionContext } from "../engine"

/**
 * Integration node handler — RAG search, database, storage.
 */
export async function executeIntegration(
  data: WorkflowNodeData,
  input: unknown,
  _context: ExecutionContext
): Promise<{ output: unknown }> {
  switch (data.nodeType) {
    case NodeType.RAG_SEARCH: {
      const ragData = data as RagSearchNodeData
      const query =
        ragData.queryTemplate?.replace("{{input}}", JSON.stringify(input)) ||
        (typeof input === "string" ? input : JSON.stringify(input))

      // TODO: Integrate with actual RAG/smartRetrieve
      return {
        output: {
          query,
          topK: ragData.topK || 5,
          results: [],
          message: "RAG search integration pending",
        },
      }
    }

    case NodeType.DATABASE: {
      // TODO: Integrate with database operations
      return {
        output: {
          message: "Database node not yet implemented",
          input,
        },
      }
    }

    case NodeType.STORAGE: {
      // TODO: Integrate with storage operations
      return {
        output: {
          message: "Storage node not yet implemented",
          input,
        },
      }
    }

    default:
      return { output: input }
  }
}
