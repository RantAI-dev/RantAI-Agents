/**
 * Shared Prisma where-fragments for "alive" Documents (`deletedAt: null`).
 *
 * Every Document listing / counting query in the knowledge feature must hide
 * soft-deleted rows by default — otherwise the sidebar + Agent Builder show
 * stale counts (see commit 73d7c28a). These constants make that filter
 * unforgettable and grep-able: search for `prisma.document.(count|findMany)`
 * call sites that lack `aliveDocumentWhere` / `aliveDocumentRelation` in code
 * review and you've found every regression candidate.
 *
 * Callers that *want* soft-deleted rows (the trash view, restore endpoint,
 * retention sweep cron) should compose explicit `where: { deletedAt: ... }`
 * conditions instead of using these helpers — that intent is visible in the
 * diff and PR review.
 */

/**
 * Top-level Prisma where fragment for finding/counting alive Documents.
 *
 *   prisma.document.count({ where: { ...aliveDocumentWhere, organizationId } })
 */
export const aliveDocumentWhere = { deletedAt: null } as const

/**
 * Prisma `_count.select` / nested-relation where fragment for counting only
 * the join rows whose target Document is alive. Use for
 * `_count: { select: { documents: aliveDocumentRelation } }` on models that
 * relate to Document via a join table (KnowledgeBaseGroup → DocumentGroup,
 * etc.).
 */
export const aliveDocumentRelation = {
  where: { document: aliveDocumentWhere },
} as const
