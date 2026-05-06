import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the service layer + S3 helper before importing the route.
// Use vi.hoisted so the mock fns exist at the top of the hoisted vi.mock factories.
const { mockGetArtifact, mockDownloadFile } = vi.hoisted(() => ({
  mockGetArtifact: vi.fn(),
  mockDownloadFile: vi.fn(),
}))

vi.mock("@/features/conversations/sessions/service", () => ({
  getDashboardChatSessionArtifact: mockGetArtifact,
}))
vi.mock("@/lib/s3", () => ({
  downloadFile: mockDownloadFile,
}))
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}))
vi.mock("@/features/shared/http-service-error", () => ({
  isHttpServiceError: (x: unknown) =>
    !!x && typeof x === "object" && "status" in (x as Record<string, unknown>) && "error" in (x as Record<string, unknown>),
}))

// Import AFTER mocks.
import { GET } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/versions/[versionNum]/route"

const baseParams = { id: "session-1", artifactId: "art-1", versionNum: "1" }

function makeReq() {
  return new Request("http://localhost/api/dashboard/chat/sessions/session-1/artifacts/art-1/versions/1")
}

describe("GET /artifacts/[id]/versions/[N]", () => {
  beforeEach(() => {
    mockGetArtifact.mockReset()
    mockDownloadFile.mockReset()
  })

  it("returns 404 when the artifact lookup returns a service error", async () => {
    mockGetArtifact.mockResolvedValue({ status: 404, error: "Session not found" })
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(404)
  })

  it("returns 404 when the version index is out of range", async () => {
    mockGetArtifact.mockResolvedValue({
      id: "art-1",
      metadata: { versions: [] },
    })
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(404)
  })

  it("returns 410 when the version was archive-failed", async () => {
    mockGetArtifact.mockResolvedValue({
      id: "art-1",
      metadata: {
        versions: [
          { archiveFailed: true, title: "x", timestamp: 1, contentLength: 10 },
        ],
      },
    })
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body).toMatchObject({ error: "archived" })
  })

  it("returns 200 with text/plain bytes from S3 when the version has an s3Key", async () => {
    mockGetArtifact.mockResolvedValue({
      id: "art-1",
      metadata: {
        versions: [
          { s3Key: "artifacts/org/sess/art-1.v1", title: "x", timestamp: 1, contentLength: 10 },
        ],
      },
    })
    mockDownloadFile.mockResolvedValue(Buffer.from("export const x = 1\n", "utf-8"))
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/)
    expect(res.headers.get("Cache-Control")).toMatch(/private/)
    const text = await res.text()
    expect(text).toBe("export const x = 1\n")
  })

  it("returns 200 with inline content when the version has fallback content", async () => {
    mockGetArtifact.mockResolvedValue({
      id: "art-1",
      metadata: {
        versions: [
          { content: "inline body", title: "x", timestamp: 1, contentLength: 11 },
        ],
      },
    })
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("inline body")
  })

  it("returns 502 when downloadFile throws", async () => {
    mockGetArtifact.mockResolvedValue({
      id: "art-1",
      metadata: {
        versions: [
          { s3Key: "artifacts/org/sess/art-1.v1", title: "x", timestamp: 1, contentLength: 10 },
        ],
      },
    })
    mockDownloadFile.mockRejectedValue(new Error("network down"))
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(502)
  })

  it("returns 400 when versionNum is not a positive integer", async () => {
    const res = await GET(makeReq(), {
      params: Promise.resolve({ ...baseParams, versionNum: "abc" }),
    })
    expect(res.status).toBe(400)
  })
})
