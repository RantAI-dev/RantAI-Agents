import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestWorkflow,
} from "../../helpers/fixtures"

// IMPORTANT: All mocks must come before importing the module under test

vi.mock("@/lib/prisma", () => ({ prisma: testPrisma }))

const mockAuth = vi.fn()
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

import { GET } from "@/app/api/dashboard/workflows/route"

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => { await cleanupDatabase() })
afterAll(async () => { await testPrisma.$disconnect() })

function makeRequest(orgId?: string, search?: Record<string, string>): Request {
  const url = new URL("http://localhost/api/dashboard/workflows")
  if (search) {
    for (const [k, v] of Object.entries(search)) url.searchParams.set(k, v)
  }
  const headers = new Headers()
  if (orgId) headers.set("x-organization-id", orgId)
  return new Request(url.toString(), { headers })
}

describe("GET /api/dashboard/workflows", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)

    const res = await GET(makeRequest())
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("returns workflows for the authenticated user's org", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "admin")
    const workflow = await createTestWorkflow(org.id, user.id, { name: "My Workflow" })

    mockAuth.mockResolvedValue({ user: { id: user.id } })

    const res = await GET(makeRequest(org.id))
    expect(res.status).toBe(200)

    const workflows = await res.json()
    expect(Array.isArray(workflows)).toBe(true)

    const ids = workflows.map((w: { id: string }) => w.id)
    expect(ids).toContain(workflow.id)
  })
})
