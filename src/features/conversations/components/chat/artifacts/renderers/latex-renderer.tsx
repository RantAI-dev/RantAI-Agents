"use client"

import { useState, useMemo, useCallback } from "react"
import { AlertTriangle, RotateCcw, Code } from "@/lib/icons"
import katex from "katex"
import "katex/dist/katex.min.css"

interface LatexRendererProps {
  content: string
}

/** Render a math string via KaTeX, returning HTML */
function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      trust: true,
    })
  } catch {
    return `<code class="latex-error">${escapeHtml(tex)}</code>`
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/**
 * Balanced-brace scanner. Given a source string and the index of
 * the opening `{` of a LaTeX command argument, returns the substring inside
 * the matched braces and the index of the closing brace (`endIndex`).
 * Handles nested `{...}` correctly so things like `\section{$f(x)$}` and
 * `\textbf{$x^2$}` survive.
 *
 * Returns `null` if no matching brace is found.
 */
function readBracedArg(
  source: string,
  openIndex: number,
): { content: string; endIndex: number } | null {
  if (source[openIndex] !== "{") return null
  let depth = 1
  let i = openIndex + 1
  while (i < source.length) {
    const ch = source[i]
    // Honor backslash escaping so `\{` and `\}` don't affect depth.
    if (ch === "\\" && i + 1 < source.length) {
      i += 2
      continue
    }
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) {
        return { content: source.slice(openIndex + 1, i), endIndex: i }
      }
    }
    i++
  }
  return null
}

/**
 * Replace every `\command{...}` (with balanced braces) by a transformer.
 * The transformer receives the inner text. Used for `\textbf`, `\section`,
 * `\href`, etc. — replaces the previous regex which broke on nested braces.
 */
function replaceBracedCommand(
  source: string,
  command: string,
  transform: (inner: string) => string,
): string {
  const re = new RegExp(`\\\\${command}(?:\\*)?\\s*\\{`, "g")
  let result = ""
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    const openBrace = match.index + match[0].length - 1
    const arg = readBracedArg(source, openBrace)
    if (!arg) {
      // Unbalanced — leave as-is
      continue
    }
    result += source.slice(cursor, match.index) + transform(arg.content)
    cursor = arg.endIndex + 1
    re.lastIndex = cursor
  }
  result += source.slice(cursor)
  return result
}

/**
 * Two-arg variant for commands like `\href{url}{text}`.
 */
function replaceTwoArgBracedCommand(
  source: string,
  command: string,
  transform: (a: string, b: string) => string,
): string {
  const re = new RegExp(`\\\\${command}\\s*\\{`, "g")
  let result = ""
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    const firstOpen = match.index + match[0].length - 1
    const first = readBracedArg(source, firstOpen)
    if (!first) continue
    let next = first.endIndex + 1
    while (next < source.length && /\s/.test(source[next])) next++
    if (source[next] !== "{") continue
    const second = readBracedArg(source, next)
    if (!second) continue
    result +=
      source.slice(cursor, match.index) + transform(first.content, second.content)
    cursor = second.endIndex + 1
    re.lastIndex = cursor
  }
  result += source.slice(cursor)
  return result
}

/**
 * Parse a single line that may begin with `\section`, `\subsection`, or
 * `\subsubsection`. Returns the title (with balanced braces honored), the
 * remainder of the line, and which level it was. Returns `null` if the line
 * doesn't open with one of these commands.
 */
function parseSectioningHead(
  line: string,
): { kind: "section" | "subsection" | "subsubsection"; title: string; rest: string } | null {
  const m = line.match(/^\s*\\(subsubsection|subsection|section)\*?\s*\{/)
  if (!m) return null
  const kind = m[1] as "section" | "subsection" | "subsubsection"
  const openIdx = line.indexOf("{", m.index! + m[0].length - 1)
  const arg = readBracedArg(line, openIdx)
  if (!arg) return null
  return {
    kind,
    title: arg.content,
    rest: line.slice(arg.endIndex + 1),
  }
}

/**
 * Parse a `\paragraph{Title}rest...` line, balanced-brace aware.
 */
function parseParagraphHead(
  line: string,
): { title: string; rest: string } | null {
  const m = line.match(/^\s*\\paragraph\*?\s*\{/)
  if (!m) return null
  const openIdx = line.indexOf("{", m.index! + m[0].length - 1)
  const arg = readBracedArg(line, openIdx)
  if (!arg) return null
  return { title: arg.content, rest: line.slice(arg.endIndex + 1) }
}

/** Process inline LaTeX commands within a text line and return HTML */
function processInlineLatex(text: string): string {
  let result = text

  // Inline math: $...$ (non-greedy, not $$)
  result = result.replace(/\$([^$]+?)\$/g, (_, math) => renderMath(math, false))

  // Balanced-brace text commands (no longer regex `[^}]*`).
  result = replaceBracedCommand(result, "textbf", (inner) => `<strong>${processInlineLatex(inner)}</strong>`)
  result = replaceBracedCommand(result, "textit", (inner) => `<em>${processInlineLatex(inner)}</em>`)
  result = replaceBracedCommand(result, "emph", (inner) => `<em>${processInlineLatex(inner)}</em>`)
  result = replaceBracedCommand(result, "underline", (inner) => `<u>${processInlineLatex(inner)}</u>`)
  result = replaceBracedCommand(result, "texttt", (inner) => `<code>${processInlineLatex(inner)}</code>`)
  result = replaceTwoArgBracedCommand(
    result,
    "href",
    (url, txt) => `<a href="${escapeHtml(url)}">${processInlineLatex(txt)}</a>`,
  )
  // \text{...} (used inside math sometimes, just unwrap)
  result = replaceBracedCommand(result, "text", (inner) => inner)

  // Clean up remaining simple commands
  result = result.replace(/\\noindent\s*/g, "")
  result = result.replace(/\\\\(\s*)/g, "<br>")
  result = result.replace(/\\newline\s*/g, "<br>")
  result = result.replace(/~/g, "&nbsp;")
  result = result.replace(/\\,/g, "&thinsp;")
  result = result.replace(/\\;/g, "&ensp;")
  result = result.replace(/\\quad/g, "&emsp;")
  result = result.replace(/\\qquad/g, "&emsp;&emsp;")
  result = result.replace(/---/g, "&mdash;")
  result = result.replace(/--/g, "&ndash;")

  return result
}

/** Convert a full LaTeX document to HTML, using KaTeX for math */
function latexToHtml(source: string): string {
  const parts: string[] = []

  // Extract body from \begin{document}...\end{document} if present
  let body = source
  const docMatch = source.match(
    /\\begin\{document\}([\s\S]*?)\\end\{document\}/
  )
  if (docMatch) body = docMatch[1]

  // Extract \title{} and \author{} from preamble
  const titleMatch = source.match(/\\title\{([^}]*)\}/)
  const authorMatch = source.match(/\\author\{([^}]*)\}/)
  const dateMatch = source.match(/\\date\{([^}]*)\}/)

  // Remove \maketitle — we'll render title info from preamble
  body = body.replace(/\\maketitle\s*/g, "")

  // If \maketitle was in the source and we found title, add it
  if (titleMatch && source.includes("\\maketitle")) {
    parts.push(`<h1 class="doc-title">${processInlineLatex(titleMatch[1])}</h1>`)
    if (authorMatch) {
      parts.push(
        `<p class="doc-author">${processInlineLatex(authorMatch[1])}</p>`
      )
    }
    if (dateMatch) {
      parts.push(
        `<p class="doc-date">${processInlineLatex(dateMatch[1])}</p>`
      )
    }
    parts.push("<hr>")
  }

  // Process line by line / block by block
  const lines = body.split("\n")
  let i = 0
  let inList = false
  let listType: "ul" | "ol" = "ul"

  while (i < lines.length) {
    const line = lines[i].trim()

    // Skip empty lines
    if (!line) {
      i++
      continue
    }

    // Skip preamble commands
    if (
      line.startsWith("\\documentclass") ||
      line.startsWith("\\usepackage") ||
      line.startsWith("\\title{") ||
      line.startsWith("\\author{") ||
      line.startsWith("\\date{") ||
      line.startsWith("\\begin{document}") ||
      line.startsWith("\\end{document}") ||
      line.startsWith("\\maketitle")
    ) {
      i++
      continue
    }

    // Sectioning commands with balanced-brace argument scanning so titles
    // like `\section{$f(x)$}` and `\section{Reading: \emph{Notes}}` don't
    // get clipped at the first `}`.
    const sectionHead = parseSectioningHead(line)
    if (sectionHead) {
      if (inList) { parts.push(`</${listType}>`); inList = false }
      const tag =
        sectionHead.kind === "section"
          ? "h2"
          : sectionHead.kind === "subsection"
            ? "h3"
            : "h4"
      parts.push(`<${tag}>${processInlineLatex(sectionHead.title)}</${tag}>`)
      if (sectionHead.rest.trim()) {
        parts.push(`<p>${processInlineLatex(sectionHead.rest.trim())}</p>`)
      }
      i++
      continue
    }

    // \begin{itemize} or \begin{enumerate}
    if (line.startsWith("\\begin{itemize}")) {
      if (inList) parts.push(`</${listType}>`)
      listType = "ul"
      parts.push("<ul>")
      inList = true
      i++
      continue
    }
    if (line.startsWith("\\begin{enumerate}")) {
      if (inList) parts.push(`</${listType}>`)
      listType = "ol"
      parts.push("<ol>")
      inList = true
      i++
      continue
    }

    // \end{itemize} or \end{enumerate}
    if (
      line.startsWith("\\end{itemize}") ||
      line.startsWith("\\end{enumerate}")
    ) {
      if (inList) {
        parts.push(`</${listType}>`)
        inList = false
      }
      i++
      continue
    }

    // \item content
    const itemMatch = line.match(/\\item\s*(.*)/)
    if (itemMatch) {
      if (!inList) {
        parts.push("<ul>")
        inList = true
        listType = "ul"
      }
      parts.push(`<li>${processInlineLatex(itemMatch[1])}</li>`)
      i++
      continue
    }

    // Display math blocks: \begin{equation}, \begin{align}, \begin{gather}, etc.
    const mathEnvMatch = line.match(
      /\\begin\{(equation|align|gather|multline|cases|eqnarray)\*?\}/
    )
    if (mathEnvMatch) {
      if (inList) { parts.push(`</${listType}>`); inList = false }
      const envName = mathEnvMatch[0].replace("\\begin{", "").replace("}", "")
      const endTag = `\\end{${envName}}`
      let mathContent = line
      i++
      while (i < lines.length && !lines[i].includes(endTag)) {
        mathContent += "\n" + lines[i]
        i++
      }
      if (i < lines.length) {
        mathContent += "\n" + lines[i]
        i++
      }
      parts.push(`<div class="math-block">${renderMath(mathContent, true)}</div>`)
      continue
    }

    // Display math: \[...\]
    if (line.startsWith("\\[")) {
      if (inList) { parts.push(`</${listType}>`); inList = false }
      let mathContent = line.replace("\\[", "")
      if (mathContent.includes("\\]")) {
        mathContent = mathContent.replace("\\]", "")
      } else {
        i++
        while (i < lines.length && !lines[i].includes("\\]")) {
          mathContent += "\n" + lines[i]
          i++
        }
        if (i < lines.length) {
          mathContent += "\n" + lines[i].replace("\\]", "")
          i++
        }
      }
      parts.push(
        `<div class="math-block">${renderMath(mathContent.trim(), true)}</div>`
      )
      continue
    }

    // Display math: $$...$$
    if (line.startsWith("$$")) {
      if (inList) { parts.push(`</${listType}>`); inList = false }
      let mathContent = line.slice(2)
      if (mathContent.endsWith("$$")) {
        mathContent = mathContent.slice(0, -2)
      } else {
        i++
        while (i < lines.length && !lines[i].includes("$$")) {
          mathContent += "\n" + lines[i]
          i++
        }
        if (i < lines.length) {
          mathContent += "\n" + lines[i].replace("$$", "")
          i++
        }
      }
      parts.push(
        `<div class="math-block">${renderMath(mathContent.trim(), true)}</div>`
      )
      continue
    }

    // \begin{quote} or \begin{abstract}
    if (line.startsWith("\\begin{quote}") || line.startsWith("\\begin{abstract}")) {
      if (inList) { parts.push(`</${listType}>`); inList = false }
      const endTag = line.includes("abstract") ? "\\end{abstract}" : "\\end{quote}"
      let content = ""
      i++
      while (i < lines.length && !lines[i].includes(endTag)) {
        content += lines[i] + "\n"
        i++
      }
      if (i < lines.length) i++
      parts.push(
        `<blockquote>${processInlineLatex(content.trim())}</blockquote>`
      )
      continue
    }

    // Skip other \begin{...} / \end{...} we don't handle
    if (line.startsWith("\\begin{") || line.startsWith("\\end{")) {
      i++
      continue
    }

    // \paragraph{Title} rest — balanced-brace argument
    const paraHead = parseParagraphHead(line)
    if (paraHead) {
      if (inList) { parts.push(`</${listType}>`); inList = false }
      parts.push(
        `<p><strong>${processInlineLatex(paraHead.title)}</strong> ${processInlineLatex(paraHead.rest)}</p>`
      )
      i++
      continue
    }

    // Regular text paragraph — collect consecutive non-command lines.
    // LaTeX semantics: a blank line is a paragraph break, adjacent non-blank
    // lines belong to the same paragraph. The outer `while` already skips
    // blanks, so each <p> we emit corresponds to one source paragraph.
    // We preserve embedded line breaks as `\n` rather than collapsing to a
    // single space so manual `\\` line breaks survive when authors used
    // `text\\\nmore` over multiple lines.
    if (inList) { parts.push(`</${listType}>`); inList = false }
    let paragraph = line
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("\\") &&
      !lines[i].trim().startsWith("$")
    ) {
      paragraph += "\n" + lines[i].trim()
      i++
    }
    parts.push(`<p>${processInlineLatex(paragraph)}</p>`)
  }

  if (inList) parts.push(`</${listType}>`)

  return parts.join("\n")
}

export function LatexRenderer({ content }: LatexRendererProps) {
  const [showSource, setShowSource] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const { html, error } = useMemo(() => {
    try {
      const rendered = latexToHtml(content)
      return { html: rendered, error: null }
    } catch (err) {
      return {
        html: null,
        error: err instanceof Error ? err.message : "Failed to render LaTeX",
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, retryCount])

  const handleRetry = useCallback(() => setRetryCount((c) => c + 1), [])

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex items-center gap-2 text-amber-500 min-w-0">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">LaTeX render error</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
              <button
                type="button"
                onClick={() => setShowSource((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <Code className="h-3.5 w-3.5" />
                {showSource ? "Hide source" : "View source"}
              </button>
            </div>
          </div>
          <div className="px-3 py-2 border-t border-amber-500/20 text-xs text-amber-500/80">
            {error}
          </div>
          {showSource && (
            <pre className="px-3 py-3 border-t border-amber-500/20 text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap font-mono bg-muted/30">
              {content}
            </pre>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="p-6 prose dark:prose-invert max-w-none overflow-auto [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-2 [&_.math-block]:my-4 [&_.doc-title]:text-2xl [&_.doc-title]:font-bold [&_.doc-title]:mb-2 [&_.doc-author]:text-muted-foreground [&_.doc-author]:mb-1 [&_.doc-date]:text-muted-foreground [&_.doc-date]:text-sm [&_.doc-date]:mb-4 [&_.latex-error]:text-red-500 [&_.latex-error]:text-xs"
      dangerouslySetInnerHTML={{ __html: html || "" }}
    />
  )
}
