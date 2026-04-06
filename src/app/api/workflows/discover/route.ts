import { NextResponse } from "next/server"
import { WorkflowPublicDiscoverQuerySchema } from "@/features/workflows-public/schema"
import {
  discoverPublicWorkflows,
  isWorkflowPublicServiceError,
} from "@/features/workflows-public/service"

/**
 * GET /api/workflows/discover?name=fraud&mode=STANDARD&apiEnabled=true
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsedQuery = WorkflowPublicDiscoverQuerySchema.safeParse({
    name: searchParams.get("name") ?? undefined,
    mode: searchParams.get("mode") ?? undefined,
    apiEnabled: searchParams.get("apiEnabled") ?? undefined,
  })
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid query params" }, { status: 400 })
  }

  const result = await discoverPublicWorkflows({
    apiKey: request.headers.get("x-api-key"),
    query: parsedQuery.data,
  })
  if (isWorkflowPublicServiceError(result)) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  if (result.kind === "response") {
    return result.response
  }

  return NextResponse.json(result.body, { status: result.status })
}
