import { htmlArtifact } from "./html"
import { reactArtifact } from "./react"
import { svgArtifact } from "./svg"
import { mermaidArtifact } from "./mermaid"
import { slidesArtifact } from "./slides"
import { codeArtifact } from "./code"
import { pythonArtifact } from "./python"
import { sheetArtifact } from "./sheet"
import { markdownArtifact } from "./markdown"
import { documentArtifact } from "./document"
import { latexArtifact } from "./latex"
import { r3fArtifact } from "./r3f"
import type { ArtifactType } from "@/features/conversations/components/chat/artifacts/registry"

/**
 * Tuple of per-type prompt modules. The `satisfies` clause forces every
 * entry's `type` field to match a registered `ArtifactType` from the
 * artifact registry — adding a prompt module for a type that isn't in
 * the registry (or vice-versa) is a compile-time error.
 */
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
  documentArtifact,
  latexArtifact,
  r3fArtifact,
] as const satisfies ReadonlyArray<{
  type: ArtifactType
  label: string
  summary: string
  rules: string
  examples: ReadonlyArray<{ label: string; code: string }>
}>

export const CANVAS_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_ARTIFACTS.map((a) => [a.type, a.label]),
)

export const ARTIFACT_TYPE_INSTRUCTIONS: Record<string, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.rules]))

export const ARTIFACT_TYPE_SUMMARIES: Record<string, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.summary]))
