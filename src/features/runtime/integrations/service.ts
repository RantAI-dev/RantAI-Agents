import { getIntegrationDefinition } from "@/lib/digital-employee/integrations"
import { decryptCredential, encryptCredential } from "@/lib/workflow/credentials"
import {
  createRuntimeIntegrationApproval,
  findRuntimeEmployeeIntegration,
  updateRuntimeEmployeeIntegration,
  upsertRuntimeEmployeeIntegration,
} from "./repository"
import type {
  RuntimeIntegrationCredentialsInput,
  RuntimeStoreIntegrationCredentialsInput,
  RuntimeTestIntegrationInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Creates a dashboard approval request so the employee can obtain credentials.
 */
export async function requestRuntimeIntegrationCredentials(params: {
  employeeId: string
  input: RuntimeIntegrationCredentialsInput
}): Promise<{ approvalId: string; status: "pending" } | ServiceError> {
  if (!isNonEmptyString(params.input.integrationId)) {
    return { status: 400, error: "integrationId required" }
  }

  const approval = await createRuntimeIntegrationApproval({
    digitalEmployeeId: params.employeeId,
    employeeRunId: "credential-request",
    requestType: "credential_request",
    title: params.input.title || `Credentials needed: ${params.input.integrationId}`,
    description:
      params.input.description || `The employee needs credentials for ${params.input.integrationId}`,
    content: { integrationId: params.input.integrationId },
    options: { type: "credential_request" },
    channel: "dashboard",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })

  return { approvalId: approval.id, status: "pending" }
}

/**
 * Encrypts and stores runtime integration credentials for the caller-provided employee.
 */
export async function storeRuntimeIntegrationCredentials(
  input: RuntimeStoreIntegrationCredentialsInput
): Promise<
  | {
      success: true
      integrationId: string
      status: string
      connectedAt: Date | null
    }
  | ServiceError
> {
  if (!isNonEmptyString(input.employeeId) || !isNonEmptyString(input.integrationId)) {
    return { status: 400, error: "Missing required fields" }
  }

  const hasCredentials = !!input.credentials && Object.keys(input.credentials as object).length > 0
  const encryptedData = hasCredentials
    ? encryptCredential(input.credentials as Record<string, unknown>)
    : undefined

  const expiresAt = input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000) : null

  const integration = await upsertRuntimeEmployeeIntegration({
    digitalEmployeeId: input.employeeId,
    integrationId: input.integrationId,
    status: hasCredentials ? "connected" : "disconnected",
    encryptedData,
    connectedAt: hasCredentials ? new Date() : null,
    expiresAt,
    metadata: input.metadata ? (input.metadata as object) : undefined,
  })

  return {
    success: true,
    integrationId: integration.integrationId,
    status: integration.status,
    connectedAt: integration.connectedAt,
  }
}

/**
 * Tests a stored runtime integration against its configured test endpoint.
 */
export async function testRuntimeIntegration(
  employeeId: string,
  input: RuntimeTestIntegrationInput
): Promise<
  | { success: boolean; status?: number; message?: string; error?: string }
  | ServiceError
> {
  if (!isNonEmptyString(input.integrationId)) {
    return { status: 400, error: "integrationId required" }
  }

  const integration = await findRuntimeEmployeeIntegration({
    digitalEmployeeId: employeeId,
    integrationId: input.integrationId,
  })

  if (!integration?.encryptedData) {
    return { success: false, error: "No credentials stored" }
  }

  const def = getIntegrationDefinition(input.integrationId)
  if (!def?.testEndpoint) {
    return { success: true, message: "No test endpoint" }
  }

  const creds = decryptCredential(integration.encryptedData)
  const headers: Record<string, string> = {}
  if ((creds as Record<string, string>).token) headers.Authorization = `Bearer ${(creds as Record<string, string>).token}`
  else if ((creds as Record<string, string>).apiKey) headers.Authorization = `Bearer ${(creds as Record<string, string>).apiKey}`
  else if ((creds as Record<string, string>).botToken) headers.Authorization = `Bearer ${(creds as Record<string, string>).botToken}`

  try {
    const res = await fetch(def.testEndpoint, {
      headers,
      method: "GET",
      signal: AbortSignal.timeout(10000),
    })
    await updateRuntimeEmployeeIntegration(integration.id, {
      lastTestedAt: new Date(),
      status: res.ok ? "connected" : "error",
      lastError: res.ok ? null : `HTTP ${res.status}`,
    })
    return { success: res.ok, status: res.status }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test failed"
    await updateRuntimeEmployeeIntegration(integration.id, {
      lastTestedAt: new Date(),
      status: "error",
      lastError: message,
    })
    return { success: false, error: message }
  }
}
