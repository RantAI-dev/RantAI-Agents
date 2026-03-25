import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardOpenApiSpecCreateBodySchema,
} from "@/src/features/openapi-specs/schema"
import {
  importDashboardOpenApiSpec,
  listDashboardOpenApiSpecs,
} from "@/src/features/openapi-specs/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const result = await listDashboardOpenApiSpecs({
      organizationId: orgContext?.organizationId || null,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[OpenAPI API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch specs" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const parsedBody = DashboardOpenApiSpecCreateBodySchema.safeParse(await req.json())
    const result = await importDashboardOpenApiSpec({
      organizationId: orgContext?.organizationId || null,
      createdBy: session.user.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("[OpenAPI API] POST error:", error)
    return NextResponse.json({ error: "Failed to import spec" }, { status: 500 })
  }
}
