import type { NotebookContent, Output } from "./types"

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string))

function renderOutput(o: Output): string {
  if (o.type === "stream") return `<pre class="nb-stream nb-${o.name}">${escape(o.text)}</pre>`
  if (o.type === "error") return `<pre class="nb-error">${escape(`${o.ename}: ${o.evalue}\n${o.traceback.join("\n")}`)}</pre>`
  if (o.type === "display_data" || o.type === "execute_result") {
    const data = o.data as { "image/png"?: string; "text/html"?: string; "text/plain"?: string }
    if (data["image/png"]) return `<img class="nb-img" src="data:image/png;base64,${data["image/png"]}" />`
    if (data["text/html"]) return `<div class="nb-html">${data["text/html"]}</div>`
    if (data["text/plain"]) return `<pre class="nb-plain">${escape(data["text/plain"])}</pre>`
  }
  return ""
}

export function toHtml(nb: NotebookContent, opts: { title?: string } = {}): string {
  const title = escape(opts.title ?? "Python Notebook")
  const cells = nb.cells
    .map((c) => {
      if (c.type === "markdown") return `<section class="nb-md">${escape(c.source)}</section>`
      const counter = c.executionCount === null ? "&nbsp;" : c.executionCount
      const outs = c.outputs.map(renderOutput).join("")
      return `<section class="nb-cell"><div class="nb-counter">[${counter}]</div><pre class="nb-code">${escape(c.source)}</pre>${outs}</section>`
    })
    .join("\n")
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 920px; margin: 2rem auto; padding: 0 1rem; color: #111; }
  .nb-md { white-space: pre-wrap; }
  .nb-cell { display: grid; grid-template-columns: 3rem 1fr; gap: .5rem; margin: 1rem 0; }
  .nb-counter { color: #888; font-family: ui-monospace, monospace; font-size: .8rem; }
  .nb-code { background: #0d1117; color: #e6edf3; padding: .75rem 1rem; border-radius: 6px; overflow:auto; font-family: ui-monospace, monospace; font-size: .85rem; grid-column: 2; }
  .nb-stream, .nb-plain, .nb-error { grid-column: 2; padding: .5rem 1rem; font-family: ui-monospace, monospace; font-size: .85rem; white-space: pre-wrap; }
  .nb-stderr, .nb-error { color: #b91c1c; background: #fef2f2; }
  .nb-img { grid-column: 2; max-width: 100%; }
  .nb-html table { border-collapse: collapse; }
  .nb-html th, .nb-html td { border: 1px solid #ddd; padding: .25rem .5rem; }
</style></head>
<body><h1>${title}</h1>${cells}</body></html>`
}
