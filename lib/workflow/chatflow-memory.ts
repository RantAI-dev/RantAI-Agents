/**
 * Chatflow Fact Extraction
 *
 * Post-processing helper that extracts facts, preferences, and entities
 * from chatflow conversations using a lightweight LLM call.
 * Called from the stream tee background IIFE in all chatflow entry points.
 */

import { generateObject } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { z } from "zod"
import { updateUserProfile } from "@/lib/memory"
import { DEFAULT_MODEL_ID } from "@/lib/models"

const SOURCES_DELIMITER = "\n\n---SOURCES---\n"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

/** Strip ---SOURCES--- delimiter and everything after from accumulated stream text */
export function stripSources(text: string): string {
  const idx = text.indexOf(SOURCES_DELIMITER)
  return idx >= 0 ? text.substring(0, idx) : text
}

// Same schema as saveMemory tool in chat/route.ts
const extractionSchema = z.object({
  facts: z.array(z.object({
    category: z.string(),
    label: z.string(),
    value: z.string(),
    confidence: z.number().min(0).max(1),
  })).default([]),
  preferences: z.array(z.object({
    category: z.string(),
    preference: z.string(),
    value: z.string(),
  })).default([]),
  entities: z.array(z.object({
    name: z.string(),
    type: z.string(),
  })).default([]),
})

/**
 * Extract facts from a chatflow conversation and save to user profile.
 * Uses a lightweight LLM for structured extraction.
 * Non-fatal — logs errors and returns silently.
 */
export async function extractAndSaveFacts(
  userId: string,
  threadId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    // Skip if messages are too short to contain useful info
    if (userMessage.length < 5 || assistantResponse.length < 10) return

    const { object } = await generateObject({
      model: openrouter(DEFAULT_MODEL_ID),
      schema: extractionSchema,
      prompt: `Extract facts, preferences, and entities from this conversation.

User: ${userMessage}
Assistant: ${assistantResponse}

Rules:
- Only extract explicitly stated information, do not infer
- Facts: personal info (name, age, occupation, etc.)
- Preferences: user preferences (language, product interest, communication channel, etc.)
- Entities: named entities mentioned (people, organizations, locations, dates)
- If nothing to extract, return empty arrays
- Confidence 0.9 for directly stated facts, 0.7 for implied`,
    })

    const { facts, preferences, entities } = object

    if (!facts.length && !preferences.length && !entities.length) return

    // Convert to internal types (same as chat/route.ts:714-743)
    const finalFacts = facts.map(f => ({
      id: `fact_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      subject: "user" as const,
      predicate: f.label,
      object: f.value,
      confidence: f.confidence,
      source: threadId,
      createdAt: new Date(),
    }))

    const finalPreferences = preferences.map(p => ({
      id: `pref_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      category: p.category,
      key: p.preference,
      value: p.value,
      confidence: 0.9,
      source: threadId,
    }))

    await updateUserProfile(
      userId,
      userMessage,
      assistantResponse,
      threadId,
      finalFacts,
      finalPreferences
    )

    console.log(`[Chatflow Memory] Extracted ${facts.length} facts, ${preferences.length} preferences, ${entities.length} entities for ${userId}`)
  } catch (err) {
    console.error("[Chatflow Memory] Fact extraction error (non-fatal):", err)
  }
}
