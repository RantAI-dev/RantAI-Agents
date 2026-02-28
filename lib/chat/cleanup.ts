/**
 * Cleanup for temporary chat attachment documents
 *
 * Removes CHAT_ATTACHMENT documents older than 24 hours
 * from both PostgreSQL and SurrealDB.
 */

import { prisma } from "@/lib/prisma"
import { getSurrealClient } from "@/lib/surrealdb"

export interface CleanupResult {
  deletedCount: number
  documentIds: string[]
}

export async function cleanupExpiredAttachments(
  maxAgeHours: number = 24
): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000)

  // Find expired CHAT_ATTACHMENT documents
  const expiredDocs = await prisma.document.findMany({
    where: {
      categories: { has: "CHAT_ATTACHMENT" },
      createdAt: { lt: cutoff },
    },
    select: { id: true },
  })

  if (expiredDocs.length === 0) {
    return { deletedCount: 0, documentIds: [] }
  }

  const documentIds = expiredDocs.map((d) => d.id)

  // Delete chunks from SurrealDB
  const surrealClient = await getSurrealClient()
  await surrealClient.query(
    `DELETE document_chunk WHERE document_id IN $document_ids`,
    { document_ids: documentIds }
  )

  // Delete documents from PostgreSQL (cascades to DocumentGroup)
  await prisma.document.deleteMany({
    where: { id: { in: documentIds } },
  })

  console.log(
    `[Cleanup] Deleted ${documentIds.length} expired CHAT_ATTACHMENT documents`
  )

  return { deletedCount: documentIds.length, documentIds }
}
