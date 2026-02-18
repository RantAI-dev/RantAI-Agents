"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Loader2, Play, Square, RotateCcw, AlertTriangle, Terminal } from "lucide-react"
import { StreamdownContent } from "../../streamdown-content"

interface PythonRendererProps {
  content: string
}

/**
 * Messages sent from main thread → worker
 */
type WorkerRequest = { type: "run"; code: string }

/**
 * Messages sent from worker → main thread
 */
type WorkerResponse =
  | { type: "status"; status: "loading" | "ready" | "running" }
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "plot"; data: string }
  | { type: "done" }
  | { type: "error"; message: string }

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.6/full/"

/**
 * Inline Web Worker source that loads and runs Pyodide off the main thread.
 */
const workerSource = `
const PYODIDE_CDN = "${PYODIDE_CDN}";
let pyodide = null;

async function initPyodide() {
  if (pyodide) return pyodide;

  self.postMessage({ type: "status", status: "loading" });

  importScripts(PYODIDE_CDN + "pyodide.js");
  pyodide = await self.loadPyodide({ indexURL: PYODIDE_CDN });
  await pyodide.loadPackage(["numpy", "micropip"]);

  self.postMessage({ type: "status", status: "ready" });
  return pyodide;
}

self.onmessage = async (e) => {
  if (e.data.type !== "run") return;

  try {
    const py = await initPyodide();
    self.postMessage({ type: "status", status: "running" });

    // Capture stdout/stderr
    py.setStdout({
      batched: (text) => self.postMessage({ type: "stdout", text }),
    });
    py.setStderr({
      batched: (text) => self.postMessage({ type: "stderr", text }),
    });

    // Matplotlib capture setup
    await py.runPythonAsync(\`
import sys, io
__plot_images__ = []
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    _original_show = plt.show
    def _capture_show(*args, **kwargs):
        import base64
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
        buf.seek(0)
        __plot_images__.append(base64.b64encode(buf.read()).decode())
        plt.close('all')
    plt.show = _capture_show
except ImportError:
    pass
\`);

    await py.runPythonAsync(e.data.code);

    // Send plots back
    const plotList = py.globals.get("__plot_images__");
    if (plotList && plotList.toJs) {
      const plots = plotList.toJs();
      for (const p of plots) {
        self.postMessage({ type: "plot", data: p });
      }
    }

    self.postMessage({ type: "done" });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
`

function createWorker(): Worker {
  const blob = new Blob([workerSource], { type: "application/javascript" })
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)
  URL.revokeObjectURL(url)
  return worker
}

export function PythonRenderer({ content }: PythonRendererProps) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "running"
  >("idle")
  const [output, setOutput] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [plots, setPlots] = useState<string[]>([])
  const workerRef = useRef<Worker | null>(null)

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const runCode = useCallback(() => {
    setOutput([])
    setPlots([])
    setError(null)

    // Reuse existing worker or create new one
    if (!workerRef.current) {
      workerRef.current = createWorker()
    }
    const worker = workerRef.current

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      switch (msg.type) {
        case "status":
          setStatus(msg.status)
          break
        case "stdout":
          setOutput((prev) => [...prev, msg.text])
          break
        case "stderr":
          setOutput((prev) => [...prev, `[stderr] ${msg.text}`])
          break
        case "plot":
          setPlots((prev) => [...prev, msg.data])
          break
        case "done":
          setStatus("ready")
          break
        case "error":
          setError(msg.message)
          setStatus("ready")
          break
      }
    }

    worker.onerror = (e) => {
      setError(e.message || "Worker error")
      setStatus("ready")
    }

    const request: WorkerRequest = { type: "run", code: content }
    worker.postMessage(request)
  }, [content])

  const stopCode = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    setStatus("idle")
    setOutput((prev) => [...prev, "\n[Execution stopped]"])
  }, [])

  const clearOutput = useCallback(() => {
    setOutput([])
    setPlots([])
    setError(null)
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Code display */}
      <div className="flex-1 overflow-auto border-b min-h-0">
        <StreamdownContent
          content={`\`\`\`python\n${content}\n\`\`\``}
          className="p-4"
        />
      </div>

      {/* Run bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
        {status === "loading" || status === "running" ? (
          <button
            type="button"
            onClick={stopCode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={runCode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20 transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </button>
        )}
        {(status === "loading" || status === "running") && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {status === "loading" ? "Loading Pyodide..." : "Running..."}
          </span>
        )}
        {(output.length > 0 || plots.length > 0 || error) && status !== "loading" && status !== "running" && (
          <button
            type="button"
            onClick={clearOutput}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Clear
          </button>
        )}
        {status === "idle" && (
          <span className="text-xs text-muted-foreground">
            Click Run to execute in browser (Pyodide)
          </span>
        )}
      </div>

      {/* Output panel */}
      {(output.length > 0 || plots.length > 0 || error) && (
        <div className="max-h-[300px] overflow-auto shrink-0">
          {error && (
            <div className="px-4 py-2 bg-destructive/5 border-b border-destructive/20">
              <div className="flex items-center gap-2 text-destructive text-xs font-medium mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Error
              </div>
              <pre className="text-xs text-destructive/80 whitespace-pre-wrap font-mono">
                {error}
              </pre>
            </div>
          )}
          {output.length > 0 && (
            <div className="px-4 py-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Terminal className="h-3 w-3" />
                Output
              </div>
              <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">
                {output.join("\n")}
              </pre>
            </div>
          )}
          {plots.map((img, i) => (
            <div key={i} className="px-4 py-2 border-t">
              <img
                src={`data:image/png;base64,${img}`}
                alt={`Plot ${i + 1}`}
                className="max-w-full rounded-lg border"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
