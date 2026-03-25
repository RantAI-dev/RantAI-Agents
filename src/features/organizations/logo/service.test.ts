import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  deleteOrganizationLogo,
  getOrganizationLogo,
  uploadOrganizationLogo,
} from "./service"
import * as repository from "./repository"
import * as s3 from "@/lib/s3"

vi.mock("./repository", () => ({
  clearOrganizationLogo: vi.fn(),
  findOrganizationLogoFields: vi.fn(),
  updateOrganizationLogoKey: vi.fn(),
}))

vi.mock("@/lib/s3", () => ({
  S3Paths: {
    organizationLogo: vi.fn((orgId: string, filename: string) => `organizations/${orgId}/logo/${filename}`),
  },
  deleteFile: vi.fn(),
  getPresignedDownloadUrl: vi.fn(),
  uploadFile: vi.fn(),
  validateUpload: vi.fn(),
}))

function createMockFile(name = "logo.png", type = "image/png", content = "abc") {
  return new File([content], name, { type })
}

describe("organization-logo service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 when org context does not match", async () => {
    const result = await getOrganizationLogo({
      organizationId: "org_1",
      context: { organizationId: "org_2", role: "owner" },
    })

    expect(result).toEqual({ status: 404, error: "Organization not found" })
  })

  it("returns 403 for upload when actor cannot manage org", async () => {
    const result = await uploadOrganizationLogo({
      organizationId: "org_1",
      actorUserId: "user_1",
      context: { organizationId: "org_1", role: "member" },
      file: createMockFile(),
    })

    expect(result).toEqual({
      status: 403,
      error: "Only admins can update organization logo",
    })
  })

  it("deletes old S3 logo before uploading a new one", async () => {
    vi.mocked(s3.validateUpload).mockReturnValue({ valid: true })
    vi.mocked(repository.findOrganizationLogoFields).mockResolvedValue({
      logoS3Key: "organizations/org_1/logo/old.png",
      logoUrl: null,
    })
    vi.mocked(s3.uploadFile).mockResolvedValue({
      key: "organizations/org_1/logo/new.png",
      url: "https://example.com/new.png",
      size: 3,
    })

    const result = await uploadOrganizationLogo({
      organizationId: "org_1",
      actorUserId: "user_1",
      context: { organizationId: "org_1", role: "owner" },
      file: createMockFile("new.png"),
    })

    expect(s3.deleteFile).toHaveBeenCalledWith("organizations/org_1/logo/old.png")
    expect(repository.updateOrganizationLogoKey).toHaveBeenCalledWith(
      "org_1",
      "organizations/org_1/logo/new.png"
    )
    expect(result).toEqual({
      logoUrl: "https://example.com/new.png",
      logoS3Key: "organizations/org_1/logo/new.png",
    })
  })

  it("blocks delete for non-managers", async () => {
    const result = await deleteOrganizationLogo({
      organizationId: "org_1",
      context: { organizationId: "org_1", role: "viewer" },
    })

    expect(result).toEqual({
      status: 403,
      error: "Only admins can remove organization logo",
    })
  })
})
