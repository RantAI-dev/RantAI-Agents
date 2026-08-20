import { canEdit, canManage } from "@/lib/organization"
import {
  createKnowledgeGroup,
  deleteKnowledgeGroup,
  findKnowledgeGroupAccessById,
  findKnowledgeGroupById,
  listKnowledgeGroupsByOrganization,
  updateKnowledgeGroup,
} from "./repository"
import { recordKnowledgeAudit } from "@/lib/audit/knowledge"
import { KbTreeError, assertParentAllowed, childCount, expandGroupIds } from "./tree"
import type { KnowledgeGroupCreateInput, KnowledgeGroupUpdateInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

/**
 * A rejected nesting is the user picking an impossible parent, not a bug —
 * surface the reason instead of a generic 500. 409 for the structural
 * conflicts (cycle, depth), 400 for a parent that cannot be used at all.
 */
function treeErrorToService(error: unknown): ServiceError | null {
  if (!(error instanceof KbTreeError)) return null
  const status =
    error.code === "CYCLE" || error.code === "TOO_DEEP" || error.code === "SELF_PARENT"
      ? 409
      : 400
  return { status, error: error.message }
}

export interface KnowledgeGroupListItem {
  id: string
  name: string
  description: string | null
  color: string | null
  parentId: string | null
  documentCount: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeGroupWriteResponse {
  id: string
  name: string
  description: string | null
  color: string | null
  parentId: string | null
}

export interface KnowledgeGroupDetail {
  id: string
  name: string
  description: string | null
  color: string | null
  parentId: string | null
  documents: Array<{ id: string; title: string; categories: string[] }>
  createdAt: string
  updatedAt: string
}

function mapListItem(group: {
  id: string
  name: string
  description: string | null
  color: string | null
  parentId: string | null
  _count: { documents: number }
  createdAt: Date
  updatedAt: Date
}): KnowledgeGroupListItem {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    parentId: group.parentId,
    // Documents attached directly to this KB. The tree in the UI sums its own
    // subtree from these, so returning a pre-summed count here would double
    // every ancestor.
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
/**
 * Documents belonging to any of the given knowledge bases, capped.
 *
 * The public way for other features (agent API, public chat, widget) to ask
 * "what is in these KBs?" — they used to import the repository's Prisma query
 * directly, which leaked storage internals across a feature boundary and
 * blocked extracting the KB.
 */
/**
 * KB name + alive-document count for an org, for pickers (Agent Builder).
 * Replaces outside features importing the `aliveDocumentRelation` Prisma
 * fragment and hand-rolling the query.
 */
export async function listKnowledgeGroupSummaries(organizationId: string | null) {
  const { findKnowledgeGroupSummaries } = await import("./repository")
  return findKnowledgeGroupSummaries(organizationId)
}

export async function listDocumentsInKnowledgeGroups(groupIds: string[], cap = 200) {
  const { findDocumentsByGroups } = await import("./repository")
  return findDocumentsByGroups(groupIds, cap)
}

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

  if (params.input.parentId) {
    try {
      await assertParentAllowed({
        parentId: params.input.parentId,
        organizationId: params.organizationId ?? null,
      })
    } catch (error) {
      const mapped = treeErrorToService(error)
      if (mapped) return mapped
      throw error
    }
  }

  const group = await createKnowledgeGroup({
    name: params.input.name,
    description: params.input.description || null,
    color: params.input.color || null,
    parentId: params.input.parentId || null,
    organizationId: params.organizationId || null,
    createdBy: params.userId,
  })

  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId,
    action: "knowledgeBaseGroup.create",
    entityType: "knowledgeBaseGroup",
    entityId: group.id,
    detail: { name: group.name, description: group.description, parentId: group.parentId },
  })

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    parentId: group.parentId,
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
    parentId: group.parentId,
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
  userId?: string | null
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

  // `parentId: null` is a real instruction ("move to top level"), so this
  // checks for key presence rather than truthiness — the usual `|| null`
  // shortcut would make un-nesting indistinguishable from not asking.
  if (params.input.parentId !== undefined && params.input.parentId !== null) {
    try {
      await assertParentAllowed({
        parentId: params.input.parentId,
        childId: params.groupId,
        organizationId: params.organizationId ?? null,
      })
    } catch (error) {
      const mapped = treeErrorToService(error)
      if (mapped) return mapped
      throw error
    }
  }

  const group = await updateKnowledgeGroup(params.groupId, {
    ...(params.input.name && { name: params.input.name }),
    ...(params.input.description !== undefined && { description: params.input.description || null }),
    ...(params.input.color !== undefined && { color: params.input.color || null }),
    ...(params.input.parentId !== undefined && {
      parent: params.input.parentId
        ? { connect: { id: params.input.parentId } }
        : { disconnect: true },
    }),
  })

  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    action: "knowledgeBaseGroup.update",
    entityType: "knowledgeBaseGroup",
    entityId: params.groupId,
    detail: {
      name: params.input.name,
      description: params.input.description,
      ...(params.input.parentId !== undefined && { parentId: params.input.parentId }),
    },
  })

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    parentId: group.parentId,
  }
}

/**
 * Deletes a dashboard knowledge group.
 */
export async function deleteKnowledgeGroupForDashboard(params: {
  groupId: string
  organizationId: string | null
  role: string | null | undefined
  userId?: string | null
  /**
   * Delete every KB nested underneath as well.
   *
   * Off by default on purpose. The database relation is `Restrict`, so without
   * this a parent simply refuses to delete — which is the right default when
   * one click could otherwise take out an entire branch of someone's library.
   * The caller has to say it meant it.
   */
  cascade?: boolean
}): Promise<{ success: true; deletedIds: string[] } | ServiceError> {
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

  const children = await childCount(params.groupId)
  if (children > 0 && !params.cascade) {
    return {
      status: 409,
      error:
        `This knowledge base has ${children} nested knowledge base` +
        `${children === 1 ? "" : "s"} inside it. Move them out first, or delete it with its contents.`,
    }
  }

  // Deepest-first: the relation is Restrict, so a parent cannot go before its
  // children. `expandGroupIds` returns the subtree unordered, so reverse-sort
  // by depth via repeated leaf removal — cheap at MAX_KB_DEPTH levels.
  const subtree = children > 0 ? await expandGroupIds([params.groupId]) : [params.groupId]
  const deletedIds: string[] = []
  const remaining = new Set(subtree)
  while (remaining.size > 0) {
    const before = remaining.size
    for (const id of [...remaining]) {
      if (await childCount(id) > 0) continue // still has children inside the set
      await deleteKnowledgeGroup(id)
      deletedIds.push(id)
      remaining.delete(id)
    }
    // Defensive: a pre-existing cycle would leave every node with a child and
    // spin forever. Bail rather than hang the request.
    if (remaining.size === before) break
  }

  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    action: "knowledgeBaseGroup.delete",
    entityType: "knowledgeBaseGroup",
    entityId: params.groupId,
    detail: { cascade: Boolean(params.cascade), deletedCount: deletedIds.length },
    riskLevel: "medium",
  })
  return { success: true, deletedIds }
}
