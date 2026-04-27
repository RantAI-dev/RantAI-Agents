// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: authMock }))

const { getCachedMock } = vi.hoisted(() => ({ getCachedMock: vi.fn() }))
vi.mock("@/lib/document-script/cache", () => ({ getCachedPngs: getCachedMock }))

import { GET } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/render-pages/[contentHash]/[pageIndex]/route"

beforeEach(() => { authMock.mockReset(); getCachedMock.mockReset() })

describe("render-pages route", () => {
  it("returns the requested page as image/png", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" } })
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff])
    getCachedMock.mockResolvedValue([png])
    const res = await GET(new Request("https://x/") as Request, {
      params: Promise.resolve({ id: "s", artifactId: "a", contentHash: "h", pageIndex: "0" }),
    } as never)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    const body = Buffer.from(await res.arrayBuffer())
    expect(body).toEqual(png)
  })
})
