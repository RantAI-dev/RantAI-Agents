import { encryptCredential } from "@/lib/workflow/credentials"
import type { Prisma } from "@prisma/client"
import {
  createDashboardCredential as createDashboardCredentialRecord,
  deleteDashboardCredential,
  findDashboardCredentialById,
  findDashboardCredentials,
  updateDashboardCredential,
} from "./repository"
import type {
  CreateCredentialInput,
  CredentialType,
  UpdateCredentialInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardCredentialsContext {
  organizationId: string | null
  userId: string
}

export interface DashboardCredentialSummary {
  id: string
  name: string
  type: string
  organizationId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

const VALID_TYPES = new Set<CredentialType>(["api_key", "oauth2", "basic_auth", "bearer"])

function toSummary(credential: {
  id: string
  name: string
  type: string
  organizationId: string | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}): DashboardCredentialSummary {
  return {
    ...credential,
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString(),
  }
}

function canAccessCredential(
  organizationId: string | null,
  credentialOrganizationId: string | null
): boolean {
  return !credentialOrganizationId || credentialOrganizationId === organizationId
}

/**
 * Lists credentials visible to the current user.
 */
export async function listDashboardCredentials(
  context: DashboardCredentialsContext
): Promise<DashboardCredentialSummary[]> {
  const credentials = await findDashboardCredentials({
    organizationId: context.organizationId,
    userId: context.userId,
  })
  return credentials.map(toSummary)
}

/**
 * Creates a credential after validating its type and encrypting the payload.
 */
export async function createDashboardCredential(params: {
  context: DashboardCredentialsContext
  input: CreateCredentialInput
}): Promise<DashboardCredentialSummary | ServiceError> {
  if (!VALID_TYPES.has(params.input.type)) {
    return {
      status: 400,
      error: `Invalid type. Must be one of: ${Array.from(VALID_TYPES).join(", ")}`,
    }
  }

  const credential = await createDashboardCredentialRecord({
    name: params.input.name,
    type: params.input.type,
    encryptedData: encryptCredential(params.input.data),
    organizationId: params.context.organizationId,
    createdBy: params.context.userId,
  })

  return toSummary(credential)
}

/**
 * Loads one credential and enforces organization access.
 */
export async function getDashboardCredential(params: {
  context: DashboardCredentialsContext
  id: string
}): Promise<DashboardCredentialSummary | ServiceError> {
  const credential = await findDashboardCredentialById(params.id)
  if (!credential) {
    return { status: 404, error: "Credential not found" }
  }

  if (!canAccessCredential(params.context.organizationId, credential.organizationId)) {
    return { status: 403, error: "Forbidden" }
  }

  return toSummary(credential)
}

/**
 * Updates a credential after enforcing ownership and type validation.
 */
export async function updateDashboardCredentialRecord(params: {
  context: DashboardCredentialsContext
  id: string
  input: UpdateCredentialInput
}): Promise<DashboardCredentialSummary | ServiceError> {
  const existing = await findDashboardCredentialById(params.id)
  if (!existing) {
    return { status: 404, error: "Credential not found" }
  }

  if (!canAccessCredential(params.context.organizationId, existing.organizationId)) {
    return { status: 403, error: "Forbidden" }
  }

  if (params.input.type && !VALID_TYPES.has(params.input.type)) {
    return {
      status: 400,
      error: `Invalid type. Must be one of: ${Array.from(VALID_TYPES).join(", ")}`,
    }
  }

  const updateData: Prisma.CredentialUpdateInput = {}
  if (params.input.name) updateData.name = params.input.name
  if (params.input.type) updateData.type = params.input.type
  if (params.input.data) {
    updateData.encryptedData = encryptCredential(params.input.data)
  }

  const credential = await updateDashboardCredential(params.id, updateData)
  return toSummary(credential)
}

/**
 * Deletes a credential after enforcing ownership.
 */
export async function deleteDashboardCredentialRecord(params: {
  context: DashboardCredentialsContext
  id: string
}): Promise<{ success: true } | ServiceError> {
  const existing = await findDashboardCredentialById(params.id)
  if (!existing) {
    return { status: 404, error: "Credential not found" }
  }

  if (!canAccessCredential(params.context.organizationId, existing.organizationId)) {
    return { status: 403, error: "Forbidden" }
  }

  await deleteDashboardCredential(params.id)
  return { success: true }
}
