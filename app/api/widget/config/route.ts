import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateDomain, extractOrigin, validateApiKeyFormat } from "@/lib/embed"
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@/lib/embed/types"
import { brand } from "@/lib/branding"

// GET /api/widget/config?key=rantai_live_... - Get widget configuration
export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key")

    if (!key) {
      return NextResponse.json(
        { error: "API key is required", code: "MISSING_KEY" },
        { status: 400 }
      )
    }

    if (!validateApiKeyFormat(key)) {
      return NextResponse.json(
        { error: "Invalid API key format", code: "INVALID_KEY_FORMAT" },
        { status: 400 }
      )
    }

    // Find the API key
    const embedKey = await prisma.embedApiKey.findFirst({
      where: { key, enabled: true },
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

    // Fetch assistant details
    const assistant = await prisma.assistant.findUnique({
      where: { id: embedKey.assistantId },
      select: {
        id: true,
        name: true,
        emoji: true,
        description: true,
        liveChatEnabled: true,
      },
    })

    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found", code: "ASSISTANT_NOT_FOUND" },
        { status: 404 }
      )
    }

    // Merge config with defaults
    const config: WidgetConfig = {
      ...DEFAULT_WIDGET_CONFIG,
      ...(embedKey.config as object),
    }

    // Update last used timestamp (async, non-blocking)
    prisma.embedApiKey
      .update({
        where: { id: embedKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(console.error)

    // Return public config
    return NextResponse.json({
      assistantId: assistant.id,
      assistantName: assistant.name,
      assistantEmoji: assistant.emoji,
      assistantDescription: assistant.description,
      liveChatEnabled: assistant.liveChatEnabled,
      config,
      poweredByText: brand.poweredByText,
      poweredByUrl: brand.companyUrl,
    })
  } catch (error) {
    console.error("[Widget Config API] Error:", error)
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
