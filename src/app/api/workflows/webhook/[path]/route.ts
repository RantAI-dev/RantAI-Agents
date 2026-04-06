import { NextResponse } from "next/server"
import { WorkflowPublicWebhookParamsSchema } from "@/features/workflows-public/schema"
import {
  executePublicWorkflowWebhookPost,
  getPublicWorkflowWebhookStatus,
  isWorkflowPublicServiceError,
} from "@/features/workflows-public/service"

type RouteParams = { params: Promise<{ path: string }> }

/**
 * POST /api/workflows/webhook/[path] - Webhook trigger handler.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const parsedParams = WorkflowPublicWebhookParamsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Missing webhook path" }, { status: 400 })
  }

  const result = await executePublicWorkflowWebhookPost({
    path: parsedParams.data.path,
    rawBody: await req.text(),
    signatureHeader: req.headers.get("x-webhook-signature"),
    requestHeaders: Object.fromEntries(req.headers.entries()),
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

/**
 * GET /api/workflows/webhook/[path] - Webhook testing/ping endpoint.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const parsedParams = WorkflowPublicWebhookParamsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Missing webhook path" }, { status: 400 })
  }

  const result = await getPublicWorkflowWebhookStatus(parsedParams.data.path)
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.body, { status: result.status })
}
