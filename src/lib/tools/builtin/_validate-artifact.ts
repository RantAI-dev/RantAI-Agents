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
  return { ok: true, errors: [], warnings: [] }
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
