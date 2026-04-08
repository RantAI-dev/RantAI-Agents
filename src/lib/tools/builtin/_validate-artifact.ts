/**
 * Server-side validation for HTML and React artifact content.
 *
 * Goals:
 *  - Catch the most common LLM failure modes (missing export default,
 *    non-whitelisted imports, missing viewport, broken HTML structure)
 *    BEFORE persisting to S3 / Prisma.
 *  - Surface failures to the LLM as a structured tool-error so the AI SDK's
 *    natural retry loop produces a corrected artifact on the next call.
 *  - Stay cheap (< 25 ms p50). No network, no LLM, no recursion.
 *
 * Validation is intentionally permissive: only hard runtime-breaking issues
 * are flagged as errors. Style nags are returned as warnings (currently
 * unused but available to renderers later).
 */

import { parse as parseHtml } from "parse5"
import { parse as parseJs } from "@babel/parser"

export interface ArtifactValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/** React libraries the renderer exposes as window globals. */
const REACT_IMPORT_WHITELIST = new Set([
  "react",
  "react-dom",
  "recharts",
  "lucide-react",
  "framer-motion",
])

/** Maximum non-blank lines allowed inside inline <style> blocks. */
const MAX_INLINE_STYLE_LINES = 10

export function validateArtifactContent(
  type: string,
  content: string
): ArtifactValidationResult {
  if (type === "text/html") return validateHtml(content)
  if (type === "application/react") return validateReact(content)
  if (type === "image/svg+xml") return validateSvg(content)
  if (type === "application/mermaid") return validateMermaid(content)
  if (type === "application/code") return validateCode(content)
  return { ok: true, errors: [], warnings: [] }
}

// ---------------------------------------------------------------------------
// Code validation
// ---------------------------------------------------------------------------

/**
 * Truncation / placeholder markers that indicate the LLM gave up partway.
 * Each pattern is chosen to be unlikely in real, complete code.
 */
const CODE_TRUNCATION_MARKERS: ReadonlyArray<{ marker: RegExp; label: string }> = [
  { marker: /\/\/\s*\.{3,}\s*(rest|more|etc|remaining|omitted)/i, label: "// ... rest" },
  { marker: /\/\*\s*\.{3,}\s*(rest|more|etc|remaining|omitted)[\s\S]*?\*\//i, label: "/* ... rest */" },
  { marker: /#\s*\.{3,}\s*(rest|more|etc|remaining|omitted)/i, label: "# ... rest" },
  { marker: /\/\/\s*TODO:?\s*implement/i, label: "// TODO: implement" },
  { marker: /#\s*TODO:?\s*implement/i, label: "# TODO: implement" },
  { marker: /\/\/\s*implement (this|me)/i, label: "// implement this" },
  { marker: /throw new Error\(\s*["'`]not[ _-]?implemented["'`]/i, label: 'throw new Error("not implemented")' },
  { marker: /\bunimplemented!\s*\(/i, label: "unimplemented!()" },
  { marker: /\btodo!\s*\(/i, label: "todo!()" },
  { marker: /\bpass\s*#\s*(placeholder|implement|todo)/i, label: "pass  # placeholder" },
]

function validateCode(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const trimmed = content.trim()

  if (!trimmed) {
    errors.push("Code content is empty.")
    return { ok: false, errors, warnings }
  }

  // Wrong-type guard: HTML document masquerading as code.
  if (/^\s*<!doctype\s+html/i.test(content) || /^\s*<html[\s>]/i.test(content)) {
    errors.push(
      "This looks like an HTML document. Use type 'text/html' so it renders in the preview iframe, not 'application/code'."
    )
    return { ok: false, errors, warnings }
  }

  // Wrong-type guard: markdown fence wrap — LLM treated content as markdown.
  const firstLine = trimmed.split("\n")[0] ?? ""
  if (/^\s*```/.test(firstLine)) {
    errors.push(
      "Remove the markdown code fences (```lang ... ```). The artifact content is the code itself — the renderer adds highlighting."
    )
    return { ok: false, errors, warnings }
  }

  // Truncation / placeholder warnings
  const hits: string[] = []
  for (const { marker, label } of CODE_TRUNCATION_MARKERS) {
    if (marker.test(content)) hits.push(label)
  }
  if (hits.length > 0) {
    warnings.push(
      `Detected likely truncation or placeholder markers: ${hits
        .slice(0, 3)
        .map((h) => `"${h}"`)
        .join(", ")}. Output the COMPLETE code with every function implemented.`
    )
  }

  if (content.length > 512 * 1024) {
    warnings.push(
      `Code content is ${Math.round(content.length / 1024)}KB — consider splitting into multiple files or trimming.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// Mermaid validation
// ---------------------------------------------------------------------------

/**
 * Recognized Mermaid diagram type declarations. Order matters only insofar as
 * longer prefixes must be checked before shorter ones that are proper prefixes
 * (e.g. `stateDiagram-v2` before `stateDiagram`). We handle that explicitly
 * below via `startsWith(keyword + " ")` or exact-match.
 */
const MERMAID_DIAGRAM_TYPES = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "erDiagram",
  "stateDiagram-v2",
  "stateDiagram",
  "classDiagram",
  "gantt",
  "pie",
  "mindmap",
  "gitGraph",
  "journey",
  "quadrantChart",
  "timeline",
  "sankey-beta",
  "xychart-beta",
  "block-beta",
  "packet-beta",
  "kanban",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Deployment",
  "requirementDiagram",
  "architecture-beta",
]

function validateMermaid(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("Mermaid content is empty.")
    return { ok: false, errors, warnings }
  }

  // Find the first meaningful line: skip leading frontmatter (--- ... ---),
  // skip directives/comments (%% ...), skip blank lines.
  const rawLines = content.split("\n")
  let inFrontmatter = false
  let seenFrontmatterFence = false
  let firstLine: string | null = null

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim()
    if (!line) continue

    // Leading frontmatter: first `---` opens, next `---` closes.
    if (line === "---") {
      if (!seenFrontmatterFence) {
        seenFrontmatterFence = true
        inFrontmatter = true
        continue
      }
      if (inFrontmatter) {
        inFrontmatter = false
        continue
      }
    }
    if (inFrontmatter) continue

    // Skip directives and comments
    if (line.startsWith("%%")) continue

    firstLine = line
    break
  }

  // Markdown fence wrap
  if (firstLine && firstLine.startsWith("```")) {
    errors.push(
      "Remove markdown code fences (```mermaid ... ```) — output raw Mermaid syntax only."
    )
    return { ok: false, errors, warnings }
  }

  // Recognized diagram type declaration
  const hasDeclaration =
    firstLine != null &&
    MERMAID_DIAGRAM_TYPES.some(
      (k) =>
        firstLine === k ||
        firstLine.startsWith(k + " ") ||
        firstLine.startsWith(k + "\t")
    )

  if (!hasDeclaration) {
    errors.push(
      "Missing or unrecognized diagram type declaration on the first non-empty line. Must start with one of: flowchart, sequenceDiagram, erDiagram, stateDiagram-v2, classDiagram, gantt, pie, mindmap, gitGraph, journey, quadrantChart, timeline, sankey-beta, xychart-beta, block-beta, kanban, C4Context, requirementDiagram, architecture-beta."
    )
    return { ok: false, errors, warnings }
  }

  // Length warning
  if (content.length > 3000) {
    warnings.push(
      `Mermaid content is ${content.length} chars — likely too complex to render readably. Aim for ≤ 3000 chars.`
    )
  }

  // Flowchart-style node count heuristic (noisy for ER/class but still
  // useful as a warning for flowcharts, which is the common failure mode).
  const nodeDefRegex = /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*[[({]/gm
  const nodeMatches = content.match(nodeDefRegex)
  if (nodeMatches && nodeMatches.length > 15) {
    warnings.push(
      `Detected ${nodeMatches.length} node definitions — diagrams with more than 15 nodes become unreadable. Consider splitting into multiple diagrams.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// SVG validation
// ---------------------------------------------------------------------------

type SvgNode = {
  nodeName: string
  tagName?: string
  attrs?: Array<{ name: string; value: string }>
  childNodes?: SvgNode[]
  parentNode?: SvgNode
}

function validateSvg(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("SVG content is empty.")
    return { ok: false, errors, warnings }
  }

  let document
  try {
    document = parseHtml(content)
  } catch (err) {
    errors.push(
      `SVG failed to parse: ${err instanceof Error ? err.message : String(err)}`
    )
    return { ok: false, errors, warnings }
  }

  let rootSvg: SvgNode | null = null
  let scriptCount = 0
  let foreignObjectCount = 0
  let styleBlockCount = 0
  let titleAsSvgChild = 0
  const externalHrefs: string[] = []
  const eventHandlers = new Set<string>()
  const colorValues = new Set<string>()
  let highPrecisionPath = false

  const walk = (node: SvgNode) => {
    const tag = node.tagName || node.nodeName
    const tagLc = tag?.toLowerCase()
    if (tagLc === "svg" && !rootSvg) rootSvg = node
    if (tagLc === "script") scriptCount++
    if (tagLc === "foreignobject") foreignObjectCount++
    if (tagLc === "style") styleBlockCount++
    if (tagLc === "title") {
      const parentTag = (
        node.parentNode?.tagName || node.parentNode?.nodeName
      )?.toLowerCase()
      if (parentTag === "svg") titleAsSvgChild++
    }

    node.attrs?.forEach((a) => {
      if (a.name === "href" || a.name === "xlink:href") {
        if (/^(https?:|data:|\/\/)/i.test(a.value)) externalHrefs.push(a.value)
      }
      if (/^on[a-z]+$/i.test(a.name)) eventHandlers.add(a.name)
      if (
        (a.name === "fill" || a.name === "stroke") &&
        a.value &&
        a.value !== "none" &&
        a.value !== "currentColor" &&
        !a.value.startsWith("url(")
      ) {
        colorValues.add(a.value.toLowerCase())
      }
      if (a.name === "d" && /\d\.\d{3,}/.test(a.value)) highPrecisionPath = true
    })
    node.childNodes?.forEach(walk)
  }
  walk(document as unknown as SvgNode)

  if (!rootSvg) {
    errors.push("Missing root <svg> element.")
    return { ok: false, errors, warnings }
  }

  const rootAttrs = (rootSvg as SvgNode).attrs ?? []
  const hasXmlns = rootAttrs.some((a) => a.name.toLowerCase() === "xmlns")
  const hasViewBox = rootAttrs.some((a) => a.name.toLowerCase() === "viewbox")
  const hasWidth = rootAttrs.some((a) => a.name.toLowerCase() === "width")
  const hasHeight = rootAttrs.some((a) => a.name.toLowerCase() === "height")
  const ariaHidden =
    rootAttrs.find((a) => a.name === "aria-hidden")?.value === "true"

  if (!hasXmlns) {
    errors.push('Missing xmlns="http://www.w3.org/2000/svg" on root <svg>.')
  }
  if (!hasViewBox) {
    errors.push(
      "Missing viewBox attribute on root <svg>. The renderer scales by viewBox; without it the SVG cannot render responsively."
    )
  }
  if (hasWidth || hasHeight) {
    errors.push(
      "Remove hardcoded width/height attributes from the root <svg>. Use viewBox only so the SVG scales responsively to its container."
    )
  }
  if (scriptCount > 0) {
    errors.push(
      "Found <script> element(s) — these are stripped by the sanitizer. Remove them."
    )
  }
  if (foreignObjectCount > 0) {
    errors.push(
      "Found <foreignObject> element(s) — these are stripped by the sanitizer. Remove them."
    )
  }
  if (externalHrefs.length > 0) {
    errors.push(
      `Found external href/xlink:href references: ${externalHrefs
        .slice(0, 3)
        .map((h) => `"${h}"`)
        .join(", ")}. Only same-document fragment references (#id) are allowed.`
    )
  }
  if (eventHandlers.size > 0) {
    errors.push(
      `Found event handler attributes: ${[...eventHandlers].join(
        ", "
      )}. These are stripped by the sanitizer — remove them.`
    )
  }

  if (titleAsSvgChild === 0 && !ariaHidden) {
    warnings.push(
      'Missing <title> child of root <svg>. Add one for accessibility, or set aria-hidden="true" if the SVG is purely decorative.'
    )
  }
  if (styleBlockCount > 0) {
    warnings.push(
      "Inline <style> block detected. Because the renderer is not iframed, CSS inside <style> can leak into the host page. Prefer SVG presentation attributes (fill, stroke, stroke-width, opacity)."
    )
  }
  if (colorValues.size > 5) {
    warnings.push(
      `SVG uses ${colorValues.size} distinct colors. Aim for ≤ 5 for visual cohesion.`
    )
  }
  if (highPrecisionPath) {
    warnings.push(
      "Some path coordinates use more than 2 decimal places. Round to 1 decimal for readability and smaller file size."
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// HTML validation
// ---------------------------------------------------------------------------

function validateHtml(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Doctype (case-insensitive, must appear early)
  if (!/^\s*<!doctype\s+html/i.test(content)) {
    errors.push(
      "Missing <!DOCTYPE html> declaration at the top of the document."
    )
  }

  // 2. Parse with parse5 — this is forgiving so a parse failure is a hard signal
  let document
  try {
    document = parseHtml(content)
  } catch (err) {
    errors.push(
      `HTML failed to parse: ${err instanceof Error ? err.message : String(err)}`
    )
    return { ok: false, errors, warnings }
  }

  // 3. Walk the tree once and collect what we need
  const found = {
    html: false,
    head: false,
    body: false,
    title: false,
    titleHasText: false,
    viewport: false,
    formWithAction: false,
    inlineStyleOverflow: false,
  }

  type Node = {
    nodeName: string
    tagName?: string
    attrs?: Array<{ name: string; value: string }>
    childNodes?: Node[]
    value?: string
    parentNode?: Node
  }

  const walk = (node: Node) => {
    const tag = node.tagName || node.nodeName
    if (tag === "html") found.html = true
    if (tag === "head") found.head = true
    if (tag === "body") found.body = true

    if (tag === "title") {
      found.title = true
      const textChild = node.childNodes?.find((c) => c.nodeName === "#text")
      if (textChild?.value && textChild.value.trim().length > 0) {
        found.titleHasText = true
      }
    }

    if (tag === "meta") {
      const nameAttr = node.attrs?.find((a) => a.name === "name")?.value
      if (nameAttr === "viewport") found.viewport = true
    }

    if (tag === "form") {
      const action = node.attrs?.find((a) => a.name === "action")?.value
      if (action) found.formWithAction = true
    }

    if (tag === "style") {
      const text =
        node.childNodes?.find((c) => c.nodeName === "#text")?.value ?? ""
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0).length
      if (lines > MAX_INLINE_STYLE_LINES) {
        found.inlineStyleOverflow = true
      }
    }

    node.childNodes?.forEach(walk)
  }
  walk(document as unknown as Node)

  if (!found.html) errors.push("Missing <html> root element.")
  if (!found.head) errors.push("Missing <head> element.")
  if (!found.body) errors.push("Missing <body> element.")
  if (!found.title || !found.titleHasText) {
    errors.push("Missing or empty <title> element inside <head>.")
  }
  if (!found.viewport) {
    errors.push(
      'Missing <meta name="viewport" content="width=device-width, initial-scale=1.0"> in <head>.'
    )
  }
  if (found.formWithAction) {
    errors.push(
      'Found <form action="..."> — the iframe sandbox blocks form submission. Use onSubmit JS handlers instead and remove the action attribute.'
    )
  }
  if (found.inlineStyleOverflow) {
    warnings.push(
      `Inline <style> block exceeds ${MAX_INLINE_STYLE_LINES} non-blank lines. Prefer Tailwind utility classes instead of custom CSS.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// React validation
// ---------------------------------------------------------------------------

function validateReact(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Must parse as JSX/ES2022
  let ast
  try {
    ast = parseJs(content, {
      sourceType: "module",
      allowReturnOutsideFunction: true,
      plugins: ["jsx"],
    })
  } catch (err) {
    errors.push(
      `React component failed to parse as JSX: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    return { ok: false, errors, warnings }
  }

  // 2. Scan top-level statements
  let hasDefaultExport = false
  let hasClassComponent = false
  const badImports: string[] = []

  for (const node of ast.program.body) {
    if (
      node.type === "ExportDefaultDeclaration" ||
      node.type === "ExportNamedDeclaration"
    ) {
      if (node.type === "ExportDefaultDeclaration") hasDefaultExport = true
    }

    if (node.type === "ImportDeclaration") {
      const source = node.source.value
      // Allow bare imports from the whitelist plus relative side-effect strips
      if (!REACT_IMPORT_WHITELIST.has(source) && !source.startsWith(".")) {
        badImports.push(source)
      }
    }

    // class Foo extends React.Component | extends Component
    if (node.type === "ClassDeclaration" && node.superClass) {
      const sc = node.superClass
      const isReactClass =
        (sc.type === "MemberExpression" &&
          sc.object.type === "Identifier" &&
          sc.object.name === "React") ||
        (sc.type === "Identifier" &&
          (sc.name === "Component" || sc.name === "PureComponent"))
      if (isReactClass) hasClassComponent = true
    }
  }

  // 3. String-level checks for things that aren't worth a full AST walk
  if (/document\.(getElementById|querySelector|querySelectorAll)\s*\(/.test(content)) {
    errors.push(
      "Found document.getElementById / document.querySelector — direct DOM access does not work reliably inside the sandboxed iframe. Use useRef instead."
    )
  }

  if (/import\s+['"][^'"]+\.css['"]/.test(content)) {
    errors.push(
      "Found a CSS import — CSS imports are silently dropped by the renderer. Remove it; Tailwind is already loaded."
    )
  }

  // Report results
  if (!hasDefaultExport) {
    errors.push(
      "Missing `export default` declaration. The component renderer requires a default export (function or const)."
    )
  }
  if (hasClassComponent) {
    errors.push(
      "Found `class extends React.Component` — class components are not supported. Use a function component."
    )
  }
  if (badImports.length > 0) {
    errors.push(
      `Imports from non-whitelisted libraries: ${badImports
        .map((s) => `"${s}"`)
        .join(", ")}. Only react, react-dom, recharts, lucide-react, and framer-motion are available (as window globals: React, Recharts, LucideReact, Motion). Remove the imports and use the globals instead.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

/**
 * Format validation errors as a single string suitable for returning from a
 * tool execute() so the LLM sees a structured failure and can self-correct.
 */
export function formatValidationError(
  type: string,
  result: ArtifactValidationResult
): string {
  const bullets = result.errors.map((e) => `  - ${e}`).join("\n")
  return `Your ${type} artifact has issues that will prevent it from rendering correctly:\n${bullets}\n\nFix these and call the tool again with the corrected content. Output the COMPLETE corrected artifact — do not truncate.`
}
