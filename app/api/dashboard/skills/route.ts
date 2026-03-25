import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import {
  CreateDashboardSkillSchema,
} from "@/src/features/skills/schema"
import {
  createDashboardSkillRecord,
  listDashboardSkills,
} from "@/src/features/skills/service"

function isServiceError(value: unknown): value is {
  status: number
  error: string
} {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return typeof candidate.status === "number" && typeof candidate.error === "string"
}

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    return NextResponse.json(
      await listDashboardSkills({
        organizationId: orgContext?.organizationId ?? null,
        userId: session.user.id,
      })
    )
  } catch (error) {
    console.error("[Skills API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    const parsed = CreateDashboardSkillSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await createDashboardSkillRecord({
      context: {
        organizationId: orgContext?.organizationId ?? null,
        userId: session.user.id,
      },
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[Skills API] POST error:", error)
    return NextResponse.json({ error: "Failed to create skill" }, { status: 500 })
  }
}
