import { prisma } from "@/lib/prisma"

/**
 * Knowledge audit log helper. Fire-and-forget — never blocks the calling
 * mutation, errors are logged and swallowed.
 *
 * Reuses the existing AuditLog model (originally added for digital-employee
 * tool execution) by emitting events with action prefixes like
 * "document.create" / "category.update" / "knowledgeBaseGroup.delete".
 *
 * Requires a non-null organizationId because the existing schema has a
 * required FK to Organization. Global / null-org mutations (system category
 * seeds, sample documents) are silently skipped — they're invariably done by
 * scripts or migrations, not user actions.
 */
export type KnowledgeAuditAction =
  | "document.create"
  | "document.update"
  | "document.delete"
  | "document.hard_delete"
  | "document.restore"
  | "document.reembed"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "knowledgeBaseGroup.create"
  | "knowledgeBaseGroup.update"
  | "knowledgeBaseGroup.delete"

export interface KnowledgeAuditParams {
  organizationId: string | null
  userId: string | null
  action: KnowledgeAuditAction
  /** Stable entity id; written as resource = "<entityType>:<id>". */
  entityType: "document" | "category" | "knowledgeBaseGroup"
  entityId: string
  /** Optional structured payload (changed fields, before/after snippets). */
  detail?: Record<string, unknown>
  /** Defaults to "low"; bump for hard deletes or mass operations. */
  riskLevel?: "low" | "medium" | "high" | "critical"
}

export function recordKnowledgeAudit(params: KnowledgeAuditParams): void {
  if (!params.organizationId) return
  void prisma.auditLog
    .create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        action: params.action,
        resource: `${params.entityType}:${params.entityId}`,
        detail: (params.detail ?? {}) as never,
        riskLevel: params.riskLevel ?? "low",
      },
    })
    .catch((err) => console.warn("[audit] recordKnowledgeAudit failed:", err))
}
