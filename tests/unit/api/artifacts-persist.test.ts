// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

// All mocks must come before importing the module under test.

vi.mock("@/lib/s3", () => ({
  uploadFile: vi.fn(async () => undefined),
  S3Paths: { artifact: () => "mock-key" },
  getArtifactExtension: () => "html",
}))

vi.mock("@/lib/rag", () => ({
  indexArtifactContent: vi.fn(async () => undefined),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dashboardSession: {
      findFirst: vi.fn(),
    },
    document: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

const mockAuth = vi.fn()
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

import { POST } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/persist/route"

const VALID_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>T</title></head><body><h1>Hi</h1></body></html>`

function makeRequest(body: unknown): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function getPrismaMock() {
  return (await import("@/lib/prisma")) as unknown as {
    prisma: {
      dashboardSession: { findFirst: ReturnType<typeof vi.fn> }
      document: {
        findUnique: ReturnType<typeof vi.fn>
        create: ReturnType<typeof vi.fn>
      }
    }
  }
}

describe("POST /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/persist", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(
      makeRequest({ title: "T", type: "text/html", content: VALID_HTML }),
      { params: Promise.resolve({ id: "any", artifactId: "any" }) },
    )
    expect(res.status).toBe(401)
  })

  it("returns 404 when the session does not belong to the user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const { prisma } = await getPrismaMock()
    prisma.dashboardSession.findFirst.mockResolvedValue(null)
    const res = await POST(
      makeRequest({ title: "T", type: "text/html", content: VALID_HTML }),
      { params: Promise.resolve({ id: "not-mine", artifactId: "x" }) },
    )
    expect(res.status).toBe(404)
  })

  it("returns 400 on invalid body shape (empty title)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const { prisma } = await getPrismaMock()
    prisma.dashboardSession.findFirst.mockResolvedValue({
      id: "s1",
      organizationId: null,
    })
    const res = await POST(
      makeRequest({ title: "", type: "text/html", content: VALID_HTML }),
      { params: Promise.resolve({ id: "s1", artifactId: "x" }) },
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 on invalid type", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const { prisma } = await getPrismaMock()
    prisma.dashboardSession.findFirst.mockResolvedValue({
      id: "s1",
      organizationId: null,
    })
    const res = await POST(
      makeRequest({ title: "T", type: "application/totally-bogus", content: VALID_HTML }),
      { params: Promise.resolve({ id: "s1", artifactId: "x" }) },
    )
    expect(res.status).toBe(400)
  })

  it("returns ok:true on the happy path and calls document.create", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const { prisma } = await getPrismaMock()
    prisma.dashboardSession.findFirst.mockResolvedValue({
      id: "s1",
      organizationId: null,
    })
    prisma.document.findUnique.mockResolvedValue(null)
    prisma.document.create.mockResolvedValue({ id: "art-1" })
    const res = await POST(
      makeRequest({ title: "T", type: "text/html", content: VALID_HTML }),
      { params: Promise.resolve({ id: "s1", artifactId: "art-1" }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(prisma.document.create).toHaveBeenCalledTimes(1)
  })

  it("returns ok:true with alreadyPersisted:true when the Document row already exists", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const { prisma } = await getPrismaMock()
    prisma.dashboardSession.findFirst.mockResolvedValue({
      id: "s1",
      organizationId: null,
    })
    prisma.document.findUnique.mockResolvedValue({ id: "art-2" })
    const res = await POST(
      makeRequest({ title: "T", type: "text/html", content: VALID_HTML }),
      { params: Promise.resolve({ id: "s1", artifactId: "art-2" }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { alreadyPersisted?: boolean }
    expect(body.alreadyPersisted).toBe(true)
    // Idempotent: must not attempt a second create.
    expect(prisma.document.create).not.toHaveBeenCalled()
  })

  it("returns 502 when S3 upload still throws", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const { prisma } = await getPrismaMock()
    prisma.dashboardSession.findFirst.mockResolvedValue({
      id: "s1",
      organizationId: null,
    })
    prisma.document.findUnique.mockResolvedValue(null)
    const s3Mod = (await import("@/lib/s3")) as unknown as {
      uploadFile: ReturnType<typeof vi.fn>
    }
    s3Mod.uploadFile.mockRejectedValueOnce(new Error("InternalError"))
    const res = await POST(
      makeRequest({ title: "T", type: "text/html", content: VALID_HTML }),
      { params: Promise.resolve({ id: "s1", artifactId: "art-3" }) },
    )
    expect(res.status).toBe(502)
    const body = (await res.json()) as { ok: boolean; error?: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBeTruthy()
  })
})
