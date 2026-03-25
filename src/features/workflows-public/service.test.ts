import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  discoverPublicWorkflows,
  executePublicWorkflowWebhookPost,
  getPublicWorkflowWebhookStatus,
  runPublicWorkflowById,
} from "./service"
import * as repository from "./repository"
import * as rateLimiter from "@/lib/embed/rate-limiter"
import { workflowEngine } from "@/lib/workflow"
import * as chatflowModule from "@/lib/workflow/chatflow"

vi.mock("./repository", () => ({
  findWorkflowById: vi.fn(),
  findWorkflowRunById: vi.fn(),
  findActiveWorkflows: vi.fn(),
  findApiEnabledWorkflowByKey: vi.fn(),
  findDiscoverableWorkflows: vi.fn(),
}))

vi.mock("@/lib/embed/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
}))

vi.mock("@/lib/workflow", () => ({
  workflowEngine: {
    execute: vi.fn(),
  },
}))

vi.mock("@/lib/workflow/chatflow", () => ({
  executeChatflow: vi.fn(),
}))

describe("workflows-public service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when workflow run API key is missing", async () => {
    const result = await runPublicWorkflowById({
      workflowId: "wf_1",
      apiKey: null,
      input: {},
    })

    expect(result).toEqual({ status: 401, error: "Missing x-api-key header" })
  })

  it("returns 429 when workflow run hits rate limit", async () => {
    vi.mocked(repository.findWorkflowById).mockResolvedValue({
      id: "wf_1",
      apiEnabled: true,
      apiKey: "key_1",
      status: "ACTIVE",
      mode: "STANDARD",
    } as never)
    vi.mocked(rateLimiter.checkRateLimit).mockReturnValue({
      allowed: false,
      resetIn: 42,
      remaining: 0,
    })

    const result = await runPublicWorkflowById({
      workflowId: "wf_1",
      apiKey: "key_1",
      input: {},
    })

    expect(result).toEqual({
      status: 429,
      error: "Rate limit exceeded",
      headers: { "Retry-After": "42" },
      body: { retryAfter: 42 },
    })
  })

  it("returns paused partial output from successful step logs", async () => {
    vi.mocked(repository.findWorkflowById).mockResolvedValue({
      id: "wf_1",
      apiEnabled: true,
      apiKey: "key_1",
      status: "ACTIVE",
      mode: "STANDARD",
    } as never)
    vi.mocked(rateLimiter.checkRateLimit).mockReturnValue({
      allowed: true,
      resetIn: 60,
      remaining: 99,
    })
    vi.mocked(workflowEngine.execute).mockResolvedValue("run_1")
    vi.mocked(repository.findWorkflowRunById).mockResolvedValue({
      id: "run_1",
      status: "PAUSED",
      output: null,
      error: null,
      startedAt: new Date("2026-03-01T00:00:00.000Z"),
      completedAt: null,
      steps: [
        { nodeId: "node_a", status: "success", output: { value: 1 } },
        { nodeId: "node_b", status: "failed", output: { value: 2 } },
      ],
    } as never)

    const result = await runPublicWorkflowById({
      workflowId: "wf_1",
      apiKey: "key_1",
      input: { k: "v" },
    })

    expect(result).toMatchObject({
      kind: "json",
      status: 200,
      body: {
        runId: "run_1",
        status: "PAUSED",
        output: { node_a: { value: 1 } },
      },
    })
  })

  it("returns 401 for webhook when signature is invalid", async () => {
    vi.mocked(repository.findActiveWorkflows).mockResolvedValue([
      {
        id: "wf_1",
        trigger: { type: "webhook", webhookPath: "orders", webhookSecret: "secret" },
        mode: "STANDARD",
      },
    ] as never)

    const result = await executePublicWorkflowWebhookPost({
      path: "orders",
      rawBody: '{"event":"created"}',
      signatureHeader: "sha256=invalid",
      requestHeaders: {},
    })

    expect(result).toEqual({ status: 401, error: "Invalid webhook signature" })
  })

  it("returns discoverable workflows for valid key", async () => {
    vi.mocked(repository.findApiEnabledWorkflowByKey).mockResolvedValue({ id: "wf_1" } as never)
    vi.mocked(repository.findDiscoverableWorkflows).mockResolvedValue([
      { id: "wf_1", name: "Fraud Check", mode: "STANDARD", description: null },
    ] as never)

    const result = await discoverPublicWorkflows({
      apiKey: "key_1",
      query: { name: "fraud", mode: "STANDARD", apiEnabled: "true" },
    })

    expect(result).toMatchObject({
      kind: "json",
      status: 200,
      body: [{ id: "wf_1", name: "Fraud Check", mode: "STANDARD" }],
    })
    expect(repository.findDiscoverableWorkflows).toHaveBeenCalledWith({
      status: "ACTIVE",
      name: { contains: "fraud", mode: "insensitive" },
      mode: "STANDARD",
      apiEnabled: true,
    })
  })

  it("returns webhook readiness metadata", async () => {
    vi.mocked(repository.findActiveWorkflows).mockResolvedValue([
      {
        id: "wf_1",
        name: "Order Intake",
        trigger: { type: "webhook", webhookPath: "orders" },
      },
    ] as never)

    const result = await getPublicWorkflowWebhookStatus("orders")

    expect(result).toEqual({
      kind: "json",
      status: 200,
      body: {
        webhook: "orders",
        workflowId: "wf_1",
        workflowName: "Order Intake",
        status: "ready",
      },
    })
  })

  it("uses chatflow execution for chatflow workflows", async () => {
    vi.mocked(repository.findWorkflowById).mockResolvedValue({
      id: "wf_chat",
      apiEnabled: true,
      apiKey: "key_1",
      status: "ACTIVE",
      mode: "CHATFLOW",
    } as never)
    vi.mocked(rateLimiter.checkRateLimit).mockReturnValue({
      allowed: true,
      resetIn: 60,
      remaining: 50,
    })
    const response = new Response("stream")
    vi.mocked(chatflowModule.executeChatflow).mockResolvedValue({ response } as never)

    const result = await runPublicWorkflowById({
      workflowId: "wf_chat",
      apiKey: "key_1",
      input: { message: "hello" },
    })

    expect(result).toEqual({ kind: "response", response })
  })
})
