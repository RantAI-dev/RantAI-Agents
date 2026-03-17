import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../helpers/db"
import { createTestUser, createTestOrg, createTestMembership } from "../helpers/fixtures"

// IMPORTANT: mock prisma BEFORE importing the module under test
vi.mock("@/lib/prisma", () => ({
  prisma: testPrisma,
}))

import { getOrganizationContext, getOrganizationContextWithFallback } from "@/lib/organization"

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => { await cleanupDatabase() })
afterAll(async () => { await testPrisma.$disconnect() })

function makeRequest(orgId?: string): Request {
  const headers = new Headers()
  if (orgId) headers.set("x-organization-id", orgId)
  return new Request("http://localhost/api/test", { headers })
}

describe("getOrganizationContext", () => {
  it("returns context for accepted member with valid header", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const membership = await createTestMembership(user.id, org.id, "admin")

    const request = makeRequest(org.id)
    const ctx = await getOrganizationContext(request, user.id)

    expect(ctx).not.toBeNull()
    expect(ctx!.organizationId).toBe(org.id)
    expect(ctx!.membership.userId).toBe(user.id)
    expect(ctx!.membership.role).toBe("admin")
    expect(ctx!.membership.id).toBe(membership.id)
  })

  it("returns null when no x-organization-id header", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id)

    const request = makeRequest() // no header
    const ctx = await getOrganizationContext(request, user.id)

    expect(ctx).toBeNull()
  })

  it("returns null when user is not a member of the org", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    // No membership created

    const request = makeRequest(org.id)
    const ctx = await getOrganizationContext(request, user.id)

    expect(ctx).toBeNull()
  })

  it("returns null for pending invite (acceptedAt: null)", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "member", { acceptedAt: null })

    const request = makeRequest(org.id)
    const ctx = await getOrganizationContext(request, user.id)

    expect(ctx).toBeNull()
  })

  it("returns null for invalid/non-existent org ID", async () => {
    const user = await createTestUser()
    const fakeOrgId = "00000000-0000-0000-0000-000000000000"

    const request = makeRequest(fakeOrgId)
    const ctx = await getOrganizationContext(request, user.id)

    expect(ctx).toBeNull()
  })
})

describe("getOrganizationContextWithFallback", () => {
  it("uses the x-organization-id header when present", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "owner")

    const request = makeRequest(org.id)
    const ctx = await getOrganizationContextWithFallback(request, user.id)

    expect(ctx).not.toBeNull()
    expect(ctx!.organizationId).toBe(org.id)
    expect(ctx!.membership.role).toBe("owner")
  })

  it("falls back to first accepted org when no header is present", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "member")

    const request = makeRequest() // no header
    const ctx = await getOrganizationContextWithFallback(request, user.id)

    expect(ctx).not.toBeNull()
    expect(ctx!.organizationId).toBe(org.id)
    expect(ctx!.membership.userId).toBe(user.id)
  })

  it("returns null when user has no orgs", async () => {
    const user = await createTestUser()

    const request = makeRequest() // no header, no memberships
    const ctx = await getOrganizationContextWithFallback(request, user.id)

    expect(ctx).toBeNull()
  })

  it("skips pending memberships in fallback (only uses accepted)", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "member", { acceptedAt: null })

    const request = makeRequest() // no header
    const ctx = await getOrganizationContextWithFallback(request, user.id)

    expect(ctx).toBeNull()
  })

  it("returns first accepted org when user has multiple memberships", async () => {
    const user = await createTestUser()
    const org1 = await createTestOrg()
    const org2 = await createTestOrg()

    // Create both memberships as accepted
    await createTestMembership(user.id, org1.id, "member")
    await createTestMembership(user.id, org2.id, "admin")

    const request = makeRequest() // no header
    const ctx = await getOrganizationContextWithFallback(request, user.id)

    expect(ctx).not.toBeNull()
    // Should return one of the accepted orgs (first found)
    expect([org1.id, org2.id]).toContain(ctx!.organizationId)
    expect(ctx!.membership.userId).toBe(user.id)
  })
})
