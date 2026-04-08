import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import { createTestUser, createTestOrg } from "../../helpers/fixtures"

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

const { generateImageMock, uploadMediaBytesMock, emitMock } = vi.hoisted(() => ({
  generateImageMock: vi.fn(),
  uploadMediaBytesMock: vi.fn(),
  emitMock: vi.fn(),
}))

vi.mock("@/features/media/provider/openrouter", () => ({
  generateImage: generateImageMock,
}))

vi.mock("@/features/media/storage", () => ({
  uploadMediaBytes: uploadMediaBytesMock,
  buildMediaS3Key: (input: { organizationId: string; modality: string; assetId: string; extension: string }) =>
    `media/${input.organizationId}/${input.modality.toLowerCase()}/${input.assetId}.${input.extension}`,
  buildThumbnailKey: () => "thumb-key",
}))

vi.mock("@/lib/socket", () => ({
  emitToOrgRoom: emitMock,
}))

import { createMediaJob } from "@/features/media/service"

beforeAll(async () => {
  await testPrisma.$connect()
  process.env.OPENROUTER_API_KEY = "test-key"
})
beforeEach(() => {
  generateImageMock.mockReset()
  uploadMediaBytesMock.mockReset()
  emitMock.mockReset()
})
afterEach(async () => {
  await cleanupDatabase()
})
afterAll(async () => {
  await testPrisma.$disconnect()
})

async function seedImageModel() {
  await testPrisma.llmModel.create({
    data: {
      id: "google/nano-banana-2",
      name: "Nano Banana 2",
      provider: "Google",
      providerSlug: "google",
      contextWindow: 32000,
      pricingInput: 0,
      pricingOutput: 30,
      hasVision: true,
      hasToolCalling: false,
      hasStreaming: true,
      isFree: false,
      isTrackedLab: true,
      isActive: true,
      outputModalities: ["image"],
      inputModalities: ["text", "image"],
    },
  })
}

describe("createMediaJob — sync image path", () => {
  it("creates job, uploads asset, finalizes, emits event", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await seedImageModel()

    generateImageMock.mockResolvedValueOnce({
      images: [
        { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: "image/png" },
      ],
      actualCostCents: 4,
      rawResponse: { usage: { total_cost: 0.04 } },
    })
    uploadMediaBytesMock.mockResolvedValueOnce({ s3Key: "media/key.png", sizeBytes: 4 })

    const result = await createMediaJob({
      userId: user.id,
      organizationId: org.id,
      modality: "IMAGE",
      modelId: "google/nano-banana-2",
      prompt: "an apple",
      parameters: { count: 1 },
      referenceAssetIds: [],
    })

    expect(result.status).toBe("SUCCEEDED")
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0].mimeType).toBe("image/png")
    expect(result.costCents).toBe(4)

    expect(generateImageMock).toHaveBeenCalledTimes(1)
    expect(uploadMediaBytesMock).toHaveBeenCalledTimes(1)

    expect(emitMock).toHaveBeenCalledWith(
      org.id,
      "media:job:update",
      expect.objectContaining({ jobId: result.id, status: "SUCCEEDED" })
    )

    const persistedJob = await testPrisma.mediaJob.findUnique({
      where: { id: result.id },
      include: { assets: true },
    })
    expect(persistedJob?.status).toBe("SUCCEEDED")
    expect(persistedJob?.assets).toHaveLength(1)
  })

  it("rejects with 402-style error when over limit", async () => {
    const user = await createTestUser({ mediaLimitCentsPerDay: 5 })
    const org = await createTestOrg()
    await seedImageModel()

    // Pre-seed usage to leave only 1 cent of headroom
    await testPrisma.mediaJob.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        modality: "IMAGE",
        modelId: "google/nano-banana-2",
        prompt: "earlier",
        parameters: {},
        referenceAssetIds: [],
        status: "SUCCEEDED",
        estimatedCostCents: 4,
        costCents: 4,
        completedAt: new Date(),
      },
    })

    await expect(
      createMediaJob({
        userId: user.id,
        organizationId: org.id,
        modality: "IMAGE",
        modelId: "google/nano-banana-2",
        prompt: "another",
        parameters: { count: 1 },
        referenceAssetIds: [],
      })
    ).rejects.toThrow(/limit/i)

    expect(generateImageMock).not.toHaveBeenCalled()
  })

  it("marks the job FAILED when the provider throws", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await seedImageModel()

    generateImageMock.mockRejectedValueOnce(new Error("provider 500"))

    await expect(
      createMediaJob({
        userId: user.id,
        organizationId: org.id,
        modality: "IMAGE",
        modelId: "google/nano-banana-2",
        prompt: "p",
        parameters: { count: 1 },
        referenceAssetIds: [],
      })
    ).rejects.toThrow(/provider 500/)

    const jobs = await testPrisma.mediaJob.findMany()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].status).toBe("FAILED")
    expect(jobs[0].errorMessage).toContain("provider 500")
  })

  it("can be invoked without any Next.js request context (Phase 2 invariant)", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await seedImageModel()

    generateImageMock.mockResolvedValueOnce({
      images: [{ bytes: new Uint8Array([1]), mimeType: "image/png" }],
      actualCostCents: 1,
      rawResponse: {},
    })
    uploadMediaBytesMock.mockResolvedValueOnce({ s3Key: "k", sizeBytes: 1 })

    // Simulate being called from a tool: no request, no headers, no NextResponse
    const result = await createMediaJob({
      userId: user.id,
      organizationId: org.id,
      modality: "IMAGE",
      modelId: "google/nano-banana-2",
      prompt: "p",
      parameters: {},
      referenceAssetIds: [],
    })

    expect(result.status).toBe("SUCCEEDED")
  })
})
