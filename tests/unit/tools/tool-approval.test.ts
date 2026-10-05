// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ToolSet } from "ai"
import {
  __resetToolApprovalsForTests,
  gateToolsForApproval,
  resolveToolApprovalMode,
  respondToToolApproval,
  toolNeedsApproval,
} from "@/lib/tools/approval"

// QA CHAT-037: chat ran every tool with no approval step. These pin that an
// outward-facing tool does not run until its own user approves it.
afterEach(() => __resetToolApprovalsForTests())

function fakeTools() {
  const sendExecute = vi.fn(async () => ({ sent: true }))
  const calcExecute = vi.fn(async () => ({ result: 4 }))
  const tools = {
    channel_dispatch: { description: "send", inputSchema: {}, execute: sendExecute },
    calculator: { description: "calc", inputSchema: {}, execute: calcExecute },
  } as unknown as ToolSet
  return { tools, sendExecute, calcExecute }
}

type Exec = (input: unknown, options: { toolCallId: string; abortSignal?: AbortSignal }) => Promise<unknown>
const exec = (tools: ToolSet, name: string) => (tools[name] as unknown as { execute: Exec }).execute

describe("approval policy", () => {
  it("defaults to gating risky tools when the assistant sets nothing", () => {
    expect(resolveToolApprovalMode(null)).toBe("risky")
    expect(resolveToolApprovalMode({ blockedTopics: [] })).toBe("risky")
    expect(resolveToolApprovalMode({ toolApproval: "bogus" })).toBe("risky")
  })

  it("gates outward-facing tools but not read-only ones", () => {
    expect(toolNeedsApproval("channel_dispatch", "risky")).toBe(true)
    expect(toolNeedsApproval("mcp_github_create_issue", "risky")).toBe(true)
    expect(toolNeedsApproval("workflow_send_invoice", "risky")).toBe(true)
    expect(toolNeedsApproval("web_search", "risky")).toBe(false)
    expect(toolNeedsApproval("web_search", "all")).toBe(true)
    expect(toolNeedsApproval("channel_dispatch", "off")).toBe(false)
  })

  it("gates code_interpreter in risky mode (TC-1523): runs sandboxed arbitrary code", () => {
    expect(toolNeedsApproval("code_interpreter", "risky")).toBe(true)
    // Positive control: an actually-read-only builtin stays auto-approved.
    expect(toolNeedsApproval("calculator", "risky")).toBe(false)
    // "all" still gates everything; "off" still gates nothing.
    expect(toolNeedsApproval("code_interpreter", "all")).toBe(true)
    expect(toolNeedsApproval("code_interpreter", "off")).toBe(false)
  })
})

describe("gateToolsForApproval", () => {
  it("does not run a gated tool until its user approves", async () => {
    const { tools, sendExecute } = fakeTools()
    const { tools: gated, gated: names } = gateToolsForApproval(tools, { mode: "risky", userId: "u1" })
    expect(names).toEqual(["channel_dispatch"])

    const run = exec(gated, "channel_dispatch")({ to: "x" }, { toolCallId: "call_1" })
    await Promise.resolve()
    expect(sendExecute).not.toHaveBeenCalled()

    expect(respondToToolApproval({ toolCallId: "call_1", userId: "u1", approved: true })).toBe("ok")
    await expect(run).resolves.toEqual({ sent: true })
    expect(sendExecute).toHaveBeenCalledTimes(1)
  })

  it("returns a not-performed result when denied, without running the tool", async () => {
    const { tools, sendExecute } = fakeTools()
    const { tools: gated } = gateToolsForApproval(tools, { mode: "risky", userId: "u1" })
    const run = exec(gated, "channel_dispatch")({}, { toolCallId: "call_2" })
    respondToToolApproval({ toolCallId: "call_2", userId: "u1", approved: false })
    await expect(run).resolves.toMatchObject({ performed: false, approval: "denied" })
    expect(sendExecute).not.toHaveBeenCalled()
  })

  it("ignores a decision from a different user", async () => {
    const { tools, sendExecute } = fakeTools()
    const { tools: gated } = gateToolsForApproval(tools, { mode: "risky", userId: "u1", timeoutMs: 50 })
    const run = exec(gated, "channel_dispatch")({}, { toolCallId: "call_3" })
    expect(respondToToolApproval({ toolCallId: "call_3", userId: "intruder", approved: true })).toBe("not_found")
    await expect(run).resolves.toMatchObject({ performed: false, approval: "timeout" })
    expect(sendExecute).not.toHaveBeenCalled()
  })

  it("fails closed on abort", async () => {
    const { tools, sendExecute } = fakeTools()
    const { tools: gated } = gateToolsForApproval(tools, { mode: "risky", userId: "u1" })
    const ctrl = new AbortController()
    const run = exec(gated, "channel_dispatch")({}, { toolCallId: "call_4", abortSignal: ctrl.signal })
    ctrl.abort()
    await expect(run).resolves.toMatchObject({ performed: false, approval: "aborted" })
    expect(sendExecute).not.toHaveBeenCalled()
  })

  it("honours a decision that arrives just before the tool starts waiting", async () => {
    const { tools, sendExecute } = fakeTools()
    const { tools: gated } = gateToolsForApproval(tools, { mode: "risky", userId: "u1" })
    respondToToolApproval({ toolCallId: "call_5", userId: "u1", approved: true })
    await expect(exec(gated, "channel_dispatch")({}, { toolCallId: "call_5" })).resolves.toEqual({ sent: true })
    expect(sendExecute).toHaveBeenCalledTimes(1)
  })

  it("leaves auto-approved tools untouched (positive control)", async () => {
    const { tools, calcExecute } = fakeTools()
    const { tools: gated } = gateToolsForApproval(tools, { mode: "risky", userId: "u1" })
    await expect(exec(gated, "calculator")({}, { toolCallId: "call_6" })).resolves.toEqual({ result: 4 })
    expect(calcExecute).toHaveBeenCalledTimes(1)
  })

  it("runs each gated call exactly once under concurrent approvals", async () => {
    const { tools, sendExecute } = fakeTools()
    const { tools: gated } = gateToolsForApproval(tools, { mode: "risky", userId: "u1" })
    const ids = Array.from({ length: 20 }, (_, i) => `par_${i}`)
    const runs = ids.map((id) => exec(gated, "channel_dispatch")({}, { toolCallId: id }))
    // Each id approved three times at once — duplicates must not double-run.
    await Promise.all(
      ids.flatMap((id) => [1, 2, 3].map(() => Promise.resolve().then(() =>
        respondToToolApproval({ toolCallId: id, userId: "u1", approved: true }),
      ))),
    )
    await Promise.all(runs)
    expect(sendExecute).toHaveBeenCalledTimes(20)
  })
})
