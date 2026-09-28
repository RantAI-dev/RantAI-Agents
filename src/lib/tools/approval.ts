import type { ToolSet } from "ai"

/**
 * Per-tool approval gate for dashboard chat (QA CHAT-037).
 *
 * Chat executed every tool the model called with no way for the user to stop
 * it — the only approval system was the Digital Employee one. For tools that
 * act on the outside world (send a message, call an arbitrary HTTP API, run an
 * MCP server's tool, trigger a workflow) the call now pauses until the user
 * approves or denies it in the chat, or the wait times out.
 *
 * Mechanism: the gated tool's `execute` awaits a decision keyed by the AI SDK
 * toolCallId. The client already receives `tool-input-available` for that id
 * before `execute` settles, renders Approve/Deny, and POSTs the decision to
 * /api/chat/tool-approval, which resolves the wait. The stream stays open
 * meanwhile, so no message-history round trip is needed.
 *
 * Limitation, deliberately accepted: pending decisions live in this process's
 * memory. With more than one app instance behind a non-sticky balancer, a
 * decision can land on the wrong instance; the call then times out as denied
 * — failing closed, never open. Every current deployment runs one instance.
 */

export type ToolApprovalMode = "off" | "risky" | "all"

/**
 * Tools that only read, compute, or write inside the user's own workspace.
 * Everything else — MCP, custom/OpenAPI, community and workflow tools, and
 * the builtins that reach outside (channel_dispatch sends messages,
 * file_operations mints storage URLs) — is "risky".
 */
export const AUTO_APPROVED_TOOLS: ReadonlySet<string> = new Set([
  "knowledge_search",
  "document_analysis",
  "customer_lookup",
  "web_search",
  "calculator",
  "date_time",
  "json_transform",
  "text_utilities",
  "create_artifact",
  "update_artifact",
  "code_interpreter", // runs in the Piston sandbox, no network
  "ocr_document",
  "saveMemory",
  "forgetMemory",
])

/** Reads the assistant's guard-rails JSON; unset means the safe default. */
export function resolveToolApprovalMode(guardRails: unknown): ToolApprovalMode {
  const value =
    guardRails && typeof guardRails === "object"
      ? (guardRails as { toolApproval?: unknown }).toolApproval
      : undefined
  return value === "off" || value === "all" || value === "risky" ? value : "risky"
}

export function toolNeedsApproval(name: string, mode: ToolApprovalMode): boolean {
  if (mode === "off") return false
  if (mode === "all") return true
  return !AUTO_APPROVED_TOOLS.has(name)
}

export type ToolApprovalOutcome = "approved" | "denied" | "timeout" | "aborted"

interface Pending {
  userId: string
  settle: (outcome: ToolApprovalOutcome) => void
}

const pending = new Map<string, Pending>()
/** Decisions that arrived before the tool started waiting (tiny race window). */
const early = new Map<string, { userId: string; approved: boolean; at: number }>()
const EARLY_TTL_MS = 60_000

/**
 * Cloudflare and most proxies drop an idle stream after ~100s, and no bytes
 * flow while we wait, so the default stays under that.
 */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 90_000

export function awaitToolApproval(params: {
  toolCallId: string
  userId: string
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<ToolApprovalOutcome> {
  const { toolCallId, userId } = params
  const pre = early.get(toolCallId)
  if (pre) {
    early.delete(toolCallId)
    if (pre.userId === userId && Date.now() - pre.at < EARLY_TTL_MS) {
      return Promise.resolve(pre.approved ? "approved" : "denied")
    }
  }

  return new Promise<ToolApprovalOutcome>((resolve) => {
    let done = false
    const finish = (outcome: ToolApprovalOutcome) => {
      if (done) return
      done = true
      clearTimeout(timer)
      params.signal?.removeEventListener("abort", onAbort)
      pending.delete(toolCallId)
      resolve(outcome)
    }
    const onAbort = () => finish("aborted")
    const timer = setTimeout(
      () => finish("timeout"),
      params.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS,
    )
    if (params.signal?.aborted) return finish("aborted")
    params.signal?.addEventListener("abort", onAbort, { once: true })
    pending.set(toolCallId, { userId, settle: finish })
  })
}

/**
 * Record the user's decision. Only the user whose chat made the call can
 * decide it; anyone else gets "not_found", indistinguishable from a stale id.
 */
export function respondToToolApproval(params: {
  toolCallId: string
  userId: string
  approved: boolean
}): "ok" | "not_found" {
  const entry = pending.get(params.toolCallId)
  if (entry) {
    if (entry.userId !== params.userId) return "not_found"
    entry.settle(params.approved ? "approved" : "denied")
    return "ok"
  }
  // The client can beat `execute` to the wait by a few ms; hold the answer.
  for (const [id, v] of early) {
    if (Date.now() - v.at >= EARLY_TTL_MS) early.delete(id)
  }
  early.set(params.toolCallId, {
    userId: params.userId,
    approved: params.approved,
    at: Date.now(),
  })
  return "ok"
}

const OUTCOME_MESSAGE: Record<Exclude<ToolApprovalOutcome, "approved">, string> = {
  denied: "The user declined this action. Do not retry it; tell the user it was not performed.",
  timeout:
    "The user did not approve this action in time, so it was not performed. Ask the user whether to try again.",
  aborted: "The request was cancelled before the user approved this action; it was not performed.",
}

/**
 * Wrap every tool that needs approval so its `execute` waits for the user.
 * Returns the names that were gated so the client can render approval
 * controls for exactly those calls.
 */
export function gateToolsForApproval(
  tools: ToolSet,
  params: { mode: ToolApprovalMode; userId: string; timeoutMs?: number },
): { tools: ToolSet; gated: string[] } {
  const gated: string[] = []
  const out: ToolSet = {}
  for (const [name, t] of Object.entries(tools)) {
    const execute = (t as { execute?: (input: unknown, options: unknown) => unknown }).execute
    if (!execute || !toolNeedsApproval(name, params.mode)) {
      out[name] = t
      continue
    }
    gated.push(name)
    out[name] = {
      ...t,
      execute: async (input: unknown, options: { toolCallId: string; abortSignal?: AbortSignal }) => {
        const outcome = await awaitToolApproval({
          toolCallId: options.toolCallId,
          userId: params.userId,
          timeoutMs: params.timeoutMs,
          signal: options.abortSignal,
        })
        if (outcome !== "approved") {
          return { performed: false, approval: outcome, message: OUTCOME_MESSAGE[outcome] }
        }
        return execute(input, options)
      },
    } as ToolSet[string]
  }
  return { tools: out, gated }
}

/** Test hook: drop all pending and early decisions. */
export function __resetToolApprovalsForTests() {
  for (const entry of pending.values()) entry.settle("aborted")
  pending.clear()
  early.clear()
}
