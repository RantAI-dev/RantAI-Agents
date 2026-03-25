import { NextResponse } from "next/server"
import {
  WorkflowPublicIdParamsSchema,
  WorkflowPublicRunBodySchema,
} from "@/src/features/workflows-public/schema"
import {
  isWorkflowPublicServiceError,
  runPublicWorkflowById,
} from "@/src/features/workflows-public/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

function parseJsonOrDefault(rawBody: string): unknown {
  if (!rawBody.trim()) {
    return {}
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    return {}
  }
}

/**
 * POST /api/workflows/[id]/run - Public workflow execution endpoint.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const parsedParams = WorkflowPublicIdParamsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid workflow id" }, { status: 400 })
  }

  const rawBody = await req.text()
  const parsedBody = WorkflowPublicRunBodySchema.safeParse(parseJsonOrDefault(rawBody))
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const result = await runPublicWorkflowById({
    workflowId: parsedParams.data.id,
    apiKey: req.headers.get("x-api-key"),
    input: parsedBody.data.input ?? {},
  })

  if (isWorkflowPublicServiceError(result)) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.body ?? {}),
      },
      {
        status: result.status,
        ...(result.headers ? { headers: result.headers } : {}),
      }
    )
  }

  if (result.kind === "response") {
    return result.response
  }

  return NextResponse.json(result.body, {
    status: result.status,
    ...(result.headers ? { headers: result.headers } : {}),
  })
}
