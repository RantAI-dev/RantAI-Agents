import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  CreateAssistantSchema,
} from "@/src/features/assistants/core/schema"
import {
  createAssistantForUser,
  listAssistantsForUser,
} from "@/src/features/assistants/core/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

// GET /api/assistants - List all assistants
// Built-in assistants are created by seed.ts during setup (bun run setup)
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(request, session.user.id)
    const assistants = await listAssistantsForUser({
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.membership.role ?? null,
    })
    return NextResponse.json(assistants)
  } catch (error) {
    console.error("Failed to fetch assistants:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistants" },
      { status: 500 }
    )
  }
}

// POST /api/assistants - Create new assistant
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(request, session.user.id)
    const parsed = CreateAssistantSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const assistant = await createAssistantForUser({
      userId: session.user.id,
      input: parsed.data,
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.membership.role ?? null,
    })
    if (isHttpServiceError(assistant)) {
      return NextResponse.json({ error: assistant.error }, { status: assistant.status })
    }

    return NextResponse.json(assistant, { status: 201 })
  } catch (error) {
    console.error("Failed to create assistant:", error)
    return NextResponse.json(
      { error: "Failed to create assistant" },
      { status: 500 }
    )
  }
}
