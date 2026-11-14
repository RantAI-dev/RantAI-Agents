// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import OrgTeamsPage from "./org-teams-page"
import type { UnitNode } from "@/features/org-admin/types"

const tree: UnitNode[] = [
  {
    id: "support",
    parentId: null,
    kind: "department",
    name: "Support",
    slug: "support",
    externalId: null,
    createdAt: "2026-11-14T00:00:00.000Z",
    updatedAt: "2026-11-14T00:00:00.000Z",
    children: [
      {
        id: "tier-one",
        parentId: "support",
        kind: "team",
        name: "Tier One",
        slug: "tier-one",
        externalId: null,
        createdAt: "2026-11-14T00:00:00.000Z",
        updatedAt: "2026-11-14T00:00:00.000Z",
        children: [],
      },
    ],
  },
  {
    id: "sales",
    parentId: null,
    kind: "department",
    name: "Sales",
    slug: "sales",
    externalId: null,
    createdAt: "2026-11-14T00:00:00.000Z",
    updatedAt: "2026-11-14T00:00:00.000Z",
    children: [],
  },
]

const mocks = vi.hoisted(() => ({ isAdmin: true, orgId: "o1" as string | null }))
const fetchMock = vi.fn()

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganization: mocks.orgId ? { id: mocks.orgId, name: "Acme", slug: "acme" } : null,
    isAdmin: mocks.isAdmin,
    isOwner: false,
    canEdit: mocks.isAdmin,
  }),
  useOrgFetch: () => fetchMock,
}))

function treeResponse() {
  return new Response(JSON.stringify({ data: tree, nextCursor: null }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function okResponse() {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  mocks.isAdmin = true
  mocks.orgId = "o1"
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return Promise.resolve(okResponse())
    if (String(url).endsWith("/units")) return Promise.resolve(treeResponse())
    return Promise.resolve(okResponse())
  })
})

afterEach(() => {
  cleanup()
})

describe("OrgTeamsPage", () => {
  it("draws the tree", async () => {
    render(<OrgTeamsPage />)
    await waitFor(() => expect(screen.getByTestId("unit-tree")).not.toBeNull())
    expect(screen.getByTestId("unit-row-support")).not.toBeNull()
    expect(screen.getByTestId("unit-row-tier-one")).not.toBeNull()
    expect(screen.getByTestId("unit-row-sales")).not.toBeNull()
  })

  it("moves a unit onto the row it is dropped on", async () => {
    render(<OrgTeamsPage />)
    await waitFor(() => expect(screen.getByTestId("unit-row-support")).not.toBeNull())

    // Dropping on a row means "become a child of this unit": the body names the new parent.
    fireEvent.dragStart(screen.getByTestId("unit-row-support"))
    fireEvent.dragOver(screen.getByTestId("unit-row-sales"))
    fireEvent.drop(screen.getByTestId("unit-row-sales"))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "PATCH")
      expect(patch).toBeDefined()
      expect(patch?.[0]).toBe("/api/organizations/o1/units/support")
      expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({ parentId: "sales" })
    })
  })

  it("refuses a drop that would make a cycle, without calling the API", async () => {
    render(<OrgTeamsPage />)
    await waitFor(() => expect(screen.getByTestId("unit-row-support")).not.toBeNull())

    // Tier One is inside Support: moving Support under it would be a cycle.
    fireEvent.dragStart(screen.getByTestId("unit-row-support"))
    fireEvent.dragOver(screen.getByTestId("unit-row-tier-one"))
    fireEvent.drop(screen.getByTestId("unit-row-tier-one"))

    await waitFor(() => expect(screen.getByTestId("unit-tree")).not.toBeNull())
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "PATCH")
    expect(patch).toBeUndefined()
  })

  it("shows nothing but a refusal to a member", () => {
    mocks.isAdmin = false
    render(<OrgTeamsPage />)
    expect(screen.getByText(/only owners and admins may manage/i)).not.toBeNull()
    expect(screen.queryByTestId("unit-tree")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
