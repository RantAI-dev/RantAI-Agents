/**
 * Cross-tenant (IDOR) contract tests for workflow runs and workflow-node
 * resource lookups. Every negative case has a positive owner control so a
 * broken code path cannot pass as "denied".
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    workflow: { findFirst: vi.fn(), findUnique: vi.fn() },
    credential: { findFirst: vi.fn(), findUnique: vi.fn() },
    assistant: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}))

vi.mock("@/lib/workflow/engine", () => ({
  workflowEngine: { execute: vi.fn(), resume: vi.fn() },
  buildTemplateContext: vi.fn(() => ({})),
}))
vi.mock("@/lib/workflow/credentials", () => ({
  decryptCredential: vi.fn(() => ({ token: "secret" })),
  credentialToHeaders: vi.fn(() => ({ Authorization: "Bearer secret" })),
}))
vi.mock("@/lib/tools/builtin", () => ({ BUILTIN_TOOLS: {} }))
vi.mock("@/lib/mcp/client", () => ({ mcpClientManager: {} }))

import { prisma } from "@/lib/prisma"
import { getWorkflowRun, listWorkflowRuns, resumeWorkflowRun } from "./service"
import { executeTool } from "@/lib/workflow/nodes/tool"
import { executeSubWorkflow } from "@/lib/workflow/nodes/sub-workflow"
import { executeAgent } from "@/lib/workflow/nodes/agent"
import type { ExecutionContext } from "@/lib/workflow/engine"

const OWNER = "org_owner"
const FOREIGN = "org_foreign"

/** In-memory tenant-aware stand-in for prisma.<model>.findFirst. */
function scopedFindFirst(row: { id: string; organizationId: string | null }) {
  return vi.fn(async (args: { where: Record<string, unknown> }) => {
    const w = args.where
    if (w.id !== undefined && w.id !== row.id) return null
    const orgClauses: unknown[] = []
    if ("organizationId" in w) orgClauses.push(w.organizationId)
    if (Array.isArray(w.OR)) {
      for (const c of w.OR as Record<string, unknown>[]) orgClauses.push(c.organizationId)
    }
    if (orgClauses.length === 0) return row // unscoped query: leak (the bug)
    return orgClauses.includes(row.organizationId) ? row : null
  })
}

function ctx(organizationId?: string): ExecutionContext {
  return {
    workflowId: "wf_1",
    runId: "run_1",
    variables: {},
    stepOutputs: new Map(),
    flow: {} as ExecutionContext["flow"],
    organizationId,
  }
}

describe("workflow run tenancy", () => {
  const run = { id: "run_1", workflowId: "wf_1", status: "PAUSED" }

  beforeEach(() => {
    vi.clearAllMocks()
    // Unscoped lookups return the row regardless of caller (models the leak).
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(run as never)
    vi.mocked(prisma.workflowRun.findMany).mockResolvedValue([run] as never)
    // Scoped lookups honour the relation filter on workflow.organizationId.
    vi.mocked(prisma.workflowRun.findFirst).mockImplementation((async (args: {
      where: { id?: string; workflow?: { organizationId?: string | null } }
    }) => {
      if (args.where.id !== run.id) return null
      return args.where.workflow?.organizationId === OWNER ? run : null
    }) as never)
    vi.mocked(prisma.workflowRun.findMany).mockImplementation((async (args: {
      where: { workflowId?: string; workflow?: { organizationId?: string | null } }
    }) => {
      if (!args.where.workflow) return [run] // unscoped: leak
      return args.where.workflow.organizationId === OWNER ? [run] : []
    }) as never)
  })

  it("getWorkflowRun: foreign org gets 404", async () => {
    const result = await getWorkflowRun("run_1", FOREIGN)
    expect(result).toEqual({ status: 404, error: "Run not found" })
  })

  it("getWorkflowRun: owner org gets the run", async () => {
    const result = await getWorkflowRun("run_1", OWNER)
    expect(result).toEqual(run)
  })

  it("listWorkflowRuns: foreign org sees nothing", async () => {
    expect(await listWorkflowRuns("wf_1", FOREIGN)).toEqual([])
  })

  it("listWorkflowRuns: owner org sees the runs", async () => {
    expect(await listWorkflowRuns("wf_1", OWNER)).toEqual([run])
  })

  it("resumeWorkflowRun: foreign org gets 404 and the engine is never called", async () => {
    const engine = { resume: vi.fn() }
    const result = await resumeWorkflowRun({
      runId: "run_1",
      organizationId: FOREIGN,
      deps: { workflowEngine: engine as never },
    })
    expect(result).toEqual({ status: 404, error: "Run not found" })
    expect(engine.resume).not.toHaveBeenCalled()
  })

  it("resumeWorkflowRun: owner org resumes", async () => {
    const engine = { resume: vi.fn().mockResolvedValue(undefined) }
    const result = await resumeWorkflowRun({
      runId: "run_1",
      organizationId: OWNER,
      deps: { workflowEngine: engine as never },
    })
    expect(engine.resume).toHaveBeenCalledWith("run_1", undefined, undefined)
    expect(result).toEqual(run)
  })
})

describe("workflow node resource tenancy", () => {
  beforeEach(() => vi.clearAllMocks())

  describe("HTTP node credential", () => {
    const credential = { id: "cred_1", organizationId: OWNER, type: "BEARER", encryptedData: "x" }
    const httpNode = {
      label: "http",
      nodeType: "http" as never,
      url: "https://example.test/",
      method: "GET",
      credentialId: "cred_1",
    } as never

    beforeEach(() => {
      vi.mocked(prisma.credential.findUnique).mockResolvedValue(credential as never)
      vi.mocked(prisma.credential.findFirst).mockImplementation(scopedFindFirst(credential) as never)
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => ({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ sentHeaders: init.headers }),
          text: async () => "",
        }))
      )
    })

    it("foreign org: credential headers are NOT attached", async () => {
      const { output } = await executeTool(httpNode, {}, ctx(FOREIGN))
      const sent = (output as { data?: { sentHeaders?: Record<string, string> } }).data?.sentHeaders
      expect(sent?.Authorization).toBeUndefined()
    })

    it("owner org: credential headers are attached", async () => {
      const { output } = await executeTool(httpNode, {}, ctx(OWNER))
      const sent = (output as { data?: { sentHeaders?: Record<string, string> } }).data?.sentHeaders
      expect(sent?.Authorization).toBe("Bearer secret")
    })
  })

  describe("sub-workflow node", () => {
    const target = { id: "wf_child", organizationId: OWNER, status: "ACTIVE", name: "child" }
    const node = { label: "sub", nodeType: "sub_workflow" as never, workflowId: "wf_child" } as never

    beforeEach(() => {
      vi.mocked(prisma.workflow.findUnique).mockResolvedValue(target as never)
      vi.mocked(prisma.workflow.findFirst).mockImplementation(scopedFindFirst(target) as never)
      vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({ status: "COMPLETED", output: 1 } as never)
    })

    it("foreign org: throws not found", async () => {
      await expect(executeSubWorkflow(node, {}, ctx(FOREIGN))).rejects.toThrow(/not found/)
    })

    it("owner org: resolves the workflow", async () => {
      await expect(executeSubWorkflow(node, {}, ctx(OWNER))).resolves.toBeDefined()
    })
  })

  describe("agent node assistant", () => {
    const assistant = { id: "as_1", organizationId: OWNER, model: "m", systemPrompt: null }
    const node = { label: "agent", nodeType: "agent" as never, assistantId: "as_1" } as never

    beforeEach(() => {
      vi.mocked(prisma.assistant.findUnique).mockResolvedValue(assistant as never)
      vi.mocked(prisma.assistant.findFirst).mockImplementation(scopedFindFirst(assistant) as never)
    })

    it("foreign org: throws not found", async () => {
      await expect(executeAgent(node, {}, ctx(FOREIGN))).rejects.toThrow(/not found/)
    })

    it("owner org: gets past the assistant lookup", async () => {
      // Anything past the lookup (provider, generateText) is out of scope; we
      // only assert the failure is not the tenancy 404.
      await expect(executeAgent(node, {}, ctx(OWNER))).rejects.not.toThrow(/not found/)
        .catch(() => undefined)
      const err = await executeAgent(node, {}, ctx(OWNER)).then(() => null, (e: Error) => e)
      expect(err?.message ?? "").not.toMatch(/not found/)
    })
  })
})
