import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDashboardSkillRecord,
  deleteDashboardSkillRecord,
  getDashboardSkillById,
  getDashboardSkillReadiness,
  importDashboardSkillFromClawHub,
  listDashboardSkills,
  updateDashboardSkillRecord,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createDashboardSkill: vi.fn(),
  deleteDashboardSkill: vi.fn(),
  findDashboardSkillById: vi.fn(),
  findDashboardSkillByNameAndOrganization: vi.fn(),
  findDashboardSkillsByOrganization: vi.fn(),
  resolveDashboardSkillReadiness: vi.fn(),
  updateDashboardSkill: vi.fn(),
}))

vi.mock("@/lib/skills/parser", () => ({
  parseSkillMarkdown: vi.fn(() => ({
    name: "skill_1",
    displayName: "Skill One",
    description: "Desc",
    content: "Prompt",
    category: "general",
    tags: [],
    version: "1.0.0",
    metadata: {},
  })),
}))

describe("dashboard-skills service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists skills", async () => {
    vi.mocked(repository.findDashboardSkillsByOrganization).mockResolvedValue([
      {
        id: "skill_1",
        name: "skill_1",
        displayName: "Skill One",
        description: "Desc",
        content: "Prompt",
        source: "custom",
        sourceUrl: null,
        version: "1.0.0",
        category: "general",
        tags: [],
        icon: null,
        metadata: { toolIds: ["tool_1"] },
        enabled: true,
        _count: { assistantSkills: 2 },
        installedSkill: null,
        createdAt: new Date(),
      },
    ] as never)

    const result = await listDashboardSkills({
      organizationId: null,
      userId: "user_1",
    })

    expect(result[0]?.assistantCount).toBe(2)
  })

  it("returns 404 when skill is missing", async () => {
    vi.mocked(repository.findDashboardSkillById).mockResolvedValue(null)

    await expect(getDashboardSkillById("skill_1")).resolves.toEqual({
      status: 404,
      error: "Skill not found",
    })
  })

  it("creates skills", async () => {
    vi.mocked(repository.createDashboardSkill).mockResolvedValue({
      id: "skill_1",
      name: "skill_1",
      displayName: "Skill One",
      description: "Desc",
      content: "Prompt",
      source: "custom",
      sourceUrl: null,
      version: "1.0.0",
      category: "general",
      tags: [],
      icon: null,
      metadata: {},
      enabled: true,
      organizationId: null,
      createdBy: "user_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await createDashboardSkillRecord({
      context: { organizationId: null, userId: "user_1" },
      input: {
        name: "skill_1",
        displayName: "Skill One",
        content: "Prompt",
      },
    })

    expect(result).toMatchObject({ id: "skill_1" })
  })

  it("imports skills from raw markdown", async () => {
    vi.mocked(repository.findDashboardSkillByNameAndOrganization).mockResolvedValue(null)
    vi.mocked(repository.createDashboardSkill).mockResolvedValue({
      id: "skill_1",
      name: "skill_1",
      displayName: "Skill One",
      description: "Desc",
      content: "Prompt",
      source: "marketplace",
      sourceUrl: null,
      version: "1.0.0",
      category: "general",
      tags: [],
      icon: null,
      metadata: {},
      enabled: true,
      organizationId: null,
      createdBy: "user_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await importDashboardSkillFromClawHub({
      context: { organizationId: null, userId: "user_1" },
      input: { rawContent: "---\n---\n# Prompt" },
    })

    expect(result).toMatchObject({ id: "skill_1" })
  })

  it("updates and deletes skills", async () => {
    vi.mocked(repository.updateDashboardSkill).mockResolvedValue({
      id: "skill_1",
      name: "skill_1",
      displayName: "Skill One",
      description: "Desc",
      content: "Prompt",
      source: "custom",
      sourceUrl: null,
      version: "1.0.0",
      category: "general",
      tags: [],
      icon: null,
      metadata: {},
      enabled: true,
      organizationId: null,
      createdBy: "user_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    await expect(
      updateDashboardSkillRecord({
        id: "skill_1",
        input: { displayName: "Updated" },
      })
    ).resolves.toMatchObject({ id: "skill_1" })

    vi.mocked(repository.deleteDashboardSkill).mockResolvedValue({} as never)
    await expect(deleteDashboardSkillRecord("skill_1")).resolves.toEqual({
      success: true,
    })
  })

  it("resolves readiness", async () => {
    vi.mocked(repository.resolveDashboardSkillReadiness).mockResolvedValue({
      ready: true,
      missingTools: [],
    } as never)

    const result = await getDashboardSkillReadiness({
      skillId: "skill_1",
      assistantId: "assistant_1",
      organizationId: "org_1",
    })

    expect(result).toEqual({ ready: true, missingTools: [] })
  })
})
