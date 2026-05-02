/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from "./python-worker-types"

const PYODIDE_VERSION = "0.28.0"
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

declare const self: DedicatedWorkerGlobalScope & {
  loadPyodide: (opts: { indexURL: string }) => Promise<any>
}

let pyodide: any = null

function post(msg: WorkerResponse) {
  self.postMessage(msg)
}

async function initPyodide() {
  if (pyodide) return pyodide
  post({ type: "kernel-status", status: "loading" })
  ;(self as any).importScripts(PYODIDE_CDN + "pyodide.js")
  pyodide = await self.loadPyodide({ indexURL: PYODIDE_CDN })
  await pyodide.loadPackage(["numpy", "micropip", "matplotlib", "scikit-learn"])

  await pyodide.runPythonAsync(`
import io, base64, sys, json as _json
__display_buffer__ = []
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    def _capture_show(*args, **kwargs):
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
        buf.seek(0)
        __display_buffer__.append(('image/png', base64.b64encode(buf.read()).decode()))
        plt.close('all')
    plt.show = _capture_show
except ImportError:
    pass

def __format_last__(value):
    if value is None:
        return None
    out = []
    try:
        import pandas as _pd
        if isinstance(value, _pd.DataFrame):
            out.append(('text/html', value.to_html(max_rows=200, classes='nb-df')))
            out.append(('text/plain', repr(value)))
            return out
        if isinstance(value, _pd.Series):
            out.append(('text/html', value.to_frame().to_html(max_rows=200, classes='nb-df')))
            out.append(('text/plain', repr(value)))
            return out
    except ImportError:
        pass
    out.append(('text/plain', repr(value)))
    return out
`)
  post({ type: "kernel-status", status: "ready" })
  return pyodide
}

function splitLastExpression(source: string): { body: string; tail: string | null } {
  const lines = source.split("\n")
  let lastIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    const stripped = lines[i].split("#")[0]
    if (stripped.trim() === "") continue
    lastIdx = i
    break
  }
  if (lastIdx === -1) return { body: source, tail: null }
  const lastLine = lines[lastIdx]
  if (/^\s/.test(lastLine)) return { body: source, tail: null }
  if (/[=:]\s*$|^(import|from|def|class|if|for|while|try|with|return|raise|pass|break|continue|elif|else|except|finally|@|async|await)\b/.test(lastLine.trim())) {
    return { body: source, tail: null }
  }
  if (/^[^()]*=[^=]/.test(lastLine.trim())) return { body: source, tail: null }
  const body = lines.slice(0, lastIdx).join("\n")
  return { body, tail: lastLine }
}

const IMAGE_BUDGET_BYTES = 100 * 1024

async function runCell(req: Extract<WorkerRequest, { type: "run" }>) {
  const { cellId, source, timeoutMs = 30_000 } = req
  await initPyodide()
  post({ type: "kernel-status", status: "running" })
  post({ type: "cell-status", cellId, status: "running" })
  const startedAt = performance.now()

  pyodide.setStdout({ batched: (text: string) => post({ type: "stream", cellId, name: "stdout", text }) })
  pyodide.setStderr({ batched: (text: string) => post({ type: "stream", cellId, name: "stderr", text }) })

  await pyodide.runPythonAsync("__display_buffer__.clear()")

  const { body, tail } = splitLastExpression(source)
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Cell exceeded ${timeoutMs}ms timeout`)), timeoutMs)
  })

  try {
    // Auto-fetch any Pyodide-shipped packages the cell imports (pandas, scipy,
    // sympy, networkx, pillow, bs4, lxml, yaml, etc.) before executing.
    // Packages not in Pyodide's repo are silently ignored here and would fail
    // at the runPythonAsync below with the usual ModuleNotFoundError.
    if (typeof pyodide.loadPackagesFromImports === "function") {
      try {
        await pyodide.loadPackagesFromImports(source)
      } catch {
        // best-effort — proceed with whatever loaded
      }
    }
    if (body.trim()) {
      await Promise.race([pyodide.runPythonAsync(body), timeoutPromise])
    }
    let lastValue: unknown = null
    if (tail) {
      lastValue = await Promise.race([pyodide.runPythonAsync(tail), timeoutPromise])
    }

    const displays = pyodide.globals.get("__display_buffer__")
    if (displays?.toJs) {
      const arr = displays.toJs() as Array<[string, string]>
      for (const [mime, data] of arr) {
        if (mime === "image/png" || mime === "text/html") {
          const oversize = mime === "image/png" && data.length > IMAGE_BUDGET_BYTES
          post({ type: "display", cellId, mime, data, oversize })
        }
      }
    }

    if (tail) {
      const formatter = pyodide.globals.get("__format_last__")
      const formatted = formatter(lastValue)
      if (formatted?.toJs) {
        const items = formatted.toJs() as Array<[string, string]>
        const data: { "text/html"?: string; "text/plain"?: string } = {}
        for (const [mime, value] of items) {
          if (mime === "text/html") data["text/html"] = value
          else if (mime === "text/plain") data["text/plain"] = value
        }
        if (Object.keys(data).length > 0) post({ type: "result", cellId, data })
      }
    }

    post({ type: "cell-status", cellId, status: "done" })
  } catch (err: any) {
    const msg: string = err?.message ?? String(err)
    post({
      type: "error",
      cellId,
      ename: err?.name ?? "Error",
      evalue: msg.split("\n")[0] ?? msg,
      traceback: msg.split("\n"),
    })
    post({ type: "cell-status", cellId, status: "error" })
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    const elapsedMs = Math.round(performance.now() - startedAt)
    post({ type: "duration", cellId, ms: elapsedMs })
    post({ type: "kernel-status", status: "idle" })
  }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  switch (req.type) {
    case "init":
      await initPyodide()
      break
    case "run":
      await runCell(req)
      break
    case "interrupt":
      break
    case "reset":
      pyodide = null
      await initPyodide()
      break
  }
}
