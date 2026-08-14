import { describe, expect, it } from "vitest"
import { parseNewChatDraft } from "@/features/conversations/components/chat/pages/new-chat-draft"

describe("parseNewChatDraft", () => {
  it("restores a valid draft", () => {
    expect(
      parseNewChatDraft(
        JSON.stringify({
          input: "Unsent prompt",
          webSearchOverride: true,
          codeInterpreterOverride: false,
          selectedKBGroupIds: ["kb-1"],
          toolMode: "select",
          selectedToolNames: ["web_search"],
          skillMode: "off",
          selectedSkillIds: [],
          canvasMode: "application/code",
          updatedAt: 123,
        }),
      ),
    ).toEqual({
      input: "Unsent prompt",
      webSearchOverride: true,
      codeInterpreterOverride: false,
      selectedKBGroupIds: ["kb-1"],
      toolMode: "select",
      selectedToolNames: ["web_search"],
      skillMode: "off",
      selectedSkillIds: [],
      canvasMode: "application/code",
      updatedAt: 123,
    })
  })

  it("rejects malformed storage and normalizes unsafe fields", () => {
    expect(parseNewChatDraft("not-json")).toBeNull()
    expect(parseNewChatDraft(JSON.stringify({ input: 42 }))).toBeNull()

    const parsed = parseNewChatDraft(
      JSON.stringify({
        input: "Draft",
        selectedKBGroupIds: ["kb-1", 2],
        toolMode: "invalid",
        selectedToolNames: ["tool-1", null],
        skillMode: "invalid",
      }),
    )

    expect(parsed).toMatchObject({
      input: "Draft",
      selectedKBGroupIds: ["kb-1"],
      toolMode: "auto",
      selectedToolNames: ["tool-1"],
      skillMode: "auto",
      selectedSkillIds: [],
      canvasMode: false,
    })
  })
})
