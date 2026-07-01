/**
 * In-memory hand-off for files attached in the new-chat composer.
 *
 * When the composer creates a session it navigates to /dashboard/chat/[id] and
 * replays the typed message via a sessionStorage "pending-init" payload. File
 * objects can't ride in that payload — JSON.stringify strips their binary
 * contents (a File serializes to `{}`), which is why images picked on the home
 * composer never reached the created chat.
 *
 * The new-chat → chat navigation is a client-side router.push (no full reload),
 * so module state survives it. Stash the real File[] here keyed by the same init
 * token that's in the URL, and take them exactly once on the target page.
 */
const store = new Map<string, File[]>()

export function stashPendingChatFiles(token: string, files: File[]): void {
  if (token && files.length > 0) {
    store.set(token, files)
  }
}

/** Returns the stashed files for this token (once) and clears them. */
export function takePendingChatFiles(token: string | null | undefined): File[] {
  if (!token) return []
  const files = store.get(token) ?? []
  store.delete(token)
  return files
}
