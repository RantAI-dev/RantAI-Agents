import { NextRequest, NextResponse } from "next/server"
import { streamText, convertToModelMessages } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { prisma } from "@/lib/prisma"
import {
  validateDomain,
  extractOrigin,
  validateApiKeyFormat,
  checkRateLimit,
} from "@/lib/embed"
import { smartRetrieve, formatContextForPrompt } from "@/lib/rag"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

// POST /api/widget/chat - Handle widget chat messages (streaming)
export async function POST(req: NextRequest) {
  try {
    // Get API key from header
    const apiKey = req.headers.get("X-Widget-Api-Key")

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required", code: "MISSING_KEY" },
        { status: 401 }
      )
    }

    if (!validateApiKeyFormat(apiKey)) {
      return NextResponse.json(
        { error: "Invalid API key format", code: "INVALID_KEY_FORMAT" },
        { status: 400 }
      )
    }

    // Find the API key
    const embedKey = await prisma.embedApiKey.findFirst({
      where: { key: apiKey, enabled: true },
    })

    if (!embedKey) {
      return NextResponse.json(
        { error: "API key not found or disabled", code: "INVALID_KEY" },
        { status: 401 }
      )
    }

    // Validate domain
    const origin = extractOrigin(req.headers)
    const domainValidation = validateDomain(origin, embedKey.allowedDomains)

    if (!domainValidation.valid) {
      return NextResponse.json(
        {
          error: "Domain not allowed",
          code: "DOMAIN_NOT_ALLOWED",
          domain: domainValidation.domain,
        },
        { status: 403 }
      )
    }

    // Check rate limit
    const rateLimit = checkRateLimit(embedKey.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: rateLimit.resetIn,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.resetIn),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rateLimit.resetIn),
          },
        }
      )
    }

    // Parse request body
    const body = await req.json()
    const { messages: rawMessages } = body

    if (!rawMessages || !Array.isArray(rawMessages)) {
      return NextResponse.json(
        { error: "Messages are required", code: "MISSING_MESSAGES" },
        { status: 400 }
      )
    }

    // Fetch assistant
    const assistant = await prisma.assistant.findUnique({
      where: { id: embedKey.assistantId },
    })

    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found", code: "ASSISTANT_NOT_FOUND" },
        { status: 404 }
      )
    }

    // Normalize messages to UIMessage format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uiMessages = rawMessages.map(
      (msg: { id?: string; role: string; content?: string; parts?: Array<{ type: string; text?: string }> }) => {
        if (msg.parts) {
          return msg
        }
        return {
          id: msg.id || `msg-${Date.now()}`,
          role: msg.role,
          parts: [{ type: "text", text: msg.content || "" }],
        }
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[]

    const messages = await convertToModelMessages(uiMessages)

    // Build system prompt
    let systemPrompt = assistant.systemPrompt

    // RAG retrieval if enabled
    if (assistant.useKnowledgeBase) {
      const lastUserMessage = [...messages]
        .reverse()
        .find((msg) => msg.role === "user")

      if (lastUserMessage) {
        try {
          const userQuery =
            typeof lastUserMessage.content === "string"
              ? lastUserMessage.content
              : lastUserMessage.content
                  .filter(
                    (part): part is { type: "text"; text: string } =>
                      part.type === "text"
                  )
                  .map((part) => part.text)
                  .join(" ")

          const retrievalResult = await smartRetrieve(userQuery, {
            minSimilarity: 0.35,
            maxChunks: 5,
            groupIds: assistant.knowledgeBaseGroupIds,
          })

          if (retrievalResult.context) {
            const formattedContext = formatContextForPrompt(retrievalResult)
            systemPrompt = `${systemPrompt}\n\n${formattedContext}`
          }
        } catch (error) {
          console.error("[Widget Chat] RAG error:", error)
        }
      }
    }

    // Update usage stats (async, non-blocking)
    prisma.embedApiKey
      .update({
        where: { id: embedKey.id },
        data: {
          requestCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      })
      .catch(console.error)

    // Stream response
    const result = streamText({
      model: openrouter("xiaomi/mimo-v2-flash"),
      system: systemPrompt,
      messages,
    })

    const response = result.toTextStreamResponse()

    // Add CORS headers
    response.headers.set("Access-Control-Allow-Origin", "*")
    response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining))

    return response
  } catch (error) {
    console.error("[Widget Chat API] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Widget-Api-Key",
    },
  })
}
