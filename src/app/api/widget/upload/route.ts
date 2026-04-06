import { NextRequest, NextResponse } from "next/server"
import { extractOrigin } from "@/lib/embed"
import {
  WIDGET_CORS_HEADERS,
  isServiceError,
  uploadWidgetFile,
} from "@/features/widget/service"

// POST /api/widget/upload - Handle temporary file uploads
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("X-Widget-Api-Key")
    const origin = extractOrigin(req.headers)

    const formData = await req.formData()
    const file = formData.get("file") as File | null

    const result = await uploadWidgetFile({
      apiKey,
      origin,
      file,
    })

    if (isServiceError(result)) {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          ...(result.retryAfter !== undefined && { retryAfter: result.retryAfter }),
          ...(result.domain && { domain: result.domain }),
        },
        { status: result.status }
      )
    }

    return NextResponse.json(result)
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
      ...WIDGET_CORS_HEADERS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  })
}
