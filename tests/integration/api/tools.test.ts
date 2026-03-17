import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestTool,
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

// ensureBuiltinTools pulls in BUILTIN_TOOLS which requires several heavy deps — mock it out
vi.mock("@/lib/tools", () => ({
  ensureBuiltinTools: vi.fn().mockResolvedValue(undefined),
}))

import { GET } from "@/app/api/dashboard/tools/route"

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => { await cleanupDatabase() })
afterAll(async () => { await testPrisma.$disconnect() })

function makeRequest(orgId?: string): Request {
  const headers = new Headers()
  if (orgId) headers.set("x-organization-id", orgId)
  return new Request("http://localhost/api/dashboard/tools", { headers })
}

describe("GET /api/dashboard/tools", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)

    const res = await GET(makeRequest())
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("returns tools for the authenticated user's org", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "admin")
    const tool = await createTestTool(org.id, { name: "org-tool-a", displayName: "Org Tool A" })

    mockAuth.mockResolvedValue({ user: { id: user.id } })

    const res = await GET(makeRequest(org.id))
    expect(res.status).toBe(200)

    const tools = await res.json()
    expect(Array.isArray(tools)).toBe(true)

    const ids = tools.map((t: { id: string }) => t.id)
    expect(ids).toContain(tool.id)
  })

  it("isolates tools between orgs (user A cannot see org B's tools)", async () => {
    const userA = await createTestUser()
    const orgA = await createTestOrg()
    await createTestMembership(userA.id, orgA.id, "admin")
    const toolA = await createTestTool(orgA.id, { name: "tool-for-a", displayName: "Tool A" })

    const userB = await createTestUser()
    const orgB = await createTestOrg()
    await createTestMembership(userB.id, orgB.id, "admin")
    const toolB = await createTestTool(orgB.id, { name: "tool-for-b", displayName: "Tool B" })

    // userA queries with their own org header
    mockAuth.mockResolvedValue({ user: { id: userA.id } })

    const res = await GET(makeRequest(orgA.id))
    expect(res.status).toBe(200)

    const tools = await res.json()
    const ids = tools.map((t: { id: string }) => t.id)

    expect(ids).toContain(toolA.id)
    expect(ids).not.toContain(toolB.id)
  })
})
