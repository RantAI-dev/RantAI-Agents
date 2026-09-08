/**
 * Artifact recovery — promote artifact source the model wrote *as chat text*
 * into a real `create_artifact` call.
 *
 * Weaker models, when handed a strict "the content must be raw JSON / a
 * single component / no fences" spec, sometimes obey it in their reply
 * instead of in the tool argument. The user then sees a wall of JSON and no
 * preview. This module decides whether a finished reply contains something
 * that should have been an artifact; `runChat` then executes the tool with
 * that content and emits synthetic tool events so the client renders it
 * exactly as if the model had called the tool.
 *
 * Pure detection only. No I/O.
 */

import type { ArtifactType } from "@/features/conversations/components/chat/artifacts/registry"

export interface RecoveredArtifact {
  type: ArtifactType
  content: string
  language: string | undefined
}

export interface DetectOptions {
  /** `true` / `"auto"` / a specific type, or null when canvas mode is off. */
  canvasMode: string | boolean | null | undefined
  /** Whether `create_artifact` was in the model's tool list this turn. */
  toolAvailable?: boolean
}

/** A fence must be at least this many lines to be promoted as a code artifact. */
const MIN_CODE_LINES = 15

const JSON_CONTENT_TYPES = new Set<ArtifactType>([
  "application/slides",
  "application/python",
  "application/sheet",
])

interface Fence {
  lang: string
  body: string
}

function extractFences(text: string): Fence[] {
  const out: Fence[] = []
  const re = /```([\w+-]*)[^\n]*\n([\s\S]*?)\n?```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const body = m[2].trim()
    if (body) out.push({ lang: m[1].toLowerCase(), body })
  }
  return out
}

/** Largest `{...}` span that parses as a JSON object, or null. */
function extractBareJsonObject(text: string): { raw: string; value: Record<string, unknown> } | null {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  const raw = text.slice(start, end + 1)
  if (raw.length < 40) return null
  try {
    const value = JSON.parse(raw)
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { raw, value: value as Record<string, unknown> }
    }
  } catch {
    // not JSON
  }
  return null
}

function parseJsonObject(body: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(body)
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function jsonShapeToType(obj: Record<string, unknown>): ArtifactType | null {
  if (Array.isArray(obj.slides) && obj.theme) return "application/slides"
  if (Array.isArray(obj.cells)) return "application/python"
  if (obj.kind === "spreadsheet/v1" || Array.isArray(obj.sheets)) return "application/sheet"
  return null
}

const R3F_MARKERS = /\buseFrame\b|\buseThree\b|<mesh\b|<group\b|<boxGeometry\b|<sphereGeometry\b|<meshStandardMaterial\b|\bTHREE\./

function looksLikeReactComponent(body: string): boolean {
  return /export\s+default\b/.test(body) && /<[A-Za-z]/.test(body)
}

function fenceToType(f: Fence): RecoveredArtifact | null {
  const lines = f.body.split("\n").length
  switch (f.lang) {
    case "json": {
      const obj = parseJsonObject(f.body)
      const t = obj ? jsonShapeToType(obj) : null
      return t ? { type: t, content: f.body, language: undefined } : null
    }
    case "html":
      return /<html[\s>]|<!doctype/i.test(f.body) && lines >= MIN_CODE_LINES
        ? { type: "text/html", content: f.body, language: undefined }
        : null
    case "svg":
      return /^<svg[\s>]/i.test(f.body) ? { type: "image/svg+xml", content: f.body, language: undefined } : null
    case "mermaid":
      return { type: "application/mermaid", content: f.body, language: undefined }
    case "jsx":
    case "tsx":
    case "react":
      if (!looksLikeReactComponent(f.body)) return null
      return {
        type: R3F_MARKERS.test(f.body) ? "application/3d" : "application/react",
        content: f.body,
        language: undefined,
      }
    case "":
      return null
    default:
      if (f.lang === "xml" && /^<svg[\s>]/i.test(f.body)) {
        return { type: "image/svg+xml", content: f.body, language: undefined }
      }
      return lines >= MIN_CODE_LINES
        ? { type: "application/code", content: f.body, language: f.lang }
        : null
  }
}

/**
 * Decide whether `text` (the model's full final reply) contains artifact
 * source that should be promoted. Returns the artifact to create, or null.
 */
export function detectArtifactInText(text: string, opts: DetectOptions): RecoveredArtifact | null {
  const { canvasMode, toolAvailable } = opts
  if (!canvasMode && !toolAvailable) return null
  if (!text || text.trim().length === 0) return null

  const fences = extractFences(text)

  // Specific canvas type: the user asked for exactly this, so any substantial
  // fence — or bare JSON for JSON-content types — is the artifact.
  if (typeof canvasMode === "string" && canvasMode !== "auto") {
    const type = canvasMode as ArtifactType
    if (JSON_CONTENT_TYPES.has(type)) {
      for (const f of fences) {
        if (parseJsonObject(f.body)) return { type, content: f.body, language: undefined }
      }
      const bare = extractBareJsonObject(text)
      if (bare) return { type, content: bare.raw, language: undefined }
      return null
    }
    // Sheet CSV, markdown, latex, html, react, 3d, svg, mermaid, code, document:
    // take the largest fence.
    const biggest = fences.slice().sort((a, b) => b.body.length - a.body.length)[0]
    if (!biggest) return null
    if (biggest.body.split("\n").length < 3 && type !== "application/mermaid" && type !== "image/svg+xml") {
      return null
    }
    return {
      type,
      content: biggest.body,
      language: type === "application/code" ? biggest.lang || undefined : undefined,
    }
  }

  // Auto mode (or tool merely available): infer the type from each fence,
  // first match wins.
  for (const f of fences) {
    const r = fenceToType(f)
    if (r) return r
  }
  // Bare JSON deck/notebook with no fence at all.
  const bare = extractBareJsonObject(text)
  if (bare) {
    const t = jsonShapeToType(bare.value)
    if (t) return { type: t, content: bare.raw, language: undefined }
  }
  return null
}
