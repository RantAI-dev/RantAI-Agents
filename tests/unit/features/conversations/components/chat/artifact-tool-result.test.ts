// @vitest-environment node
import { describe, it, expect } from "vitest"
import {
  isPersistedArtifactToolCall,
  getEffectiveToolState,
  formatUserFacingValidationError,
} from "@/features/conversations/components/chat/artifact-tool-result"

/** Build a tool-call-like object with sensible defaults so each test only
 *  has to override the field it cares about. */
function tc(overrides: {
  toolName?: string
  state?: "input-streaming" | "input-available" | "execution-started" | "done" | "error"
  output?: unknown
  errorText?: string
} = {}) {
  return {
    toolName: "create_artifact" as string,
    state: "done" as const,
    output: undefined as unknown,
    errorText: undefined as string | undefined,
    ...overrides,
  }
}

describe("isPersistedArtifactToolCall", () => {
  describe("create_artifact", () => {
    it("returns true when persisted is exactly true", () => {
      expect(
        isPersistedArtifactToolCall(
          tc({ output: { id: "a", title: "T", type: "text/html", content: "...", persisted: true } }),
        ),
      ).toBe(true)
    })

    it("returns false when persisted is false (validation rejected, error returned alongside input)", () => {
      // This is the bug-fix case — previously the chat-workspace happily
      // added this to the artifact map, leaving the user with a "ghost"
      // indicator pointing at content the server rejected.
      expect(
        isPersistedArtifactToolCall(
          tc({
            output: {
              id: "a",
              title: "T",
              type: "text/html",
              content: "<broken>",
              persisted: false,
              error: "Missing DOCTYPE",
            },
          }),
        ),
      ).toBe(false)
    })

    it("returns false when persisted is missing entirely", () => {
      expect(
        isPersistedArtifactToolCall(
          tc({ output: { id: "a", title: "T", type: "text/html", content: "..." } }),
        ),
      ).toBe(false)
    })

    it("returns false when persisted is the string 'true' (only the boolean counts)", () => {
      expect(
        isPersistedArtifactToolCall(
          tc({ output: { id: "a", title: "T", type: "text/html", content: "...", persisted: "true" } }),
        ),
      ).toBe(false)
    })
  })

  describe("update_artifact", () => {
    it("returns true when updated is exactly true", () => {
      expect(
        isPersistedArtifactToolCall(
          tc({ toolName: "update_artifact", output: { id: "a", content: "...", updated: true } }),
        ),
      ).toBe(true)
    })

    it("returns false when updated is false (concurrent conflict / missing artifact)", () => {
      expect(
        isPersistedArtifactToolCall(
          tc({
            toolName: "update_artifact",
            output: { id: "a", content: "...", updated: false, error: "Concurrent update detected" },
          }),
        ),
      ).toBe(false)
    })

    it("returns false even when persisted is true if updated is false", () => {
      // The contract for update is `updated`, not `persisted` — make sure
      // we use the right flag for each tool.
      expect(
        isPersistedArtifactToolCall(
          tc({
            toolName: "update_artifact",
            output: { id: "a", content: "...", persisted: true, updated: false },
          }),
        ),
      ).toBe(false)
    })
  })

  describe("guards", () => {
    it("returns false when state is not 'done'", () => {
      expect(
        isPersistedArtifactToolCall(
          tc({ state: "input-streaming", output: { id: "a", persisted: true, type: "text/html", content: "...", title: "t" } }),
        ),
      ).toBe(false)
    })

    it("returns false when output is missing", () => {
      expect(isPersistedArtifactToolCall(tc({ output: undefined }))).toBe(false)
    })

    it("returns false when output is a primitive (string, number, null)", () => {
      expect(isPersistedArtifactToolCall(tc({ output: "hello" }))).toBe(false)
      expect(isPersistedArtifactToolCall(tc({ output: 42 }))).toBe(false)
      expect(isPersistedArtifactToolCall(tc({ output: null }))).toBe(false)
    })

    it("returns false for non-artifact tool calls even when output looks artifact-like", () => {
      expect(
        isPersistedArtifactToolCall(
          tc({ toolName: "knowledge_search", output: { id: "a", persisted: true, type: "text/html", content: "..." } }),
        ),
      ).toBe(false)
    })
  })
})

describe("getEffectiveToolState", () => {
  it("rewrites done create_artifact with persisted=false to error state with the tool's own message", () => {
    const result = getEffectiveToolState(
      tc({ output: { id: "a", title: "T", type: "text/html", content: "<broken>", persisted: false, error: "Missing DOCTYPE" } }),
    )
    expect(result.state).toBe("error")
    expect(result.errorText).toBe("Missing DOCTYPE")
  })

  it("rewrites done update_artifact with updated=false to error state", () => {
    const result = getEffectiveToolState(
      tc({
        toolName: "update_artifact",
        output: { id: "a", content: "...", updated: false, error: "Concurrent update detected" },
      }),
    )
    expect(result.state).toBe("error")
    expect(result.errorText).toBe("Concurrent update detected")
  })

  it("falls back to a generic error message when persisted=false but error is missing", () => {
    const result = getEffectiveToolState(
      tc({ output: { id: "a", persisted: false } }),
    )
    expect(result.state).toBe("error")
    expect(result.errorText).toBe("Artifact creation failed")
  })

  it("passes the original state through for successful artifact tool calls", () => {
    const result = getEffectiveToolState(
      tc({ output: { id: "a", title: "T", type: "text/html", content: "...", persisted: true } }),
    )
    expect(result.state).toBe("done")
    expect(result.errorText).toBeUndefined()
  })

  it("passes the original state and errorText through for non-artifact tool calls", () => {
    const result = getEffectiveToolState(
      tc({ toolName: "knowledge_search", state: "error", errorText: "API failure", output: { error: "API failure" } }),
    )
    expect(result.state).toBe("error")
    expect(result.errorText).toBe("API failure")
  })

  it("does not rewrite state when create_artifact persisted is missing (legacy or unknown contract)", () => {
    const result = getEffectiveToolState(
      tc({ output: { id: "a", title: "T", type: "text/html", content: "..." } }),
    )
    // Without `persisted: false` we don't know it failed — leave the state
    // alone rather than guessing.
    expect(result.state).toBe("done")
  })
})

describe("formatUserFacingValidationError", () => {
  it("formats validation errors as bullets without model instructions", () => {
    const formatted = formatUserFacingValidationError([
      "Model URL is not in the verified whitelist",
      "Missing export default",
    ])
    expect(formatted).toBe(
      "Artifact failed validation — the assistant is retrying:\n  - Model URL is not in the verified whitelist\n  - Missing export default",
    )
    expect(formatted).not.toMatch(/Fix these and call the tool again/i)
    expect(formatted).not.toMatch(/do not truncate/i)
  })

  it("handles empty or missing errors array gracefully", () => {
    expect(formatUserFacingValidationError()).toBe(
      "Artifact failed validation — the assistant is retrying",
    )
    expect(formatUserFacingValidationError([])).toBe(
      "Artifact failed validation — the assistant is retrying",
    )
  })
})

describe("getEffectiveToolState — TC-1514 user-facing validation shaping", () => {
  it("prefers userFacingError over internal model error on failed create_artifact", () => {
    const modelError =
      "Your application/3d artifact has issues that will prevent it from rendering correctly:\n  - Model URL must be from the verified whitelist\n\nFix these and call the tool again with the corrected content. Output the COMPLETE corrected artifact — do not truncate."
    const userFacingError =
      "Artifact failed validation — the assistant is retrying:\n  - Model URL must be from the verified whitelist"

    const result = getEffectiveToolState(
      tc({
        output: {
          id: "art-3d",
          title: "Scene",
          type: "application/3d",
          persisted: false,
          failureReason: "validation",
          error: modelError,
          userFacingError,
          validationErrors: ["Model URL must be from the verified whitelist"],
        },
      }),
    )

    expect(result.state).toBe("error")
    expect(result.errorText).toBe(userFacingError)
    expect(result.errorText).not.toContain("Fix these and call the tool again")
    expect(result.errorText).not.toContain("do not truncate")
  })

  it("derives user-facing message from validationErrors when userFacingError is absent", () => {
    const modelError =
      "Your application/3d artifact has issues that will prevent it from rendering correctly:\n  - Non-whitelisted model\n\nFix these and call the tool again with the corrected content. Output the COMPLETE corrected artifact — do not truncate."

    const result = getEffectiveToolState(
      tc({
        output: {
          id: "art-3d",
          title: "Scene",
          type: "application/3d",
          persisted: false,
          failureReason: "validation",
          error: modelError,
          validationErrors: ["Non-whitelisted model"],
        },
      }),
    )

    expect(result.state).toBe("error")
    expect(result.errorText).toBe(
      "Artifact failed validation — the assistant is retrying:\n  - Non-whitelisted model",
    )
    expect(result.errorText).not.toContain("Fix these and call the tool again")
  })

  it("strips internal instructions when error contains call the tool again but validationErrors is missing", () => {
    const modelError =
      "Your text/document artifact has issues that will prevent it from rendering correctly:\n  - SyntaxError: Unexpected token\n\nFix these and call the tool again with the corrected content. Output the COMPLETE corrected artifact — do not truncate."

    const result = getEffectiveToolState(
      tc({
        output: {
          id: "doc-1",
          persisted: false,
          error: modelError,
        },
      }),
    )

    expect(result.state).toBe("error")
    expect(result.errorText).toBe(
      "Artifact failed validation — the assistant is retrying:\n- SyntaxError: Unexpected token",
    )
    expect(result.errorText).not.toContain("Fix these and call the tool again")
    expect(result.errorText).not.toContain("do not truncate")
  })

  it("handles update_artifact with userFacingError on validation failure", () => {
    const result = getEffectiveToolState(
      tc({
        toolName: "update_artifact",
        output: {
          id: "art-1",
          updated: false,
          persisted: false,
          failureReason: "validation",
          error: "internal model instruction",
          userFacingError: "Artifact failed validation — the assistant is retrying:\n  - Bad syntax",
          validationErrors: ["Bad syntax"],
        },
      }),
    )

    expect(result.state).toBe("error")
    expect(result.errorText).toBe(
      "Artifact failed validation — the assistant is retrying:\n  - Bad syntax",
    )
  })
})
