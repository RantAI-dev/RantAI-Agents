import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import { createTestUser, createTestOrg } from "../../helpers/fixtures"

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

import {
  createMediaJobRow,
  finalizeMediaJobAsSucceeded,
  failMediaJob,
  listJobsForUser,
  listAssetsForOrg,
  toggleAssetFavorite,
  deleteAssetById,
  findJobById,
} from "@/features/media/repository"

beforeAll(async () => {
  await testPrisma.$connect()
})
afterEach(async () => {
  await cleanupDatabase()
})
afterAll(async () => {
  await testPrisma.$disconnect()
})

describe("media repository", () => {
  it("creates a job in PENDING and finalizes it with assets", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()

    const job = await createMediaJobRow({
      organizationId: org.id,
      userId: user.id,
      modality: "IMAGE",
      modelId: "google/nano-banana-2",
      prompt: "an apple",
      parameters: { count: 1 },
      referenceAssetIds: [],
      estimatedCostCents: 4,
    })

    expect(job.status).toBe("PENDING")
    expect(job.estimatedCostCents).toBe(4)

    const finalized = await finalizeMediaJobAsSucceeded({
      jobId: job.id,
      costCents: 4,
      assets: [
        {
          modality: "IMAGE",
          mimeType: "image/png",
          s3Key: "media/foo/image/abc.png",
          sizeBytes: 1024,
          width: 1024,
          height: 1024,
          metadata: { seed: 42 },
        },
      ],
    })

    expect(finalized.status).toBe("SUCCEEDED")
    expect(finalized.costCents).toBe(4)
    expect(finalized.assets).toHaveLength(1)
    expect(finalized.assets[0].mimeType).toBe("image/png")
  })

  it("marks a job as FAILED with an error message", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const job = await createMediaJobRow({
      organizationId: org.id,
      userId: user.id,
      modality: "IMAGE",
      modelId: "x",
      prompt: "p",
      parameters: {},
      referenceAssetIds: [],
      estimatedCostCents: 1,
    })

    const failed = await failMediaJob(job.id, "provider returned 500")
    expect(failed.status).toBe("FAILED")
    expect(failed.errorMessage).toBe("provider returned 500")
    expect(failed.completedAt).not.toBeNull()
  })

  it("listJobsForUser filters by user and modality", async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()
    const org = await createTestOrg()

    await createMediaJobRow({
      organizationId: org.id, userId: userA.id, modality: "IMAGE",
      modelId: "m", prompt: "a", parameters: {}, referenceAssetIds: [], estimatedCostCents: 1,
    })
    await createMediaJobRow({
      organizationId: org.id, userId: userA.id, modality: "AUDIO",
      modelId: "m", prompt: "b", parameters: {}, referenceAssetIds: [], estimatedCostCents: 1,
    })
    await createMediaJobRow({
      organizationId: org.id, userId: userB.id, modality: "IMAGE",
      modelId: "m", prompt: "c", parameters: {}, referenceAssetIds: [], estimatedCostCents: 1,
    })

    const aJobs = await listJobsForUser({ userId: userA.id, limit: 50 })
    expect(aJobs.items).toHaveLength(2)

    const aImage = await listJobsForUser({ userId: userA.id, modality: "IMAGE", limit: 50 })
    expect(aImage.items).toHaveLength(1)
    expect(aImage.items[0].prompt).toBe("a")
  })

  it("listAssetsForOrg isolates between orgs", async () => {
    const user = await createTestUser()
    const orgA = await createTestOrg()
    const orgB = await createTestOrg()

    const jobA = await createMediaJobRow({
      organizationId: orgA.id, userId: user.id, modality: "IMAGE",
      modelId: "m", prompt: "a", parameters: {}, referenceAssetIds: [], estimatedCostCents: 1,
    })
    await finalizeMediaJobAsSucceeded({
      jobId: jobA.id,
      costCents: 1,
      assets: [{ modality: "IMAGE", mimeType: "image/png", s3Key: "k1", sizeBytes: 1, width: 1, height: 1, metadata: {} }],
    })

    const jobB = await createMediaJobRow({
      organizationId: orgB.id, userId: user.id, modality: "IMAGE",
      modelId: "m", prompt: "b", parameters: {}, referenceAssetIds: [], estimatedCostCents: 1,
    })
    await finalizeMediaJobAsSucceeded({
      jobId: jobB.id,
      costCents: 1,
      assets: [{ modality: "IMAGE", mimeType: "image/png", s3Key: "k2", sizeBytes: 1, width: 1, height: 1, metadata: {} }],
    })

    const aAssets = await listAssetsForOrg({ organizationId: orgA.id, limit: 50, sort: "new" })
    expect(aAssets.items).toHaveLength(1)
    expect(aAssets.items[0].s3Key).toBe("k1")
  })

  it("toggleAssetFavorite flips and persists", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const job = await createMediaJobRow({
      organizationId: org.id, userId: user.id, modality: "IMAGE",
      modelId: "m", prompt: "p", parameters: {}, referenceAssetIds: [], estimatedCostCents: 1,
    })
    const finalized = await finalizeMediaJobAsSucceeded({
      jobId: job.id,
      costCents: 1,
      assets: [{ modality: "IMAGE", mimeType: "image/png", s3Key: "k", sizeBytes: 1, width: 1, height: 1, metadata: {} }],
    })

    const assetId = finalized.assets[0].id
    const favorited = await toggleAssetFavorite(assetId, true)
    expect(favorited.isFavorite).toBe(true)
    const unfavorited = await toggleAssetFavorite(assetId, false)
    expect(unfavorited.isFavorite).toBe(false)
  })

  it("findJobById returns the job with assets", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const job = await createMediaJobRow({
      organizationId: org.id, userId: user.id, modality: "IMAGE",
      modelId: "m", prompt: "p", parameters: {}, referenceAssetIds: [], estimatedCostCents: 1,
    })

    const found = await findJobById(job.id)
    expect(found?.id).toBe(job.id)
    expect(found?.assets).toEqual([])
  })

  it("deleteAssetById removes the asset row", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const job = await createMediaJobRow({
      organizationId: org.id, userId: user.id, modality: "IMAGE",
      modelId: "m", prompt: "p", parameters: {}, referenceAssetIds: [], estimatedCostCents: 1,
    })
    const finalized = await finalizeMediaJobAsSucceeded({
      jobId: job.id,
      costCents: 1,
      assets: [{ modality: "IMAGE", mimeType: "image/png", s3Key: "k", sizeBytes: 1, width: 1, height: 1, metadata: {} }],
    })
    const assetId = finalized.assets[0].id

    await deleteAssetById(assetId)
    const after = await listAssetsForOrg({ organizationId: org.id, limit: 50, sort: "new" })
    expect(after.items).toHaveLength(0)
  })
})
