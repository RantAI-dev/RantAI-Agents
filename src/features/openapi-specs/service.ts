import { generateToolsFromEndpoints } from "@/lib/openapi/tool-generator"
import { parseOpenApiSpec } from "@/lib/openapi/parser"
import type { ParsedOpenApiSpec } from "@/lib/openapi/parser"
import type { DashboardOpenApiSpecCreateInput } from "./schema"
import {
  createOpenApiSpec,
  createOpenApiTools,
  deleteOpenApiSpecById,
  deleteOpenApiToolsBySpecId,
  findOpenApiSpecById,
  findOpenApiSpecWithToolsById,
  findOpenApiSpecsByOrganization,
  findOpenApiToolsBySpecId,
  updateOpenApiSpecToolCount,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardOpenApiSpecSummary {
  id: string
  name: string
  specUrl: string | null
  version: string
  serverUrl: string
  toolCount: number
  createdAt: string
}

export interface DashboardOpenApiSpecTool {
  id: string
  name: string
  displayName: string
  description: string
  enabled: boolean
}

export interface DashboardOpenApiSpecPreview {
  preview: true
  title: string
  version: string
  serverUrl: string
  endpoints: Array<{
    operationId: string
    method: string
    path: string
    summary: string
  }>
}

function mapSummary(spec: {
  id: string
  name: string
  specUrl: string | null
  version: string
  serverUrl: string
  toolCount: number
  createdAt: Date
}): DashboardOpenApiSpecSummary {
  return {
    id: spec.id,
    name: spec.name,
    specUrl: spec.specUrl,
    version: spec.version,
    serverUrl: spec.serverUrl,
    toolCount: spec.toolCount,
    createdAt: spec.createdAt.toISOString(),
  }
}

function toStoredSpecContent(rawSpec: unknown): unknown {
  if (typeof rawSpec === "string") {
    const trimmed = rawSpec.trim()
    return JSON.parse(trimmed.startsWith("{") ? rawSpec : JSON.stringify(rawSpec))
  }

  return JSON.parse(JSON.stringify(rawSpec))
}

function toRawSpecString(specContent: unknown): string {
  return typeof specContent === "string" ? specContent : JSON.stringify(specContent)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseImportInput(input: DashboardOpenApiSpecCreateInput): {
  specContent?: unknown
  specUrl?: string | null
  name?: string | null
  authConfig?: unknown
  selectedOperationIds?: string[]
} {
  if (!isObjectRecord(input)) {
    return {}
  }

  const record = input as Record<string, unknown>
  return {
    specContent: record.specContent,
    specUrl: (record.specUrl as string | null | undefined) ?? null,
    name: (record.name as string | null | undefined) ?? null,
    authConfig: record.authConfig,
    selectedOperationIds: record.selectedOperationIds as string[] | undefined,
  }
}

/**
 * Lists OpenAPI specs visible to the current organization.
 */
export async function listDashboardOpenApiSpecs(params: {
  organizationId: string | null
}): Promise<DashboardOpenApiSpecSummary[]> {
  const specs = (await findOpenApiSpecsByOrganization(params.organizationId)) as Array<{
    id: string
    name: string
    specUrl: string | null
    version: string
    serverUrl: string
    toolCount: number
    createdAt: Date
  }>
  return specs.map(mapSummary)
}

/**
 * Imports an OpenAPI spec, returning a preview or creating the stored spec.
 */
export async function importDashboardOpenApiSpec(params: {
  organizationId: string | null
  createdBy: string
  input: DashboardOpenApiSpecCreateInput
}): Promise<DashboardOpenApiSpecPreview | { spec: { id: string; name: string }; toolsCreated: number } | ServiceError> {
  const { specContent, specUrl, name, authConfig, selectedOperationIds } = parseImportInput(
    params.input
  )

  if (!specContent && !specUrl) {
    return { status: 400, error: "specContent or specUrl is required" }
  }

  let rawSpec = specContent as string
  if (!rawSpec && specUrl) {
    const res = await fetch(specUrl, {
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      return {
        status: 400,
        error: `Failed to fetch spec from URL: ${res.status}`,
      }
    }
    rawSpec = await res.text()
  }

  let parsed: ParsedOpenApiSpec
  try {
    parsed = parseOpenApiSpec(rawSpec)
  } catch (error) {
    return {
      status: 400,
      error: `Invalid OpenAPI spec: ${error instanceof Error ? error.message : "Parse error"}`,
    }
  }

  if (!name) {
    return {
      preview: true,
      title: parsed.title,
      version: parsed.version,
      serverUrl: parsed.serverUrl,
      endpoints: parsed.endpoints.map((endpoint: ParsedOpenApiSpec["endpoints"][number]) => ({
        operationId: endpoint.operationId,
        method: endpoint.method,
        path: endpoint.path,
        summary: endpoint.summary,
      })),
    }
  }

  const storedSpec = await createOpenApiSpec({
    name: name || parsed.title,
    specUrl: specUrl || null,
    specContent: toStoredSpecContent(rawSpec),
    version: parsed.version,
    serverUrl: parsed.serverUrl,
    authConfig: authConfig || null,
    toolCount: 0,
    organizationId: params.organizationId,
    createdBy: params.createdBy,
  })

  const toolInputs = generateToolsFromEndpoints(parsed.endpoints, {
    serverUrl: parsed.serverUrl,
    specId: storedSpec.id,
    organizationId: params.organizationId,
    createdBy: params.createdBy,
    authConfig: authConfig as { type: string; token?: string; headerName?: string } | null,
    selectedOperationIds,
  })

  if (toolInputs.length > 0) {
    await createOpenApiTools(toolInputs)
    await updateOpenApiSpecToolCount(storedSpec.id, toolInputs.length)
  }

  return {
    spec: { id: storedSpec.id, name: storedSpec.name },
    toolsCreated: toolInputs.length,
  }
}

/**
 * Loads one OpenAPI spec and its generated tools.
 */
export async function getDashboardOpenApiSpec(params: {
  id: string
}): Promise<Record<string, unknown> | ServiceError> {
  const spec = await findOpenApiSpecWithToolsById(params.id)
  if (!spec) {
    return { status: 404, error: "Spec not found" }
  }

  const tools = await findOpenApiToolsBySpecId(params.id)
  return { ...spec, tools }
}

/**
 * Deletes an OpenAPI spec and its generated tools.
 */
export async function deleteDashboardOpenApiSpec(params: {
  id: string
}): Promise<{ success: true } | ServiceError> {
  await deleteOpenApiToolsBySpecId(params.id)
  await deleteOpenApiSpecById(params.id)
  return { success: true }
}

/**
 * Regenerates tools from an existing spec record.
 */
export async function resyncDashboardOpenApiSpec(params: {
  id: string
  createdBy: string
}): Promise<{ toolsCreated: number } | ServiceError> {
  const spec = await findOpenApiSpecById(params.id)
  if (!spec) {
    return { status: 404, error: "Spec not found" }
  }

  const parsed = parseOpenApiSpec(toRawSpecString((spec as { specContent: unknown }).specContent))

  await deleteOpenApiToolsBySpecId(params.id)

  const toolInputs = generateToolsFromEndpoints(parsed.endpoints, {
    serverUrl: (spec as { serverUrl: string }).serverUrl,
    specId: params.id,
    organizationId: (spec as { organizationId: string | null }).organizationId,
    createdBy: params.createdBy,
    authConfig: (spec as { authConfig: { type: string; token?: string; headerName?: string } | null }).authConfig,
  })

  if (toolInputs.length > 0) {
    await createOpenApiTools(toolInputs)
  }

  await updateOpenApiSpecToolCount(params.id, toolInputs.length)
  return { toolsCreated: toolInputs.length }
}
