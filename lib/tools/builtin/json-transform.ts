import { z } from "zod"
import type { ToolDefinition } from "../types"

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".")
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined
    const match = part.match(/^(.+)\[(\d+)]$/)
    if (match) {
      current = (current as Record<string, unknown>)[match[1]]
      if (Array.isArray(current)) {
        current = current[parseInt(match[2], 10)]
      } else {
        return undefined
      }
    } else {
      current = (current as Record<string, unknown>)[part]
    }
  }
  return current
}

function pickKeys(
  obj: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key]
    }
  }
  return result
}

function flattenObject(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(
        result,
        flattenObject(value as Record<string, unknown>, newKey)
      )
    } else {
      result[newKey] = value
    }
  }
  return result
}

function sortArray(
  arr: unknown[],
  sortBy?: string,
  order: string = "asc"
): unknown[] {
  return [...arr].sort((a, b) => {
    const valA = sortBy ? getByPath(a, sortBy) : a
    const valB = sortBy ? getByPath(b, sortBy) : b

    if (typeof valA === "number" && typeof valB === "number") {
      return order === "desc" ? valB - valA : valA - valB
    }
    const strA = String(valA ?? "")
    const strB = String(valB ?? "")
    return order === "desc"
      ? strB.localeCompare(strA)
      : strA.localeCompare(strB)
  })
}

export const jsonTransformTool: ToolDefinition = {
  name: "json_transform",
  displayName: "JSON Transform",
  description:
    "Query, pick, flatten, or sort JSON data. Use this to extract specific fields, restructure data, or sort arrays from JSON input.",
  category: "builtin",
  parameters: z.object({
    data: z
      .string()
      .describe("JSON string to transform"),
    operation: z
      .enum(["query", "pick", "flatten", "sort"])
      .describe(
        "Operation: 'query' = get value by dot-path, 'pick' = select specific keys, 'flatten' = flatten nested object, 'sort' = sort array"
      ),
    path: z
      .string()
      .optional()
      .describe("Dot-notation path for query operation (e.g. 'user.address.city', 'items[0].name')"),
    keys: z
      .array(z.string())
      .optional()
      .describe("Array of key names for pick operation"),
    sortBy: z
      .string()
      .optional()
      .describe("Dot-path field to sort by (for sort operation on arrays of objects)"),
    order: z
      .enum(["asc", "desc"])
      .optional()
      .default("asc")
      .describe("Sort order: 'asc' or 'desc'"),
  }),
  execute: async (params) => {
    const operation = params.operation as string
    let parsed: unknown

    try {
      parsed = JSON.parse(params.data as string)
    } catch {
      return { success: false, error: "Invalid JSON data" }
    }

    try {
      switch (operation) {
        case "query": {
          if (!params.path) {
            return { success: false, error: "'path' is required for query operation" }
          }
          const result = getByPath(parsed, params.path as string)
          return {
            success: true,
            path: params.path,
            result: result ?? null,
          }
        }

        case "pick": {
          if (!params.keys || !Array.isArray(params.keys)) {
            return { success: false, error: "'keys' array is required for pick operation" }
          }
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return { success: false, error: "Pick operation requires a JSON object (not array)" }
          }
          const result = pickKeys(
            parsed as Record<string, unknown>,
            params.keys as string[]
          )
          return { success: true, result }
        }

        case "flatten": {
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return { success: false, error: "Flatten operation requires a JSON object (not array)" }
          }
          const result = flattenObject(parsed as Record<string, unknown>)
          return { success: true, result }
        }

        case "sort": {
          if (!Array.isArray(parsed)) {
            return { success: false, error: "Sort operation requires a JSON array" }
          }
          const result = sortArray(
            parsed,
            params.sortBy as string | undefined,
            (params.order as string) || "asc"
          )
          return { success: true, result }
        }

        default:
          return { success: false, error: `Unknown operation: ${operation}` }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Transform failed",
      }
    }
  },
}
