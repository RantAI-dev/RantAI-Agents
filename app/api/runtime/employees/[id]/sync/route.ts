import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

interface RouteParams {
  params: Promise<{ id: string }>
}

interface FileChange {
  path: string
  content: string
  type: "workspace" | "memory" | "schedules"
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId } = await verifyRuntimeToken(token)
    const { id } = await params

    if (employeeId !== id) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 403 })
    }

    const body = await req.json()
    const changes: FileChange[] = body.changes || []

    for (const change of changes) {
      if (change.type === "workspace") {
        // Upsert workspace file
        const existing = await prisma.employeeFile.findFirst({
          where: { digitalEmployeeId: id, filename: change.path },
        })

        if (existing) {
          await prisma.employeeFile.update({
            where: { id: existing.id },
            data: { content: change.content, updatedBy: "container-sync" },
          })
        } else {
          await prisma.employeeFile.create({
            data: {
              digitalEmployeeId: id,
              filename: change.path,
              content: change.content,
              updatedBy: "container-sync",
            },
          })
        }
      } else if (change.type === "memory") {
        // Upsert daily memory note — extract date from filename (YYYY-MM-DD.md)
        const dateMatch = change.path.match(/^(\d{4}-\d{2}-\d{2})\.md$/)
        const date = dateMatch ? dateMatch[1] : change.path

        const existing = await prisma.employeeMemory.findFirst({
          where: { digitalEmployeeId: id, type: "daily", date },
        })

        if (existing) {
          await prisma.employeeMemory.update({
            where: { id: existing.id },
            data: { content: change.content },
          })
        } else {
          await prisma.employeeMemory.create({
            data: {
              digitalEmployeeId: id,
              type: "daily",
              date,
              content: change.content,
              embedding: [],
            },
          })
        }
      } else if (change.type === "schedules") {
        // Sync cron jobs from RantaiClaw → deploymentConfig.schedules
        try {
          const cronSchedules = JSON.parse(change.content)
          if (!Array.isArray(cronSchedules)) continue

          const employee = await prisma.digitalEmployee.findUnique({
            where: { id },
            select: { deploymentConfig: true },
          })

          const config = (employee?.deploymentConfig as Record<string, unknown>) ?? {}
          const existingSchedules = Array.isArray(config.schedules)
            ? (config.schedules as Array<{ id: string;[k: string]: unknown }>)
            : []

          // Merge: cron-synced jobs replace entries with same ID, keep manual schedules
          const cronIds = new Set(cronSchedules.map((s: { id: string }) => s.id))
          const manualSchedules = existingSchedules.filter((s) => !cronIds.has(s.id))
          const mergedSchedules = [...manualSchedules, ...cronSchedules]

          await prisma.digitalEmployee.update({
            where: { id },
            data: {
              deploymentConfig: { ...config, schedules: mergedSchedules },
            },
          })
        } catch (parseErr) {
          console.error("[Sync] Failed to parse cron schedules:", parseErr)
        }
      }
    }

    return NextResponse.json({ ok: true, synced: changes.length })
  } catch (error) {
    console.error("File sync failed:", error)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}
