import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDashboardWorkflow,
  deleteDashboardWorkflow,
  exportDashboardWorkflow,
  getDashboardWorkflow,
  getWorkflowRun,
  importDashboardWorkflow,
  listDashboardWorkflows,
  resumeWorkflowRun,
  updateDashboardWorkflow,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createWorkflowRun: vi.fn(),
  createWorkflowWithCount: vi.fn(),
  deleteWorkflowById: vi.fn(),
  findWorkflowApiKeyById: vi.fn(),
  findWorkflowById: vi.fn(),
  findWorkflowRunById: vi.fn(),
  findWorkflowRunsByWorkflowId: vi.fn(),
  findWorkflowsByScope: vi.fn(),
  updateWorkflowById: vi.fn(),
  updateWorkflowRunById: vi.fn(),
}))

vi.mock("@/lib/workflow/import-export", () => ({
  exportWorkflow: vi.fn((workflow: { name: string }) => ({ version: 1, name: workflow.name })),
  importWorkflow: vi.fn(),
}))

describe("workflows service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists workflows in the current scope", async () => {
    vi.mocked(repository.findWorkflowsByScope).mockResolvedValue([{ id: "wf_1" }] as never)

    const result = await listDashboardWorkflows({
      organizationId: "org_1",
      assistantId: "assistant_1",
    })

    expect(result).toEqual([{ id: "wf_1" }])
  })

  it("returns 400 when creating a workflow without a name", async () => {
    const result = await createDashboardWorkflow({
      actorUserId: "user_1",
      organizationId: "org_1",
      input: {},
    })

    expect(result).toEqual({ status: 400, error: "Name is required" })
  })

  it("creates workflows inside the current organization", async () => {
    vi.mocked(repository.createWorkflowWithCount).mockResolvedValue({ id: "wf_1" } as never)

    const result = await createDashboardWorkflow({
      actorUserId: "user_1",
      organizationId: "org_1",
      input: { name: "Workflow", description: "desc" },
    })

    expect(result).toEqual({ id: "wf_1" })
    expect(repository.createWorkflowWithCount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Workflow",
        description: "desc",
        organizationId: "org_1",
        createdBy: "user_1",
      })
    )
  })

  it("returns 404 for missing workflow lookups", async () => {
    vi.mocked(repository.findWorkflowById).mockResolvedValue(null)

    const result = await getDashboardWorkflow("wf_missing")

    expect(result).toEqual({ status: 404, error: "Workflow not found" })
  })

  it("generates an api key when enabling API access on update", async () => {
    vi.mocked(repository.findWorkflowApiKeyById).mockResolvedValue({ apiKey: null })
    vi.mocked(repository.updateWorkflowById).mockResolvedValue({ id: "wf_1" } as never)

    const result = await updateDashboardWorkflow({
      id: "wf_1",
      input: { apiEnabled: true },
    })

    expect(result).toEqual({ id: "wf_1" })
    expect(repository.updateWorkflowById).toHaveBeenCalledWith(
      "wf_1",
      expect.objectContaining({
        apiEnabled: true,
        apiKey: expect.stringMatching(/^wf_wf_1_/),
      })
    )
  })

  it("returns an exported workflow payload", async () => {
    vi.mocked(repository.findWorkflowById).mockResolvedValue({
      id: "wf_1",
      name: "Workflow",
      description: null,
      mode: "STANDARD",
      trigger: {},
      variables: {},
      nodes: [],
      edges: [],
    } as never)

    const result = await exportDashboardWorkflow("wf_1")

    expect(result).toMatchObject({
      name: "Workflow",
      exportData: { version: 1, name: "Workflow" },
    })
  })

  it("returns 404 for missing runs", async () => {
    vi.mocked(repository.findWorkflowRunById).mockResolvedValue(null)

    const result = await getWorkflowRun("run_1")

    expect(result).toEqual({ status: 404, error: "Run not found" })
  })

  it("resumes a paused run without requiring stepId", async () => {
    vi.mocked(repository.findWorkflowRunById)
      .mockResolvedValueOnce({
        id: "run_1",
        status: "PAUSED",
      } as never)
      .mockResolvedValueOnce({
        id: "run_1",
        status: "RUNNING",
      } as never)

    const resume = vi.fn().mockResolvedValue(undefined)
    const result = await resumeWorkflowRun({
      runId: "run_1",
      data: {},
      deps: { workflowEngine: { resume } as never },
    })

    expect(resume).toHaveBeenCalledWith("run_1", undefined, {})
    expect(result).toEqual({
      id: "run_1",
      status: "RUNNING",
    })
  })

  it("deletes workflows through the repository", async () => {
    vi.mocked(repository.deleteWorkflowById).mockResolvedValue({ id: "wf_1" } as never)

    const result = await deleteDashboardWorkflow("wf_1")

    expect(result).toEqual({ success: true })
  })
})
