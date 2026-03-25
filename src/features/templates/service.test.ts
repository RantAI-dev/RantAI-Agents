import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDashboardTemplateForDashboard,
  deleteDashboardTemplateForDashboard,
  listDashboardTemplates,
  updateDashboardTemplateForDashboard,
} from "./service"
import * as repository from "./repository"
import { hasPermission } from "@/lib/digital-employee/rbac"

vi.mock("@/lib/digital-employee/rbac", () => ({
  hasPermission: vi.fn(),
}))

vi.mock("./repository", () => ({
  createDashboardTemplate: vi.fn(),
  deleteDashboardTemplate: vi.fn(),
  findDashboardTemplateById: vi.fn(),
  findDashboardTemplatesByOrganization: vi.fn(),
  updateDashboardTemplate: vi.fn(),
}))

describe("dashboard templates service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasPermission).mockReturnValue(true)
  })

  it("lists templates for an organization", async () => {
    vi.mocked(repository.findDashboardTemplatesByOrganization).mockResolvedValue([
      { id: "template_1" },
    ] as never)

    const result = await listDashboardTemplates("org_1")

    expect(result).toEqual([{ id: "template_1" }])
  })

  it("creates a template when the caller has permission", async () => {
    vi.mocked(repository.createDashboardTemplate).mockResolvedValue({
      id: "template_1",
      name: "Blueprint",
    } as never)

    const result = await createDashboardTemplateForDashboard({
      context: {
        organizationId: "org_1",
        role: "admin",
        userId: "user_1",
      },
      input: {
        name: "Blueprint",
        description: "Default",
        category: "ops",
        templateData: { foo: "bar" },
        isPublic: true,
      } as never,
    })

    expect(result).toEqual({ id: "template_1", name: "Blueprint" })
  })

  it("blocks template updates when the caller is neither creator nor admin", async () => {
    vi.mocked(repository.findDashboardTemplateById).mockResolvedValue({
      createdBy: "user_2",
    } as never)
    vi.mocked(hasPermission).mockReturnValue(false)

    const result = await updateDashboardTemplateForDashboard({
      templateId: "template_1",
      context: {
        organizationId: "org_1",
        role: "member",
        userId: "user_1",
      },
      input: { name: "Updated" } as never,
    })

    expect(result).toEqual({ status: 403, error: "Insufficient permissions" })
  })

  it("deletes a template when the caller owns it", async () => {
    vi.mocked(repository.findDashboardTemplateById).mockResolvedValue({
      createdBy: "user_1",
    } as never)

    const result = await deleteDashboardTemplateForDashboard({
      templateId: "template_1",
      context: {
        organizationId: "org_1",
        role: "member",
        userId: "user_1",
      },
    })

    expect(result).toEqual({ success: true })
    expect(repository.deleteDashboardTemplate).toHaveBeenCalledWith("template_1")
  })
})
