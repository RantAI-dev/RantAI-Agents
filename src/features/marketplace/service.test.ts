import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getDashboardMarketplaceItemDetail,
  installDashboardMarketplaceItem,
  listDashboardMarketplaceItems,
  uninstallDashboardMarketplaceItem,
} from "./service"
import * as repository from "./repository"
import * as catalog from "@/lib/marketplace/catalog"
import * as installer from "@/lib/marketplace/installer"

vi.mock("./repository", () => ({
  findDashboardMarketplaceInstallByCatalogItemAndOrganization: vi.fn(),
  findDashboardMarketplaceInstalledSkillsByIds: vi.fn(),
  findDashboardMarketplaceInstallsByOrganization: vi.fn(),
}))

vi.mock("@/lib/marketplace/catalog", () => ({
  getCatalogCategories: vi.fn(),
  getCatalogItemById: vi.fn(),
  getCatalogItems: vi.fn(),
}))

vi.mock("@/lib/marketplace/installer", () => ({
  installMarketplaceItem: vi.fn(),
  uninstallMarketplaceItem: vi.fn(),
}))

vi.mock("@/lib/skills/gateway", () => ({
  getCommunitySkill: vi.fn(),
  getCommunityTool: vi.fn(),
  getToolSchemasForSkill: vi.fn(),
}))

vi.mock("@/lib/skill-sdk", () => ({
  communityToolToJsonSchema: vi.fn((tool: { name: string }) => ({ name: tool.name })),
}))

describe("dashboard marketplace service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists catalog items with install status", async () => {
    vi.mocked(catalog.getCatalogItems).mockResolvedValue([
      {
        id: "item_1",
        name: "builtin-tool-search",
        displayName: "Search",
        description: "Built in",
        category: "tools",
        type: "tool",
        icon: "search",
        tags: [],
      },
    ] as never)
    vi.mocked(catalog.getCatalogCategories).mockResolvedValue(["tools"] as never)

    const result = await listDashboardMarketplaceItems({
      organizationId: null,
      type: "tool",
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        installed: true,
        isBuiltIn: true,
      })
    )
  })

  it("returns 404 when a marketplace item is missing", async () => {
    vi.mocked(catalog.getCatalogItemById).mockResolvedValue(null)

    const result = await getDashboardMarketplaceItemDetail({
      organizationId: null,
      itemId: "missing",
    })

    expect(result).toEqual({ status: 404, error: "Not found" })
  })

  it("delegates marketplace installs to the installer helper", async () => {
    vi.mocked(installer.installMarketplaceItem).mockResolvedValue({
      success: true,
      installedId: "tool_1",
    } as never)

    const result = await installDashboardMarketplaceItem({
      organizationId: "org_1",
      userId: "user_1",
      input: {
        catalogItemId: "catalog_1",
        authConfig: { type: "bearer", token: "secret" },
      } as never,
    })

    expect(result).toEqual({ success: true, installedId: "tool_1" })
    expect(installer.installMarketplaceItem).toHaveBeenCalledWith(
      "catalog_1",
      "org_1",
      "user_1",
      { type: "bearer", token: "secret" },
      undefined
    )
  })

  it("delegates marketplace uninstalls to the installer helper", async () => {
    vi.mocked(installer.uninstallMarketplaceItem).mockResolvedValue({
      success: true,
    } as never)

    const result = await uninstallDashboardMarketplaceItem({
      organizationId: "org_1",
      input: { catalogItemId: "catalog_1" },
    })

    expect(result).toEqual({ success: true })
    expect(installer.uninstallMarketplaceItem).toHaveBeenCalledWith(
      "catalog_1",
      "org_1"
    )
  })
})
