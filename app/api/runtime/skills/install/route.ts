import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { installClawHubSkill } from "@/lib/digital-employee/clawhub"

// POST - Agent installs/enables a skill
// { slug: "...", source: "clawhub" }  — install from ClawHub
// { skillId: "...", source: "platform" } — enable a platform skill on the assistant
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId } = await verifyRuntimeToken(token)
    const body = await req.json()
    const source = body.source || "clawhub"

    if (source === "platform") {
      // Enable a platform skill on the employee's assistant
      const skillId = body.skillId || body.id
      if (!skillId) {
        return NextResponse.json({ error: "skillId is required for platform skills" }, { status: 400 })
      }

      const employee = await prisma.digitalEmployee.findUnique({
        where: { id: employeeId },
        select: { assistantId: true, organizationId: true },
      })

      if (!employee?.assistantId) {
        return NextResponse.json({ error: "Employee has no assistant" }, { status: 404 })
      }

      // Verify the skill exists in this org
      const skill = await prisma.skill.findFirst({
        where: {
          id: skillId,
          organizationId: employee.organizationId,
          enabled: true,
        },
      })

      if (!skill) {
        return NextResponse.json({ error: "Skill not found" }, { status: 404 })
      }

      // Check if already enabled
      const existing = await prisma.assistantSkill.findFirst({
        where: { assistantId: employee.assistantId, skillId },
      })

      if (existing) {
        // Re-enable if disabled
        if (!existing.enabled) {
          await prisma.assistantSkill.update({
            where: { id: existing.id },
            data: { enabled: true },
          })
        }
      } else {
        await prisma.assistantSkill.create({
          data: {
            assistantId: employee.assistantId,
            skillId,
            enabled: true,
          },
        })
      }

      return NextResponse.json({
        success: true,
        skill: {
          id: skill.id,
          name: skill.displayName || skill.name,
          description: skill.description,
          content: skill.content,
          source: "platform",
        },
      })
    }

    // ClawHub install
    const slug = body.slug
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 })
    }

    const skill = await installClawHubSkill(employeeId, slug, "agent-runtime")

    return NextResponse.json({
      success: true,
      skill: {
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        source: "clawhub",
      },
    })
  } catch (error) {
    console.error("Runtime skill install failed:", error)
    const msg = error instanceof Error ? error.message : "Install failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
