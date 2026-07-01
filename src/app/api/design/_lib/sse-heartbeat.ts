/**
 * Minimal keep-alive SSE stream for the design SPA's EventSource endpoints.
 *
 * Upstream open-design's daemon pushed real events over these streams (chokidar
 * file-change events on `/api/projects/:id/events`; memory-extraction events on
 * `/api/memory/events`). The cloud port has no host filesystem watcher and no
 * memory-extraction pipeline, but the SPA opens an EventSource to each and
 * exponential-backoff RECONNECTS on error — a 404 turns into a reconnect storm.
 *
 * This helper returns a valid `text/event-stream` that opens, sends an initial
 * `ready`/named event so the SPA's backoff resets, then heartbeats a comment
 * frame (`: keepalive`) every ~25s to hold the connection open through proxies.
 * It never emits domain events (preview refresh already flows through the run
 * `tool_result`/artifact path). Aborts cleanly on client disconnect.
 */
const encoder = new TextEncoder()

export interface HeartbeatSseOptions {
  /** Client disconnect signal (Request.signal). */
  signal: AbortSignal
  /** Named event + JSON payload sent immediately on open (e.g. `ready`). */
  open?: { event: string; data: unknown }
  /** Heartbeat interval in ms. Defaults to 25000. */
  intervalMs?: number
}

export function heartbeatSseResponse(opts: HeartbeatSseOptions): Response {
  const { signal, open, intervalMs = 25_000 } = opts

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let timer: ReturnType<typeof setInterval> | null = null

      const cleanup = () => {
        if (closed) return
        closed = true
        if (timer) clearInterval(timer)
        signal.removeEventListener("abort", cleanup)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      const write = (chunk: string): void => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }

      if (signal.aborted) {
        cleanup()
        return
      }
      signal.addEventListener("abort", cleanup)

      // Open frame: a comment so the stream is immediately valid, plus an
      // optional named event so the SPA's backoff resets.
      write(": open\n\n")
      if (open) {
        write(`event: ${open.event}\ndata: ${JSON.stringify(open.data)}\n\n`)
      }

      timer = setInterval(() => write(": keepalive\n\n"), intervalMs)
      // Do not keep the event loop alive solely for the heartbeat.
      ;(timer as { unref?: () => void }).unref?.()
    },
    cancel() {
      /* client went away; start()'s abort listener handles teardown */
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
