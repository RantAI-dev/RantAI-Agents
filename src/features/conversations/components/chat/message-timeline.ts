/**
 * Ordered message timeline.
 *
 * An assistant turn is a sequence of reasoning, text and tool parts in the
 * order the model produced them. The chat used to keep text as one string
 * and tool calls in a Map, which lost that order and forced every tool pill
 * to render above the whole answer. This module is the single source of
 * truth for the ordered shape, both live (fed by AI SDK UI-stream events)
 * and persisted (`metadata.parts` on the DashboardMessage row).
 *
 * Pure functions only — no React, no I/O — so the reducer is unit-testable
 * and shared by the SSE consumer, the employee polling consumer and the
 * server-side persistence path.
 */

export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "execution-started"
  | "done"
  | "error"

export type ReasoningPart = {
  type: "reasoning"
  text: string
  durationMs?: number
  /** Live only — true while reasoning deltas are still arriving. */
  streaming?: boolean
  /** Live only — wall-clock start used to compute durationMs. */
  startedAt?: number
}

export type TextPart = {
  type: "text"
  text: string
  /** Live only — the id from `text-start`, used to close the segment. */
  id?: string
}

export type ToolPart = {
  type: "tool"
  toolCallId: string
  toolName: string
  state: ToolPartState
  input?: Record<string, unknown>
  output?: unknown
  errorText?: string
  startedAt?: number
  endedAt?: number
}

export type TimelinePart = ReasoningPart | TextPart | ToolPart

/** The subset of a ToolPart written to `metadata.parts` and `metadata.toolCalls`. */
export type PersistedToolPart = Omit<ToolPart, "state"> & { state: "done" | "error" }

export type PersistedTimelinePart =
  | { type: "reasoning"; text: string; durationMs?: number }
  | { type: "text"; text: string }
  | ToolPart

type UiStreamEvent = Record<string, unknown> & { type?: string }

function isToolPart(p: TimelinePart | undefined): p is ToolPart {
  return p?.type === "tool"
}

function findToolIndex(timeline: TimelinePart[], toolCallId: string): number {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const p = timeline[i]
    if (p.type === "tool" && p.toolCallId === toolCallId) return i
  }
  return -1
}

function replaceAt(timeline: TimelinePart[], index: number, part: TimelinePart): TimelinePart[] {
  const next = timeline.slice()
  next[index] = part
  return next
}

/**
 * Append `delta` to the trailing text part, or open a new one. A text
 * segment is "open" only while it is the last part in the timeline — any
 * tool or reasoning part after it closes it, so the next delta starts a new
 * segment and interleaving is preserved.
 */
function appendText(timeline: TimelinePart[], delta: string, id?: string): TimelinePart[] {
  const last = timeline[timeline.length - 1]
  if (last?.type === "text" && (id == null || last.id == null || last.id === id)) {
    return replaceAt(timeline, timeline.length - 1, {
      ...last,
      text: last.text + delta,
      ...(id != null && last.id == null ? { id } : {}),
    })
  }
  return [...timeline, { type: "text", text: delta, ...(id != null ? { id } : {}) }]
}

function upsertTool(
  timeline: TimelinePart[],
  toolCallId: string,
  patch: Partial<ToolPart> & { toolName?: string },
  now: number,
): TimelinePart[] {
  const idx = findToolIndex(timeline, toolCallId)
  if (idx >= 0) {
    const existing = timeline[idx] as ToolPart
    return replaceAt(timeline, idx, {
      ...existing,
      ...patch,
      toolName: patch.toolName || existing.toolName,
    })
  }
  return [
    ...timeline,
    {
      type: "tool",
      toolCallId,
      toolName: patch.toolName || "unknown",
      state: patch.state ?? "input-streaming",
      startedAt: now,
      ...patch,
    },
  ]
}

/**
 * Reduce one AI SDK v6 UI-message-stream event (or the legacy
 * `tool-call` / `tool-result` pair) into the timeline. Returns a new array;
 * the input is never mutated.
 */
export function applyUiStreamEvent(
  timeline: TimelinePart[],
  event: UiStreamEvent,
  now: number = Date.now(),
): TimelinePart[] {
  switch (event.type) {
    case "thinking":
    case "reasoning-start": {
      const last = timeline[timeline.length - 1]
      if (last?.type === "reasoning" && last.streaming) return timeline
      return [...timeline, { type: "reasoning", text: "", streaming: true, startedAt: now }]
    }
    case "reasoning-delta": {
      const delta =
        (event.delta as string | undefined) ??
        (event.text as string | undefined) ??
        (event.textDelta as string | undefined) ??
        ""
      const last = timeline[timeline.length - 1]
      if (last?.type === "reasoning" && last.streaming) {
        return replaceAt(timeline, timeline.length - 1, { ...last, text: last.text + delta })
      }
      return [...timeline, { type: "reasoning", text: delta, streaming: true, startedAt: now }]
    }
    case "thinking-done":
    case "reasoning-end": {
      const last = timeline[timeline.length - 1]
      if (last?.type === "reasoning" && last.streaming) {
        return replaceAt(timeline, timeline.length - 1, {
          ...last,
          streaming: false,
          durationMs: last.startedAt != null ? now - last.startedAt : undefined,
        })
      }
      return timeline
    }
    case "text-start": {
      const id = event.id as string | undefined
      return [...timeline, { type: "text", text: "", ...(id != null ? { id } : {}) }]
    }
    case "text-delta":
      return appendText(timeline, (event.delta as string) || "", event.id as string | undefined)
    case "text-end":
      return timeline
    case "tool-input-start":
      return upsertTool(
        timeline,
        event.toolCallId as string,
        { toolName: event.toolName as string, state: "input-streaming" },
        now,
      )
    case "tool-input-available":
    case "tool-call":
      return upsertTool(
        timeline,
        event.toolCallId as string,
        {
          toolName: event.toolName as string | undefined,
          state: "execution-started",
          input: event.input as Record<string, unknown> | undefined,
        },
        now,
      )
    case "tool-output-available":
    case "tool-result":
      return upsertTool(
        timeline,
        event.toolCallId as string,
        {
          toolName: event.toolName as string | undefined,
          state: "done",
          output: event.output,
          endedAt: now,
        },
        now,
      )
    case "tool-output-error":
    case "tool-input-error":
      return upsertTool(
        timeline,
        event.toolCallId as string,
        {
          toolName: event.toolName as string | undefined,
          state: "error",
          errorText: event.errorText as string | undefined,
          endedAt: now,
        },
        now,
      )
    default:
      return timeline
  }
}

/** Legacy `tool-invocation` part shape kept on messages by older code paths. */
interface LegacyToolInvocationPart {
  type?: string
  toolCallId?: string
  toolName?: string
  state?: string
  args?: Record<string, unknown>
  input?: Record<string, unknown>
  output?: unknown
  errorText?: string
}

function legacyStateToToolState(raw: string | undefined): ToolPartState {
  switch (raw) {
    case "partial-call":
    case "input-streaming":
      return "input-streaming"
    case "call":
    case "input-available":
    case "execution-started":
      return "execution-started"
    case "error":
      return "error"
    default:
      return "done"
  }
}

function legacyToolToPart(tc: LegacyToolInvocationPart): ToolPart {
  return {
    type: "tool",
    toolCallId: tc.toolCallId || "",
    toolName: tc.toolName || "unknown",
    state: legacyStateToToolState(tc.state),
    input: tc.args ?? tc.input,
    output: tc.output,
    errorText: tc.errorText,
  }
}

export interface TimelineMessageInput {
  content?: string
  parts?: Array<Record<string, unknown>>
  metadata?: Record<string, unknown> | null
}

/**
 * Build the render timeline for a message. Prefers the ordered
 * `metadata.parts`; otherwise reconstructs the pre-timeline layout (reasoning,
 * every tool, then the text) so older messages look exactly as they did.
 */
export function timelineFromMessage(message: TimelineMessageInput): TimelinePart[] {
  const meta = message.metadata ?? undefined
  const persisted = meta?.parts
  if (Array.isArray(persisted) && persisted.length > 0) {
    const out: TimelinePart[] = []
    for (const raw of persisted as Array<Record<string, unknown>>) {
      if (raw?.type === "text" && typeof raw.text === "string") {
        out.push({ type: "text", text: raw.text })
      } else if (raw?.type === "reasoning" && typeof raw.text === "string") {
        out.push({
          type: "reasoning",
          text: raw.text,
          streaming: false,
          ...(typeof raw.durationMs === "number" ? { durationMs: raw.durationMs } : {}),
        })
      } else if (raw?.type === "tool" && typeof raw.toolCallId === "string") {
        out.push({
          type: "tool",
          toolCallId: raw.toolCallId,
          toolName: (raw.toolName as string) || "unknown",
          state: legacyStateToToolState(raw.state as string | undefined),
          input: raw.input as Record<string, unknown> | undefined,
          output: raw.output,
          errorText: raw.errorText as string | undefined,
          ...(typeof raw.startedAt === "number" ? { startedAt: raw.startedAt } : {}),
          ...(typeof raw.endedAt === "number" ? { endedAt: raw.endedAt } : {}),
        })
      }
    }
    if (out.length > 0) return out
  }

  const out: TimelinePart[] = []
  const reasoning = typeof meta?.reasoning === "string" ? meta.reasoning : ""
  if (reasoning) {
    out.push({
      type: "reasoning",
      text: reasoning,
      streaming: false,
      ...(typeof meta?.reasoningDurationMs === "number"
        ? { durationMs: meta.reasoningDurationMs }
        : {}),
    })
  }

  const liveTools = (message.parts ?? []).filter(
    (p) => p?.type === "tool-invocation" || p?.type === "tool",
  ) as LegacyToolInvocationPart[]
  const persistedTools = Array.isArray(meta?.toolCalls)
    ? (meta!.toolCalls as LegacyToolInvocationPart[])
    : []
  const tools = liveTools.length > 0 ? liveTools : persistedTools
  for (const tc of tools) out.push(legacyToolToPart(tc))

  const text =
    message.content ??
    (message.parts ?? [])
      .filter((p) => p?.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("")
  if (text) out.push({ type: "text", text })
  return out
}

/** Concatenated text of the timeline — what goes in `content`. */
export function timelineText(timeline: TimelinePart[]): string {
  return timeline
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("")
}

/** Every tool part, in order. */
export function timelineTools(timeline: TimelinePart[]): ToolPart[] {
  return timeline.filter((p): p is ToolPart => p.type === "tool")
}

/** Persisted shape: drops live-only fields and empty text segments. */
export function timelineToPersisted(timeline: TimelinePart[]): PersistedTimelinePart[] {
  const out: PersistedTimelinePart[] = []
  for (const p of timeline) {
    if (p.type === "text") {
      if (p.text.length > 0) out.push({ type: "text", text: p.text })
    } else if (p.type === "reasoning") {
      if (p.text.length > 0) {
        out.push({
          type: "reasoning",
          text: p.text,
          ...(typeof p.durationMs === "number" ? { durationMs: p.durationMs } : {}),
        })
      }
    } else {
      const { startedAt, endedAt, ...rest } = p
      out.push({
        ...rest,
        ...(typeof startedAt === "number" ? { startedAt } : {}),
        ...(typeof endedAt === "number" ? { endedAt } : {}),
      })
    }
  }
  return out
}

/**
 * Remove the fenced code block (or bare body) whose contents equal
 * `recovered`, used when the server promoted text the model wrote into an
 * artifact so the same source is not shown twice. Whitespace-tolerant on the
 * body; the surrounding blank lines are collapsed.
 */
export function stripRecoveredFence(text: string, recovered: string): string {
  const needle = recovered.trim()
  if (!needle) return text
  const fence = /```[\w+-]*[^\n]*\n([\s\S]*?)\n?```/g
  let match: RegExpExecArray | null
  while ((match = fence.exec(text)) !== null) {
    if (match[1].trim() === needle) {
      return collapse(text.slice(0, match.index) + text.slice(match.index + match[0].length))
    }
  }
  const idx = text.indexOf(needle)
  if (idx >= 0) {
    return collapse(text.slice(0, idx) + text.slice(idx + needle.length))
  }
  return text
}

function collapse(s: string): string {
  return s.replace(/\n{3,}/g, "\n\n").trim()
}

/** Apply the recovered-fence strip to the text part that precedes `toolIndex`. */
export function stripRecoveredFromTimeline(
  timeline: TimelinePart[],
  toolCallId: string,
  recovered: string,
): TimelinePart[] {
  const toolIdx = findToolIndex(timeline, toolCallId)
  const next = timeline.slice()
  for (let i = (toolIdx >= 0 ? toolIdx : next.length) - 1; i >= 0; i--) {
    const p = next[i]
    if (p.type !== "text") continue
    const stripped = stripRecoveredFence(p.text, recovered)
    if (stripped !== p.text) {
      next[i] = { ...p, text: stripped }
      return next
    }
  }
  return timeline
}

export { isToolPart }
