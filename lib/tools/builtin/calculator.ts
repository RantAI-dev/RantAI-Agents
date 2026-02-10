import { z } from "zod"
import type { ToolDefinition } from "../types"

// Allowlist of safe tokens for math evaluation
const SAFE_MATH_PATTERN =
  /^[\d\s+\-*/().,%^e]+$|^[\d\s+\-*/().,%^e]*(Math\.(abs|ceil|floor|round|sqrt|pow|min|max|log|log2|log10|sin|cos|tan|PI|E)[\d\s+\-*/().,%^e]*)+$/

function safeEval(expression: string): number {
  // Normalize common patterns
  const normalized = expression
    .replace(/\^/g, "**")
    .replace(/(\d+)%/g, "($1/100)")

  // Validate only safe math operations
  if (!SAFE_MATH_PATTERN.test(normalized) && !/^[\d\s+\-*/().^**%eE]+$/.test(normalized)) {
    throw new Error(
      "Expression contains unsupported characters. Only numbers, operators (+, -, *, /, ^, %), parentheses, and Math.* functions are allowed."
    )
  }

  // Use Function constructor in a restricted way
  const fn = new Function(`"use strict"; return (${normalized})`)
  const result = fn()

  if (typeof result !== "number" || !isFinite(result)) {
    throw new Error("Expression did not evaluate to a finite number")
  }

  return result
}

export const calculatorTool: ToolDefinition = {
  name: "calculator",
  displayName: "Calculator",
  description:
    "Evaluate mathematical expressions. Supports basic arithmetic (+, -, *, /, ^, %), parentheses, and Math functions (sqrt, abs, ceil, floor, round, pow, min, max, log, sin, cos, tan, PI, E).",
  category: "builtin",
  parameters: z.object({
    expression: z
      .string()
      .describe(
        'The mathematical expression to evaluate, e.g. "2 + 3 * 4", "Math.sqrt(16)", "15% * 200"'
      ),
  }),
  execute: async (params) => {
    const expression = params.expression as string
    try {
      const result = safeEval(expression)
      return {
        success: true,
        expression,
        result,
      }
    } catch (err) {
      return {
        success: false,
        expression,
        error: err instanceof Error ? err.message : "Failed to evaluate expression",
      }
    }
  },
}
