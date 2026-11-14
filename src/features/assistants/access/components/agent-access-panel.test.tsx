// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { AgentAccessPanel } from "./agent-access-panel"

const fetchMock = vi.fn()

const state = vi.hoisted(() => ({ isAdmin: true }))

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganization: { id: "o1", name: "Acme", slug: "acme" },
    isAdmin: state.isAdmin,
    isOwner: false,
    canEdit: true,
  }),
  useOrgFetch: () => fetchMock,
}))

const units = {
  data: [
    {
      id: "support",
      parentId: null,
      kind: "department",
      name: "Support",
      slug: "support",
      externalId: null,
      createdAt: "2026-11-14T00:00:00.000Z",
      updatedAt: "2026-11-14T00:00:00.000Z",
      children: [],
    },
  ],
  nextCursor: null,
}

const members = [
  {
    id: "m1",
    userId: "u1",
    email: "ana@acme.com",
    name: "Ana",
    role: "member",
    invitedBy: null,
    invitedAt: "2026-11-14T00:00:00.000Z",
    acceptedAt: "2026-11-14T00:00:00.000Z",
    isPending: false,
    units: [],
  },
]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  state.isAdmin = true
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return Promise.resolve(json({ data: (JSON.parse(String(init.body)) as unknown[]) .map((row, index) => ({ id: `g${index}`, ...(row as object), grantedBy: "u0", createdAt: "2026-11-14T00:00:00.000Z" })), nextCursor: null }))
    }
    if (init?.method === "DELETE") return Promise.resolve(json({ success: true }))
    if (String(url).endsWith("/units")) return Promise.resolve(json(units))
    if (String(url).endsWith("/members")) return Promise.resolve(json(members))
    return Promise.resolve(json({ data: [], nextCursor: null }))
  })
})

afterEach(() => cleanup())

describe("AgentAccessPanel", () => {
  it("says a new agent is shared with nobody but the admins", async () => {
    render(<AgentAccessPanel assistantId="a1" />)
    await screen.findByText(/nobody but your admins/i)
  })

  it("builds the PUT body from the draft: a bare array of subjects with their level", async () => {
    render(<AgentAccessPanel assistantId="a1" />)
    await screen.findByText(/nobody but your admins/i)

    fireEvent.click(screen.getByRole("button", { name: /everyone at acme/i }))

    // The row starts at "can use"; the caller raises it to "can manage".
    const manage = await screen.findByRole("button", { name: "Can manage" })
    fireEvent.click(manage)
    expect(manage.getAttribute("aria-pressed")).toBe("true")

    fireEvent.click(screen.getByRole("button", { name: /save access/i }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "PUT")
      expect(put).toBeDefined()
      expect(put?.[0]).toBe("/api/assistants/a1/access")
      expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual([
        { subjectType: "org", subjectId: "o1", level: "manage" },
      ])
    })
  })

  it("tells a delegated manager that grants are the admins' decision", async () => {
    state.isAdmin = false
    render(<AgentAccessPanel assistantId="a1" />)

    expect(screen.getByText(/only your organisation's owners and admins/i)).not.toBeNull()
    expect(screen.queryByRole("button", { name: /save access/i })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("revokes a saved grant by its id", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.resolve(json({ success: true }))
      if (String(url).endsWith("/units")) return Promise.resolve(json(units))
      if (String(url).endsWith("/members")) return Promise.resolve(json(members))
      if (String(url).endsWith("/access")) {
        return Promise.resolve(
          json({
            data: [
              {
                id: "g1",
                subjectType: "user",
                subjectId: "u1",
                level: "use",
                grantedBy: "u0",
                createdAt: "2026-11-14T00:00:00.000Z",
              },
            ],
            nextCursor: null,
          }),
        )
      }
      return Promise.resolve(json({ data: [], nextCursor: null }))
    })

    render(<AgentAccessPanel assistantId="a1" />)
    const remove = await screen.findByRole("button", { name: /remove access for ana/i })
    fireEvent.click(remove)

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "DELETE")
      expect(call?.[0]).toBe("/api/assistants/a1/access/g1")
    })
  })
})
