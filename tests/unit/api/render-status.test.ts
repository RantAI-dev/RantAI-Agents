// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: authMock }))

const { getArtifactMock } = vi.hoisted(() => ({ getArtifactMock: vi.fn() }))
vi.mock("@/features/conversations/sessions/service", () => ({
  getDashboardChatSessionArtifact: getArtifactMock,
}))

const { renderMock } = vi.hoisted(() => ({ renderMock: vi.fn() }))
vi.mock("@/lib/rendering/server/docx-preview-pipeline", () => ({
  renderArtifactPreview: renderMock,
}))

import { GET } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/render-status/route"

beforeEach(() => {
  authMock.mockReset()
  getArtifactMock.mockReset()
  renderMock.mockReset()
})

describe("render-status route", () => {
  it("triggers render and returns hash + pageCount on success", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" } })
    getArtifactMock.mockResolvedValue({
      id: "a-1", artifactType: "text/document",
      content: "/* script */",
    })
    renderMock.mockResolvedValue({ hash: "abc123", pages: [Buffer.from([0x89,0x50])], cached: false })
    const req = new Request("https://example.test/")
    const res = await GET(req as Request, { params: Promise.resolve({ id: "s-1", artifactId: "a-1" }) } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ hash: "abc123", pageCount: 1, cached: false })
  })
})
