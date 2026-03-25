import { canEdit, canManage } from "@/lib/organization"
import {
  createKnowledgeGroup,
  deleteKnowledgeGroup,
  findKnowledgeGroupAccessById,
  findKnowledgeGroupById,
  listKnowledgeGroupsByOrganization,
  updateKnowledgeGroup,
} from "./repository"
import type { KnowledgeGroupCreateInput, KnowledgeGroupUpdateInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

export interface KnowledgeGroupListItem {
  id: string
  name: string
  description: string | null
  color: string | null
  documentCount: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeGroupWriteResponse {
  id: string
  name: string
  description: string | null
  color: string | null
}

export interface KnowledgeGroupDetail {
  id: string
  name: string
  description: string | null
  color: string | null
  documents: Array<{ id: string; title: string; categories: string[] }>
  createdAt: string
  updatedAt: string
}

function mapListItem(group: {
  id: string
  name: string
  description: string | null
  color: string | null
  _count: { documents: number }
  createdAt: Date
  updatedAt: Date
}): KnowledgeGroupListItem {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    documentCount: group._count.documents,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  }
}

/**
 * Lists dashboard knowledge groups.
 */
export async function listKnowledgeGroupsForDashboard(organizationId: string | null) {
  const groups = await listKnowledgeGroupsByOrganization(organizationId)
  return groups.map(mapListItem)
}

/**
 * Creates a dashboard knowledge group.
 */
export async function createKnowledgeGroupForDashboard(params: {
  organizationId: string | null
  role: string | null | undefined
  userId: string
  input: KnowledgeGroupCreateInput
}): Promise<KnowledgeGroupWriteResponse | ServiceError> {
  if (params.organizationId && params.role && !canEdit(params.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  if (!params.input.name) {
    return { status: 400, error: "Name is required" }
  }

  const group = await createKnowledgeGroup({
    name: params.input.name,
    description: params.input.description || null,
    color: params.input.color || null,
    organizationId: params.organizationId || null,
    createdBy: params.userId,
  })

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
  }
}

/**
 * Loads a dashboard knowledge group with documents.
 */
export async function getKnowledgeGroupForDashboard(params: {
  groupId: string
  organizationId: string | null
}): Promise<KnowledgeGroupDetail | ServiceError> {
  const group = await findKnowledgeGroupById(params.groupId)
  if (!group) {
    return { status: 404, error: "Group not found" }
  }

  if (group.organizationId) {
    if (!params.organizationId || group.organizationId !== params.organizationId) {
      return { status: 404, error: "Group not found" }
    }
  }

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    documents: group.documents.map((entry) => entry.document),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  }
}

/**
 * Updates a dashboard knowledge group.
 */
export async function updateKnowledgeGroupForDashboard(params: {
  groupId: string
  organizationId: string | null
  role: string | null | undefined
  input: KnowledgeGroupUpdateInput
}): Promise<KnowledgeGroupWriteResponse | ServiceError> {
  const existing = await findKnowledgeGroupAccessById(params.groupId)
  if (!existing) {
    return { status: 404, error: "Group not found" }
  }

  if (existing.organizationId) {
    if (!params.organizationId || existing.organizationId !== params.organizationId) {
      return { status: 404, error: "Group not found" }
    }

    if (params.role && !canEdit(params.role)) {
      return { status: 403, error: "Insufficient permissions" }
    }
  }

  const group = await updateKnowledgeGroup(params.groupId, {
    ...(params.input.name && { name: params.input.name }),
    ...(params.input.description !== undefined && { description: params.input.description || null }),
    ...(params.input.color !== undefined && { color: params.input.color || null }),
  })

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
  }
}

/**
 * Deletes a dashboard knowledge group.
 */
export async function deleteKnowledgeGroupForDashboard(params: {
  groupId: string
  organizationId: string | null
  role: string | null | undefined
}): Promise<{ success: true } | ServiceError> {
  const existing = await findKnowledgeGroupAccessById(params.groupId)
  if (!existing) {
    return { status: 404, error: "Group not found" }
  }

  if (existing.organizationId) {
    if (!params.organizationId || existing.organizationId !== params.organizationId) {
      return { status: 404, error: "Group not found" }
    }

    if (params.role && !canManage(params.role)) {
      return { status: 403, error: "Insufficient permissions" }
    }
  }

  await deleteKnowledgeGroup(params.groupId)
  return { success: true }
}
