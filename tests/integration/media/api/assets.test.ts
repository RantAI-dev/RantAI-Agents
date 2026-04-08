import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../../helpers/db"
import { createTestUser, createTestOrg, createTestMembership } from "../../../helpers/fixtures"

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

const { sessionMock, presignMock, orgContextMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  presignMock: vi.fn().mockResolvedValue("https://signed.example/k.png"),
  orgContextMock: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: sessionMock }))
vi.mock("@/lib/organization", () => ({
  getOrganizationContextWithFallback: orgContextMock,
}))
vi.mock("@/lib/s3", () => ({
  getS3Client: vi.fn(),
  getBucket: () => "rantai-files",
  getPresignedDownloadUrl: presignMock,
}))

import { GET as listAssets } from "@/app/api/dashboard/media/assets/route"
import { GET as getAsset, PATCH, DELETE } from "@/app/api/dashboard/media/assets/[id]/route"
import { GET as downloadAsset } from "@/app/api/dashboard/media/assets/[id]/download/route"

beforeAll(async () => await testPrisma.$connect())
beforeEach(() => {
  sessionMock.mockReset()
  presignMock.mockClear()
  orgContextMock.mockReset()
})
afterEach(async () => await cleanupDatabase())
afterAll(async () => await testPrisma.$disconnect())

async function setup() {
  const user = await createTestUser()
  const org = await createTestOrg()
  await createTestMembership(user.id, org.id)
  sessionMock.mockResolvedValue({
    user: { id: user.id, email: user.email },
  })
  orgContextMock.mockResolvedValue({ organizationId: org.id })
  return { user, org }
}

async function seedAsset(orgId: string, userId: string, prompt = "p") {
  const job = await testPrisma.mediaJob.create({
    data: {
      organizationId: orgId, userId, modality: "IMAGE",
      modelId: "m", prompt, parameters: {}, referenceAssetIds: [],
      status: "SUCCEEDED", estimatedCostCents: 1, costCents: 1,
    },
  })
  return testPrisma.mediaAsset.create({
    data: {
      jobId: job.id, organizationId: orgId, modality: "IMAGE",
      mimeType: "image/png", s3Key: `media/${orgId}/image/${job.id}.png`,
      sizeBytes: 1024, width: 1024, height: 1024,
    },
  })
}

describe("GET /api/dashboard/media/assets", () => {
  it("lists assets for the org and excludes other orgs", async () => {
    const { user, org } = await setup()
    const otherOrg = await createTestOrg()
    await seedAsset(org.id, user.id, "mine")
    await seedAsset(otherOrg.id, user.id, "theirs")

    const res = await listAssets(new Request("http://localhost/api/dashboard/media/assets"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].mimeType).toBe("image/png")
  })

  it("filters by modality", async () => {
    const { user, org } = await setup()
    await seedAsset(org.id, user.id)
    const res = await listAssets(new Request("http://localhost/api/dashboard/media/assets?modality=AUDIO"))
    const body = await res.json()
    expect(body.items).toHaveLength(0)
  })
})

describe("PATCH /api/dashboard/media/assets/[id]", () => {
  it("toggles favorite", async () => {
    const { user, org } = await setup()
    const asset = await seedAsset(org.id, user.id)

    const res = await PATCH(
      new Request(`http://localhost/api/dashboard/media/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isFavorite: true }),
      }),
      { params: Promise.resolve({ id: asset.id }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isFavorite).toBe(true)
  })

  it("rejects assets from other orgs", async () => {
    const { user } = await setup()
    const otherOrg = await createTestOrg()
    const asset = await seedAsset(otherOrg.id, user.id)
    const res = await PATCH(
      new Request(`http://localhost/api/dashboard/media/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isFavorite: true }),
      }),
      { params: Promise.resolve({ id: asset.id }) }
    )
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/dashboard/media/assets/[id]", () => {
  it("removes the asset", async () => {
    const { user, org } = await setup()
    const asset = await seedAsset(org.id, user.id)
    const res = await DELETE(
      new Request(`http://localhost/api/dashboard/media/assets/${asset.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: asset.id }) }
    )
    expect(res.status).toBe(200)
    const remaining = await testPrisma.mediaAsset.findUnique({ where: { id: asset.id } })
    expect(remaining).toBeNull()
  })
})

describe("GET /api/dashboard/media/assets/[id]/download", () => {
  it("returns a presigned URL", async () => {
    const { user, org } = await setup()
    const asset = await seedAsset(org.id, user.id)
    const res = await downloadAsset(
      new Request(`http://localhost/api/dashboard/media/assets/${asset.id}/download?inline=0`),
      { params: Promise.resolve({ id: asset.id }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe("https://signed.example/k.png")
    expect(presignMock).toHaveBeenCalled()
  })
})
