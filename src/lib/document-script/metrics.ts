import "server-only"

interface Counters {
  sandbox_attempts: number
  sandbox_failures: number
  sandbox_duration_ms_total: number
  render_attempts: number
  render_failures: number
  render_duration_ms_total: number
  llm_rewrite_attempts: number
  llm_rewrite_retries: number
  llm_rewrite_failures: number
}

const ZERO: Counters = {
  sandbox_attempts: 0, sandbox_failures: 0, sandbox_duration_ms_total: 0,
  render_attempts: 0, render_failures: 0, render_duration_ms_total: 0,
  llm_rewrite_attempts: 0, llm_rewrite_retries: 0, llm_rewrite_failures: 0,
}

let counters: Counters = { ...ZERO }

export function metrics(): Counters {
  return { ...counters }
}

export function resetMetrics(): void {
  counters = { ...ZERO }
}

export function recordSandbox(args: { ok: boolean; durationMs: number }): void {
  counters.sandbox_attempts++
  if (!args.ok) counters.sandbox_failures++
  counters.sandbox_duration_ms_total += args.durationMs
}

export function recordRender(args: { ok: boolean; durationMs: number }): void {
  counters.render_attempts++
  if (!args.ok) counters.render_failures++
  counters.render_duration_ms_total += args.durationMs
}

export function recordLlmRewrite(args: { ok: boolean; attempts: number }): void {
  counters.llm_rewrite_attempts++
  counters.llm_rewrite_retries += Math.max(0, args.attempts - 1)
  if (!args.ok) counters.llm_rewrite_failures++
}
