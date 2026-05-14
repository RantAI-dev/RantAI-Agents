import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"
import { testPrisma, cleanupDatabase } from "../helpers/db"
import { createTestUser, createTestOrg, createTestMembership } from "../helpers/fixtures"

// IMPORTANT: mock prisma BEFORE importing the module under test
vi.mock("@/lib/prisma", () => ({
  prisma: testPrisma,
}))

import { resolveActiveOrg } from "@/lib/org-context"

beforeAll(async () => { await testPrisma.$connect() })
afterEach(async () => { await cleanupDatabase() })
afterAll(async () => { await testPrisma.$disconnect() })

function makeRequest(orgId?: string, cookieOrgId?: string): Request {
  const headers = new Headers()
  if (orgId) headers.set("x-organization-id", orgId)
  if (cookieOrgId) headers.set("cookie", `rantai-active-org=${cookieOrgId}`)
  return new Request("http://localhost/api/test", { headers })
}

describe("resolveActiveOrg — header precedence", () => {
  it("returns context for accepted member with valid header", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    const membership = await createTestMembership(user.id, org.id, "admin")

    const ctx = await resolveActiveOrg(makeRequest(org.id), user.id)

    expect(ctx).not.toBeNull()
    expect(ctx!.organizationId).toBe(org.id)
    expect(ctx!.membership.userId).toBe(user.id)
    expect(ctx!.membership.role).toBe("admin")
    expect(ctx!.membership.id).toBe(membership.id)
    expect(ctx!.role).toBe("admin")
    expect(ctx!.source).toBe("header")
  })

  it("returns null when header references an org the user is not a member of", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    // No membership created — explicit header override must not silently fall through
    const ctx = await resolveActiveOrg(makeRequest(org.id), user.id)
    expect(ctx).toBeNull()
  })

  it("returns null for pending invite (acceptedAt: null) when header is present", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "member", { acceptedAt: null })

    const ctx = await resolveActiveOrg(makeRequest(org.id), user.id)
    expect(ctx).toBeNull()
  })
})

describe("resolveActiveOrg — cookie + auto fallback", () => {
  it("falls through to cookie when no header is present", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "owner")

    const ctx = await resolveActiveOrg(makeRequest(undefined, org.id), user.id)
    expect(ctx).not.toBeNull()
    expect(ctx!.organizationId).toBe(org.id)
    expect(ctx!.source).toBe("cookie")
  })

  it("ignores a stale cookie and falls through to auto-pick", async () => {
    const user = await createTestUser()
    const realOrg = await createTestOrg()
    const fakeOrg = await createTestOrg() // user is NOT a member
    await createTestMembership(user.id, realOrg.id, "member")

    const ctx = await resolveActiveOrg(makeRequest(undefined, fakeOrg.id), user.id)
    expect(ctx).not.toBeNull()
    expect(ctx!.organizationId).toBe(realOrg.id)
    expect(ctx!.source).toBe("auto")
  })

  it("auto-picks the user's first accepted org when nothing is provided", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "member")

    const ctx = await resolveActiveOrg(makeRequest(), user.id)
    expect(ctx).not.toBeNull()
    expect(ctx!.organizationId).toBe(org.id)
    expect(ctx!.membership.userId).toBe(user.id)
    expect(ctx!.source).toBe("auto")
  })

  it("returns null when user has no accepted memberships at all", async () => {
    const user = await createTestUser()
    const ctx = await resolveActiveOrg(makeRequest(), user.id)
    expect(ctx).toBeNull()
  })

  it("skips pending memberships in the auto-pick branch", async () => {
    const user = await createTestUser()
    const org = await createTestOrg()
    await createTestMembership(user.id, org.id, "member", { acceptedAt: null })

    const ctx = await resolveActiveOrg(makeRequest(), user.id)
    expect(ctx).toBeNull()
  })

  it("auto-picks one of multiple accepted orgs (order: earliest accepted)", async () => {
    const user = await createTestUser()
    const org1 = await createTestOrg()
    const org2 = await createTestOrg()
    await createTestMembership(user.id, org1.id, "member")
    await createTestMembership(user.id, org2.id, "admin")

    const ctx = await resolveActiveOrg(makeRequest(), user.id)
    expect(ctx).not.toBeNull()
    expect([org1.id, org2.id]).toContain(ctx!.organizationId)
    expect(ctx!.membership.userId).toBe(user.id)
  })
})
