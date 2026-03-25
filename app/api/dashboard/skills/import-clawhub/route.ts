import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  ImportDashboardSkillSchema,
} from "@/src/features/skills/schema"
import {
  importDashboardSkillFromClawHub,
} from "@/src/features/skills/service"

function isServiceError(value: unknown): value is {
  status: number
  error: string
  existingId?: string
} {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as {
    status?: unknown
    error?: unknown
    existingId?: unknown
  }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsed = ImportDashboardSkillSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await importDashboardSkillFromClawHub({
      context: {
        organizationId: orgContext?.organizationId ?? null,
        userId: session.user.id,
      },
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json(
        { error: result.error, ...(result.existingId ? { existingId: result.existingId } : {}) },
        { status: result.status }
      )
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[ClawHub Import] error:", error)
    return NextResponse.json({ error: "Failed to import skill" }, { status: 500 })
  }
}
