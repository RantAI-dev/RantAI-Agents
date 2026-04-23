/**
 * Single source of truth for artifact-type metadata.
 *
 * Adding a new artifact type? Add ONE entry here. Every derived map
 * (`ARTIFACT_TYPES`, `VALID_ARTIFACT_TYPES`, `TYPE_ICONS`, `TYPE_LABELS`,
 * `TYPE_SHORT_LABELS`, `TYPE_COLORS`), the `ArtifactType` union, the Zod
 * enum in `create-artifact`, the validator dispatch, the renderer switch,
 * and the panel chrome will all see it automatically (or — for switches —
 * fail at compile time so you know to add the case).
 *
 * Client-safe: this module imports only icon components, no prompt rules
 * and no validators. Do NOT add server-only deps here. Anything UI chrome
 * needs lives on `ArtifactRegistryEntry`; anything server-only (LLM rules,
 * runtime content validation) stays in `lib/prompts/artifacts/*` and
 * `lib/tools/builtin/_validate-artifact.ts`.
 */

import {
  Globe,
  FileCode,
  Image,
  GitBranch,
  FileText,
  BookOpen,
  Code,
  Table2,
  Sigma,
  Presentation,
  Terminal,
  Box,
} from "@/lib/icons"

type IconComponent = typeof Globe

export interface ArtifactRegistryEntry {
  /** Canonical MIME-style id used everywhere in the artifact pipeline. */
  type: string
  /** Long descriptive label for the panel header tagline. */
  label: string
  /** Compact label for the panel header pill. */
  shortLabel: string
  /** Icon component for chips, toolbar pickers, and badges. */
  icon: IconComponent
  /** Tailwind utility classes (text/bg/border) for chips and badges. */
  colorClasses: string
  /** Filename extension when downloading the source content. */
  extension: string
  /**
   * Syntax-highlight language for the code tab. Empty string means
   * "no language" — used for `application/code` (the language is carried
   * on the artifact instance instead).
   */
  codeLanguage: string
  /**
   * Whether this type renders a separate code/preview tab pair. False
   * for `application/code` (preview *is* the code) and `text/document`
   * (preview is the source of truth — same bytes the user downloads).
   */
  hasCodeTab: boolean
}

export const ARTIFACT_REGISTRY = [
  {
    type: "text/html",
    label: "HTML Page",
    shortLabel: "HTML",
    icon: Globe,
    colorClasses: "text-orange-500 bg-orange-500/10 border-orange-500/20",
    extension: ".html",
    codeLanguage: "html",
    hasCodeTab: true,
  },
  {
    type: "application/react",
    label: "React Component",
    shortLabel: "React",
    icon: FileCode,
    colorClasses: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    extension: ".tsx",
    codeLanguage: "tsx",
    hasCodeTab: true,
  },
  {
    type: "image/svg+xml",
    label: "SVG Graphic",
    shortLabel: "SVG",
    icon: Image,
    colorClasses: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    extension: ".svg",
    codeLanguage: "svg",
    hasCodeTab: true,
  },
  {
    type: "application/mermaid",
    label: "Mermaid Diagram",
    shortLabel: "Mermaid",
    icon: GitBranch,
    colorClasses: "text-purple-500 bg-purple-500/10 border-purple-500/20",
    extension: ".mmd",
    codeLanguage: "mermaid",
    hasCodeTab: true,
  },
  {
    type: "text/markdown",
    label: "Markdown",
    shortLabel: "Markdown",
    icon: FileText,
    colorClasses: "text-gray-500 bg-gray-500/10 border-gray-500/20",
    extension: ".md",
    codeLanguage: "markdown",
    hasCodeTab: true,
  },
  {
    type: "text/document",
    label: "Document",
    shortLabel: "Document",
    icon: BookOpen,
    colorClasses: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    extension: ".md",
    codeLanguage: "",
    hasCodeTab: false,
  },
  {
    type: "application/code",
    label: "Code",
    shortLabel: "Code",
    icon: Code,
    colorClasses: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
    extension: ".txt",
    codeLanguage: "",
    hasCodeTab: false,
  },
  {
    type: "application/sheet",
    label: "Spreadsheet",
    shortLabel: "Spreadsheet",
    icon: Table2,
    colorClasses: "text-green-500 bg-green-500/10 border-green-500/20",
    extension: ".csv",
    codeLanguage: "csv",
    hasCodeTab: true,
  },
  {
    type: "text/latex",
    label: "LaTeX / Math",
    shortLabel: "LaTeX",
    icon: Sigma,
    colorClasses: "text-rose-500 bg-rose-500/10 border-rose-500/20",
    extension: ".tex",
    codeLanguage: "latex",
    hasCodeTab: true,
  },
  {
    type: "application/slides",
    label: "Slides",
    shortLabel: "Slides",
    icon: Presentation,
    colorClasses: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
    extension: ".pptx",
    codeLanguage: "json",
    hasCodeTab: true,
  },
  {
    type: "application/python",
    label: "Python Script",
    shortLabel: "Python",
    icon: Terminal,
    colorClasses: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
    extension: ".py",
    codeLanguage: "python",
    hasCodeTab: true,
  },
  {
    type: "application/3d",
    label: "3D Scene",
    shortLabel: "R3F Scene",
    icon: Box,
    colorClasses: "text-pink-500 bg-pink-500/10 border-pink-500/20",
    extension: ".tsx",
    codeLanguage: "tsx",
    hasCodeTab: true,
  },
] as const satisfies readonly ArtifactRegistryEntry[]

export type ArtifactType = (typeof ARTIFACT_REGISTRY)[number]["type"]

export const ARTIFACT_TYPES = ARTIFACT_REGISTRY.map((e) => e.type) as readonly ArtifactType[]

export const VALID_ARTIFACT_TYPES: ReadonlySet<ArtifactType> = new Set(ARTIFACT_TYPES)

const BY_TYPE = new Map<ArtifactType, ArtifactRegistryEntry>(
  ARTIFACT_REGISTRY.map((e) => [e.type, e] as const)
)

/** Return the registry entry for an artifact type, or undefined if unknown. */
export function getArtifactRegistryEntry(
  type: string
): ArtifactRegistryEntry | undefined {
  return BY_TYPE.get(type as ArtifactType)
}

export const TYPE_ICONS: Record<ArtifactType, IconComponent> =
  Object.fromEntries(ARTIFACT_REGISTRY.map((e) => [e.type, e.icon])) as Record<
    ArtifactType,
    IconComponent
  >

export const TYPE_LABELS: Record<ArtifactType, string> = Object.fromEntries(
  ARTIFACT_REGISTRY.map((e) => [e.type, e.label])
) as Record<ArtifactType, string>

export const TYPE_SHORT_LABELS: Record<ArtifactType, string> = Object.fromEntries(
  ARTIFACT_REGISTRY.map((e) => [e.type, e.shortLabel])
) as Record<ArtifactType, string>

export const TYPE_COLORS: Record<ArtifactType, string> = Object.fromEntries(
  ARTIFACT_REGISTRY.map((e) => [e.type, e.colorClasses])
) as Record<ArtifactType, string>
