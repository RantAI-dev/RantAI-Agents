// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ShareChatDialog } from "./share-chat-dialog"

const fetchMock = vi.fn()

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganization: { id: "o1", name: "Acme", slug: "acme" },
    isAdmin: true,
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

const people = [
  {
    id: "m2",
    userId: "u2",
    email: "ben@acme.com",
    name: "Ben",
    role: "member",
    invitedBy: null,
    invitedAt: "2026-11-14T00:00:00.000Z",
    acceptedAt: "2026-11-14T00:00:00.000Z",
    isPending: false,
    units: [],
  },
]

const shares = {
  data: [
    {
      id: "s-unit",
      subjectType: "unit",
      subjectId: "support",
      level: "view",
      sharedBy: "u1",
      createdAt: "2026-11-14T00:00:00.000Z",
    },
    {
      id: "s-user",
      subjectType: "user",
      subjectId: "u2",
      level: "view",
      sharedBy: "u1",
      createdAt: "2026-11-14T00:00:00.000Z",
    },
  ],
  nextCursor: null,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method) return Promise.resolve(json({ data: [], nextCursor: null }))
    if (String(url).includes("/shares")) return Promise.resolve(json(shares))
    if (String(url).endsWith("/units")) return Promise.resolve(json(units))
    if (String(url).endsWith("/members")) return Promise.resolve(json(people))
    return Promise.resolve(json({ data: [], nextCursor: null }))
  })
})

afterEach(() => cleanup())

describe("ShareChatDialog", () => {
  it("lists what the chat is shared with, by name", async () => {
    render(
      <ShareChatDialog sessionId="s1" title="Quarterly plan" open onOpenChange={() => {}} />,
    )

    await screen.findByText("Support")
    expect(screen.getByText("Ben")).not.toBeNull()
    expect(screen.getAllByText(/can read/i).length).toBe(2)
  })

  it("saves the whole list with one PUT, as a bare array of subjects", async () => {
    render(<ShareChatDialog sessionId="s1" title="Quarterly plan" open onOpenChange={() => {}} />)
    await screen.findByText("Support")

    fireEvent.click(screen.getByRole("button", { name: /save sharing/i }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "PUT")
      expect(put).toBeDefined()
      expect(put?.[0]).toBe("/api/dashboard/chat/sessions/s1/shares")
      expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual([
        { subjectType: "unit", subjectId: "support" },
        { subjectType: "user", subjectId: "u2" },
      ])
    })
  })

  it("revokes one share by its id", async () => {
    render(<ShareChatDialog sessionId="s1" title="Quarterly plan" open onOpenChange={() => {}} />)
    await screen.findByText("Support")

    fireEvent.click(screen.getByRole("button", { name: /revoke sharing with support/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "DELETE")
      expect(call?.[0]).toBe("/api/dashboard/chat/sessions/s1/shares/s-unit")
    })
  })

  it("shows the API's sentence when the chat belongs to no organisation", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve(
          json(
            {
              error: {
                code: "conflict",
                message: "This chat belongs to no organisation and cannot be shared.",
                requestId: "r1",
              },
            },
            409,
          ),
        )
      }
      if (String(url).includes("/shares")) return Promise.resolve(json({ data: [], nextCursor: null }))
      if (String(url).endsWith("/units")) return Promise.resolve(json(units))
      if (String(url).endsWith("/members")) return Promise.resolve(json(people))
      return Promise.resolve(json({ data: [], nextCursor: null }))
    })

    render(<ShareChatDialog sessionId="legacy" title="Old chat" open onOpenChange={() => {}} />)
    await screen.findByText(/only you/i)
    fireEvent.click(screen.getByRole("button", { name: /save sharing/i }))

    expect(
      (await screen.findByText(/belongs to no organisation and cannot be shared/i)).textContent,
    ).toContain("belongs to no organisation")
  })
})
