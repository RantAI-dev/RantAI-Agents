import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import { createTestUser, createTestOrg } from "../../helpers/fixtures"

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

const { pollMock, uploadMock } = vi.hoisted(() => ({
  pollMock: vi.fn(),
  uploadMock: vi.fn(),
}))

// The service polls via pollVideoJobAlpha, which returns the downloaded video
// bytes embedded in `video` (no separate fetchVideoBytes step anymore).
vi.mock("@/features/media/provider/openrouter", () => ({
  pollVideoJobAlpha: pollMock,
}))

vi.mock("@/features/media/storage", () => ({
  uploadMediaBytes: uploadMock,
  buildMediaS3Key: () => "k",
  buildThumbnailKey: () => "t",
}))

vi.mock("@/lib/socket", () => ({ emitToOrgRoom: vi.fn() }))

import { pollPendingVideoJobs } from "@/features/platform-routes/cron-poll-video-jobs/service"

beforeAll(async () => {
  await testPrisma.$connect()
  process.env.OPENROUTER_API_KEY = "k"
})
beforeEach(() => {
  pollMock.mockReset()
  uploadMock.mockReset()
})
afterEach(async () => await cleanupDatabase())
afterAll(async () => await testPrisma.$disconnect())

describe("pollPendingVideoJobs", () => {
  it("does nothing when there are no running video jobs", async () => {
    const result = await pollPendingVideoJobs()
    expect(result.advanced).toBe(0)
    expect(pollMock).not.toHaveBeenCalled()
  })

  it("leaves still-running jobs as RUNNING", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await testPrisma.mediaJob.create({
      data: {
        organizationId: org.id, userId: user.id, modality: "VIDEO",
        modelId: "google/veo-3.1", prompt: "p", parameters: {},
        referenceAssetIds: [], status: "RUNNING",
        estimatedCostCents: 50, providerJobId: "vid_1",
      },
    })

    pollMock.mockResolvedValueOnce({ status: "running", rawResponse: {} })

    const result = await pollPendingVideoJobs()
    expect(result.advanced).toBe(0)

    const job = await testPrisma.mediaJob.findFirst()
    expect(job?.status).toBe("RUNNING")
  })

  it("finalizes succeeded jobs with the downloaded video as an asset", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const job = await testPrisma.mediaJob.create({
      data: {
        organizationId: org.id, userId: user.id, modality: "VIDEO",
        modelId: "google/veo-3.1", prompt: "p", parameters: {},
        referenceAssetIds: [], status: "RUNNING",
        estimatedCostCents: 50, providerJobId: "vid_2",
      },
    })

    pollMock.mockResolvedValueOnce({
      status: "succeeded",
      video: { bytes: new Uint8Array([10, 20, 30]), mimeType: "video/mp4" },
      actualCostCents: 47,
      rawResponse: {},
    })
    uploadMock.mockResolvedValueOnce({ s3Key: "media/x/video/y.mp4", sizeBytes: 3 })

    const result = await pollPendingVideoJobs()
    expect(result.advanced).toBe(1)

    const finalized = await testPrisma.mediaJob.findUnique({
      where: { id: job.id },
      include: { assets: true },
    })
    expect(finalized?.status).toBe("SUCCEEDED")
    expect(finalized?.costCents).toBe(47)
    expect(finalized?.assets).toHaveLength(1)
    expect(finalized?.assets[0].mimeType).toBe("video/mp4")
  })

  it("marks failed jobs as FAILED with the provider error", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const job = await testPrisma.mediaJob.create({
      data: {
        organizationId: org.id, userId: user.id, modality: "VIDEO",
        modelId: "google/veo-3.1", prompt: "p", parameters: {},
        referenceAssetIds: [], status: "RUNNING",
        estimatedCostCents: 50, providerJobId: "vid_3",
      },
    })

    pollMock.mockResolvedValueOnce({
      status: "failed",
      errorMessage: "content policy violation",
      rawResponse: {},
    })

    await pollPendingVideoJobs()
    const failed = await testPrisma.mediaJob.findUnique({ where: { id: job.id } })
    expect(failed?.status).toBe("FAILED")
    expect(failed?.errorMessage).toContain("content policy")
  })
})
