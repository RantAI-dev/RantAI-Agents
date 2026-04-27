// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: authMock }))

const { getArtifactMock, updateArtifactMock } = vi.hoisted(() => ({
  getArtifactMock: vi.fn(),
  updateArtifactMock: vi.fn(),
}))
vi.mock("@/features/conversations/sessions/service", () => ({
  getDashboardChatSessionArtifact: getArtifactMock,
  updateDashboardChatSessionArtifact: updateArtifactMock,
}))

const { rewriteMock } = vi.hoisted(() => ({ rewriteMock: vi.fn() }))
vi.mock("@/lib/document-script/llm-rewrite", () => ({
  llmRewriteWithRetry: rewriteMock,
}))

import { POST } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/edit-document/route"

beforeEach(() => {
  authMock.mockReset()
  getArtifactMock.mockReset()
  updateArtifactMock.mockReset()
  rewriteMock.mockReset()
})

describe("edit-document route", () => {
  it("calls LLM rewrite, validates result, updates artifact", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" } })
    getArtifactMock.mockResolvedValue({
      id: "a-1",
      title: "doc",
      artifactType: "text/document",
      documentFormat: "script",
      content: "/* old */",
      metadata: null,
    })
    const newScript = `
      import { Document, Paragraph, TextRun, Packer } from "docx"
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("new")] })] }] })
      Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
    `
    rewriteMock.mockResolvedValue({ ok: true, script: newScript, attempts: 1 })
    updateArtifactMock.mockResolvedValue({
      id: "a-1",
      title: "doc",
      content: newScript,
      artifactType: "text/document",
      documentFormat: "script",
      metadata: null,
    })

    const req = new Request("https://x/", {
      method: "POST",
      body: JSON.stringify({ editPrompt: "change title" }),
      headers: { "content-type": "application/json" },
    })
    const res = await POST(
      req as Request,
      { params: Promise.resolve({ id: "s", artifactId: "a-1" }) } as never,
    )
    expect(res.status).toBe(200)
    expect(rewriteMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentScript: "/* old */", editPrompt: "change title" }),
    )
    expect(updateArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: "a-1",
        sessionId: "s",
        userId: "u-1",
        input: expect.objectContaining({ content: newScript }),
      }),
    )
  }, 30_000)
})
