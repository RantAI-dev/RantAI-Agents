import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../../helpers/db"
import {
  createTestUser,
  createTestOrg,
  createTestMembership,
  createTestAssistant,
  createTestEmployeeGroup,
  createTestEmployee,
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

import { GET } from "@/app/api/dashboard/digital-employees/route"

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => { await cleanupDatabase() })
afterAll(async () => { await testPrisma.$disconnect() })

function makeRequest(orgId?: string): Request {
  const headers = new Headers()
  if (orgId) headers.set("x-organization-id", orgId)
  return new Request("http://localhost/api/dashboard/digital-employees", { headers })
}

describe("GET /api/dashboard/digital-employees", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null)

    const res = await GET(makeRequest())
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("returns employees for the authenticated user's org", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "admin")
    const assistant = await createTestAssistant(org.id)
    const group = await createTestEmployeeGroup(org.id, user.id)
    const employee = await createTestEmployee(org.id, assistant.id, group.id, user.id, {
      name: "Test Employee",
    })

    mockAuth.mockResolvedValue({ user: { id: user.id } })

    const res = await GET(makeRequest(org.id))
    expect(res.status).toBe(200)

    const employees = await res.json()
    expect(Array.isArray(employees)).toBe(true)

    const ids = employees.map((e: { id: string }) => e.id)
    expect(ids).toContain(employee.id)
  })
})
