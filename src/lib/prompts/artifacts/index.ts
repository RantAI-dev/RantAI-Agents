import { htmlArtifact } from "./html"
import { reactArtifact } from "./react"
import { svgArtifact } from "./svg"
import { mermaidArtifact } from "./mermaid"
import { slidesArtifact } from "./slides"
import { codeArtifact } from "./code"
import { pythonArtifact } from "./python"
import { sheetArtifact } from "./sheet"
import { markdownArtifact } from "./markdown"
import { latexArtifact } from "./latex"
import { r3fArtifact } from "./r3f"

export const ALL_ARTIFACTS = [
  htmlArtifact,
  reactArtifact,
  svgArtifact,
  mermaidArtifact,
  slidesArtifact,
  codeArtifact,
  pythonArtifact,
  sheetArtifact,
  markdownArtifact,
  latexArtifact,
  r3fArtifact,
] as const

/** Canonical tuple of artifact MIME types, derived from ALL_ARTIFACTS. */
export const ARTIFACT_TYPES = ALL_ARTIFACTS.map((a) => a.type) as readonly ArtifactType[]

/** Union of all valid artifact MIME types. */
export type ArtifactType = (typeof ALL_ARTIFACTS)[number]["type"]

const ARTIFACT_TYPE_SET = new Set<string>(ARTIFACT_TYPES)

/** Type guard: narrows an arbitrary string to ArtifactType when valid. */
export function isArtifactType(value: unknown): value is ArtifactType {
  return typeof value === "string" && ARTIFACT_TYPE_SET.has(value)
}

/**
 * Canonical label map: MIME type → user-facing display label.
 * Single source of truth — consumed by the LLM system prompt AND the UI
 * (via re-export from features/.../artifacts/constants.ts).
 */
export const ARTIFACT_LABELS: Record<ArtifactType, string> = Object.fromEntries(
  ALL_ARTIFACTS.map((a) => [a.type, a.label]),
) as Record<ArtifactType, string>

export const ARTIFACT_TYPE_INSTRUCTIONS: Record<ArtifactType, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.rules])) as Record<
    ArtifactType,
    string
  >

export const ARTIFACT_TYPE_SUMMARIES: Record<ArtifactType, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.summary])) as Record<
    ArtifactType,
    string
  >
