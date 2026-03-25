import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardDigitalEmployeeSkillInstallSchema,
} from "@/src/features/digital-employees/interactions/schema"
import {
  installDigitalEmployeeSkill,
  isServiceError,
  listDigitalEmployeeSkills,
} from "@/src/features/digital-employees/interactions/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await listDigitalEmployeeSkills({
      id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch skills:", error)
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsed = DashboardDigitalEmployeeSkillInstallSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await installDigitalEmployeeSkill({
      id,
      organizationId: orgContext?.organizationId ?? null,
      userId: session.user.id,
      input: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("Failed to install skill:", error)
    const msg = error instanceof Error ? error.message : "Failed to install skill"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
