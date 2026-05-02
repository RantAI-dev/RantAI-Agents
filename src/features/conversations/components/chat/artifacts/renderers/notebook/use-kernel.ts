"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { WorkerRequest, WorkerResponse } from "@/lib/workers/python-worker-types"
import type { Cell, Output } from "@/lib/notebook/types"

export type KernelStatus = "idle" | "loading" | "ready" | "running"

export type CellRuntimeState = {
  status: "idle" | "queued" | "running" | "done" | "error"
  outputs: Output[]
  executionCount: number | null
  lastRunDurationMs: number | null
  imageTruncated: boolean
}

type QueueItem = { id: string; source: string }

const EMPTY_RUNTIME: CellRuntimeState = {
  status: "idle",
  outputs: [],
  executionCount: null,
  lastRunDurationMs: null,
  imageTruncated: false,
}

export function useKernel(onCellUpdate: (cellId: string, state: CellRuntimeState) => void) {
  const workerRef = useRef<Worker | null>(null)
  const cellStateRef = useRef<Map<string, CellRuntimeState>>(new Map())
  const execCounterRef = useRef<number>(0)
  const queueRef = useRef<QueueItem[]>([])
  const onCellUpdateRef = useRef(onCellUpdate)
  useEffect(() => {
    onCellUpdateRef.current = onCellUpdate
  }, [onCellUpdate])

  const [kernelStatus, setKernelStatus] = useState<KernelStatus>("idle")
  const [runningCellId, setRunningCellId] = useState<string | null>(null)

  const emit = useCallback((cellId: string) => {
    const s = cellStateRef.current.get(cellId)
    if (!s) return
    onCellUpdateRef.current(cellId, { ...s, outputs: [...s.outputs] })
  }, [])

  const setCellState = useCallback(
    (cellId: string, patch: Partial<CellRuntimeState>) => {
      const prev = cellStateRef.current.get(cellId) ?? { ...EMPTY_RUNTIME, outputs: [] }
      const next: CellRuntimeState = {
        ...prev,
        ...patch,
        outputs: patch.outputs ?? prev.outputs,
      }
      cellStateRef.current.set(cellId, next)
      emit(cellId)
    },
    [emit],
  )

  const drainQueue = useCallback(() => {
    if (!workerRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    execCounterRef.current += 1
    setCellState(next.id, {
      status: "running",
      outputs: [],
      executionCount: execCounterRef.current,
      lastRunDurationMs: null,
      imageTruncated: false,
    })
    setRunningCellId(next.id)
    workerRef.current.postMessage({
      type: "run",
      cellId: next.id,
      source: next.source,
      executionCount: execCounterRef.current,
    } satisfies WorkerRequest)
  }, [setCellState])

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current
    const w = new Worker(new URL("@/lib/workers/python-worker.ts", import.meta.url), {
      type: "module",
    })
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === "kernel-status") {
        setKernelStatus(
          msg.status === "running"
            ? "running"
            : msg.status === "loading"
              ? "loading"
              : msg.status === "ready"
                ? "ready"
                : "idle",
        )
        return
      }

      const cellId = msg.cellId
      const prev = cellStateRef.current.get(cellId) ?? { ...EMPTY_RUNTIME, outputs: [] }
      const outputs = [...prev.outputs]
      const next: CellRuntimeState = { ...prev, outputs }

      switch (msg.type) {
        case "cell-status":
          next.status = msg.status
          break
        case "stream":
          outputs.push({ type: "stream", name: msg.name, text: msg.text })
          break
        case "display":
          if (msg.mime === "image/png") {
            if (msg.oversize) next.imageTruncated = true
            outputs.push({ type: "display_data", data: { "image/png": msg.data } })
          } else {
            outputs.push({ type: "display_data", data: { "text/html": msg.data } })
          }
          break
        case "result":
          outputs.push({
            type: "execute_result",
            data: msg.data,
            executionCount: prev.executionCount ?? 0,
          })
          break
        case "error":
          outputs.push({
            type: "error",
            ename: msg.ename,
            evalue: msg.evalue,
            traceback: msg.traceback,
          })
          next.status = "error"
          break
        case "duration":
          next.lastRunDurationMs = msg.ms
          break
      }

      cellStateRef.current.set(cellId, next)
      emit(cellId)

      if (msg.type === "cell-status" && (msg.status === "done" || msg.status === "error")) {
        setRunningCellId(null)
        if (msg.status === "error") {
          queueRef.current = []
        } else if (queueRef.current.length > 0) {
          drainQueue()
        }
      }
    }
    workerRef.current = w
    return w
  }, [emit, drainQueue])

  const runCell = useCallback(
    (cellId: string, source: string) => {
      ensureWorker()
      queueRef.current = [{ id: cellId, source }]
      drainQueue()
    },
    [ensureWorker, drainQueue],
  )

  const runAll = useCallback(
    (cells: Cell[]) => {
      ensureWorker()
      const codeCells = cells.filter((c) => c.type === "code" && c.source.trim().length > 0)
      for (const c of codeCells) {
        setCellState(c.id, {
          status: "queued",
          outputs: [],
          lastRunDurationMs: null,
          imageTruncated: false,
        })
      }
      queueRef.current = codeCells.map((c) => ({ id: c.id, source: c.source }))
      drainQueue()
    },
    [ensureWorker, drainQueue, setCellState],
  )

  const interrupt = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    queueRef.current = []
    setKernelStatus("idle")
    setRunningCellId(null)
  }, [])

  const restart = useCallback(() => {
    interrupt()
    execCounterRef.current = 0
    cellStateRef.current.clear()
    ensureWorker().postMessage({ type: "init" } satisfies WorkerRequest)
  }, [interrupt, ensureWorker])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  return { kernelStatus, runningCellId, runCell, runAll, interrupt, restart }
}
