// @vitest-environment node
import { describe, it, expect } from "vitest"
import { CreateAssistantSchema, UpdateAssistantSchema } from "@/features/assistants/core/schema"

describe("TC-1016: System prompt minimum length validation (20 chars)", () => {
  describe("CreateAssistantSchema", () => {
    it("rejects system prompt shorter than 20 characters (19 chars)", () => {
      const shortPrompt = "1234567890123456789" // 19 chars
      const result = CreateAssistantSchema.safeParse({
        name: "Test Assistant",
        systemPrompt: shortPrompt,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const error = result.error.format()
        expect(error.systemPrompt?._errors[0]).toBe("System prompt must be at least 20 characters")
      }
    })

    it("rejects 1-character system prompt", () => {
      const result = CreateAssistantSchema.safeParse({
        name: "Test Assistant",
        systemPrompt: "a",
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("System prompt must be at least 20 characters")
      }
    })

    it("accepts system prompt with exactly 20 characters (positive control)", () => {
      const validPrompt = "12345678901234567890" // 20 chars
      const result = CreateAssistantSchema.safeParse({
        name: "Test Assistant",
        systemPrompt: validPrompt,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.systemPrompt).toBe(validPrompt)
      }
    })

    it("accepts system prompt longer than 20 characters (positive control)", () => {
      const validPrompt = "You are an expert AI software architect and technical leader."
      const result = CreateAssistantSchema.safeParse({
        name: "Test Assistant",
        systemPrompt: validPrompt,
      })
      expect(result.success).toBe(true)
    })
  })

  describe("UpdateAssistantSchema", () => {
    it("allows omitting systemPrompt during update (positive control)", () => {
      const result = UpdateAssistantSchema.safeParse({
        name: "Updated Name",
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.systemPrompt).toBeUndefined()
      }
    })

    it("rejects system prompt shorter than 20 characters when provided", () => {
      const result = UpdateAssistantSchema.safeParse({
        systemPrompt: "Too short prompt", // 16 chars
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe("System prompt must be at least 20 characters")
      }
    })

    it("accepts valid system prompt when provided on update (positive control)", () => {
      const validPrompt = "This is a valid prompt that has more than 20 chars."
      const result = UpdateAssistantSchema.safeParse({
        systemPrompt: validPrompt,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.systemPrompt).toBe(validPrompt)
      }
    })
  })
})
