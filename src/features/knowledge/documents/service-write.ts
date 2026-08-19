import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { deleteChunksByDocumentId, getDocumentChunkCount } from "@/lib/rag"
import { getSurrealClient } from "@/lib/surrealdb"
import { deleteFile } from "@/lib/s3"
import { canEdit, canManage } from "@/lib/organization"
import { recordKnowledgeAudit } from "@/lib/audit/knowledge"
import {
  deleteKnowledgeDocument,
  findKnowledgeDocumentAccessById,
  findKnowledgeDocumentById,
  replaceKnowledgeDocumentContent,
  restoreKnowledgeDocument,
  softDeleteKnowledgeDocument,
  updateKnowledgeDocumentWithGroups,
} from "./repository"
import type { KnowledgeDocumentUpdateInput } from "./schema"
import {
  hasDocumentAccess,
  mapGroups,
  toCategoryList,
  toJsonValue,
  toStringList,
  type ServiceError,
} from "./service-shared"

/** Write paths for dashboard knowledge documents: update, delete, restore. */

/**
 * Updates a dashboard knowledge document.
 */
export async function updateKnowledgeDocumentForDashboard(params: {
  documentId: string
  organizationId: string | null
  role: string | null | undefined
  /** Acting user id — written to AuditLog so we can answer "who did this?". */
  userId: string | null
  input: KnowledgeDocumentUpdateInput
}): Promise<Record<string, unknown> | ServiceError> {
  const existing = await findKnowledgeDocumentAccessById(params.documentId)
  if (!existing) {
    return { status: 404, error: "Document not found" }
  }

  if (!hasDocumentAccess(existing.organizationId, params.organizationId)) {
    return { status: 404, error: "Document not found" }
  }

  if (existing.organizationId && params.role && !canEdit(params.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  const groupIds = params.input.groupIds === undefined ? undefined : toStringList(params.input.groupIds)

  const document = await updateKnowledgeDocumentWithGroups(
    params.documentId,
    {
      ...(params.input.title && { title: params.input.title }),
      ...(params.input.categories !== undefined && { categories: toCategoryList(params.input.categories) }),
      ...(params.input.subcategory !== undefined && {
        subcategory: params.input.subcategory || null,
      }),
    },
    groupIds
  )

  if (!document) {
    return { status: 404, error: "Document not found" }
  }

  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId,
    action: "document.update",
    entityType: "document",
    entityId: params.documentId,
    detail: {
      title: params.input.title,
      categories: params.input.categories,
      subcategory: params.input.subcategory,
      groupIds,
    },
  })

  return {
    id: document.id,
    title: document.title,
    categories: document.categories,
    subcategory: document.subcategory,
    groups: mapGroups(document.groups),
  }
}

/**
 * Soft-deletes a knowledge document by default (recoverable for `retentionDays`
 * before the retention sweep hard-deletes). Pass `hard: true` for the legacy
 * permanent-delete path that also cleans up S3 + SurrealDB chunks immediately.
 */
export async function deleteKnowledgeDocumentForDashboard(params: {
  documentId: string
  organizationId: string | null
  role: string | null | undefined
  userId: string | null
  hard?: boolean
}): Promise<{ success: true; mode: "soft" | "hard" } | ServiceError> {
  const existing = await findKnowledgeDocumentAccessById(params.documentId)
  if (!existing) {
    return { status: 404, error: "Document not found" }
  }

  if (!hasDocumentAccess(existing.organizationId, params.organizationId)) {
    return { status: 404, error: "Document not found" }
  }

  if (existing.organizationId && params.role && !canManage(params.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  if (!params.hard) {
    // Soft delete: row stays, deletedAt timestamp filters it out everywhere.
    // Chunks in SurrealDB stay until the retention sweep — retrieval skips
    // them because the Postgres join filters deletedAt: null.
    await softDeleteKnowledgeDocument(params.documentId)
    recordKnowledgeAudit({
      organizationId: params.organizationId,
      userId: params.userId,
      action: "document.delete",
      entityType: "document",
      entityId: params.documentId,
      detail: { mode: "soft" },
    })
    console.log(`Soft-deleted document ${params.documentId}`)
    return { success: true, mode: "soft" }
  }

  // Hard-delete order (postgres-first):
  //   1. delete Document row in Postgres — this is the only step we can do
  //      atomically. If it fails, nothing changes; user retries.
  //   2. cleanup SurrealDB chunks + entities — best-effort. If it fails, the
  //      chunks are now orphans (no parent Document.id in Postgres) and will
  //      be filtered out at retrieval (vector-store.ts uses an inner join +
  //      deletedAt:null filter, so missing doc → chunk dropped from results).
  //      A retention sweep can hard-drop the orphan chunks later.
  //   3. delete S3 file — best-effort, same logic; orphan S3 objects are
  //      cheap and recoverable by a periodic scan of S3 vs Document.s3Key.
  //
  // Old order (surreal → s3 → postgres) had the failure mode: if Postgres
  // delete failed AFTER surreal+s3 cleared, the doc stayed visible in the UI
  // but RAG silently returned zero chunks. New order avoids that by leaving
  // the doc fully present if its row delete fails.
  let cleanupStats: { deletedRelationTables: number; entitiesDeleted: boolean; chunksDeleted: boolean } = {
    deletedRelationTables: 0,
    entitiesDeleted: false,
    chunksDeleted: false,
  }
  try {
    await deleteKnowledgeDocument(params.documentId)
  } catch (err) {
    console.error(`[Knowledge API] Hard delete: Postgres delete failed for ${params.documentId}:`, err)
    return {
      status: 500,
      error: `Failed to delete document row: ${(err as Error).message?.slice(0, 200) ?? "unknown"}`,
    }
  }

  try {
    const surrealClient = await getSurrealClient()
    cleanupStats = await surrealClient.cleanupDocumentIntelligence(params.documentId)
  } catch (err) {
    console.error(
      `[Knowledge API] Hard delete: SurrealDB cleanup failed for ${params.documentId} (Postgres row already deleted; chunks orphan and will be filtered at retrieval). Manual sweep needed:`,
      err
    )
  }

  if (existing.s3Key) {
    try {
      await deleteFile(existing.s3Key)
    } catch (error) {
      console.error(
        `[Knowledge API] Hard delete: S3 delete failed for ${existing.s3Key} (Postgres row already deleted; file orphan). Manual sweep needed:`,
        error
      )
    }
  }

  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId,
    action: "document.hard_delete",
    entityType: "document",
    entityId: params.documentId,
    detail: {
      mode: "hard",
      relationTablesCleaned: cleanupStats.deletedRelationTables,
      entitiesDeleted: cleanupStats.entitiesDeleted,
      chunksDeleted: cleanupStats.chunksDeleted,
    },
    riskLevel: "high",
  })
  console.log(
    `Hard-deleted document ${params.documentId}: cleaned up relations from ${cleanupStats.deletedRelationTables} tables, entities: ${cleanupStats.entitiesDeleted}, chunks: ${cleanupStats.chunksDeleted}`
  )

  return { success: true, mode: "hard" }
}

/**
 * Restore a previously soft-deleted document.
 */
export async function restoreKnowledgeDocumentForDashboard(params: {
  documentId: string
  organizationId: string | null
  role: string | null | undefined
  userId: string | null
}): Promise<{ success: true } | ServiceError> {
  const existing = await findKnowledgeDocumentAccessById(params.documentId)
  if (!existing) {
    return { status: 404, error: "Document not found" }
  }

  if (!hasDocumentAccess(existing.organizationId, params.organizationId)) {
    return { status: 404, error: "Document not found" }
  }

  if (existing.organizationId && params.role && !canManage(params.role)) {
    return { status: 403, error: "Insufficient permissions" }
  }

  await restoreKnowledgeDocument(params.documentId)
  recordKnowledgeAudit({
    organizationId: params.organizationId,
    userId: params.userId,
    action: "document.restore",
    entityType: "document",
    entityId: params.documentId,
  })
  console.log(`Restored document ${params.documentId}`)
  return { success: true }
}
