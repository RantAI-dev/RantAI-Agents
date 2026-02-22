import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
})

const META_PROMPT = `You are an expert AI agent designer. Given a short description of an agent, generate a complete system prompt for it.

Output format - return ONLY the system prompt using this exact structure:

## Goal
[1-3 sentences describing the agent's main purpose and objective]

## Skills
[Bullet list of 4-6 key capabilities and specialized knowledge areas]

## Workflow
[Numbered list of 3-5 steps describing how the agent should approach tasks and interact with users]

## Constraints
[Bullet list of 3-5 important limitations, guidelines for behavior, and boundaries]

Also output a suggested agent name and a single emoji that best represents the agent.

Format your entire response as:
NAME: [suggested name]
EMOJI: [single emoji]
PROMPT:
[the structured system prompt]`

/**
 * POST /api/assistants/generate-prompt
 * Generate a structured system prompt from a short description using AI.
 */
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { description } = body

    if (!description || typeof description !== "string" || description.trim().length < 5) {
      return NextResponse.json(
        { error: "Please provide a description of at least 5 characters" },
        { status: 400 }
      )
    }

    const { text } = await generateText({
      model: openrouter("openai/gpt-4o-mini"),
      system: META_PROMPT,
      prompt: `Create an AI agent for: ${description.trim()}`,
    })

    // Parse the response
    const nameMatch = text.match(/^NAME:\s*(.+)$/m)
    const emojiMatch = text.match(/^EMOJI:\s*(.+)$/m)
    const promptMatch = text.match(/PROMPT:\s*\n([\s\S]+)$/)

    const suggestedName = nameMatch?.[1]?.trim() || ""
    const suggestedEmoji = emojiMatch?.[1]?.trim() || "🤖"
    const systemPrompt = promptMatch?.[1]?.trim() || text.trim()

    return NextResponse.json({
      systemPrompt,
      suggestedName,
      suggestedEmoji,
    })
  } catch (error) {
    console.error("[Generate Prompt] Error:", error)
    return NextResponse.json(
      { error: "Failed to generate prompt" },
      { status: 500 }
    )
  }
}
