import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { orchestrator } from "@/lib/digital-employee"
import type { TriggerContext } from "@/lib/digital-employee/types"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
      select: { id: true, status: true, groupId: true },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    if (employee.status !== "ACTIVE") {
      return NextResponse.json({ error: "Employee must be ACTIVE to run" }, { status: 400 })
    }

    const containerUrl = await orchestrator.getGroupContainerUrl(employee.groupId)
    if (!containerUrl) {
      return NextResponse.json({ error: "Group container not running" }, { status: 503 })
    }

    const group = await prisma.employeeGroup.findUnique({
      where: { id: employee.groupId },
      select: { gatewayToken: true },
    })

    const body = await req.json().catch(() => ({}))

    const trigger: TriggerContext = {
      type: body.trigger || "manual",
      workflowId: body.workflowId,
      input: body.input,
    }

    const res = await fetch(`${containerUrl}/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(group?.gatewayToken ? { Authorization: `Bearer ${group.gatewayToken}` } : {}),
      },
      body: JSON.stringify({ employeeId: id, trigger }),
      signal: AbortSignal.timeout(30_000),
    })

    const result = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: result.error || "Run failed" }, { status: res.status })
    }

    return NextResponse.json({ runId: result.runId }, { status: 201 })
  } catch (error) {
    console.error("Run failed:", error)
    const message = error instanceof Error ? error.message : "Run failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
