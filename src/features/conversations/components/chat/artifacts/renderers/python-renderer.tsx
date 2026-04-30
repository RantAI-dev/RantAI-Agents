"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Loader2, Play, Square, RotateCcw, AlertTriangle, Terminal, Wand2 } from "@/lib/icons"
import { StreamdownContent } from "../../streamdown-content"

interface PythonRendererProps {
  content: string
  onFixWithAI?: (error: string) => void
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
 *
 * - numpy AND scikit-learn are pre-loaded at init so the documented
 *   packages don't trigger first-import latency.
 * - __plot_images__ is reset to [] at the start of every run so the
 *   previous run's plots don't bleed into the current run's output.
 * - matplotlib capture is installed once during initPyodide (not on
 *   every run).
 */
const workerSource = `
const PYODIDE_CDN = "${PYODIDE_CDN}";
let pyodide = null;

async function initPyodide() {
  if (pyodide) return pyodide;

  self.postMessage({ type: "status", status: "loading" });

  importScripts(PYODIDE_CDN + "pyodide.js");
  pyodide = await self.loadPyodide({ indexURL: PYODIDE_CDN });
  // Pre-load common heavy packages so the first user import is instant.
  await pyodide.loadPackage(["numpy", "micropip", "matplotlib", "scikit-learn"]);

  // Install the matplotlib plt.show() interceptor exactly once. The
  // global __plot_images__ list is also defined here; subsequent runs reset
  // it from runPythonAsync (see onmessage below).
  await pyodide.runPythonAsync(\`
import io, base64
__plot_images__ = []
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    _original_show = plt.show
    def _capture_show(*args, **kwargs):
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
        buf.seek(0)
        __plot_images__.append(base64.b64encode(buf.read()).decode())
        plt.close('all')
    plt.show = _capture_show
except ImportError:
    pass
\`);

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

    // Reset the plot accumulator so a previous run's images don't leak
    // into this one. The capture hook itself is installed in initPyodide.
    await py.runPythonAsync("__plot_images__ = []");

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

export function PythonRenderer({ content, onFixWithAI }: PythonRendererProps) {
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

  // D-27: adaptive fence length — match application/code's pattern so a
  // Python script with embedded triple-backticks (e.g. docstrings showing
  // markdown examples) doesn't break Streamdown's parser.
  const longestRun = (content.match(/`+/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    0,
  )
  const fence = "`".repeat(Math.max(3, longestRun + 1))

  return (
    <div className="flex flex-col h-full">
      {/* Code display */}
      <div className="flex-1 overflow-auto border-b min-h-0">
        <StreamdownContent
          content={`${fence}python\n${content}\n${fence}`}
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

      {/* Output panel — responsive max height so fullscreen / tall
          panels can show more output. Falls back to 300px on the smallest
          viewports and grows up to 60vh on larger screens. */}
      {(output.length > 0 || plots.length > 0 || error) && (
        <div className="max-h-[300px] sm:max-h-[40vh] lg:max-h-[60vh] overflow-auto shrink-0">
          {error && (
            <div className="px-4 py-2 bg-destructive/5 border-b border-destructive/20">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 text-destructive text-xs font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Error
                </div>
                {onFixWithAI && (
                  <button
                    type="button"
                    onClick={() => onFixWithAI(error)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Wand2 className="h-3 w-3" />
                    Fix with AI
                  </button>
                )}
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
