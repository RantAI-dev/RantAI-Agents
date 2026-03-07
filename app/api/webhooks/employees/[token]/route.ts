import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ token: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { token } = await params

    const webhook = await prisma.employeeWebhook.findUnique({
      where: { token },
      include: { digitalEmployee: { select: { id: true, status: true } } },
    })

    if (!webhook || !webhook.enabled) {
      return NextResponse.json({ error: "Invalid or disabled webhook" }, { status: 404 })
    }

    if (webhook.digitalEmployee.status !== "ACTIVE") {
      return NextResponse.json({ error: "Employee not active" }, { status: 409 })
    }

    let payload: unknown = null
    try {
      payload = await req.json()
    } catch {
      payload = null
    }

    // Update webhook stats
    await prisma.employeeWebhook.update({
      where: { id: webhook.id },
      data: {
        lastTriggeredAt: new Date(),
        triggerCount: { increment: 1 },
      },
    })

    // Create a run for this trigger
    const { orchestrator } = await import("@/lib/digital-employee")
    const runId = await orchestrator.startRun(webhook.digitalEmployeeId, {
      type: "webhook",
      input: { webhookId: webhook.id, webhookName: webhook.name, payload },
    })

    return NextResponse.json({ received: true, runId })
  } catch (error) {
    console.error("Webhook processing failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
