import type { ParsedEndpoint } from "./parser"

export interface ToolCreateInput {
  name: string
  displayName: string
  description: string
  category: "openapi"
  parameters: object
  executionConfig: {
    url: string
    method: string
    headers?: Record<string, string>
  }
  isBuiltIn: false
  enabled: true
  openApiSpecId: string
  organizationId: string | null
  createdBy: string | null
}

/**
 * Convert parsed OpenAPI endpoints to Tool create inputs.
 */
export function generateToolsFromEndpoints(
  endpoints: ParsedEndpoint[],
  options: {
    serverUrl: string
    specId: string
    organizationId: string | null
    createdBy: string | null
    authConfig?: { type: string; token?: string; headerName?: string } | null
    selectedOperationIds?: string[] // If provided, only generate these
  }
): ToolCreateInput[] {
  const { serverUrl, specId, organizationId, createdBy, authConfig, selectedOperationIds } = options

  const filtered = selectedOperationIds
    ? endpoints.filter((e) => selectedOperationIds.includes(e.operationId))
    : endpoints

  const authHeaders: Record<string, string> = {}
  if (authConfig) {
    if (authConfig.type === "bearer" && authConfig.token) {
      authHeaders["Authorization"] = `Bearer ${authConfig.token}`
    } else if (authConfig.type === "api_key" && authConfig.token) {
      authHeaders[authConfig.headerName || "X-API-Key"] = authConfig.token
    }
  }

  return filtered.map((endpoint) => {
    const displayName = humanize(endpoint.operationId)
    const url = buildUrl(serverUrl, endpoint.path)

    return {
      name: endpoint.operationId,
      displayName,
      description: endpoint.description || endpoint.summary || `${endpoint.method} ${endpoint.path}`,
      category: "openapi" as const,
      parameters: endpoint.parameters,
      executionConfig: {
        url,
        method: endpoint.method,
        ...(Object.keys(authHeaders).length > 0 && { headers: authHeaders }),
      },
      isBuiltIn: false as const,
      enabled: true as const,
      openApiSpecId: specId,
      organizationId,
      createdBy,
    }
  })
}

function humanize(operationId: string): string {
  return operationId
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

function buildUrl(serverUrl: string, path: string): string {
  // Remove trailing slash from server, ensure path starts with /
  const base = serverUrl.replace(/\/$/, "")
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  return `${base}${cleanPath}`
}
