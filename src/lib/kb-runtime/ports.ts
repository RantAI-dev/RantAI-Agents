/**
 * KB engine ports.
 *
 * Interfaces ONLY — this file must never import anything. The engine
 * (lib/rag, lib/ingest, lib/ocr, lib/document-intelligence, lib/files) talks
 * to the outside world exclusively through these, so it can be lifted into its
 * own repo/service without dragging the app along. The bindings to prisma /
 * s3 / socket / surrealdb live in ./adapters, which stays behind at split time.
 *
 * Every port here is shaped from real call sites — nothing speculative.
 */

// ─── Blob storage ────────────────────────────────────────────────────────────

export interface BlobStore {
  upload(
    key: string,
    body: Buffer,
    contentType: string,
    meta?: Record<string, string>
  ): Promise<{ size: number }>
  download(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  /** Storage key for a document's original file. */
  documentPath(organizationId: string | null, documentId: string, filename: string): string
  /** Storage key for a derived asset (figure crop, table image). */
  assetPath(organizationId: string | null, documentId: string, filename: string): string
}

// ─── Live progress ───────────────────────────────────────────────────────────

export interface ProgressSink {
  /** Broadcast to everyone watching an organization. Best-effort: never throws. */
  emit(organizationId: string, event: string, payload: Record<string, unknown>): Promise<void>
}

// ─── Ingest jobs ─────────────────────────────────────────────────────────────

export interface JobRecord {
  id: string
  organizationId: string | null
  userId: string | null
  documentId: string | null
  s3Key: string | null
  filename: string
  mimeType: string | null
  attempt: number
  params: Record<string, unknown> | null
}

export interface JobStore {
  create(input: {
    organizationId: string | null
    userId: string | null
    filename: string
    fileSize: number | null
    mimeType: string | null
    s3Key: string | null
    documentId: string | null
    params: Record<string, unknown>
  }): Promise<string | null>
  /** Atomically flip the oldest pending job to processing. */
  claimNextPending(): Promise<JobRecord | null>
  updateProgress(jobId: string, data: Record<string, unknown>): Promise<void>
  /** Terminal write; must be durable (retry internally). */
  finish(jobId: string, data: Record<string, unknown>): Promise<void>
  /** Bump updatedAt so a live job isn't mistaken for a stalled one. */
  touch(jobId: string): Promise<void>
  reclaimStale(staleMs: number, maxAttempts: number): Promise<number>
  listReapable(maxAgeDays: number, limit: number): Promise<Array<{ id: string; s3Key: string | null }>>
  clearS3Key(jobId: string): Promise<void>
}

// ─── Document metadata (the relational side) ─────────────────────────────────

export interface DocumentMeta {
  id: string
  title: string
  categories: string[]
  subcategory: string | null
}

export interface DocumentListItem extends DocumentMeta {
  createdAt: Date
}

export interface DocumentStore {
  /** Pre-filter for retrieval: alive document ids matching category/group. */
  findAliveIdsByFilter(filter: { category?: string; groupIds?: string[] }): Promise<string[]>
  /** Metadata for search hits; soft-deleted docs are excluded. */
  findAliveMetaByIds(ids: string[]): Promise<DocumentMeta[]>
  findById(id: string): Promise<{ id: string; title: string; deletedAt: Date | null } | null>
  /** Alive ids from `ids` visible to an org (own + global). */
  filterVisibleIds(ids: string[], organizationId: string | null): Promise<string[]>
  listAll(): Promise<DocumentListItem[]>
  deleteById(id: string): Promise<void>
  deleteAll(): Promise<void>
  setStatus(documentId: string, status: string): Promise<void>
  updateMetadata(documentId: string, patch: Record<string, unknown>): Promise<void>
  /** Fire-and-forget retrieval analytics. */
  recordRetrievalHits(documentIds: string[]): Promise<void>
}

// ─── Vector / graph store ────────────────────────────────────────────────────

export interface VectorStore {
  query<T = unknown>(sql: string, vars?: Record<string, unknown>): Promise<T>
  relate(from: string, relation: string, to: string, props: Record<string, unknown>): Promise<void>
  cleanupDocumentIntelligence(documentId: string): Promise<{
    deletedRelationTables: number
    entitiesDeleted: number
    chunksDeleted: number
  }>
}

// ─── Runtime configuration overrides ─────────────────────────────────────────

export interface ManagedProvider {
  enabled: boolean
  baseUrl: string | null
  /** Already decrypted by the adapter — the engine never handles ciphertext. */
  apiKey: string | null
}

export interface ConfigProvider {
  /** Raw stored KB config blob (DB overrides), or null when unset. */
  readKbSetting(): Promise<Record<string, unknown> | null>
  resolveProvider(providerId: string): Promise<ManagedProvider | null>
}

// ─── LLM endpoint resolution ─────────────────────────────────────────────────

export interface EndpointResolver {
  /** Synchronous by contract — callers resolve endpoints inline. */
  resolveModel(modelId: string): { baseUrl: string; apiKey: string } | null
}

// ─── Ingest job execution ────────────────────────────────────────────────────

export interface JobProcessor {
  process(
    job: JobRecord,
    onProgress: (progress: { step: string; current?: number; total?: number }) => void | Promise<void>
  ): Promise<"ready" | "failed">
}

// ─── The runtime ─────────────────────────────────────────────────────────────

export interface KbRuntime {
  blob: BlobStore
  progress: ProgressSink
  jobs: JobStore
  documents: DocumentStore
  vectors: VectorStore
  config: ConfigProvider
  endpoints: EndpointResolver
  processor: JobProcessor
}
