import { NodeType, type WorkflowNodeData, type ConditionNodeData, type SwitchNodeData } from "../types"
import type { ExecutionContext } from "../engine"

/**
 * Condition / Switch node handler — evaluates conditions to determine branch.
 */
export async function executeCondition(
  data: WorkflowNodeData,
  input: unknown,
  _context: ExecutionContext
): Promise<{ output: unknown; branch?: string }> {
  if (data.nodeType === NodeType.SWITCH) {
    const switchData = data as SwitchNodeData
    const value = evaluateExpression(switchData.switchOn, input)

    for (const c of switchData.cases) {
      if (String(value) === c.value) {
        return { output: input, branch: c.id }
      }
    }

    // Default case
    if (switchData.defaultCase) {
      return { output: input, branch: "default" }
    }

    return { output: input }
  }

  // Condition node
  const condData = data as ConditionNodeData

  for (const condition of condData.conditions) {
    if (condition.expression === "true" || condition.id === "else") continue

    try {
      const result = evaluateExpression(condition.expression, input)
      if (result) {
        return { output: input, branch: condition.id }
      }
    } catch {
      // If expression fails, skip this branch
    }
  }

  // Fall through to else branch
  const elseBranch = condData.conditions.find((c) => c.id === "else")
  if (elseBranch) {
    return { output: input, branch: "else" }
  }

  return { output: input }
}

function evaluateExpression(expression: string, input: unknown): unknown {
  try {
    const fn = new Function("input", `return (${expression})`)
    return fn(input)
  } catch {
    return false
  }
}
