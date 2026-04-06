import type { z } from "zod"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodDef = { _def: Record<string, any> }
function asDef(schema: z.ZodSchema): ZodDef["_def"] {
  return (schema as unknown as ZodDef)._def
}

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
        const fieldDef = asDef(fieldSchema)
        const isOptional = fieldDef.typeName === "ZodOptional" || fieldDef.typeName === "ZodDefault"

        if (!isOptional) {
          required.push(key)
        }

        const prop: Record<string, unknown> = {
          type: getZodTypeName(fieldSchema),
          description: fieldDef.description || fieldDef.innerType?._def?.description || undefined,
        }

        // Extract enum values
        const enumValues = getZodEnumValues(fieldSchema)
        if (enumValues) prop.enum = enumValues

        // Extract default value
        const defaultValue = getZodDefault(fieldSchema)
        if (defaultValue !== undefined) prop.default = defaultValue

        properties[key] = prop
      }

      return { type: "object", properties, required }
    }
  }

  return { type: "object", properties: {} }
}

function getZodEnumValues(schema: z.ZodSchema): string[] | undefined {
  const def = asDef(schema)
  const typeName = def.typeName as string

  if (typeName === "ZodEnum") return def.values as string[]
  if (typeName === "ZodDefault" || typeName === "ZodOptional") {
    const inner = (def.innerType || def.type) as z.ZodSchema | undefined
    if (inner) return getZodEnumValues(inner)
  }
  return undefined
}

function getZodDefault(schema: z.ZodSchema): unknown {
  const def = asDef(schema)
  if (def.typeName === "ZodDefault") {
    return typeof def.defaultValue === "function"
      ? (def.defaultValue as () => unknown)()
      : def.defaultValue
  }
  if (def.typeName === "ZodOptional") {
    const inner = (def.innerType || def.type) as z.ZodSchema | undefined
    if (inner) return getZodDefault(inner)
  }
  return undefined
}

function getZodTypeName(schema: z.ZodSchema): string {
  const def = asDef(schema)
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
