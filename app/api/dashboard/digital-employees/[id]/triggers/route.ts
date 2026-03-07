import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import type { EmployeeSchedule } from "@/lib/digital-employee/types"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
      select: { id: true, deploymentConfig: true },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const webhooks = await prisma.employeeWebhook.findMany({
      where: { digitalEmployeeId: id },
      orderBy: { createdAt: "desc" },
    })

    const config = employee.deploymentConfig as Record<string, unknown> | null
    const schedules = (config?.schedules as EmployeeSchedule[]) || []

    // Unified trigger list
    const triggers = [
      ...schedules.map((s) => ({
        id: s.id,
        type: "cron" as const,
        name: s.name,
        config: { cron: s.cron, workflowId: s.workflowId },
        enabled: s.enabled,
        triggerCount: 0,
        lastTriggeredAt: null,
        createdAt: null,
      })),
      ...webhooks.map((w) => ({
        id: w.id,
        type: w.type,
        name: w.name,
        token: w.token,
        config: w.config,
        filterRules: w.filterRules,
        enabled: w.enabled,
        triggerCount: w.triggerCount,
        lastTriggeredAt: w.lastTriggeredAt,
        createdAt: w.createdAt,
      })),
    ]

    return NextResponse.json(triggers)
  } catch (error) {
    console.error("Failed to fetch triggers:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const { type, name, config, filterRules } = await req.json()
    if (!type || !name) return NextResponse.json({ error: "type and name required" }, { status: 400 })

    if (type === "cron") {
      // Add to deployment config schedules
      const deployConfig = (employee.deploymentConfig as Record<string, unknown>) || {}
      const schedules = ((deployConfig.schedules as EmployeeSchedule[]) || [])
      const newSchedule: EmployeeSchedule = {
        id: `sched_${Date.now()}`,
        name,
        cron: config?.cron || "0 * * * *",
        workflowId: config?.workflowId,
        input: config?.input,
        enabled: true,
      }
      schedules.push(newSchedule)

      await prisma.digitalEmployee.update({
        where: { id },
        data: { deploymentConfig: { ...deployConfig, schedules } as object },
      })

      return NextResponse.json({ id: newSchedule.id, type: "cron", name, config })
    }

    // Webhook type
    const webhook = await prisma.employeeWebhook.create({
      data: {
        digitalEmployeeId: id,
        type,
        name,
        config: config || {},
        filterRules: filterRules || [],
      },
    })

    return NextResponse.json(webhook)
  } catch (error) {
    console.error("Failed to create trigger:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
