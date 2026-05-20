import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { canManage, resolveActiveOrg } from "@/lib/org-context"
import { AssistantIdParamsSchema } from "@/features/assistants/default/schema"
import {
  loadAssistantForDefaultMutation,
  removeSystemDefaultAssistant,
  setSystemDefaultAssistant,
} from "@/features/assistants/default/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Guard for system-default mutations:
 *   - session required
 *   - active-org context required (no anonymous global writes)
 *   - org-scoped assistants must belong to the caller's org
 *   - only owner/admin may set or clear the system default
 *
 * Returns a guard result on success or an HTTP-shaped error response.
 */
async function guardDefaultMutation(
  request: Request,
  rawId: string
): Promise<{ id: string } | NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgContext = await resolveActiveOrg(request, session.user.id)
  if (!orgContext) {
    return NextResponse.json({ error: "No organization context" }, { status: 403 })
  }
  if (!canManage(orgContext.role)) {
    return NextResponse.json(
      { error: "Only owners or admins can set the system default" },
      { status: 403 }
    )
  }

  const assistant = await loadAssistantForDefaultMutation({
    assistantId: rawId,
    organizationId: orgContext.organizationId,
  })
  if (isHttpServiceError(assistant)) {
    return NextResponse.json({ error: assistant.error }, { status: assistant.status })
  }

  return { id: assistant.id }
}

// POST /api/assistants/[id]/default - Set as system default
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }

    const guard = await guardDefaultMutation(request, parsedParams.data.id)
    if (guard instanceof NextResponse) return guard

    const updated = await setSystemDefaultAssistant(guard.id)
    if (isHttpServiceError(updated)) {
      return NextResponse.json({ error: updated.error }, { status: updated.status })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to set system default:", error)
    return NextResponse.json(
      { error: "Failed to set system default" },
      { status: 500 }
    )
  }
}

// DELETE /api/assistants/[id]/default - Remove system default (makes no assistant the default)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }

    const guard = await guardDefaultMutation(request, parsedParams.data.id)
    if (guard instanceof NextResponse) return guard

    const updated = await removeSystemDefaultAssistant(guard.id)
    if (isHttpServiceError(updated)) {
      return NextResponse.json({ error: updated.error }, { status: updated.status })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to remove system default:", error)
    return NextResponse.json(
      { error: "Failed to remove system default" },
      { status: 500 }
    )
  }
}
