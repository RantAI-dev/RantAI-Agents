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

export const CANVAS_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_ARTIFACTS.map((a) => [a.type, a.label]),
)

export const ARTIFACT_TYPE_INSTRUCTIONS: Record<string, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.rules]))

export const ARTIFACT_TYPE_SUMMARIES: Record<string, string> =
  Object.fromEntries(ALL_ARTIFACTS.map((a) => [a.type, a.summary]))
