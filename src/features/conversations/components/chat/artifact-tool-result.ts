/**
 * Helpers for interpreting `create_artifact` / `update_artifact` tool
 * results emitted into the chat-message stream.
 *
 * Two distinct facts the chat-workspace needs to know about a finished
 * artifact tool call:
 *
 * 1. **Did the artifact actually persist?** Both tools return shapes that
 *    LOOK successful at the JSON level (id, title, type, content all
 *    present) even on failure paths — `create_artifact` returns the raw
 *    input alongside `persisted: false` when validation rejects, and
 *    `update_artifact` returns existing fields alongside `updated: false`
 *    on conflicts / validation failures. Without checking the
 *    persisted/updated flag, the workspace would treat failed calls as
 *    successful and add a "ghost" artifact to its in-memory map (an
 *    indicator the user can click to see content the server rejected).
 *
 * 2. **What state should the indicator render?** A `state: "done"` tool
 *    call with `persisted: false` should NOT look like a successful tool
 *    in the UI — it should render as a failed tool call so the user
 *    understands the LLM's attempt didn't take.
 */

interface ToolCallLike {
  toolName: string
  state: "input-streaming" | "input-available" | "execution-started" | "done" | "error"
  output?: unknown
  errorText?: string
}

/** True when `tc` is a finished artifact tool call whose result actually
 *  reached storage. Used to gate `addOrUpdateArtifact` on tool-output and
 *  to decide whether to render an `ArtifactIndicator` (vs. a failed
 *  `ToolCallIndicator`). */
export function isPersistedArtifactToolCall(tc: ToolCallLike): boolean {
  if (tc.state !== "done") return false
  if (!tc.output || typeof tc.output !== "object") return false
  if (tc.toolName !== "create_artifact" && tc.toolName !== "update_artifact") {
    return false
  }
  const out = tc.output as Record<string, unknown>
  if (tc.toolName === "create_artifact") return out.persisted === true
  // update_artifact uses `updated` as the success flag (persisted may be
  // true or false depending on whether storage succeeded after a passing
  // validation; `updated: true` is the contract that the server actually
  // wrote the row).
  return out.updated === true
}

/** Resolve the effective indicator state + error text for a tool call.
 *  Returns the same shape `ToolCallIndicator` consumes. Failed artifact
 *  tool calls (state="done" but persisted/updated=false) get rewritten
 *  to state="error" with the tool's own error message so the indicator
 *  shows red instead of green. */
/**
 * Formats a short user-facing validation error message for the chat UI tool card.
 * Bullet points the reasons without internal model instructions.
 */
export function formatUserFacingValidationError(validationErrors?: string[]): string {
  if (!validationErrors || validationErrors.length === 0) {
    return "Artifact failed validation — the assistant is retrying"
  }
  const bullets = validationErrors.map((e) => `  - ${e}`).join("\n")
  return `Artifact failed validation — the assistant is retrying:\n${bullets}`
}

function resolveUserFacingError(out: Record<string, unknown>, fallback: string): string {
  if (typeof out.userFacingError === "string" && out.userFacingError.trim().length > 0) {
    return out.userFacingError
  }
  if (Array.isArray(out.validationErrors) && out.validationErrors.length > 0) {
    return formatUserFacingValidationError(out.validationErrors as string[])
  }
  if (typeof out.error === "string") {
    // If the error message contains internal instructions meant for the model, strip them out
    if (out.failureReason === "validation" || out.error.includes("Fix these and call the tool again")) {
      const match = out.error.match(/:\n([\s\S]*?)(?:\n\nFix these|\nFix these|$)/)
      if (match && match[1]?.trim()) {
        return `Artifact failed validation — the assistant is retrying:\n${match[1].trim()}`
      }
      return "Artifact failed validation — the assistant is retrying"
    }
    return out.error
  }
  return fallback
}

export function getEffectiveToolState(tc: ToolCallLike): {
  state: ToolCallLike["state"]
  errorText: string | undefined
} {
  if (tc.state === "done" && tc.output && typeof tc.output === "object") {
    const out = tc.output as Record<string, unknown>
    if (tc.toolName === "create_artifact" && out.persisted === false) {
      return {
        state: "error",
        errorText: resolveUserFacingError(out, "Artifact creation failed"),
      }
    }
    if (tc.toolName === "update_artifact" && out.updated === false) {
      return {
        state: "error",
        errorText: resolveUserFacingError(out, "Artifact update failed"),
      }
    }
  }
  return { state: tc.state, errorText: tc.errorText }
}
