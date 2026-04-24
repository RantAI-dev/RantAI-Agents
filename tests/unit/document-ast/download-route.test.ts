// @vitest-environment node
import { describe, it, expect, vi } from "vitest"
import { proposalExample } from "@/lib/document-ast/examples/proposal"

vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { id: "user-1" } }),
}))

vi.mock("@/lib/unsplash/client", () => ({
  searchPhoto: vi.fn(async (q: string) => ({
    urls: { regular: `https://images.unsplash.com/photo-${encodeURIComponent(q)}` },
    user: { name: "Photographer" },
  })),
}))

vi.mock("@/features/conversations/sessions/service", () => ({
  getDashboardChatSessionArtifact: async ({
    artifactId,
  }: {
    artifactId: string
  }) => {
    if (artifactId === "art-1") {
      return {
        id: artifactId,
        title: "Infrastructure Migration Proposal",
        content: JSON.stringify(proposalExample),
        artifactType: "text/document",
        metadata: null,
      }
    }
    if (artifactId === "art-html") {
      return {
        id: artifactId,
        title: "HTML page",
        content: "<h1>Hi</h1>",
        artifactType: "text/html",
        metadata: null,
      }
    }
    return { status: 404, error: "Not found" }
  },
}))

import { GET } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route"

describe("download route — text/document", () => {
  it("returns a .docx buffer", async () => {
    const req = new Request(
      "http://localhost/api/dashboard/chat/sessions/s-1/artifacts/art-1/download?format=docx"
    )
    const res = await GET(req, {
      params: Promise.resolve({ id: "s-1", artifactId: "art-1" }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("wordprocessingml")
    const ab = await res.arrayBuffer()
    expect(ab.byteLength).toBeGreaterThan(2000)
  })

  it("defaults to docx when format query is omitted", async () => {
    const req = new Request(
      "http://localhost/api/dashboard/chat/sessions/s-1/artifacts/art-1/download"
    )
    const res = await GET(req, {
      params: Promise.resolve({ id: "s-1", artifactId: "art-1" }),
    })
    expect(res.status).toBe(200)
  })

  it("sets a sanitized filename from the document title", async () => {
    const req = new Request(
      "http://localhost/api/dashboard/chat/sessions/s-1/artifacts/art-1/download?format=docx"
    )
    const res = await GET(req, {
      params: Promise.resolve({ id: "s-1", artifactId: "art-1" }),
    })
    const cd = res.headers.get("content-disposition") ?? ""
    expect(cd).toMatch(/filename="[a-z0-9._-]+\.docx"/i)
  })

  it("404s for missing artifact", async () => {
    const req = new Request(
      "http://localhost/api/dashboard/chat/sessions/s-1/artifacts/art-ghost/download"
    )
    const res = await GET(req, {
      params: Promise.resolve({ id: "s-1", artifactId: "art-ghost" }),
    })
    expect(res.status).toBe(404)
  })

  it("400s for non-text/document artifact types", async () => {
    const req = new Request(
      "http://localhost/api/dashboard/chat/sessions/s-1/artifacts/art-html/download"
    )
    const res = await GET(req, {
      params: Promise.resolve({ id: "s-1", artifactId: "art-html" }),
    })
    expect(res.status).toBe(400)
  })

  it("400s for unsupported format", async () => {
    const req = new Request(
      "http://localhost/api/dashboard/chat/sessions/s-1/artifacts/art-1/download?format=epub"
    )
    const res = await GET(req, {
      params: Promise.resolve({ id: "s-1", artifactId: "art-1" }),
    })
    expect(res.status).toBe(400)
  })
})
