import { describe, it, expect, vi } from "vitest"

// Mock prisma since lib/organization.ts imports it at the top level
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { canEdit, canManage, isOwner } from "@/lib/organization"

describe("canEdit", () => {
  it("returns true for owner", () => expect(canEdit("owner")).toBe(true))
  it("returns true for admin", () => expect(canEdit("admin")).toBe(true))
  it("returns true for member", () => expect(canEdit("member")).toBe(true))
  it("returns false for viewer", () => expect(canEdit("viewer")).toBe(false))
  it("returns false for unknown role", () => expect(canEdit("guest")).toBe(false))
  it("returns false for empty string", () => expect(canEdit("")).toBe(false))
})

describe("canManage", () => {
  it("returns true for owner", () => expect(canManage("owner")).toBe(true))
  it("returns true for admin", () => expect(canManage("admin")).toBe(true))
  it("returns false for member", () => expect(canManage("member")).toBe(false))
  it("returns false for viewer", () => expect(canManage("viewer")).toBe(false))
})

describe("isOwner", () => {
  it("returns true for owner", () => expect(isOwner("owner")).toBe(true))
  it("returns false for admin", () => expect(isOwner("admin")).toBe(false))
  it("returns false for member", () => expect(isOwner("member")).toBe(false))
})
