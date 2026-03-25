import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  connectDigitalEmployeeIntegration,
  createDigitalEmployeeTrigger,
  installDigitalEmployeeSkill,
  listDigitalEmployeeMessages,
  searchDigitalEmployeeSkills,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createDigitalEmployeeWebhook: vi.fn(),
  deleteDigitalEmployeeIntegration: vi.fn(),
  deleteDigitalEmployeeInstalledSkill: vi.fn(),
  deleteDigitalEmployeeWebhook: vi.fn(),
  findDigitalEmployeeContext: vi.fn(),
  findDigitalEmployeeIntegrationById: vi.fn(),
  findDigitalEmployeeIntegrations: vi.fn(),
  findDigitalEmployeeMessages: vi.fn(),
  findDigitalEmployeeOAuthContext: vi.fn(),
  findDigitalEmployeeSkillsContext: vi.fn(),
  findDigitalEmployeeTriggersContext: vi.fn(),
  findDigitalEmployeeWebhooks: vi.fn(),
  updateDigitalEmployeeDeploymentConfig: vi.fn(),
  updateDigitalEmployeeIntegration: vi.fn(),
  updateDigitalEmployeeInstalledSkill: vi.fn(),
  updateDigitalEmployeeWebhook: vi.fn(),
  upsertDigitalEmployeeIntegration: vi.fn(),
}))

vi.mock("@/lib/digital-employee/integrations", () => ({
  INTEGRATION_REGISTRY: [{ id: "slack", name: "Slack" }],
  getIntegrationDefinition: vi.fn(),
}))

vi.mock("@/lib/digital-employee/clawhub", () => ({
  installClawHubSkill: vi.fn(),
  listClawHubSkills: vi.fn(),
  searchClawHub: vi.fn(),
}))

vi.mock("@/lib/digital-employee/audit", () => ({
  AUDIT_ACTIONS: { INTEGRATION_CONNECT: "INTEGRATION_CONNECT" },
  classifyActionRisk: vi.fn(() => "low"),
  logAudit: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/workflow/credentials", () => ({
  decryptCredential: vi.fn(),
  encryptCredential: vi.fn((value) => JSON.stringify(value)),
}))

vi.mock("@/lib/digital-employee/config-push", () => ({
  pushIntegration: vi.fn(async () => ({ success: true })),
  removeIntegration: vi.fn(async () => ({ success: true })),
}))

describe("dashboard digital employee interactions service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists employee messages", async () => {
    vi.mocked(repository.findDigitalEmployeeContext).mockResolvedValue({
      id: "emp_1",
      organizationId: "org_1",
      groupId: null,
      assistantId: null,
    } as never)
    vi.mocked(repository.findDigitalEmployeeMessages).mockResolvedValue([
      { id: "msg_1", content: "hello" },
    ] as never)

    const result = await listDigitalEmployeeMessages({
      id: "emp_1",
      organizationId: "org_1",
      query: { limit: 10, before: undefined },
    })

    expect(result).toEqual({ messages: [{ id: "msg_1", content: "hello" }] })
  })

  it("connects an integration", async () => {
    vi.mocked(repository.findDigitalEmployeeContext).mockResolvedValue({
      id: "emp_1",
      organizationId: "org_1",
      groupId: null,
      assistantId: null,
    } as never)
    vi.mocked(repository.upsertDigitalEmployeeIntegration).mockResolvedValue({
      id: "int_1",
      integrationId: "slack",
    } as never)
    const integrations = await import("@/lib/digital-employee/integrations")
    vi.mocked(integrations.getIntegrationDefinition).mockReturnValue({
      id: "slack",
      testEndpoint: "https://example.com",
    } as never)

    const result = await connectDigitalEmployeeIntegration({
      id: "emp_1",
      organizationId: "org_1",
      userId: "user_1",
      input: { integrationId: "slack", credentials: { token: "abc" }, metadata: { x: 1 } },
    })

    expect(result).toEqual({ id: "int_1", integrationId: "slack" })
    expect(repository.upsertDigitalEmployeeIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "emp_1",
        integrationId: "slack",
        status: "connected",
      })
    )
  })

  it("installs a ClawHub skill", async () => {
    vi.mocked(repository.findDigitalEmployeeContext).mockResolvedValue({
      id: "emp_1",
      organizationId: "org_1",
      groupId: null,
      assistantId: null,
    } as never)
    const clawhub = await import("@/lib/digital-employee/clawhub")
    vi.mocked(clawhub.installClawHubSkill).mockResolvedValue({
      id: "skill_1",
      slug: "my-skill",
    } as never)

    const result = await installDigitalEmployeeSkill({
      id: "emp_1",
      organizationId: "org_1",
      userId: "user_1",
      input: { slug: "my-skill", source: "clawhub" },
    })

    expect(result).toEqual({ id: "skill_1", slug: "my-skill" })
  })

  it("creates a cron trigger", async () => {
    vi.mocked(repository.findDigitalEmployeeTriggersContext).mockResolvedValue({
      id: "emp_1",
      deploymentConfig: { schedules: [] },
    } as never)
    vi.mocked(repository.updateDigitalEmployeeDeploymentConfig).mockResolvedValue({
      id: "emp_1",
    } as never)

    const result = await createDigitalEmployeeTrigger({
      id: "emp_1",
      organizationId: "org_1",
      input: {
        type: "cron",
        name: "Daily",
        config: { cron: "0 * * * *", workflowId: "wf_1" },
      },
    })

    expect(result).toMatchObject({ type: "cron", name: "Daily" })
    expect(repository.updateDigitalEmployeeDeploymentConfig).toHaveBeenCalled()
  })

  it("searches ClawHub skills when query is empty", async () => {
    vi.mocked(repository.findDigitalEmployeeContext).mockResolvedValue({
      id: "emp_1",
      organizationId: "org_1",
      groupId: null,
      assistantId: null,
    } as never)
    const clawhub = await import("@/lib/digital-employee/clawhub")
    vi.mocked(clawhub.listClawHubSkills).mockResolvedValue([{ slug: "skill-1" }] as never)

    const result = await searchDigitalEmployeeSkills({
      id: "emp_1",
      organizationId: "org_1",
      query: { q: "" },
    })

    expect(result).toEqual({ results: [{ slug: "skill-1" }] })
  })
})
