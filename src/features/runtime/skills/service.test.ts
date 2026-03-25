import { beforeEach, describe, expect, it, vi } from "vitest"
import { installRuntimeSkill, searchRuntimeSkills } from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createRuntimeAssistantSkillBinding: vi.fn(),
  enableRuntimeAssistantSkill: vi.fn(),
  findRuntimeAssistantSkillBinding: vi.fn(),
  findRuntimeEmployeeSkillContext: vi.fn(),
  findRuntimeEmployeeSkillInstallContext: vi.fn(),
  findRuntimePlatformSkillById: vi.fn(),
  findRuntimePlatformSkills: vi.fn(),
}))

vi.mock("@/lib/digital-employee/clawhub", () => ({
  installClawHubSkill: vi.fn(),
  listClawHubSkills: vi.fn(),
  searchClawHub: vi.fn(),
}))

describe("runtime-skills service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("searches platform and clawhub skills", async () => {
    vi.mocked(repository.findRuntimeEmployeeSkillContext).mockResolvedValue({
      organizationId: "org_1",
      assistantId: "assistant_1",
      assistant: {
        skills: [{ skillId: "skill_1", enabled: true }],
      },
    } as never)
    vi.mocked(repository.findRuntimePlatformSkills).mockResolvedValue([
      {
        id: "skill_1",
        name: "skill_1",
        displayName: "Skill One",
        description: "Desc",
        content: "Prompt",
        version: "1.0.0",
      },
    ] as never)

    const result = await searchRuntimeSkills({
      employeeId: "employee_1",
      query: { q: "skill", source: "" },
    })

    expect(result).toMatchObject({
      results: [
        expect.objectContaining({
          id: "skill_1",
          name: "Skill One",
          source: "platform",
          enabled: true,
        }),
      ],
    })
  })

  it("installs a platform skill", async () => {
    vi.mocked(repository.findRuntimeEmployeeSkillInstallContext).mockResolvedValue({
      assistantId: "assistant_1",
      organizationId: "org_1",
    } as never)
    vi.mocked(repository.findRuntimePlatformSkillById).mockResolvedValue({
      id: "skill_1",
      name: "skill_1",
      displayName: "Skill One",
      description: "Desc",
      content: "Prompt",
    } as never)
    vi.mocked(repository.findRuntimeAssistantSkillBinding).mockResolvedValue(null)

    const result = await installRuntimeSkill({
      employeeId: "employee_1",
      input: { source: "platform", skillId: "skill_1" },
    })

    expect(result).toMatchObject({
      success: true,
      skill: {
        id: "skill_1",
        name: "Skill One",
      },
    })
  })
})
