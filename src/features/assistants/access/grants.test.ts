import { describe, expect, it } from "vitest"
import { draftsEqual, toGrantBody } from "./grants"
import type { AccessGrant } from "@/features/org-admin/types"

const grant: AccessGrant = {
  id: "g1",
  subjectType: "unit",
  subjectId: "support",
  level: "use",
  grantedBy: "u0",
  createdAt: "2026-11-14T00:00:00.000Z",
}

describe("toGrantBody", () => {
  it("sends a bare array, the shape the PUT takes", () => {
    expect(
      toGrantBody([
        { subjectType: "org", subjectId: "o1", level: "use" },
        { subjectType: "unit", subjectId: "support", level: "manage" },
        { subjectType: "user", subjectId: "u1", level: "use" },
      ]),
    ).toEqual([
      { subjectType: "org", subjectId: "o1", level: "use" },
      { subjectType: "unit", subjectId: "support", level: "manage" },
      { subjectType: "user", subjectId: "u1", level: "use" },
    ])
  })

  it("keeps one row per subject, which is the unique index the API enforces", () => {
    expect(
      toGrantBody([
        { subjectType: "user", subjectId: "u1", level: "use" },
        { subjectType: "user", subjectId: "u1", level: "manage" },
      ]),
    ).toEqual([{ subjectType: "user", subjectId: "u1", level: "use" }])
  })

  it("drops a subject with no id, and trims the ones it keeps", () => {
    expect(
      toGrantBody([
        { subjectType: "org", subjectId: "", level: "use" },
        { subjectType: "unit", subjectId: "  support  ", level: "use" },
      ]),
    ).toEqual([{ subjectType: "unit", subjectId: "support", level: "use" }])
  })

  it("tells an unchanged draft from a changed one", () => {
    const draft = [{ subjectType: "unit" as const, subjectId: grant.subjectId, level: "use" as const }]
    expect(draftsEqual(draft, draft)).toBe(true)
    expect(draftsEqual(draft, [{ ...draft[0], level: "manage" }])).toBe(false)
    expect(draftsEqual(draft, [])).toBe(false)
  })
})
