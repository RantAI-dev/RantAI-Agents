import type { ArtifactType } from "@/lib/prompts/artifacts"

// Re-export canonical artifact type definitions from the prompt layer so
// UI and prompt layers share a single source of truth (labels, type union,
// guard).
export {
  ARTIFACT_TYPES,
  isArtifactType,
  type ArtifactType,
} from "@/lib/prompts/artifacts"

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
