import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { searchClawHub, listClawHubSkills } from "@/lib/digital-employee/clawhub"

// GET - Agent searches for skills (both platform and ClawHub)
// ?source=platform — search platform skills only
// ?source=clawhub  — search ClawHub skills only
// (no source)      — search both
export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId } = await verifyRuntimeToken(token)

    const url = new URL(req.url)
    const query = url.searchParams.get("q") || ""
    const source = url.searchParams.get("source") || ""

    const results: Array<{
      id?: string
      slug?: string
      name: string
      description: string
      source: "platform" | "clawhub"
      version?: string
      downloads?: number
      rating?: number
      enabled?: boolean
      content?: string
    }> = []

    // Platform skills — from org's Skill table
    if (!source || source === "platform") {
      const employee = await prisma.digitalEmployee.findUnique({
        where: { id: employeeId },
        select: {
          organizationId: true,
          assistant: {
            select: {
              skills: { select: { skillId: true, enabled: true } },
            },
          },
        },
      })

      const enabledSkillIds = new Set(
        (employee?.assistant?.skills ?? []).map((s) => s.skillId)
      )

      const platformSkills = await prisma.skill.findMany({
        where: {
          organizationId: employee?.organizationId || null,
          enabled: true,
          ...(query.trim()
            ? {
                OR: [
                  { name: { contains: query, mode: "insensitive" as const } },
                  { displayName: { contains: query, mode: "insensitive" as const } },
                  { description: { contains: query, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        orderBy: { displayName: "asc" },
      })

      for (const s of platformSkills) {
        results.push({
          id: s.id,
          name: s.displayName || s.name,
          description: s.description,
          source: "platform",
          version: s.version || undefined,
          enabled: enabledSkillIds.has(s.id),
          content: s.content,
        })
      }
    }

    // ClawHub skills
    if (!source || source === "clawhub") {
      const clawHubResults = query.trim()
        ? await searchClawHub(query)
        : await listClawHubSkills()

      for (const s of clawHubResults) {
        results.push({
          slug: s.slug,
          name: s.name,
          description: s.description,
          source: "clawhub",
          version: s.version,
          downloads: s.downloads,
          rating: s.rating,
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Runtime skill search failed:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
