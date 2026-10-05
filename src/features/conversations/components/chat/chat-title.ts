/** Shared chat-title formatter — first 50 chars + ellipsis when truncated.
 *  Used by both the onFinish and sendMessage title paths so an edit at
 *  index 0 produces the same string the auto-titler would have (TC-944d). */
export function formatChatTitle(content: string): string {
  return content.slice(0, 50) + (content.length > 50 ? "..." : "")
}