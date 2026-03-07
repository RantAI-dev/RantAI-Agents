import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import {
  WORKSPACE_FILES,
  DEFAULT_DEPLOYMENT_CONFIG,
  type WorkspaceFileContext,
} from "@/lib/digital-employee/types"
import { hasPermission } from "@/lib/digital-employee/rbac"
import { logAudit, classifyActionRisk, AUDIT_ACTIONS } from "@/lib/digital-employee/audit"

// GET /api/dashboard/digital-employees - List employees
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)

    const employees = await prisma.digitalEmployee.findMany({
      where: {
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
      include: {
        assistant: { select: { id: true, name: true, emoji: true, model: true } },
        runs: { take: 1, orderBy: { startedAt: "desc" }, select: { status: true, output: true } },
        _count: {
          select: {
            runs: true,
            approvals: { where: { status: "PENDING" } },
            files: true,
            customTools: true,
            installedSkills: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    // Serialize BigInt + flatten latest run
    const serialized = employees.map((e: typeof employees[number]) => {
      const { runs: latestRuns, ...rest } = e
      // Truncate output preview to avoid sending huge payloads
      const rawOutput = latestRuns[0]?.output
      let latestOutputPreview: string | null = null
      if (rawOutput != null) {
        const str = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput)
        latestOutputPreview = str.length > 120 ? str.slice(0, 120) + "..." : str
      }
      return {
        ...rest,
        totalTokensUsed: e.totalTokensUsed.toString(),
        latestRunStatus: latestRuns[0]?.status ?? null,
        latestOutputPreview,
        pendingApprovalCount: e._count.approvals,
      }
    })

    return NextResponse.json(serialized)
  } catch (error) {
    console.error("Failed to fetch digital employees:", error)
    return NextResponse.json({ error: "Failed to fetch digital employees" }, { status: 500 })
  }
}

// POST /api/dashboard/digital-employees - Create employee
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let orgContext = await getOrganizationContext(req, session.user.id)

    // Fallback: if no x-organization-id header, use user's first org membership
    if (!orgContext) {
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: session.user.id, acceptedAt: { not: null } },
        select: { id: true, role: true, userId: true, organizationId: true },
      })
      if (membership) {
        orgContext = {
          organizationId: membership.organizationId,
          membership: { id: membership.id, role: membership.role, userId: membership.userId },
        }
      }
    }

    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.create")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await req.json()
    const { name, description, avatar, assistantId, autonomyLevel } = body

    if (!name || !assistantId) {
      return NextResponse.json({ error: "Name and assistantId are required" }, { status: 400 })
    }

    // Validate assistant exists and belongs to org
    const assistant = await prisma.assistant.findFirst({
      where: {
        id: assistantId,
        OR: [
          { organizationId: orgContext.organizationId },
          { organizationId: null },
        ],
      },
      include: {
        tools: { include: { tool: true }, where: { enabled: true } },
        skills: { include: { skill: true }, where: { enabled: true } },
        assistantWorkflows: { include: { workflow: true }, where: { enabled: true } },
      },
    })

    if (!assistant) {
      return NextResponse.json({ error: "Assistant not found" }, { status: 404 })
    }

    // Create employee
    const employee = await prisma.digitalEmployee.create({
      data: {
        name,
        description: description || null,
        avatar: avatar || null,
        assistantId,
        autonomyLevel: autonomyLevel || "L1",
        sandboxMode: (autonomyLevel || "L1") === "L1",
        deploymentConfig: DEFAULT_DEPLOYMENT_CONFIG as object,
        organizationId: orgContext.organizationId,
        createdBy: session.user.id,
        supervisorId: session.user.id,
      },
      include: {
        assistant: { select: { id: true, name: true, emoji: true, model: true } },
        _count: {
          select: {
            runs: true,
            approvals: true,
            files: true,
            customTools: true,
            installedSkills: true,
          },
        },
      },
    })

    // Generate default workspace files
    const ctx: WorkspaceFileContext = {
      employeeName: name,
      employeeDescription: description,
      avatar,
      systemPrompt: assistant.systemPrompt,
      supervisorName: session.user.name || undefined,
      supervisorEmail: session.user.email || undefined,
      toolNames: assistant.tools.map((t) => t.tool.displayName || t.tool.name),
      skillNames: assistant.skills.map((s) => s.skill.displayName || s.skill.name),
      workflowNames: assistant.assistantWorkflows.map((aw) => aw.workflow.name),
      schedules: [],
    }

    const fileCreates = WORKSPACE_FILES.map((fileDef) => {
      const content =
        typeof fileDef.defaultContent === "function"
          ? fileDef.defaultContent(ctx)
          : fileDef.defaultContent
      return prisma.employeeFile.create({
        data: {
          digitalEmployeeId: employee.id,
          filename: fileDef.filename,
          content,
          updatedBy: session.user.id,
        },
      })
    })
    await Promise.all(fileCreates)

    logAudit({
      organizationId: orgContext.organizationId,
      userId: session.user.id,
      action: AUDIT_ACTIONS.EMPLOYEE_CREATE,
      resource: `employee:${employee.id}`,
      detail: { name: employee.name },
      riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_CREATE),
    }).catch(() => {})

    return NextResponse.json(
      { ...employee, totalTokensUsed: employee.totalTokensUsed.toString() },
      { status: 201 }
    )
  } catch (error) {
    console.error("Failed to create digital employee:", error)
    return NextResponse.json({ error: "Failed to create digital employee" }, { status: 500 })
  }
}
