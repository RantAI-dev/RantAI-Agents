import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { prisma } from "@/lib/prisma"

export interface SearchResult {
  id: string
  type: "conversation" | "assistant" | "workflow" | "employee" | "file" | "skill" | "marketplace" | "tool"
  title: string
  description?: string
  url: string
  icon?: string | null
  meta?: string
}

export interface SearchResponse {
  results: SearchResult[]
  query: string
}

const MAX_PER_TYPE = 5

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const query = searchParams.get("q")?.trim()

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [], query: query || "" })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    const orgId = orgContext?.organizationId ?? null

    // For resources with optional orgId, match both the org's items AND unscoped items
    const orgFilter = orgId ? { organizationId: orgId } : {}
    const orgFilterWithNull = orgId
      ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
      : {}
    const contains = query
    const results: SearchResult[] = []

    // Run all queries in parallel
    const [conversations, assistants, workflows, employees, documents, skills, installedSkills, tools] = await Promise.all([
      // Conversations — user's own, in org or unscoped
      prisma.dashboardSession.findMany({
        where: {
          ...orgFilterWithNull,
          userId: session.user.id,
          title: { contains, mode: "insensitive" },
        },
        select: { id: true, title: true, updatedAt: true, assistantId: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_PER_TYPE,
      }),

      // Assistants
      prisma.assistant.findMany({
        where: {
          ...orgFilterWithNull,
          OR: [
            { name: { contains, mode: "insensitive" } },
            { description: { contains, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, description: true, emoji: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_PER_TYPE,
      }),

      // Workflows
      prisma.workflow.findMany({
        where: {
          ...orgFilterWithNull,
          OR: [
            { name: { contains, mode: "insensitive" } },
            { description: { contains, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, description: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_PER_TYPE,
      }),

      // Digital Employees
      prisma.digitalEmployee.findMany({
        where: {
          ...orgFilterWithNull,
          OR: [
            { name: { contains, mode: "insensitive" } },
            { description: { contains, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, description: true, avatar: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_PER_TYPE,
      }),

      // Documents / Files
      prisma.document.findMany({
        where: {
          ...orgFilterWithNull,
          OR: [
            { title: { contains, mode: "insensitive" } },
          ],
        },
        select: { id: true, title: true, fileType: true, createdAt: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_PER_TYPE,
      }),

      // Skills (custom)
      prisma.skill.findMany({
        where: {
          ...orgFilterWithNull,
          OR: [
            { name: { contains, mode: "insensitive" } },
            { displayName: { contains, mode: "insensitive" } },
            { description: { contains, mode: "insensitive" } },
          ],
        },
        select: { id: true, displayName: true, description: true, name: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_PER_TYPE,
      }),

      // Installed Skills (marketplace)
      prisma.installedSkill.findMany({
        where: {
          ...orgFilterWithNull,
          OR: [
            { name: { contains, mode: "insensitive" } },
            { displayName: { contains, mode: "insensitive" } },
            { description: { contains, mode: "insensitive" } },
          ],
        },
        select: { id: true, displayName: true, description: true, name: true, icon: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_PER_TYPE,
      }),

      // Tools (custom/community from marketplace)
      prisma.tool.findMany({
        where: {
          ...orgFilterWithNull,
          isBuiltIn: false,
          OR: [
            { name: { contains, mode: "insensitive" } },
            { displayName: { contains, mode: "insensitive" } },
            { description: { contains, mode: "insensitive" } },
          ],
        },
        select: { id: true, displayName: true, description: true, name: true, icon: true, category: true },
        orderBy: { updatedAt: "desc" },
        take: MAX_PER_TYPE,
      }),
    ])

    // Map results
    for (const c of conversations) {
      results.push({
        id: c.id,
        type: "conversation",
        title: c.title || "Untitled conversation",
        url: `/dashboard/chat/${c.id}`,
      })
    }

    for (const a of assistants) {
      results.push({
        id: a.id,
        type: "assistant",
        title: a.name,
        description: a.description || undefined,
        url: `/dashboard/agent-builder/${a.id}`,
        icon: a.emoji,
      })
    }

    for (const w of workflows) {
      results.push({
        id: w.id,
        type: "workflow",
        title: w.name,
        description: w.description || undefined,
        url: `/dashboard/workflows/${w.id}`,
      })
    }

    for (const e of employees) {
      results.push({
        id: e.id,
        type: "employee",
        title: e.name,
        description: e.description || undefined,
        url: `/dashboard/digital-employees/${e.id}`,
        icon: e.avatar,
        meta: e.status,
      })
    }

    for (const d of documents) {
      results.push({
        id: d.id,
        type: "file",
        title: d.title,
        url: `/dashboard/files/${d.id}`,
        meta: d.fileType || undefined,
      })
    }

    for (const s of skills) {
      results.push({
        id: s.id,
        type: "skill",
        title: s.displayName || s.name,
        description: s.description || undefined,
        url: `/dashboard/marketplace/skills`,
      })
    }

    for (const s of installedSkills) {
      results.push({
        id: s.id,
        type: "marketplace",
        title: s.displayName || s.name,
        description: s.description || undefined,
        url: `/dashboard/marketplace/skills`,
        icon: s.icon,
      })
    }

    for (const t of tools) {
      results.push({
        id: t.id,
        type: "tool",
        title: t.displayName || t.name,
        description: t.description || undefined,
        url: `/dashboard/marketplace/tools`,
        icon: t.icon,
      })
    }

    return NextResponse.json({ results, query } satisfies SearchResponse)
  } catch (error) {
    console.error("[Search API] Error:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
