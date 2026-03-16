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

    // Route the trigger through the employee's group container
    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: webhook.digitalEmployeeId },
      select: { id: true, groupId: true },
    })

    if (!employee?.groupId) {
      return NextResponse.json({ error: "Employee has no group" }, { status: 500 })
    }

    const { orchestrator } = await import("@/lib/digital-employee")
    const containerUrl = await orchestrator.getGroupContainerUrl(employee.groupId)
    if (!containerUrl) {
      return NextResponse.json({ error: "Group container not running" }, { status: 503 })
    }

    const group = await prisma.employeeGroup.findUnique({
      where: { id: employee.groupId },
      select: { gatewayToken: true },
    })

    const triggerRes = await fetch(`${containerUrl}/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(group?.gatewayToken ? { Authorization: `Bearer ${group.gatewayToken}` } : {}),
      },
      body: JSON.stringify({
        employeeId: webhook.digitalEmployeeId,
        trigger: {
          type: "webhook",
          input: { webhookId: webhook.id, webhookName: webhook.name, payload },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    const result = await triggerRes.json().catch(() => ({}))

    return NextResponse.json({ received: true, runId: result.runId })
  } catch (error) {
    console.error("Webhook processing failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
