import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../../helpers/db"
import { createTestUser, createTestOrg, createTestMembership } from "../../../helpers/fixtures"

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

const { sessionMock, generateImageMock, uploadMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  generateImageMock: vi.fn(),
  uploadMock: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ auth: sessionMock }))
vi.mock("@/features/media/provider/openrouter", () => ({ generateImage: generateImageMock }))
vi.mock("@/features/media/storage", () => ({
  uploadMediaBytes: uploadMock,
  buildMediaS3Key: () => "k",
  buildThumbnailKey: () => "thumb",
}))
vi.mock("@/lib/socket", () => ({ emitToOrgRoom: vi.fn() }))

import { POST, GET } from "@/app/api/dashboard/media/jobs/route"

beforeAll(async () => {
  await testPrisma.$connect()
  process.env.OPENROUTER_API_KEY = "test"
})
beforeEach(() => {
  sessionMock.mockReset()
  generateImageMock.mockReset()
  uploadMock.mockReset()
})
afterEach(async () => await cleanupDatabase())
afterAll(async () => await testPrisma.$disconnect())

async function setupSession() {
  const user = await createTestUser()
  const org = await createTestOrg()
  await createTestMembership(user.id, org.id)
  await testPrisma.llmModel.create({
    data: {
      id: "google/nano-banana-2", name: "Nano", provider: "Google", providerSlug: "google",
      contextWindow: 32000, pricingInput: 0, pricingOutput: 30,
      hasVision: true, hasToolCalling: false, hasStreaming: true,
      isFree: false, isTrackedLab: true, isActive: true,
      outputModalities: ["image"], inputModalities: ["text", "image"],
    },
  })
  sessionMock.mockResolvedValue({
    user: { id: user.id, email: user.email },
  })
  return { user, org }
}

describe("POST /api/dashboard/media/jobs", () => {
  it("returns 401 without a session", async () => {
    sessionMock.mockResolvedValue(null)
    const req = new Request("http://localhost/api/dashboard/media/jobs", {
      method: "POST",
      body: JSON.stringify({ modality: "IMAGE", modelId: "x", prompt: "p", parameters: {} }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("creates and returns a SUCCEEDED job for an image", async () => {
    const { org } = await setupSession()
    generateImageMock.mockResolvedValueOnce({
      images: [{ bytes: new Uint8Array([1]), mimeType: "image/png" }],
      actualCostCents: 4,
      rawResponse: {},
    })
    uploadMock.mockResolvedValueOnce({ s3Key: "media/k.png", sizeBytes: 1 })

    const req = new Request("http://localhost/api/dashboard/media/jobs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-organization-id": org.id,
      },
      body: JSON.stringify({
        modality: "IMAGE",
        modelId: "google/nano-banana-2",
        prompt: "an apple",
        parameters: { count: 1 },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe("SUCCEEDED")
    expect(json.assets).toHaveLength(1)
  })

  it("returns 402 when over the per-user limit", async () => {
    const { user, org } = await setupSession()
    await testPrisma.user.update({
      where: { id: user.id },
      data: { mediaLimitCentsPerDay: 1 },
    })
    await testPrisma.mediaJob.create({
      data: {
        organizationId: org.id, userId: user.id, modality: "IMAGE",
        modelId: "google/nano-banana-2", prompt: "x", parameters: {},
        referenceAssetIds: [], status: "SUCCEEDED",
        estimatedCostCents: 1, costCents: 1,
      },
    })

    const req = new Request("http://localhost/api/dashboard/media/jobs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-organization-id": org.id,
      },
      body: JSON.stringify({
        modality: "IMAGE",
        modelId: "google/nano-banana-2",
        prompt: "p",
        parameters: { count: 1 },
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.error).toMatch(/limit/i)
  })

  it("GET returns the user's recent jobs", async () => {
    const { user, org } = await setupSession()
    await testPrisma.mediaJob.createMany({
      data: [
        { organizationId: org.id, userId: user.id, modality: "IMAGE", modelId: "m", prompt: "a", parameters: {}, referenceAssetIds: [], status: "SUCCEEDED", estimatedCostCents: 1 },
        { organizationId: org.id, userId: user.id, modality: "AUDIO", modelId: "m", prompt: "b", parameters: {}, referenceAssetIds: [], status: "SUCCEEDED", estimatedCostCents: 1 },
      ],
    })

    const req = new Request("http://localhost/api/dashboard/media/jobs?modality=IMAGE", {
      headers: { "x-organization-id": org.id },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].prompt).toBe("a")
  })
})
