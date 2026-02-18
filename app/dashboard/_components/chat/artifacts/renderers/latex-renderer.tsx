"use client"

import { useState, useMemo, useCallback } from "react"
import { AlertTriangle, RotateCcw, Code } from "lucide-react"
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

/** Process inline LaTeX commands within a text line and return HTML */
function processInlineLatex(text: string): string {
  let result = text

  // Inline math: $...$ (non-greedy, not $$)
  result = result.replace(/\$([^$]+?)\$/g, (_, math) => renderMath(math, false))

  // \textbf{...}
  result = result.replace(/\\textbf\{([^}]*)\}/g, "<strong>$1</strong>")

  // \textit{...}
  result = result.replace(/\\textit\{([^}]*)\}/g, "<em>$1</em>")

  // \emph{...}
  result = result.replace(/\\emph\{([^}]*)\}/g, "<em>$1</em>")

  // \underline{...}
  result = result.replace(/\\underline\{([^}]*)\}/g, "<u>$1</u>")

  // \texttt{...}
  result = result.replace(/\\texttt\{([^}]*)\}/g, "<code>$1</code>")

  // \href{url}{text}
  result = result.replace(
    /\\href\{([^}]*)\}\{([^}]*)\}/g,
    '<a href="$1">$2</a>'
  )

  // \text{...} (used inside math sometimes, just unwrap)
  result = result.replace(/\\text\{([^}]*)\}/g, "$1")

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

    // \section{Title}
    const sectionMatch = line.match(/\\section\*?\{([^}]*)\}(.*)/)
    if (sectionMatch) {
      if (inList) { parts.push(`</${listType}>`); inList = false }
      parts.push(`<h2>${processInlineLatex(sectionMatch[1])}</h2>`)
      if (sectionMatch[2].trim()) {
        parts.push(`<p>${processInlineLatex(sectionMatch[2].trim())}</p>`)
      }
      i++
      continue
    }

    // \subsection{Title}
    const subsectionMatch = line.match(/\\subsection\*?\{([^}]*)\}(.*)/)
    if (subsectionMatch) {
      if (inList) { parts.push(`</${listType}>`); inList = false }
      parts.push(`<h3>${processInlineLatex(subsectionMatch[1])}</h3>`)
      if (subsectionMatch[2].trim()) {
        parts.push(`<p>${processInlineLatex(subsectionMatch[2].trim())}</p>`)
      }
      i++
      continue
    }

    // \subsubsection{Title}
    const subsubMatch = line.match(/\\subsubsection\*?\{([^}]*)\}(.*)/)
    if (subsubMatch) {
      if (inList) { parts.push(`</${listType}>`); inList = false }
      parts.push(`<h4>${processInlineLatex(subsubMatch[1])}</h4>`)
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

    // \paragraph{Title}
    const paraMatch = line.match(/\\paragraph\*?\{([^}]*)\}(.*)/)
    if (paraMatch) {
      if (inList) { parts.push(`</${listType}>`); inList = false }
      parts.push(
        `<p><strong>${processInlineLatex(paraMatch[1])}</strong> ${processInlineLatex(paraMatch[2])}</p>`
      )
      i++
      continue
    }

    // Regular text paragraph — collect consecutive non-command lines
    if (inList) { parts.push(`</${listType}>`); inList = false }
    let paragraph = line
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("\\") &&
      !lines[i].trim().startsWith("$")
    ) {
      paragraph += " " + lines[i].trim()
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
