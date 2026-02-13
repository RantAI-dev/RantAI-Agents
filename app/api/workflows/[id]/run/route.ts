import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { workflowEngine } from "@/lib/workflow"
import { executeChatflow } from "@/lib/workflow/chatflow"
import { checkRateLimit } from "@/lib/embed/rate-limiter"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/workflows/[id]/run — Public workflow execution endpoint.
 *
 * Authentication via x-api-key header matching workflow.apiKey.
 * Returns run result for STANDARD mode, or streaming response for CHATFLOW mode.
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const apiKey = req.headers.get("x-api-key")

    if (!apiKey) {
      return NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 })
    }

    // Find workflow by ID and validate API key
    const workflow = await prisma.workflow.findUnique({
      where: { id },
    })

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    if (!workflow.apiEnabled || workflow.apiKey !== apiKey) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 403 })
    }

    // Rate limiting: 100 requests per minute per API key
    const rateLimit = checkRateLimit(`workflow:${apiKey}`)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimit.resetIn },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.resetIn) },
        }
      )
    }

    if (workflow.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Workflow is not active", status: workflow.status },
        { status: 400 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const input = body.input || {}

    // CHATFLOW mode — return streaming response
    if (workflow.mode === "CHATFLOW") {
      const message = typeof input === "string" ? input : input.message || JSON.stringify(input)
      const { response } = await executeChatflow(workflow, message)
      return response
    }

    // STANDARD mode — execute and return result
    const runId = await workflowEngine.execute(id, input)
    const run = await prisma.workflowRun.findUnique({
      where: { id: runId },
    })

    return NextResponse.json({
      runId: run?.id,
      status: run?.status,
      output: run?.output,
      error: run?.error,
      startedAt: run?.startedAt,
      completedAt: run?.completedAt,
    })
  } catch (error) {
    console.error("[Workflow API] Execution error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Execution failed" },
      { status: 500 }
    )
  }
}
