/**
 * Pure helpers for the client-side chat-session store (`useChatSessions`).
 *
 * Kept free of React / fetch / prisma imports so the rules that decide what
 * gets DELETEd on the server, and how the sidebar is ordered, are unit-testable
 * on their own. Every rule here errs on the side of NOT deleting: the client's
 * message list can be partial (lazy load still in flight, hydration not yet
 * merged), and "delete everything the server has that the client doesn't" would
 * wipe history in exactly those windows.
 */

/**
 * Ids the client previously held and that are absent from the new list —
 * the only ids a sync is allowed to delete ("known-and-removed").
 */
export function computeRemovedMessageIds(
  previousIds: Iterable<string>,
  nextIds: Iterable<string>,
): string[] {
  const next = new Set(nextIds)
  const removed: string[] = []
  for (const id of previousIds) {
    if (!next.has(id)) removed.push(id)
  }
  return removed
}

/**
 * Folds one `syncMessages` call into the per-session pending-delete set.
 * Debounced syncs coalesce several calls into one network round, so a
 * removal observed in call N must survive until the flush even though call
 * N+1 no longer "knows" the id. An id that shows up again in a later list
 * (e.g. an error rollback that restores a message) is dropped from the set.
 */
export function accumulatePendingDeletes(
  pending: ReadonlySet<string>,
  previousIds: Iterable<string>,
  nextIds: Iterable<string>,
): Set<string> {
  const nextList = Array.from(nextIds)
  const result = new Set(pending)
  for (const id of computeRemovedMessageIds(previousIds, nextList)) {
    result.add(id)
  }
  for (const id of nextList) {
    result.delete(id)
  }
  return result
}

/**
 * The ids to actually send in the DELETE: pending removals that the server
 * still has and that the client's latest list does not contain.
 */
export function selectMessageIdsToDelete(
  pending: ReadonlySet<string>,
  serverIds: ReadonlySet<string>,
  currentIds: Iterable<string>,
): string[] {
  const current = new Set(currentIds)
  return Array.from(pending).filter((id) => serverIds.has(id) && !current.has(id))
}

/** True when the new list contains a message id the previous one did not. */
export function hasNewMessageIds(
  previousIds: Iterable<string>,
  nextIds: Iterable<string>,
): boolean {
  const previous = new Set(previousIds)
  for (const id of nextIds) {
    if (!previous.has(id)) return true
  }
  return false
}

export interface SessionActivityLike {
  id: string
  createdAt: Date
  updatedAt?: Date
}

/** Last activity for sidebar display/sorting: updatedAt, else createdAt. */
export function getSessionActivityDate(session: SessionActivityLike): Date {
  return session.updatedAt ?? session.createdAt
}

/**
 * Stamps `now` as the session's last activity and moves it to the front of
 * the list, matching the server's `updatedAt desc` order. Returns the input
 * array unchanged when the session is not present.
 */
export function moveSessionToTop<T extends SessionActivityLike>(
  sessions: T[],
  sessionId: string,
  now: Date,
): T[] {
  const index = sessions.findIndex((s) => s.id === sessionId)
  if (index === -1) return sessions
  const touched = { ...sessions[index], updatedAt: now }
  return [touched, ...sessions.slice(0, index), ...sessions.slice(index + 1)]
}

/**
 * Drops sessions the client has deleted (or is deleting) from a server
 * payload. Hydration payloads can be stale — the RSC router cache, or a
 * page render that raced the DELETE — and merging them back in makes a
 * deleted chat reappear in the sidebar.
 */
export function filterDeletedSessions<T extends { id: string; dbId?: string }>(
  incoming: T[],
  deletedIds: ReadonlySet<string>,
): T[] {
  if (deletedIds.size === 0) return incoming
  return incoming.filter(
    (s) => !deletedIds.has(s.id) && !(s.dbId && deletedIds.has(s.dbId)),
  )
}
