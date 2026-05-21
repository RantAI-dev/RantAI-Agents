/**
 * Artifact data shapes consumed across chat UI, hooks, and persistence.
 *
 * `ArtifactType` and `VALID_ARTIFACT_TYPES` are derived from `./registry` —
 * the single source of truth for artifact type metadata. To add a new
 * artifact type, edit `./registry.ts`.
 */

export {
  ARTIFACT_TYPES,
  VALID_ARTIFACT_TYPES,
} from "./registry"
export type { ArtifactType } from "./registry"

import { VALID_ARTIFACT_TYPES, type ArtifactType } from "./registry"

export function isValidArtifactType(value: unknown): value is ArtifactType {
  return typeof value === "string" && VALID_ARTIFACT_TYPES.has(value as ArtifactType)
}

export interface ArtifactVersion {
  content: string
  title: string
  timestamp: number
}

export interface Artifact {
  id: string
  title: string
  type: ArtifactType
  content: string
  language?: string
  version: number
  previousVersions: ArtifactVersion[]
  /**
   * Number of historical versions that were evicted by the FIFO version
   * cap (currently 20). Used by the UI to show "+N earlier versions
   * evicted" so users aren't surprised when older history disappears.
   */
  evictedVersionCount?: number
  /**
   * Whether this artifact has been successfully indexed into RAG. `false`
   * surfaces a "not searchable" badge in the panel header so users know
   * the indexing pipeline missed (or is still pending) for this artifact.
   */
  ragIndexed?: boolean
  /**
   * True when the artifact's content was validated server-side but the
   * persistence write (S3 / Prisma) failed. The content is live in-memory
   * but is NOT backed by storage — a page reload loses it. The artifact
   * panel renders a "Save failed — Retry" banner for these.
   */
  ephemeral?: boolean
  /**
   * Storage backend's error message captured at the moment persistence
   * failed. Surfaced verbatim in the retry banner so the user understands
   * what went wrong ("InternalError" vs "ServiceUnavailable" vs "SlowDown").
   */
  persistenceError?: string
}

/** Shape returned from the session API for persisted artifacts */
export interface PersistedArtifact {
  id: string
  title: string
  content: string
  artifactType: string
  metadata?: {
    artifactLanguage?: string
    versions?: Array<{ content: string; title: string; timestamp: number }>
    evictedVersionCount?: number
    ragIndexed?: boolean
  } | null
}
