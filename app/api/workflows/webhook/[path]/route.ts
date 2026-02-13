import { NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { prisma } from "@/lib/prisma"
import { workflowEngine } from "@/lib/workflow"
import { executeChatflow } from "@/lib/workflow/chatflow"

type RouteParams = { params: Promise<{ path: string }> }

/**
 * Verify HMAC-SHA256 webhook signature.
 * Expects header: x-webhook-signature: sha256=<hex>
 */
function verifyWebhookSignature(
  payload: string,
  secret: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false

  const expectedSig = createHmac("sha256", secret).update(payload).digest("hex")
  const expected = `sha256=${expectedSig}`

  if (expected.length !== signatureHeader.length) return false

  try {
    return timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader)
    )
  } catch {
    return false
  }
}

/**
 * POST /api/workflows/webhook/[path] — Webhook trigger handler.
 *
 * Looks up a workflow whose trigger.webhookPath matches [path],
 * then executes it with the request body as input.
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { path } = await params

    if (!path) {
      return NextResponse.json({ error: "Missing webhook path" }, { status: 400 })
    }

    // Find active workflow with matching webhook trigger path
    const workflows = await prisma.workflow.findMany({
      where: { status: "ACTIVE" },
    })

    const workflow = workflows.find((w) => {
      const trigger = w.trigger as { type?: string; webhookPath?: string }
      return trigger?.type === "webhook" && trigger?.webhookPath === path
    })

    if (!workflow) {
      return NextResponse.json(
        { error: "No workflow found for webhook path" },
        { status: 404 }
      )
    }

    // Read raw body for signature verification
    const rawBody = await req.text()

    // Verify webhook signature if secret is configured
    const trigger = workflow.trigger as { webhookSecret?: string }
    if (trigger?.webhookSecret) {
      const signature = req.headers.get("x-webhook-signature")
      if (!verifyWebhookSignature(rawBody, trigger.webhookSecret, signature)) {
        return NextResponse.json(
          { error: "Invalid webhook signature" },
          { status: 401 }
        )
      }
    }

    // Parse body
    const body = (() => { try { return JSON.parse(rawBody) } catch { return {} } })()
    const input = {
      ...body,
      _webhook: {
        path,
        method: "POST",
        headers: Object.fromEntries(req.headers.entries()),
        receivedAt: new Date().toISOString(),
      },
    }

    // CHATFLOW mode — streaming response
    if (workflow.mode === "CHATFLOW") {
      const message = typeof body === "string"
        ? body
        : body.message || JSON.stringify(body)
      const { response } = await executeChatflow(workflow, message)
      return response
    }

    // STANDARD mode — execute and return result
    const runId = await workflowEngine.execute(workflow.id, input)
    const run = await prisma.workflowRun.findUnique({
      where: { id: runId },
    })

    return NextResponse.json({
      runId: run?.id,
      status: run?.status,
      output: run?.output,
      startedAt: run?.startedAt,
      completedAt: run?.completedAt,
    })
  } catch (error) {
    console.error("[Webhook] Execution error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook execution failed" },
      { status: 500 }
    )
  }
}

// Also support GET for webhook testing/ping
export async function GET(req: Request, { params }: RouteParams) {
  const { path } = await params

  const workflows = await prisma.workflow.findMany({
    where: { status: "ACTIVE" },
  })

  const workflow = workflows.find((w) => {
    const trigger = w.trigger as { type?: string; webhookPath?: string }
    return trigger?.type === "webhook" && trigger?.webhookPath === path
  })

  if (!workflow) {
    return NextResponse.json(
      { error: "No workflow found for webhook path" },
      { status: 404 }
    )
  }

  return NextResponse.json({
    webhook: path,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: "ready",
  })
}
