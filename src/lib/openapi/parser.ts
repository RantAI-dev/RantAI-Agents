import yaml from "js-yaml"

export interface ParsedEndpoint {
  operationId: string
  path: string
  method: string
  summary: string
  description: string
  parameters: JsonSchema
  requestBody?: JsonSchema
  responseSchema?: JsonSchema
}

export interface ParsedOpenApiSpec {
  title: string
  version: string
  serverUrl: string
  endpoints: ParsedEndpoint[]
}

interface JsonSchema {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
  items?: unknown
  [key: string]: unknown
}

interface OpenApiSpec {
  openapi?: string
  swagger?: string
  info?: { title?: string; version?: string }
  servers?: Array<{ url?: string }>
  host?: string
  basePath?: string
  schemes?: string[]
  paths?: Record<string, Record<string, OpenApiOperation>>
  components?: { schemas?: Record<string, unknown> }
  definitions?: Record<string, unknown>
}

interface OpenApiOperation {
  operationId?: string
  summary?: string
  description?: string
  parameters?: OpenApiParam[]
  requestBody?: { content?: Record<string, { schema?: unknown }> }
  responses?: Record<string, unknown>
}

interface OpenApiParam {
  name: string
  in: string
  description?: string
  required?: boolean
  schema?: { type?: string; [key: string]: unknown }
  type?: string
}

/**
 * Parse an OpenAPI 3.0/3.1 or Swagger 2.0 spec from JSON string or YAML string.
 */
export function parseOpenApiSpec(input: string): ParsedOpenApiSpec {
  let spec: OpenApiSpec

  // Try JSON first, then YAML
  try {
    spec = JSON.parse(input) as OpenApiSpec
  } catch {
    try {
      spec = yaml.load(input) as OpenApiSpec
    } catch {
      throw new Error("Invalid spec: could not parse as JSON or YAML")
    }
  }

  // Validate version
  const version = spec.openapi || spec.swagger
  if (!version) {
    throw new Error("Invalid spec: missing openapi or swagger version field")
  }

  const isV3 = version.startsWith("3.")
  const isV2 = version.startsWith("2.")
  if (!isV3 && !isV2) {
    throw new Error(`Unsupported spec version: ${version}`)
  }

  // Resolve server URL
  let serverUrl = ""
  if (isV3 && spec.servers?.[0]?.url) {
    serverUrl = spec.servers[0].url
  } else if (isV2) {
    const scheme = spec.schemes?.[0] || "https"
    const host = spec.host || "localhost"
    const basePath = spec.basePath || ""
    serverUrl = `${scheme}://${host}${basePath}`
  }

  // Get schemas for $ref resolution
  const schemas = isV3
    ? (spec.components?.schemas as Record<string, unknown>) || {}
    : (spec.definitions as Record<string, unknown>) || {}

  const endpoints: ParsedEndpoint[] = []

  if (spec.paths) {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (["get", "post", "put", "patch", "delete"].indexOf(method) === -1) continue

        const op = operation as OpenApiOperation
        const operationId =
          op.operationId || generateOperationId(method, path)

        // Build parameters schema from query/path params
        const paramProps: Record<string, unknown> = {}
        const paramRequired: string[] = []

        if (op.parameters) {
          for (const param of op.parameters) {
            if (param.in === "query" || param.in === "path") {
              paramProps[param.name] = resolveRef(
                param.schema || { type: param.type || "string" },
                schemas
              )
              if (param.description) {
                (paramProps[param.name] as Record<string, unknown>).description =
                  param.description
              }
              if (param.required) paramRequired.push(param.name)
            }
          }
        }

        // Request body (v3)
        let requestBody: JsonSchema | undefined
        if (isV3 && op.requestBody?.content) {
          const jsonContent =
            op.requestBody.content["application/json"] ||
            Object.values(op.requestBody.content)[0]
          if (jsonContent?.schema) {
            requestBody = resolveRef(jsonContent.schema, schemas) as JsonSchema
          }
        }

        // Merge query/path params + request body into single parameters schema
        const allProps = { ...paramProps }
        const allRequired = [...paramRequired]

        if (requestBody && requestBody.type === "object" && requestBody.properties) {
          Object.assign(allProps, requestBody.properties)
          if (requestBody.required) {
            allRequired.push(...requestBody.required)
          }
        }

        const parameters: JsonSchema = {
          type: "object",
          properties: allProps,
          ...(allRequired.length > 0 && { required: allRequired }),
        }

        endpoints.push({
          operationId,
          path,
          method: method.toUpperCase(),
          summary: op.summary || "",
          description: op.description || op.summary || "",
          parameters,
          requestBody,
        })
      }
    }
  }

  return {
    title: spec.info?.title || "Untitled API",
    version: spec.info?.version || "1.0.0",
    serverUrl,
    endpoints,
  }
}

function generateOperationId(method: string, path: string): string {
  const segments = path
    .replace(/\{[^}]+\}/g, "by_id")
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/[^a-zA-Z0-9]/g, "_"))
  return `${method}_${segments.join("_")}`
}

function resolveRef(
  schema: unknown,
  schemas: Record<string, unknown>,
  depth = 0
): unknown {
  if (depth > 10) return schema // Prevent infinite recursion
  if (!schema || typeof schema !== "object") return schema

  const obj = schema as Record<string, unknown>

  if (obj.$ref && typeof obj.$ref === "string") {
    // Handle #/components/schemas/Name or #/definitions/Name
    const refName = obj.$ref.replace(
      /^#\/(components\/schemas|definitions)\//,
      ""
    )
    if (schemas[refName]) {
      return resolveRef(schemas[refName], schemas, depth + 1)
    }
    return { type: "object" } // Fallback for unresolved refs
  }

  // Recursively resolve properties
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === "properties" && typeof value === "object" && value) {
      const props: Record<string, unknown> = {}
      for (const [propName, propValue] of Object.entries(
        value as Record<string, unknown>
      )) {
        props[propName] = resolveRef(propValue, schemas, depth + 1)
      }
      resolved[key] = props
    } else if (key === "items" && typeof value === "object") {
      resolved[key] = resolveRef(value, schemas, depth + 1)
    } else {
      resolved[key] = value
    }
  }

  return resolved
}
