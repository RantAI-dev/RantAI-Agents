// src/lib/document-script/types.ts
export interface SandboxOptions {
  /** Wall-clock deadline in ms. Default 10_000. */
  timeoutMs?: number
  /** Maximum stdout (docx) bytes before kill. Default 100 MiB. */
  maxOutputBytes?: number
  /** Heap size cap passed to child as --max-old-space-size (MiB). Default 256. */
  maxHeapMb?: number
}

export interface SandboxResult {
  ok: boolean
  buf?: Buffer
  error?: string
  /** wall-clock ms taken */
  durationMs: number
}

export interface ScriptValidationResult {
  ok: boolean
  errors: string[]
}
