/**
 * Pure decision helpers for the chat workspace's regenerate flow.
 */

/** Minimal shape the helper reads. The real `ChatMessage` and AI SDK's
 *  `UIMessage` are both structurally compatible (they have `id` and
 *  `role`); this avoids dragging either type system into a unit test. */
export interface RegenerateMessageLike {
  id: string
  role: "user" | "assistant"
}

/**
 * Whether regenerating the assistant message at `assistantMessageId` needs
 * a confirmation dialog because doing so would discard other messages in
 * the conversation.
 *
 * Last-message regenerate is one-click (re-rolling a single response is
 * what the user just asked for). Mid-conversation regenerate silently
 * drops everything after the target, which is destructive enough to
 * warrant an explicit Continue/Cancel — TC-1546.
 *
 * Unknown ids and non-assistant ids return `false`: the caller already
 * short-circuits in that case, and the confirmation step must not fire
 * for a no-op.
 */
export function requiresRegenerateConfirmation(
  messages: ReadonlyArray<RegenerateMessageLike>,
  assistantMessageId: string,
): boolean {
  const index = messages.findIndex((m) => m.id === assistantMessageId)
  if (index === -1) return false
  const target = messages[index]
  if (target.role !== "assistant") return false
  return index < messages.length - 1
}

/**
 * The signature we need from the chat-workspace's sendMessage: same shape
 * the workspace uses internally so we can extract the resend logic without
 * dragging React in here. The workspace's sendMessage accepts more
 * optional args; we only ever pass the first three.
 */
export type RegenerateSendFn = (
  userInput: string,
  baseMessages: ReadonlyArray<
    RegenerateMessageLike & {
      content?: string
      replyTo?: unknown
    }
  >,
  replyToId?: string,
) => Promise<unknown>

/**
 * Re-send the user message preceding the target assistant message, with
 * everything before that user message as base. The workspace's sendMessage
 * truncates the live list to `baseMessages` and appends the new user +
 * assistant placeholder — that's what makes regenerate drop trailing messages.
 *
 * Returns silently when the target is missing or has no preceding user
 * message; matches the existing handler's behaviour.
 *
 * `getContent` is passed in because the helper intentionally does not
 * depend on the workspace's React-coupled `getMessageContent`.
 */
export function executeRegenerate(
  messages: ReadonlyArray<RegenerateMessageLike & { content?: string }>,
  assistantMessageId: string,
  sendMessage: RegenerateSendFn,
  getContent: (m: { content?: string }) => string,
): Promise<unknown> | undefined {
  const messageIndex = messages.findIndex((m) => m.id === assistantMessageId)
  if (messageIndex === -1) return undefined
  const target = messages[messageIndex]
  if (target.role !== "assistant") return undefined

  // Find the preceding user message
  const userMessageIndex = messageIndex - 1
  if (userMessageIndex < 0) return undefined
  const userMessage = messages[userMessageIndex]
  if (userMessage.role !== "user") return undefined

  const userContent = getContent(userMessage)
  const userReplyTo = (userMessage as { replyTo?: unknown }).replyTo
  const truncatedMessages = messages.slice(0, userMessageIndex)

  return sendMessage(
    userContent,
    truncatedMessages,
    typeof userReplyTo === "string" ? userReplyTo : undefined,
  )
}