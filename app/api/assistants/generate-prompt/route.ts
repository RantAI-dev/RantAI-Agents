import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { GenerateAssistantPromptBodySchema } from "@/src/features/assistants/prompt/schema"
import { generateAssistantPrompt } from "@/src/features/assistants/prompt/service"

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

    const parsed = GenerateAssistantPromptBodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a description of at least 5 characters" },
        { status: 400 }
      )
    }

    const result = await generateAssistantPrompt(parsed.data)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Generate Prompt] Error:", error)
    return NextResponse.json(
      { error: "Failed to generate prompt" },
      { status: 500 }
    )
  }
}
