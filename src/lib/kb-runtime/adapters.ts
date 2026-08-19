/**
 * App-side adapters for the KB ports.
 *
 * THIS IS THE ONLY FILE ON THE KB PATH ALLOWED TO IMPORT APP INFRASTRUCTURE.
 * When the engine moves to its own repo/service this file stays behind and is
 * replaced by that service's own bindings; everything it wires is already
 * expressed as a port in ./ports.
 *
 * Behavior must match what the engine did inline before the extraction —
 * this layer moves code, it does not change semantics.
 */

import { prisma } from "@/lib/prisma"
import type {
  BlobStore,
  ConfigProvider,
  DocumentStore,
  EndpointResolver,
  JobProcessor,
  JobRecord,
  JobStore,
  KbRuntime,
  ProgressSink,
  VectorStore,
} from "./ports"

const KB_CONFIG_SETTING_KEY = "kb_config"

/**
 * Everything below `prisma` is loaded on first use, not at import.
 *
 * The custom server (`apps/cloud/server.ts`) imports this module to bind the
 * ports before starting the ingest worker. A static import here therefore ends
 * up in the server's entry graph, unbundled — and `@/lib/llm/provider-registry`
 * pulls in `server-only`, which only resolves through Next's bundler. That
 * crash-looped the container at boot with "Cannot find package 'server-only'"
 * while the deploy still reported success. Lazy imports keep the composition
 * root cheap and make that class of failure impossible.
 */
const lazy = {
  s3: () => import("@/lib/s3"),
  socket: () => import("@/lib/socket"),
  surreal: () => import("@/lib/surrealdb"),
  credentials: () => import("@/lib/workflow/credentials"),
  providerRegistry: () => import("@/lib/llm/provider-registry"),
}

// ─── Blob ────────────────────────────────────────────────────────────────────

const blob: BlobStore = {
  async upload(key, body, contentType, meta) {
    const { uploadFile } = await lazy.s3()
    const result = await uploadFile(key, body, contentType, meta)
    return { size: result.size }
  },
  async download(key) {
    const { downloadFile } = await lazy.s3()
    return downloadFile(key)
  },
  async delete(key) {
    const { deleteFile } = await lazy.s3()
    await deleteFile(key)
  },
  // Path builders are pure string maths, duplicated here rather than imported
  // so key construction stays synchronous. Keep in sync with lib/s3#S3Paths.
  documentPath: (orgId, docId, filename) =>
    `documents/${orgId || "global"}/${docId}/${sanitizeKeySegment(filename)}`,
  assetPath: (orgId, docId, filename) =>
    `documents/${orgId || "global"}/${docId}/assets/${sanitizeKeySegment(filename)}`,
}

/** Mirrors lib/s3's sanitizeFilename. */
function sanitizeKeySegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

// ─── Progress ────────────────────────────────────────────────────────────────

const progress: ProgressSink = {
  async emit(organizationId, event, payload) {
    const { emitToOrgRoom } = await lazy.socket()
    emitToOrgRoom(organizationId, event, payload)
  },
}

// ─── Ingest jobs ─────────────────────────────────────────────────────────────

const jobs: JobStore = {
  async create(input) {
    try {
      const job = await prisma.ingestJob.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          filename: input.filename,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          s3Key: input.s3Key,
          documentId: input.documentId,
          status: "pending",
          step: "queued",
          params: input.params as object,
        },
        select: { id: true },
      })
      return job.id
    } catch (err) {
      console.warn("[ingest-job] create failed:", err)
      return null
    }
  },

  async claimNextPending(): Promise<JobRecord | null> {
    // FOR UPDATE SKIP LOCKED keeps concurrent app instances from grabbing the
    // same row — each takes a distinct job and neither blocks.
    const rows = await prisma.$queryRaw<JobRecord[]>`
      UPDATE "IngestJob"
         SET status = 'processing', "startedAt" = now(), "updatedAt" = now(), step = 'queued', progress = 0
       WHERE id = (
         SELECT id FROM "IngestJob"
          WHERE status = 'pending'
          ORDER BY "createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
      RETURNING id, "organizationId", "userId", "documentId", "s3Key", filename, "mimeType", attempt, params
    `
    return rows[0] ?? null
  },

  async updateProgress(jobId, data) {
    await prisma.ingestJob
      .update({ where: { id: jobId }, data })
      .catch((err) => console.warn("[ingest-job] progress update failed:", err))
  },

  async finish(jobId, data) {
    // Terminal writes must land: a lost one leaves the job "processing" and the
    // stale-reclaim later re-runs a document that already finished.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await prisma.ingestJob.update({ where: { id: jobId }, data })
        return
      } catch (err) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 500))
          continue
        }
        console.warn("[ingest-job] terminal update failed:", err)
      }
    }
  },

  async touch(jobId) {
    await prisma.ingestJob.update({ where: { id: jobId }, data: { updatedAt: new Date() } }).catch(() => {})
  },

  async reclaimStale(staleMs, maxAttempts) {
    const cutoff = new Date(Date.now() - staleMs)
    const stale = await prisma.ingestJob.findMany({
      where: { status: "processing", updatedAt: { lt: cutoff } },
      select: { id: true, attempt: true, documentId: true },
    })
    for (const job of stale) {
      if (job.attempt >= maxAttempts) {
        await prisma.ingestJob
          .update({
            where: { id: job.id },
            data: { status: "failed", error: "ingest stalled (max attempts reached)" },
          })
          .catch(() => {})
        if (job.documentId) {
          await prisma.document
            .update({ where: { id: job.documentId }, data: { status: "failed" } })
            .catch(() => {})
        }
      } else {
        await prisma.ingestJob
          .update({
            where: { id: job.id },
            data: { status: "pending", attempt: { increment: 1 }, startedAt: null, step: "queued", progress: 0 },
          })
          .catch(() => {})
      }
    }
    return stale.length
  },

  async listReapable(maxAgeDays, limit) {
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000)
    return prisma.ingestJob.findMany({
      where: { status: "failed", updatedAt: { lt: cutoff }, s3Key: { not: null } },
      select: { id: true, s3Key: true },
      take: limit,
    })
  },

  async clearS3Key(jobId) {
    await prisma.ingestJob.update({ where: { id: jobId }, data: { s3Key: null } })
  },
}

// ─── Documents ───────────────────────────────────────────────────────────────

const META_SELECT = { id: true, title: true, categories: true, subcategory: true } as const

const documents: DocumentStore = {
  async findAliveIdsByFilter(filter) {
    const where: Record<string, unknown> = { deletedAt: null }
    if (filter.category) where.categories = { has: filter.category }
    if (filter.groupIds && filter.groupIds.length > 0) {
      where.groups = { some: { groupId: { in: filter.groupIds } } }
    }
    const rows = await prisma.document.findMany({ where, select: { id: true } })
    return rows.map((r) => r.id)
  },

  async findAliveMetaByIds(ids) {
    if (ids.length === 0) return []
    return prisma.document.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: META_SELECT,
    })
  },

  async findById(id) {
    return prisma.document.findUnique({
      where: { id },
      select: { id: true, title: true, deletedAt: true },
    })
  },

  async filterVisibleIds(ids, organizationId) {
    if (ids.length === 0) return []
    const rows = await prisma.document.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        ...(organizationId !== null
          ? { OR: [{ organizationId }, { organizationId: null }] }
          : { organizationId: null }),
      },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  },

  async listAll() {
    return prisma.document.findMany({ select: { ...META_SELECT, createdAt: true } })
  },

  async deleteById(id) {
    await prisma.document.delete({ where: { id } })
  },

  async deleteAll() {
    await prisma.document.deleteMany()
  },

  async setStatus(documentId, status) {
    await prisma.document.update({ where: { id: documentId }, data: { status } }).catch((err) => {
      console.error(`[kb-adapter] setStatus failed for ${documentId}:`, err)
    })
  },

  async updateMetadata(documentId, patch) {
    const existing = await prisma.document.findUnique({
      where: { id: documentId },
      select: { metadata: true },
    })
    const merged = { ...((existing?.metadata as Record<string, unknown>) ?? {}), ...patch }
    await prisma.document.update({ where: { id: documentId }, data: { metadata: merged as object } })
  },

  async setMetadataFlag(documentId, key, value) {
    // jsonb_set keeps this a single atomic statement — a read-modify-write here
    // would drop concurrent metadata writes (figures, ragIndexed).
    try {
      await prisma.$executeRaw`
        UPDATE "Document"
        SET "metadata" = jsonb_set(
          COALESCE("metadata", '{}'::jsonb),
          ${`{${key}}`}::text[],
          to_jsonb(${value}::boolean),
          true
        )
        WHERE "id" = ${documentId}
      `
    } catch (err) {
      console.error("[kb-adapter] setMetadataFlag failed:", err)
    }
  },

  async recordRetrievalHits(documentIds) {
    if (documentIds.length === 0) return
    const { recordRetrievalHits } = await import("@/features/knowledge/documents/repository")
    await recordRetrievalHits(documentIds)
  },
}

// ─── Vector store ────────────────────────────────────────────────────────────

const vectors: VectorStore = {
  async query<T = unknown>(sql: string, vars?: Record<string, unknown>) {
    const { getSurrealClient } = await lazy.surreal()
    const client = await getSurrealClient()
    return client.query<T>(sql, vars)
  },
  async relate(from, relation, to, props) {
    const { getSurrealClient } = await lazy.surreal()
    const client = await getSurrealClient()
    await client.relate(from, relation, to, props)
  },
  async cleanupDocumentIntelligence(documentId) {
    const { getSurrealClient } = await lazy.surreal()
    const client = await getSurrealClient()
    return client.cleanupDocumentIntelligence(documentId)
  },
  async healthCheck() {
    const { getSurrealClient } = await lazy.surreal()
    const client = await getSurrealClient()
    return client.healthCheck()
  },
}

// ─── Config overrides ────────────────────────────────────────────────────────

const config: ConfigProvider = {
  async readKbSetting() {
    const row = await prisma.platformSetting.findUnique({ where: { key: KB_CONFIG_SETTING_KEY } })
    return (row?.value as Record<string, unknown> | undefined) ?? null
  },

  async resolveProvider(providerId) {
    const provider = await prisma.llmProvider.findUnique({ where: { id: providerId } })
    if (!provider) return null
    let apiKey: string | null = null
    if (provider.encryptedApiKey) {
      try {
        const { decryptCredential } = await lazy.credentials()
        const decrypted = decryptCredential(provider.encryptedApiKey).apiKey
        if (typeof decrypted === "string") apiKey = decrypted
      } catch (err) {
        console.warn(
          `[kb-config] could not decrypt embedding provider key: ${err instanceof Error ? err.message : err}`
        )
      }
    }
    return { enabled: provider.enabled, baseUrl: provider.baseUrl ?? null, apiKey }
  },
}

// ─── Endpoint resolution ─────────────────────────────────────────────────────

const endpoints: EndpointResolver = {
  async resolveModel(modelId) {
    const { getProviderRegistry } = await lazy.providerRegistry()
    const registry = getProviderRegistry()
    const providerId = registry.modelProvider.get(modelId)
    if (!providerId) return null
    const provider = registry.providers.get(providerId)
    if (provider?.type === "openai_compatible" && provider.baseUrl) {
      return { baseUrl: provider.baseUrl, apiKey: provider.apiKey || "" }
    }
    return null
  },
}

// ─── Ingest job execution ────────────────────────────────────────────────────

const processor: JobProcessor = {
  async process(job, onProgress) {
    // Lazy: keeps the heavy knowledge-service graph out of module load for
    // callers that only need retrieval.
    const { processIngestJob } = await import("@/features/knowledge/documents/service")
    return processIngestJob(job as never, onProgress as never)
  },
}

/** Every port bound to the app's real infrastructure. */
export function appKbRuntime(): KbRuntime {
  return { blob, progress, jobs, documents, vectors, config, endpoints, processor }
}
