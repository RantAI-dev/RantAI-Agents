import { hasPermission } from "@/lib/digital-employee/rbac"
import {
  createDashboardTemplate,
  deleteDashboardTemplate,
  findDashboardTemplateById,
  findDashboardTemplatesByOrganization,
  updateDashboardTemplate,
} from "./repository"
import type {
  DashboardTemplateCreateInput,
  DashboardTemplateUpdateInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface DashboardTemplateAccessContext {
  organizationId: string
  role: string | null
  userId: string
}

function isPresent(value: unknown): boolean {
  return !!value
}

/**
 * Lists dashboard templates for an organization, including public templates.
 */
export async function listDashboardTemplates(organizationId: string) {
  return findDashboardTemplatesByOrganization(organizationId)
}

/**
 * Creates a dashboard template for the current organization.
 */
export async function createDashboardTemplateForDashboard(params: {
  context: DashboardTemplateAccessContext
  input: DashboardTemplateCreateInput
}): Promise<unknown | ServiceError> {
  if (params.context.role && !hasPermission(params.context.role, "employee.create")) {
    return { status: 403, error: "Insufficient permissions" }
  }

  if (!isPresent(params.input.name) || !isPresent(params.input.category) || !isPresent(params.input.templateData)) {
    return {
      status: 400,
      error: "name, category, and templateData are required",
    }
  }

  const canMakePublic =
    !!params.context.role && hasPermission(params.context.role, "employee.delete")

  return createDashboardTemplate({
    organizationId: params.context.organizationId,
    name: params.input.name as string,
    description: params.input.description ? (params.input.description as string) : null,
    category: params.input.category as string,
    templateData: params.input.templateData as object,
    isPublic: canMakePublic && !!params.input.isPublic,
    createdBy: params.context.userId,
  })
}

/**
 * Updates a dashboard template when the caller owns it or has elevated permissions.
 */
export async function updateDashboardTemplateForDashboard(params: {
  templateId: string
  context: DashboardTemplateAccessContext
  input: DashboardTemplateUpdateInput
}): Promise<unknown | ServiceError> {
  const existing = await findDashboardTemplateById(
    params.templateId,
    params.context.organizationId
  )
  if (!existing) {
    return { status: 404, error: "Template not found" }
  }

  if (
    existing.createdBy !== params.context.userId &&
    !(params.context.role && hasPermission(params.context.role, "employee.delete"))
  ) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const canMakePublic =
    !!params.context.role && hasPermission(params.context.role, "employee.delete")

  const data: {
    name?: string
    description?: string | null
    category?: string
    templateData?: object
    isPublic?: boolean
  } = {}

  if (params.input.name) data.name = params.input.name as string
  if (params.input.description !== undefined) {
    data.description = params.input.description as string | null
  }
  if (params.input.category) data.category = params.input.category as string
  if (params.input.templateData) data.templateData = params.input.templateData as object
  if (params.input.isPublic !== undefined && canMakePublic) {
    data.isPublic = params.input.isPublic as boolean
  }

  return updateDashboardTemplate(params.templateId, data)
}

/**
 * Deletes a dashboard template when the caller owns it or has elevated permissions.
 */
export async function deleteDashboardTemplateForDashboard(params: {
  templateId: string
  context: DashboardTemplateAccessContext
}): Promise<{ success: true } | ServiceError> {
  const existing = await findDashboardTemplateById(
    params.templateId,
    params.context.organizationId
  )
  if (!existing) {
    return { status: 404, error: "Template not found" }
  }

  if (
    existing.createdBy !== params.context.userId &&
    !(params.context.role && hasPermission(params.context.role, "employee.delete"))
  ) {
    return { status: 403, error: "Insufficient permissions" }
  }

  await deleteDashboardTemplate(params.templateId)
  return { success: true }
}
