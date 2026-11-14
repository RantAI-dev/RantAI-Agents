/**
 * Chat sharing (design §3.4): the sessions routes that carry shares, and the read-only view.
 *
 * A share names the organisation, one of its units (and so every unit below it) or one of its
 * members, and is always read-only. `PUT` replaces every share with its list, so the dialog keeps
 * a draft and sends it once; a single share can also be revoked on its own.
 */

import type { OrgMember, UnitNode } from "@/features/org-admin/types"

export type ShareSubjectType = "org" | "unit" | "user"

export interface ChatShare {
  id: string
  subjectType: ShareSubjectType
  subjectId: string
  level: "view"
  sharedBy: string
  createdAt: string
}

export interface ShareSubjectBody {
  subjectType: ShareSubjectType
  subjectId: string
}

export interface SharedSession {
  id: string
  title: string
  assistantId: string
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface TranscriptMessage {
  id: string
  role: string
  content: string
  createdAt: string
  replyTo: string | null
  sources?: unknown
  metadata?: unknown
}

export interface SharedTranscript {
  id: string
  title: string
  assistantId: string
  assistantName: string
  ownerId: string
  createdAt: string
  updatedAt: string
  messages: TranscriptMessage[]
}

export interface ForkedSession {
  id: string
  title: string
  assistantId: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export interface SessionSubjectOption {
  subjectType: ShareSubjectType
  subjectId: string
  label: string
}

export const sharesPath = (sessionId: string) =>
  `/api/dashboard/chat/sessions/${encodeURIComponent(sessionId)}/shares`

export const shareRevokePath = (sessionId: string, shareId: string) =>
  `${sharesPath(sessionId)}/${encodeURIComponent(shareId)}`

export const SHARED_LIST_PATH = "/api/dashboard/chat/shared?limit=50"

export const sharedTranscriptPath = (sessionId: string) =>
  `/api/dashboard/chat/shared/${encodeURIComponent(sessionId)}`

export const sharedForkPath = (sessionId: string) =>
  `${sharedTranscriptPath(sessionId)}/fork`

export type OrgFetch = (url: string, options?: RequestInit) => Promise<Response>

/** The `PUT` body: a bare array, one entry per subject, the same subject never twice. */
export function shareBody(subjects: ShareSubjectBody[]): ShareSubjectBody[] {
  const seen = new Set<string>()
  const body: ShareSubjectBody[] = []
  for (const subject of subjects) {
    const subjectId = subject.subjectId.trim()
    if (!subjectId) continue
    const key = `${subject.subjectType}:${subjectId}`
    if (seen.has(key)) continue
    seen.add(key)
    body.push({ subjectType: subject.subjectType, subjectId })
  }
  return body
}

/** The people and units a chat can be shared with, as one list for a picker. */
export function shareTargets(
  orgId: string,
  orgName: string,
  units: UnitNode[],
  people: OrgMember[],
  flatten: (nodes: UnitNode[]) => Array<{ unit: UnitNode; depth: number }>,
): SessionSubjectOption[] {
  const options: SessionSubjectOption[] = [
    { subjectType: "org", subjectId: orgId, label: `Everyone at ${orgName}` },
  ]
  for (const { unit, depth } of flatten(units)) {
    options.push({
      subjectType: "unit",
      subjectId: unit.id,
      label: `${"— ".repeat(depth)}${unit.name}`,
    })
  }
  for (const person of people) {
    if (person.isPending) continue
    options.push({
      subjectType: "user",
      subjectId: person.userId,
      label: person.name?.trim() || person.email,
    })
  }
  return options
}

export async function putShares(
  orgFetch: OrgFetch,
  sessionId: string,
  subjects: ShareSubjectBody[],
): Promise<Response> {
  return orgFetch(sharesPath(sessionId), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(shareBody(subjects)),
  })
}

export async function revokeShare(
  orgFetch: OrgFetch,
  sessionId: string,
  shareId: string,
): Promise<Response> {
  return orgFetch(shareRevokePath(sessionId, shareId), { method: "DELETE" })
}

export async function forkSharedChat(orgFetch: OrgFetch, sessionId: string): Promise<Response> {
  return orgFetch(sharedForkPath(sessionId), { method: "POST" })
}
