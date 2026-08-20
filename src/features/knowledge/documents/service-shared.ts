import { Prisma } from "@prisma/client"

/**
 * Shared types and mappers for the knowledge documents feature.
 *
 * Split out of service.ts so the read, write and ingest-facade modules stay
 * readable; these are the pieces all three need.
 */

export interface ServiceError {
  status: number
  error: string
}

export interface KnowledgeDocumentContext {
  userId: string
  organizationId: string | null
  role?: string | null
}

export interface KnowledgeDocumentListItem {
  id: string
  title: string
  categories: string[]
  subcategory: string | null
  fileType: string
  artifactType: string | null
  fileSize: number | null
  hasS3File: boolean
  thumbnailUrl?: string
  chunkCount: number
  groups: Array<{ id: string; name: string; color: string | null }>
  createdAt: string
  updatedAt: string
  // Ingest lifecycle: "ready" (default) | "processing" | "failed".
  status: string
  // Live progress snapshot for a doc still being ingested (null otherwise) —
  // lets the card render its bar on first load / reload without the socket.
  ingest?: {
    jobId: string
    step: string | null
    progress: number
    stepCurrent: number | null
    stepTotal: number | null
    etaSeconds: number | null
    error: string | null
  } | null
}

export interface KnowledgeDocumentDetail {
  id: string
  title: string
  content: string
  categories: string[]
  subcategory: string | null
  groups: Array<{ id: string; name: string; color: string | null }>
  metadata: Prisma.JsonValue | null
  fileType: string
  artifactType: string | null
  fileSize: number | null
  mimeType: string | null
  s3Key: string | null
  fileUrl?: string
  chunks: Array<{ id: string; content: string; chunkIndex: number; chunkType: string | null; createdAt: string }>
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocumentIntelligenceResponse {
  entities: Array<{
    id: string
    name: string
    type: string
    confidence: number
    document_id: string
    chunk_id?: string
    metadata?: { context?: string; source?: "pattern" | "llm" }
  }>
  relations: Array<{
    id: string
    in: string
    out: string
    relation_type: string
    confidence: number
    metadata?: { context?: string; description?: string }
  }>
  status: "completed"
  stats: {
    totalEntities: number
    totalRelations: number
    entityTypes: number
    relationTypes: number
  }
}

export type SupportedImageExt = ".png" | ".jpg" | ".jpeg" | ".gif" | ".webp" | ".heic"

export function mapFileType(document: {
  fileType?: string | null
  metadata?: Prisma.JsonValue | null
}) {
  return document.fileType || (document.metadata as { fileType?: string } | null)?.fileType || "markdown"
}

export function mapGroups(groups: Array<{ group: { id: string; name: string; color: string | null } }>) {
  return groups.map((entry) => entry.group)
}

export function normalizeSurrealId(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  if (value && typeof value === "object") {
    const record = value as { tb?: unknown; id?: unknown }
    if (typeof record.tb === "string" && typeof record.id === "string") {
      return `${record.tb}:${record.id}`
    }
    if (typeof record.id === "string") {
      return record.id
    }
  }

  return String(value)
}

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

export function toCategoryList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
  }

  if (typeof value === "string" && value.length > 0) {
    return [value]
  }

  return []
}

export function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
  }

  return []
}

export function hasDocumentAccess(documentOrganizationId: string | null, organizationId: string | null) {
  // Org-scoped doc: caller must be in the same org.
  if (documentOrganizationId) {
    return organizationId !== null && documentOrganizationId === organizationId
  }
  // Null-org (personal/global) doc: any caller in any org context can access.
  // This matches the listing query's permissiveness at repository.ts:16-18,
  // which surfaces null-org docs to org-active callers via the OR clause.
  // Previously this branch returned `organizationId === null`, which meant
  // null-org docs were visible-but-unmutable from any org context — Files
  // page DELETE returned 404 even though the row appeared in the list.
  return true
}

export function mapListItem(document: {
  id: string
  title: string
  categories: string[]
  subcategory: string | null
  fileType?: string | null
  metadata?: Prisma.JsonValue | null
  artifactType?: string | null
  fileSize: number | null
  s3Key: string | null
  status?: string | null
  groups: Array<{ group: { id: string; name: string; color: string | null } }>
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: document.id,
    title: document.title,
    categories: document.categories,
    subcategory: document.subcategory,
    fileType: mapFileType(document),
    artifactType: document.artifactType || null,
    fileSize: document.fileSize,
    hasS3File: Boolean(document.s3Key),
    status: document.status || "ready",
    groups: mapGroups(document.groups),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

/**
 * Same-origin streaming URL for a stored file. RustFS is internal-only (no
 * published port), so a presigned `http://rustfs:9000/...` URL is unreachable
 * from the browser — hand it `/api/files/[...key]` instead, which streams the
 * bytes through the (auth + org-scoped) app route.
 */
export function appFileUrl(s3Key: string): string {
  const encoded = s3Key.split("/").map(encodeURIComponent).join("/")
  return `/api/files/${encoded}`
}

export function resolveImageThumbnail(s3Key: string | null | undefined) {
  if (!s3Key) return undefined
  return appFileUrl(s3Key)
}
