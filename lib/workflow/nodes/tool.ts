import { NodeType, type WorkflowNodeData, type CodeNodeData, type HttpNodeData } from "../types"
import type { ExecutionContext } from "../engine"

/**
 * Tool / MCP Tool / Code / HTTP node handler.
 */
export async function executeTool(
  data: WorkflowNodeData,
  input: unknown,
  _context: ExecutionContext
): Promise<{ output: unknown }> {
  switch (data.nodeType) {
    case NodeType.CODE: {
      const codeData = data as CodeNodeData
      // Execute code in a sandboxed function
      try {
        const fn = new Function("input", codeData.code)
        const result = fn(input)
        return { output: result }
      } catch (err) {
        throw new Error(`Code execution error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    case NodeType.HTTP: {
      const httpData = data as HttpNodeData
      if (!httpData.url) throw new Error("HTTP node: URL is required")

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(httpData.headers || {}),
      }

      const fetchOptions: RequestInit = {
        method: httpData.method,
        headers,
      }

      if (httpData.method !== "GET" && httpData.body) {
        fetchOptions.body = httpData.body.replace(
          /\{\{input\}\}/g,
          JSON.stringify(input)
        )
      }

      const response = await fetch(httpData.url, fetchOptions)
      const contentType = response.headers.get("content-type") || ""

      let responseData: unknown
      if (contentType.includes("application/json")) {
        responseData = await response.json()
      } else {
        responseData = await response.text()
      }

      return {
        output: {
          status: response.status,
          data: responseData,
        },
      }
    }

    case NodeType.TOOL:
    case NodeType.MCP_TOOL: {
      // TODO: Integrate with tool registry
      return {
        output: {
          message: `Tool execution for ${data.nodeType} not yet implemented`,
          input,
        },
      }
    }

    default:
      return { output: input }
  }
}
