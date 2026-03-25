import { executeCommunityTool, getCommunityTool } from "@/lib/skills/gateway"
import { getBuiltinTool } from "@/lib/tools/builtin"
import { findRuntimeEmployeeToolContext } from "./repository"
import type { RuntimeToolExecuteInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Executes a tool on behalf of a runtime employee after verifying the binding exists.
 */
export async function executeRuntimeTool(
  employeeId: string,
  input: RuntimeToolExecuteInput
): Promise<{ result: unknown } | ServiceError> {
  if (!isNonEmptyString(input.toolName)) {
    return { status: 400, error: "toolName is required" }
  }

  const employee = await findRuntimeEmployeeToolContext(employeeId)
  if (!employee?.assistant) {
    return { status: 404, error: "Employee not found" }
  }

  const enabledTool = employee.assistant.tools.find(
    (tool) => tool.tool.name === input.toolName
  )
  if (!enabledTool) {
    return {
      status: 403,
      error: `Tool "${input.toolName}" is not enabled for this employee`,
    }
  }

  const context = {
    organizationId: employee.organizationId ?? undefined,
    assistantId: employee.assistantId ?? undefined,
  }
  const toolInput = (input.input || {}) as Record<string, unknown>

  const builtin = getBuiltinTool(input.toolName)
  if (builtin) {
    const result = await builtin.execute(toolInput, context)
    return { result }
  }

  const communityTool = await getCommunityTool(input.toolName)
  if (communityTool) {
    const result = await executeCommunityTool(input.toolName, toolInput, {
      organizationId: context.organizationId,
    })
    return { result }
  }

  return {
    status: 404,
    error: `Tool "${input.toolName}" not found in platform registry`,
  }
}
