export type WorkerRequest =
  | { type: "init" }
  | { type: "run"; cellId: string; source: string; timeoutMs?: number }
  | { type: "reset" }

export type WorkerResponse =
  | { type: "kernel-status"; status: "loading" | "ready" | "running" | "idle" }
  | { type: "cell-status"; cellId: string; status: "running" | "done" | "error" }
  | { type: "stream"; cellId: string; name: "stdout" | "stderr"; text: string }
  | { type: "display"; cellId: string; mime: "image/png" | "text/html"; data: string; oversize?: boolean }
  | { type: "result"; cellId: string; data: { "text/html"?: string; "text/plain"?: string } }
  | { type: "error"; cellId: string; ename: string; evalue: string; traceback: string[] }
  | { type: "duration"; cellId: string; ms: number }
