// tests/unit/document-ast/download-route-script.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: authMock }))

const { getArtifactMock } = vi.hoisted(() => ({ getArtifactMock: vi.fn() }))
vi.mock("@/features/conversations/sessions/service", () => ({
  getDashboardChatSessionArtifact: getArtifactMock,
}))

import { GET } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route"

const SCRIPT = `
  import { Document, Paragraph, TextRun, Packer } from "docx"
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("hi")] })] }] })
  Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
`

beforeEach(() => {
  authMock.mockReset()
  getArtifactMock.mockReset()
})

describe("download route — text/document with documentFormat=script", () => {
  it("runs the script and returns docx bytes", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" } })
    getArtifactMock.mockResolvedValue({
      id: "a-1",
      title: "doc",
      content: SCRIPT,
      artifactType: "text/document",
      documentFormat: "script",
    })
    const req = new Request("https://example.test/?format=docx")
    const res = await GET(req as Request, {
      params: Promise.resolve({ id: "s-1", artifactId: "a-1" }),
    } as never)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    const body = Buffer.from(await res.arrayBuffer())
    expect(body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  }, 30_000)
})
