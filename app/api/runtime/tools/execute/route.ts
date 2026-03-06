import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { getBuiltinTool } from "@/lib/tools/builtin"
import { executeCommunityTool, getCommunityTool } from "@/lib/skills/gateway"

// POST - Agent executes a platform tool from inside the container
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId } = await verifyRuntimeToken(token)
    const { toolName, input } = await req.json()

    if (!toolName) {
      return NextResponse.json({ error: "toolName is required" }, { status: 400 })
    }

    // Verify the employee exists and get its assistant for context
    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
      select: {
        organizationId: true,
        assistantId: true,
        assistant: {
          select: {
            tools: {
              where: { enabled: true },
              include: { tool: true },
            },
          },
        },
      },
    })

    if (!employee?.assistant) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }

    // Check the tool is actually enabled for this employee's assistant
    const enabledTool = employee.assistant.tools.find(
      (t) => t.tool.name === toolName
    )
    if (!enabledTool) {
      return NextResponse.json(
        { error: `Tool "${toolName}" is not enabled for this employee` },
        { status: 403 }
      )
    }

    const context = {
      organizationId: employee.organizationId ?? undefined,
      assistantId: employee.assistantId ?? undefined,
    }

    // Try builtin tools first
    const builtin = getBuiltinTool(toolName)
    if (builtin) {
      const result = await builtin.execute(input || {}, context)
      return NextResponse.json({ result })
    }

    // Try community tools
    const communityTool = await getCommunityTool(toolName)
    if (communityTool) {
      const result = await executeCommunityTool(toolName, input || {}, {
        organizationId: context.organizationId,
      })
      return NextResponse.json({ result })
    }

    return NextResponse.json(
      { error: `Tool "${toolName}" not found in platform registry` },
      { status: 404 }
    )
  } catch (error) {
    console.error("Runtime tool execute failed:", error)
    const msg = error instanceof Error ? error.message : "Execution failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
