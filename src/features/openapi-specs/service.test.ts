import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  deleteDashboardOpenApiSpec,
  getDashboardOpenApiSpec,
  importDashboardOpenApiSpec,
  listDashboardOpenApiSpecs,
  resyncDashboardOpenApiSpec,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createOpenApiSpec: vi.fn(),
  createOpenApiTools: vi.fn(),
  deleteOpenApiSpecById: vi.fn(),
  deleteOpenApiToolsBySpecId: vi.fn(),
  findOpenApiSpecById: vi.fn(),
  findOpenApiSpecWithToolsById: vi.fn(),
  findOpenApiSpecsByOrganization: vi.fn(),
  findOpenApiToolsBySpecId: vi.fn(),
  updateOpenApiSpecToolCount: vi.fn(),
}))

describe("dashboard openapi specs service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists specs with ISO timestamps", async () => {
    vi.mocked(repository.findOpenApiSpecsByOrganization).mockResolvedValue([
      {
        id: "spec_1",
        name: "Public API",
        specUrl: null,
        version: "1.0.0",
        serverUrl: "https://api.example.com",
        toolCount: 2,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ] as never)

    const result = await listDashboardOpenApiSpecs({ organizationId: "org_1" })

    expect(result[0]).toMatchObject({
      id: "spec_1",
      createdAt: "2025-01-01T00:00:00.000Z",
    })
  })

  it("returns a preview when no name is supplied", async () => {
    const result = await importDashboardOpenApiSpec({
      organizationId: "org_1",
      createdBy: "user_1",
      input: {
        specContent: JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Preview API", version: "1.2.3" },
          servers: [{ url: "https://api.example.com" }],
          paths: {
            "/pets": {
              get: {
                operationId: "listPets",
                summary: "List pets",
              },
            },
          },
        }),
      },
    })

    expect(result).toEqual(
      expect.objectContaining({
        preview: true,
        title: "Preview API",
      })
    )
  })

  it("creates tools for a spec import", async () => {
    vi.mocked(repository.createOpenApiSpec).mockResolvedValue({
      id: "spec_1",
      name: "Public API",
      specContent: { openapi: "3.0.0" },
      version: "1.0.0",
      serverUrl: "https://api.example.com",
      authConfig: null,
      organizationId: "org_1",
    } as never)

    const result = await importDashboardOpenApiSpec({
      organizationId: "org_1",
      createdBy: "user_1",
      input: {
        name: "Public API",
        specContent: JSON.stringify({
          openapi: "3.0.0",
          info: { title: "Public API", version: "1.0.0" },
          servers: [{ url: "https://api.example.com" }],
          paths: {
            "/pets": {
              get: {
                operationId: "listPets",
                summary: "List pets",
              },
            },
          },
        }),
      },
    })

    expect(result).toEqual({
      spec: { id: "spec_1", name: "Public API" },
      toolsCreated: 1,
    })
  })

  it("loads a spec with its tools", async () => {
    vi.mocked(repository.findOpenApiSpecWithToolsById).mockResolvedValue({
      id: "spec_1",
      name: "Public API",
      specContent: { openapi: "3.0.0" },
      version: "1.0.0",
      serverUrl: "https://api.example.com",
      toolCount: 1,
      specUrl: null,
      organizationId: "org_1",
      authConfig: null,
      createdBy: "user_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
    vi.mocked(repository.findOpenApiToolsBySpecId).mockResolvedValue([
      {
        id: "tool_1",
        name: "listPets",
        displayName: "List Pets",
        description: "List pets",
        enabled: true,
      },
    ] as never)

    const result = await getDashboardOpenApiSpec({ id: "spec_1" })

    expect(result).toMatchObject({
      id: "spec_1",
      tools: [{ id: "tool_1" }],
    })
  })

  it("resyncs tools from a stored spec", async () => {
    vi.mocked(repository.findOpenApiSpecById).mockResolvedValue({
      id: "spec_1",
      specContent: {
        openapi: "3.0.0",
        info: { title: "Public API", version: "1.0.0" },
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/pets": {
            get: {
              operationId: "listPets",
              summary: "List pets",
            },
          },
        },
      },
      version: "1.0.0",
      serverUrl: "https://api.example.com",
      authConfig: null,
      organizationId: "org_1",
    } as never)

    const result = await resyncDashboardOpenApiSpec({
      id: "spec_1",
      createdBy: "user_1",
    })

    expect(result).toEqual({ toolsCreated: 1 })
  })

  it("deletes a spec and its tools", async () => {
    const result = await deleteDashboardOpenApiSpec({ id: "spec_1" })

    expect(result).toEqual({ success: true })
  })
})
