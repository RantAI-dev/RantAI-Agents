// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import OrgAuditPage from "./org-audit-page"

const fetchMock = vi.fn()

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganization: { id: "o1", name: "Acme", slug: "acme" },
    isAdmin: true,
  }),
  useOrgFetch: () => fetchMock,
}))

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
})

describe("OrgAuditPage", () => {
  it("asks for one page with a single limit, which Rust can parse", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [], nextCursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    render(<OrgAuditPage />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost")
    expect(url.pathname).toBe("/api/organizations/o1/audit")
    // `?limit=50?limit=50` reads as limit "50?limit=50", a 400 from parse_limit.
    expect(url.searchParams.getAll("limit")).toEqual(["50"])
  })
})
