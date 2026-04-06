import { NextRequest, NextResponse } from "next/server"
import { extractOrigin } from "@/lib/embed"
import {
  getWidgetConfig,
  isServiceError,
} from "@/features/widget/service"

// GET /api/widget/config?key=rantai_live_... - Get widget configuration
export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key")
    const origin = extractOrigin(req.headers)

    const result = await getWidgetConfig({ apiKey: key, origin })
    if (isServiceError(result)) {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          ...(result.domain && { domain: result.domain }),
        },
        { status: result.status }
      )
    }

    return NextResponse.json(result)
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
