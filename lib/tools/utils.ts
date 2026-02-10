import type { z } from "zod"

/**
 * Convert a Zod schema to a JSON Schema-compatible object for database storage.
 * Stores enough information to describe the tool's parameters.
 */
export function zodToJsonSchema(schema: z.ZodSchema): object {
  // Use zod's built-in JSON schema generation if available,
  // otherwise store a simplified representation
  if ("_def" in schema && schema._def) {
    const def = schema._def as Record<string, unknown>
    if (def.typeName === "ZodObject") {
      const shape = (def as { shape: () => Record<string, z.ZodSchema> }).shape()
      const properties: Record<string, object> = {}
      const required: string[] = []

      for (const [key, fieldSchema] of Object.entries(shape)) {
        const fieldDef = (fieldSchema as { _def: Record<string, unknown> })._def
        const isOptional = fieldDef.typeName === "ZodOptional" || fieldDef.typeName === "ZodDefault"

        if (!isOptional) {
          required.push(key)
        }

        properties[key] = {
          type: getZodTypeName(fieldSchema),
          description: fieldDef.description || (fieldDef.innerType as { _def?: { description?: string } })?._def?.description || undefined,
        }
      }

      return { type: "object", properties, required }
    }
  }

  return { type: "object", properties: {} }
}

function getZodTypeName(schema: z.ZodSchema): string {
  const def = (schema as { _def: Record<string, unknown> })._def
  const typeName = def.typeName as string

  switch (typeName) {
    case "ZodString":
      return "string"
    case "ZodNumber":
      return "number"
    case "ZodBoolean":
      return "boolean"
    case "ZodArray":
      return "array"
    case "ZodEnum":
      return "string"
    case "ZodOptional":
    case "ZodDefault":
      return getZodTypeName((def.innerType || def.type) as z.ZodSchema)
    default:
      return "string"
  }
}
