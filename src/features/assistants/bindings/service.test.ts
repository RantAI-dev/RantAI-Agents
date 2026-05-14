import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  listAssistantTools,
  setAssistantTools,
  setAssistantSkills,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  findAssistantById: vi.fn(),
  findHiddenAssistantToolIds: vi.fn(),
  findAssistantMcpServerBindings: vi.fn(),
  findAssistantSkillBindings: vi.fn(),
  findAssistantToolBindings: vi.fn(),
  findAssistantWorkflowBindings: vi.fn(),
  replaceAssistantMcpServerBindings: vi.fn(),
  replaceAssistantSkillBindings: vi.fn(),
  replaceAssistantToolBindings: vi.fn(),
  replaceAssistantWorkflowBindings: vi.fn(),
}))

const ORG_A = { organizationId: "org_a" }
const ORG_B = { organizationId: "org_b" }

describe("assistants-bindings service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 for list when assistant is missing", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue(null)

    const result = await listAssistantTools("assistant_1", ORG_A)

    expect(result).toEqual({ status: 404, error: "Assistant not found" })
  })

  it("returns 404 when assistant belongs to a different org", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue({
      id: "assistant_1",
      organizationId: "org_b",
      isBuiltIn: false,
    } as never)

    const result = await listAssistantTools("assistant_1", ORG_A)
    expect(result).toEqual({ status: 404, error: "Assistant not found" })
    expect(repository.findAssistantToolBindings).not.toHaveBeenCalled()
  })

  it("allows access to built-in assistants from any org", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue({
      id: "assistant_1",
      organizationId: null,
      isBuiltIn: true,
    } as never)
    vi.mocked(repository.findAssistantToolBindings).mockResolvedValue([])

    const result = await listAssistantTools("assistant_1", ORG_B)
    expect(result).toEqual([])
  })

  it("filters empty skill ids before replacing bindings", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue({
      id: "assistant_1",
      organizationId: "org_a",
      isBuiltIn: false,
    } as never)
    vi.mocked(repository.findAssistantSkillBindings).mockResolvedValue([])

    await setAssistantSkills("assistant_1", ["", "skill_1", "   "], ORG_A)

    expect(repository.replaceAssistantSkillBindings).toHaveBeenCalledWith(
      "assistant_1",
      ["skill_1", "   "]
    )
  })

  it("preserves hidden tool bindings when replacing assistant tools", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue({
      id: "assistant_1",
      organizationId: "org_a",
      isBuiltIn: false,
    } as never)
    vi.mocked(repository.findHiddenAssistantToolIds).mockResolvedValue(["hidden_tool"])
    vi.mocked(repository.findAssistantToolBindings).mockResolvedValue([])

    await setAssistantTools("assistant_1", ["visible_tool"], ORG_A)

    expect(repository.replaceAssistantToolBindings).toHaveBeenCalledWith(
      "assistant_1",
      ["visible_tool", "hidden_tool"]
    )
  })

  it("rejects cross-org writes (PUT from different org)", async () => {
    vi.mocked(repository.findAssistantById).mockResolvedValue({
      id: "assistant_1",
      organizationId: "org_b",
      isBuiltIn: false,
    } as never)

    const result = await setAssistantTools("assistant_1", ["visible_tool"], ORG_A)
    expect(result).toEqual({ status: 404, error: "Assistant not found" })
    expect(repository.replaceAssistantToolBindings).not.toHaveBeenCalled()
  })
})
