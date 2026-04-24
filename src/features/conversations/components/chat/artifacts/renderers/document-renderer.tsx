"use client"

import React, { useMemo } from "react"
import { FileText } from "@/lib/icons"
import {
  DocumentAstSchema,
  type DocumentAst,
  type BlockNode,
  type InlineNode,
} from "@/lib/document-ast/schema"
import { MERMAID_INIT_OPTIONS } from "@/lib/rendering/mermaid-theme"

type FootnoteSink = {
  push: (blocks: BlockNode[]) => number
  entries: BlockNode[][]
}

function newFootnoteSink(): FootnoteSink {
  const entries: BlockNode[][] = []
  return {
    push(blocks) {
      entries.push(blocks)
      return entries.length
    },
    entries,
  }
}

function inlineToPlain(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return n.text
      if (n.type === "link" || n.type === "anchor") return inlineToPlain(n.children)
      return ""
    })
    .join("")
}

function renderInline(
  node: InlineNode,
  key: React.Key,
  footnotes: FootnoteSink,
): React.ReactNode {
  switch (node.type) {
    case "text": {
      const style: React.CSSProperties = {}
      if (node.color) style.color = node.color
      if (node.code) {
        style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace"
        style.background = "rgba(148,163,184,0.15)"
        style.padding = "0 4px"
        style.borderRadius = 3
      }
      let el: React.ReactNode = <span style={style}>{node.text}</span>
      if (node.bold) el = <strong>{el}</strong>
      if (node.italic) el = <em>{el}</em>
      if (node.underline) el = <u>{el}</u>
      if (node.strike) el = <s>{el}</s>
      if (node.superscript) el = <sup>{el}</sup>
      if (node.subscript) el = <sub>{el}</sub>
      return <React.Fragment key={key}>{el}</React.Fragment>
    }
    case "link":
      return (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          {node.children.map((c, i) => renderInline(c, i, footnotes))}
        </a>
      )
    case "anchor":
      return (
        <a key={key} href={`#${node.bookmarkId}`} className="text-blue-600 underline">
          {node.children.map((c, i) => renderInline(c, i, footnotes))}
        </a>
      )
    case "footnote": {
      const id = footnotes.push(node.children)
      return (
        <sup key={key}>
          <a href={`#fn-${id}`} id={`fnref-${id}`} className="text-blue-600">
            [{id}]
          </a>
        </sup>
      )
    }
    case "lineBreak":
      return <br key={key} />
    case "pageNumber":
      return (
        <span key={key} className="text-slate-400" aria-label="page number">
          #
        </span>
      )
    case "tab":
      return (
        <span
          key={key}
          style={{ display: "inline-block", minWidth: "2em", textAlign: node.leader === "dot" ? "right" : "left" }}
        >
          {node.leader === "dot" ? "…" : " "}
        </span>
      )
  }
}

function renderBlock(
  node: BlockNode,
  key: React.Key,
  footnotes: FootnoteSink,
  tocEntries: Array<{ level: number; text: string; bookmarkId?: string }>,
): React.ReactNode {
  switch (node.type) {
    case "paragraph": {
      const dxaToPx = (dxa: number) => Math.round((dxa / 1440) * 96)
      const style: React.CSSProperties = {
        textAlign: node.align ?? "left",
        marginTop: node.spacing?.before ? Math.round(node.spacing.before / 20) : undefined,
        marginBottom: node.spacing?.after ? Math.round(node.spacing.after / 20) : 12,
        textIndent: node.indent?.firstLine ? `${dxaToPx(node.indent.firstLine)}px` : undefined,
        paddingLeft: node.indent?.left ? `${dxaToPx(node.indent.left)}px` : undefined,
      }
      return (
        <p key={key} style={style}>
          {node.children.map((c, i) => renderInline(c, i, footnotes))}
        </p>
      )
    }
    case "heading": {
      const Tag = (`h${node.level}`) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
      const sizes: Record<number, string> = {
        1: "1.8rem", 2: "1.4rem", 3: "1.2rem", 4: "1rem", 5: "0.95rem", 6: "0.9rem",
      }
      return (
        <Tag
          key={key}
          id={node.bookmarkId}
          style={{ fontSize: sizes[node.level], fontWeight: 700, margin: "1.5em 0 0.75em" }}
        >
          {node.children.map((c, i) => renderInline(c, i, footnotes))}
        </Tag>
      )
    }
    case "list": {
      const Tag = node.ordered ? "ol" : "ul"
      return (
        <Tag
          key={key}
          start={node.ordered ? node.startAt : undefined}
          style={{ marginLeft: 24, marginBottom: 12, paddingLeft: 16 }}
        >
          {node.items.map((item, i) => (
            <li key={i}>
              {item.children.map((c, j) => renderBlock(c, j, footnotes, tocEntries))}
              {item.subList &&
                renderBlock(
                  { type: "list", ordered: item.subList.ordered, items: item.subList.items },
                  "sublist",
                  footnotes,
                  tocEntries,
                )}
            </li>
          ))}
        </Tag>
      )
    }
    case "blockquote":
      return (
        <blockquote
          key={key}
          style={{
            borderLeft: "3px solid #94a3b8",
            paddingLeft: 16,
            margin: "1em 0",
            color: "#475569",
          }}
        >
          {node.children.map((c, i) => renderBlock(c, i, footnotes, tocEntries))}
          {node.attribution && (
            <footer style={{ textAlign: "right", fontStyle: "italic", marginTop: 4 }}>
              — {node.attribution}
            </footer>
          )}
        </blockquote>
      )
    case "codeBlock":
      return (
        <pre
          key={key}
          style={{
            background: "#f3f4f6",
            padding: 12,
            borderRadius: 4,
            overflowX: "auto",
            fontSize: 13,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            marginBottom: 12,
          }}
        >
          <code>{node.code}</code>
        </pre>
      )
    case "horizontalRule":
      return (
        <hr
          key={key}
          style={{
            border: "none",
            borderTop: "1px solid #cbd5e1",
            margin: "1.5em 0",
          }}
        />
      )
    case "pageBreak":
      return (
        <div
          key={key}
          aria-label="page break"
          style={{
            height: 2,
            background: "#e2e8f0",
            margin: "3em 0",
          }}
        />
      )
    case "table":
      return (
        <table
          key={key}
          style={{
            borderCollapse: "collapse",
            width: "100%",
            marginBottom: 16,
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            {node.columnWidths.map((w, i) => (
              <col key={i} style={{ width: `${(w / node.width) * 100}%` }} />
            ))}
          </colgroup>
          <tbody>
            {node.rows.map((row, ri) => (
              <tr
                key={ri}
                style={row.isHeader ? { background: "#f1f5f9", fontWeight: 600 } : undefined}
              >
                {row.cells.map((cell, ci) => {
                  const Cell = row.isHeader ? "th" : "td"
                  return (
                    <Cell
                      key={ci}
                      colSpan={cell.colspan}
                      rowSpan={cell.rowspan}
                      style={{
                        border: "1px solid #cbd5e1",
                        padding: "6px 10px",
                        background: cell.shading ? `#${cell.shading}` : undefined,
                        textAlign: cell.align ?? "left",
                        verticalAlign: cell.valign ?? "top",
                      }}
                    >
                      {cell.children.map((c, i) => renderBlock(c, i, footnotes, tocEntries))}
                    </Cell>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )

    case "image":
      return (
        <figure
          key={key}
          style={{
            textAlign: node.align ?? "center",
            margin: "1em 0",
          }}
        >
          <img
            src={node.src}
            alt={node.alt}
            width={node.width}
            height={node.height}
            style={{ maxWidth: "100%", height: "auto" }}
          />
          {node.caption && (
            <figcaption
              style={{
                fontStyle: "italic",
                fontSize: 13,
                color: "#475569",
                marginTop: 4,
              }}
            >
              {node.caption}
            </figcaption>
          )}
        </figure>
      )

    case "mermaid":
      return <MermaidPreviewBlock key={key} code={node.code} caption={node.caption} />

    case "toc": {
      const filtered = tocEntries.filter((e) => e.level <= node.maxLevel)
      return (
        <nav
          key={key}
          data-toc="true"
          style={{
            border: "1px solid #cbd5e1",
            padding: 16,
            margin: "1em 0",
            background: "#f8fafc",
          }}
        >
          {node.title && (
            <div style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 8 }}>
              {node.title}
            </div>
          )}
          <ol style={{ margin: 0, paddingLeft: 24 }}>
            {filtered.map((e, i) => (
              <li key={i} style={{ marginLeft: (e.level - 1) * 16 }}>
                {e.bookmarkId ? (
                  <a href={`#${e.bookmarkId}`} className="text-blue-600 underline">
                    {e.text}
                  </a>
                ) : (
                  <span>{e.text}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )
    }

    default:
      return null
  }
}

function CoverBlock({
  cover,
}: {
  cover: NonNullable<DocumentAst["coverPage"]>
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "80px 0 40px",
        borderBottom: "1px solid #e2e8f0",
        marginBottom: 40,
      }}
    >
      <div style={{ fontSize: "2.2rem", fontWeight: 700 }}>{cover.title}</div>
      {cover.subtitle && (
        <div style={{ fontSize: "1.2rem", fontStyle: "italic", marginTop: 8, color: "#475569" }}>
          {cover.subtitle}
        </div>
      )}
      <div style={{ marginTop: 32 }}>
        {cover.author && <div style={{ fontSize: "1rem" }}>{cover.author}</div>}
        {cover.organization && (
          <div style={{ fontSize: "0.95rem", color: "#475569" }}>{cover.organization}</div>
        )}
        {cover.date && (
          <div style={{ fontSize: "0.95rem", color: "#475569" }}>{cover.date}</div>
        )}
      </div>
      {cover.logoUrl && (
        <img
          src={cover.logoUrl}
          alt={`${cover.organization ?? cover.author ?? cover.title} logo`}
          style={{ maxWidth: 200, marginTop: 16 }}
        />
      )}
    </div>
  )
}

interface DocumentRendererProps {
  content: string
}

export function DocumentRenderer({ content }: DocumentRendererProps) {
  const ast = useMemo(() => parseSafe(content), [content])
  const footnotes = useMemo(newFootnoteSink, [content])

  const tocEntries = useMemo(() => {
    if (!ast) return [] as Array<{ level: number; text: string; bookmarkId?: string }>
    const list: Array<{ level: number; text: string; bookmarkId?: string }> = []
    const visit = (blocks: BlockNode[]) => {
      for (const b of blocks) {
        if (b.type === "heading") {
          list.push({ level: b.level, text: inlineToPlain(b.children), bookmarkId: b.bookmarkId })
        }
        if (b.type === "list") b.items.forEach((item) => visit(item.children))
        if (b.type === "table") b.rows.forEach((r) => r.cells.forEach((c) => visit(c.children)))
        if (b.type === "blockquote") visit(b.children)
      }
    }
    visit(ast.body)
    return list
  }, [ast])

  if (!ast) return <Skeleton />

  const renderBlockBound = (b: BlockNode, i: React.Key) => renderBlock(b, i, footnotes, tocEntries)

  const bodyNodes = ast.body.map((b, i) => renderBlockBound(b, i))

  const pageWidthPx = ast.meta.pageSize === "a4" ? 794 : 816
  const minHeightPx = ast.meta.pageSize === "a4" ? 1123 : 1056
  const dxaToPx = (dxa: number) => Math.round((dxa / 1440) * 96)
  const mLeft = dxaToPx(ast.meta.margins?.left ?? 1440)
  const mRight = dxaToPx(ast.meta.margins?.right ?? 1440)
  const mTop = dxaToPx(ast.meta.margins?.top ?? 1440)
  const mBottom = dxaToPx(ast.meta.margins?.bottom ?? 1440)

  return (
    <div className="w-full h-full overflow-y-auto bg-muted/30 py-10">
      <article
        className="mx-auto bg-white text-slate-900 shadow-md relative"
        style={{
          width: pageWidthPx,
          minHeight: minHeightPx,
          paddingTop: mTop,
          paddingBottom: mBottom,
          paddingLeft: mLeft,
          paddingRight: mRight,
          fontFamily: ast.meta.font,
          fontSize: `${ast.meta.fontSize}pt`,
          lineHeight: 1.5,
        }}
      >
        {ast.coverPage && <CoverBlock cover={ast.coverPage} />}
        {ast.header && (
          <div
            style={{
              borderBottom: "1px dashed #cbd5e1",
              marginBottom: 24,
              paddingBottom: 8,
              fontSize: "0.9em",
              color: "#64748b",
            }}
          >
            {ast.header.children.map((b, i) => renderBlockBound(b, i))}
          </div>
        )}
        {bodyNodes}
        {ast.footer && (
          <div
            style={{
              borderTop: "1px dashed #cbd5e1",
              marginTop: 24,
              paddingTop: 8,
              fontSize: "0.9em",
              color: "#64748b",
            }}
          >
            {ast.footer.children.map((b, i) => renderBlockBound(b, i))}
          </div>
        )}
        {footnotes.entries.length > 0 && (
          <section
            style={{
              borderTop: "1px solid #cbd5e1",
              marginTop: 32,
              paddingTop: 12,
              fontSize: "0.85em",
            }}
          >
            <ol style={{ paddingLeft: 24 }}>
              {footnotes.entries.map((blocks, i) => (
                <li key={i} id={`fn-${i + 1}`}>
                  {blocks.map((b, j) => renderBlock(b, j, newFootnoteSink(), tocEntries))}
                  <a href={`#fnref-${i + 1}`} style={{ marginLeft: 4 }} className="text-blue-600">
                    ↩
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>
    </div>
  )
}

function MermaidPreviewBlock({ code, caption }: { code: string; caption?: string }) {
  const [svg, setSvg] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // jsdom (vitest) does not implement SVG layout methods that mermaid's
        // dagre layout depends on. Shim fixed-metric stand-ins so rendering
        // completes in the test environment. No-op in real browsers where the
        // prototypes already provide native implementations.
        if (typeof window !== "undefined" && typeof SVGElement !== "undefined") {
          const svgProto = SVGElement.prototype as unknown as {
            getBBox?: (this: { textContent?: string | null }) => DOMRect
          }
          if (!svgProto.getBBox) {
            svgProto.getBBox = function getBBox(this: { textContent?: string | null }) {
              const text = this.textContent ?? ""
              return {
                x: 0,
                y: 0,
                width: text.length * 8,
                height: 16,
                top: 0,
                right: text.length * 8,
                bottom: 16,
                left: 0,
                toJSON: () => ({}),
              } as unknown as DOMRect
            }
          }
          const tcElement = (window as unknown as {
            SVGTextContentElement?: { prototype: { getComputedTextLength?: (this: { textContent?: string | null }) => number } }
          }).SVGTextContentElement
          if (tcElement && !tcElement.prototype.getComputedTextLength) {
            tcElement.prototype.getComputedTextLength = function (this: { textContent?: string | null }) {
              return (this.textContent ?? "").length * 8
            }
          }
        }

        const mermaid = (await import("mermaid")).default
        mermaid.initialize(MERMAID_INIT_OPTIONS)
        const id = `mmd-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, code.trim())
        if (!cancelled) setSvg(svg)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Render failed")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  return (
    <figure className="my-4 flex flex-col items-center">
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          Mermaid error: {error}
        </div>
      ) : svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="text-sm text-muted-foreground">Rendering diagram…</div>
      )}
      {caption && (
        <figcaption className="mt-2 text-center text-sm italic text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

function parseSafe(content: string): DocumentAst | null {
  if (!content.trim()) return null
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return null
  }
  const result = DocumentAstSchema.safeParse(raw)
  return result.success ? result.data : null
}

function Skeleton() {
  return (
    <div className="w-full h-full overflow-y-auto bg-muted/30 py-10">
      <div className="mx-auto max-w-[816px] p-8 rounded-md border border-slate-300 bg-white flex items-start gap-3">
        <FileText className="h-5 w-5 text-slate-400 mt-0.5" />
        <p className="text-sm text-slate-500">Generating document…</p>
      </div>
    </div>
  )
}
