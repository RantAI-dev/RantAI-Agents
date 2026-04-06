import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  DashboardChatSessionArtifactBodySchema,
  DashboardChatSessionArtifactParamsSchema,
} from "@/features/conversations/sessions/schema"
import {
  deleteDashboardChatSessionArtifact,
  updateDashboardChatSessionArtifact,
} from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardChatSessionArtifactParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 })
    }

    const parsedBody = DashboardChatSessionArtifactBodySchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const result = await updateDashboardChatSessionArtifact({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
      artifactId: parsedParams.data.artifactId,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Artifact API] PUT error:", error)
    return NextResponse.json({ error: "Failed to update artifact" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardChatSessionArtifactParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 })
    }

    const result = await deleteDashboardChatSessionArtifact({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
      artifactId: parsedParams.data.artifactId,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Artifact API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete artifact" }, { status: 500 })
  }
}
