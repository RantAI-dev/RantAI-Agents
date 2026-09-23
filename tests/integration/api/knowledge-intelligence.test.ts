import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import { createTestUser, createTestOrg, createTestMembership } from "../../helpers/fixtures"

// IMPORTANT: All mocks must come before importing the module under test

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

const mockAuth = vi.fn()
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

// SurrealDB carries no organization on entity or relation rows, which is the
// whole reason this route has to authorise in Postgres first. The graph store
// is mocked so a test can see whether it was ever reached.
const surrealQuery = vi.fn()
vi.mock("@/lib/surrealdb", () => ({
  getSurrealClient: async () => ({ query: surrealQuery }),
}))

import { GET } from "@/app/api/dashboard/files/[id]/intelligence/route"

beforeAll(async () => { await testPrisma.$connect() })
beforeEach(() => {
  surrealQuery.mockReset()
  surrealQuery.mockResolvedValue([[]])
})
afterEach(async () => { await cleanupDatabase() })
afterAll(async () => { await testPrisma.$disconnect() })

function makeRequest(documentId: string, orgId: string): [Request, { params: Promise<{ id: string }> }] {
  const headers = new Headers({ "x-organization-id": orgId })
  return [
    new Request(`http://localhost/api/dashboard/files/${documentId}/intelligence`, { headers }),
    { params: Promise.resolve({ id: documentId }) },
  ]
}

/** Was the entity graph ever queried — as opposed to only the chunk lookup? */
const graphWasRead = () =>
  surrealQuery.mock.calls.some(([sql]) => typeof sql === "string" && /FROM\s+entity/i.test(sql))

describe("GET /api/dashboard/files/[id]/intelligence — tenant isolation", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(...makeRequest("doc_x", "org_x"))
    expect(res.status).toBe(401)
  })

  // The positive control. Without it a 404 below cannot be told apart from a
  // route that is simply broken, which would pass every negative assertion.
  it("returns the graph to a member of the document's own organization", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "admin")
    const doc = await testPrisma.document.create({
      data: { title: "HR Policy", content: "", organizationId: org.id },
    })
    mockAuth.mockResolvedValue({ user: { id: user.id } })

    const res = await GET(...makeRequest(doc.id, org.id))

    expect(res.status).toBe(200)
    expect(graphWasRead()).toBe(true)
  })

  it("refuses another organization's document, and never reads its graph", async () => {
    const attacker = await createTestUser()
    const attackerOrg = await createTestOrg()
    await createTestMembership(attacker.id, attackerOrg.id, "admin")

    const victimOrg = await createTestOrg()
    const victimDoc = await testPrisma.document.create({
      data: { title: "Confidential", content: "", organizationId: victimOrg.id },
    })
    mockAuth.mockResolvedValue({ user: { id: attacker.id } })

    const res = await GET(...makeRequest(victimDoc.id, attackerOrg.id))

    expect(res.status).toBe(404)
    expect(graphWasRead()).toBe(false)
  })

  it("answers another organization's document exactly as it answers one that does not exist", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "admin")
    const otherDoc = await testPrisma.document.create({
      data: { title: "Elsewhere", content: "", organizationId: (await createTestOrg()).id },
    })
    mockAuth.mockResolvedValue({ user: { id: user.id } })

    const foreign = await GET(...makeRequest(otherDoc.id, org.id))
    const missing = await GET(...makeRequest("doc_that_never_existed", org.id))

    // Anchored to 404: without it, the unfixed route answered both with 200
    // and an empty graph, so the two matched and this passed for the wrong
    // reason. Indistinguishable only counts when both are refusals.
    expect(missing.status).toBe(404)
    expect(foreign.status).toBe(missing.status)
    expect(await foreign.json()).toEqual(await missing.json())
  })
})
