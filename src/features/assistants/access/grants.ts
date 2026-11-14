/**
 * The body of `PUT /api/assistants/{id}/access`.
 *
 * It replaces every grant on the agent with the list, so the panel keeps a draft and sends it as
 * one bare array (not `{ grants: [...] }`). One subject appears once — the unique index is
 * `(assistantId, subjectType, subjectId)` — and a subject with no id (a unit the caller has not
 * picked yet) is not sent.
 */

import type { AccessGrant, AccessGrantBody } from "@/features/org-admin/types"

export type GrantDraft = Pick<AccessGrantBody, "subjectType" | "subjectId" | "level">

export function toGrantBody(rows: GrantDraft[]): AccessGrantBody[] {
  const seen = new Set<string>()
  const body: AccessGrantBody[] = []
  for (const row of rows) {
    const subjectId = row.subjectId.trim()
    if (!subjectId) continue
    const key = `${row.subjectType}:${subjectId}`
    if (seen.has(key)) continue
    seen.add(key)
    body.push({ subjectType: row.subjectType, subjectId, level: row.level })
  }
  return body
}

/** A saved grant, as a draft the panel can edit. */
export function draftFromGrant(grant: AccessGrant): GrantDraft {
  return { subjectType: grant.subjectType, subjectId: grant.subjectId, level: grant.level }
}

/** Whether the draft differs from what the server holds, so "Save" is only offered when it does. */
export function draftsEqual(a: GrantDraft[], b: GrantDraft[]): boolean {
  const left = toGrantBody(a)
  const right = toGrantBody(b)
  if (left.length !== right.length) return false
  return left.every((row, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      row.subjectType === other.subjectType &&
      row.subjectId === other.subjectId &&
      row.level === other.level
    )
  })
}

export function grantKey(row: GrantDraft): string {
  return `${row.subjectType}:${row.subjectId}`
}
