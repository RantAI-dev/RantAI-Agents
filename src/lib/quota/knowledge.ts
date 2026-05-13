import { prisma } from "@/lib/prisma"

export interface QuotaCheckResult {
  allowed: boolean
  reason?: string
  current: { documents: number; storageBytes: number }
  limits: { maxDocuments: number | null; maxStorageBytes: number | null }
}

/**
 * Pre-upload quota check. Returns { allowed: false, reason } when the org has
 * hit either the document-count cap or the cumulative storage-bytes cap, so
 * the caller can reject with 413/422 before touching S3 or the chunker.
 *
 * Both limits are nullable on Organization — null means unlimited (default
 * for orgs created before this feature shipped). Personal / null-org uploads
 * are always allowed.
 */
export async function checkKnowledgeQuota(
  organizationId: string | null,
  incomingBytes: number
): Promise<QuotaCheckResult> {
  if (!organizationId) {
    return {
      allowed: true,
      current: { documents: 0, storageBytes: 0 },
      limits: { maxDocuments: null, maxStorageBytes: null },
    }
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { maxDocuments: true, maxStorageBytes: true },
  })
  if (!org) {
    return {
      allowed: true,
      current: { documents: 0, storageBytes: 0 },
      limits: { maxDocuments: null, maxStorageBytes: null },
    }
  }

  const maxDocs = org.maxDocuments
  const maxBytes = org.maxStorageBytes !== null ? Number(org.maxStorageBytes) : null

  const noLimits = maxDocs === null && maxBytes === null
  if (noLimits) {
    return {
      allowed: true,
      current: { documents: 0, storageBytes: 0 },
      limits: { maxDocuments: null, maxStorageBytes: null },
    }
  }

  const [docCount, bytesAgg] = await Promise.all([
    prisma.document.count({
      where: { organizationId, deletedAt: null },
    }),
    prisma.document.aggregate({
      where: { organizationId, deletedAt: null, fileSize: { not: null } },
      _sum: { fileSize: true },
    }),
  ])
  const currentBytes = bytesAgg._sum.fileSize ?? 0

  if (maxDocs !== null && docCount + 1 > maxDocs) {
    return {
      allowed: false,
      reason: `Document quota exceeded: ${docCount}/${maxDocs}`,
      current: { documents: docCount, storageBytes: currentBytes },
      limits: { maxDocuments: maxDocs, maxStorageBytes: maxBytes },
    }
  }
  if (maxBytes !== null && currentBytes + incomingBytes > maxBytes) {
    return {
      allowed: false,
      reason: `Storage quota exceeded: ${currentBytes + incomingBytes} > ${maxBytes} bytes`,
      current: { documents: docCount, storageBytes: currentBytes },
      limits: { maxDocuments: maxDocs, maxStorageBytes: maxBytes },
    }
  }

  return {
    allowed: true,
    current: { documents: docCount, storageBytes: currentBytes },
    limits: { maxDocuments: maxDocs, maxStorageBytes: maxBytes },
  }
}
