import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  validateDomain,
  extractOrigin,
  validateApiKeyFormat,
  checkRateLimit,
} from "@/lib/embed"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
]

// POST /api/widget/upload - Handle temporary file uploads
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
        { status: 429 }
      )
    }

    // Parse form data
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "No file provided", code: "MISSING_FILE" },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `File type not allowed. Allowed types: ${ALLOWED_TYPES.join(", ")}`,
          code: "INVALID_FILE_TYPE",
        },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          code: "FILE_TOO_LARGE",
        },
        { status: 400 }
      )
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // For text files, extract content directly
    let extractedContent = ""
    if (file.type === "text/plain" || file.type === "text/markdown") {
      extractedContent = buffer.toString("utf-8")
    }

    // For images, we'll return base64 for client to include in message
    const base64Data = buffer.toString("base64")

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      base64: file.type.startsWith("image/") ? base64Data : undefined,
      content: extractedContent || undefined,
      message:
        file.type.startsWith("image/")
          ? "Image uploaded. Include in your next message."
          : file.type === "application/pdf"
            ? "PDF uploaded. Content will be processed with your next message."
            : "File uploaded successfully.",
    })
  } catch (error) {
    console.error("[Widget Upload API] Error:", error)
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
