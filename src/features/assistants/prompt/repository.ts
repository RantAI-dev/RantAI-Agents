import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

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

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
})

export async function generateAssistantPromptText(description: string) {
  const { text } = await generateText({
    model: openrouter("openai/gpt-4o-mini"),
    system: META_PROMPT,
    prompt: `Create an AI agent for: ${description.trim()}`,
  })

  return text
}
