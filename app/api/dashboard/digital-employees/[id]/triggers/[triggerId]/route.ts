import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import type { EmployeeSchedule } from "@/lib/digital-employee/types"

interface RouteParams {
  params: Promise<{ id: string; triggerId: string }>
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id, triggerId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const { name, config, enabled, filterRules } = await req.json()

    // Check if it's a cron schedule (stored in deploymentConfig)
    const deployConfig = (employee.deploymentConfig as Record<string, unknown>) || {}
    const schedules = ((deployConfig.schedules as EmployeeSchedule[]) || [])
    const schedIdx = schedules.findIndex((s) => s.id === triggerId)

    if (schedIdx >= 0) {
      if (name !== undefined) schedules[schedIdx].name = name
      if (config?.cron !== undefined) schedules[schedIdx].cron = config.cron
      if (enabled !== undefined) schedules[schedIdx].enabled = enabled
      if (config?.workflowId !== undefined) schedules[schedIdx].workflowId = config.workflowId

      await prisma.digitalEmployee.update({
        where: { id },
        data: { deploymentConfig: { ...deployConfig, schedules } as object },
      })
      return NextResponse.json(schedules[schedIdx])
    }

    // Otherwise it's a webhook
    const webhook = await prisma.employeeWebhook.update({
      where: { id: triggerId },
      data: {
        ...(name !== undefined && { name }),
        ...(config !== undefined && { config }),
        ...(enabled !== undefined && { enabled }),
        ...(filterRules !== undefined && { filterRules }),
      },
    })
    return NextResponse.json(webhook)
  } catch (error) {
    console.error("Failed to update trigger:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id, triggerId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Try cron schedule first
    const deployConfig = (employee.deploymentConfig as Record<string, unknown>) || {}
    const schedules = ((deployConfig.schedules as EmployeeSchedule[]) || [])
    const schedIdx = schedules.findIndex((s) => s.id === triggerId)

    if (schedIdx >= 0) {
      schedules.splice(schedIdx, 1)
      await prisma.digitalEmployee.update({
        where: { id },
        data: { deploymentConfig: { ...deployConfig, schedules } as object },
      })
      return NextResponse.json({ success: true })
    }

    // Otherwise webhook
    await prisma.employeeWebhook.delete({ where: { id: triggerId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete trigger:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
