import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { streamAssistantWizard } from "@/features/assistants/wizard/service"
import { WizardStreamRequestSchema } from "@/features/assistants/wizard/schema"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)
  if (!orgContext) {
    return NextResponse.json({ error: "No organization" }, { status: 403 })
  }

  const body = await request.json()
  const parsed = WizardStreamRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const result = await streamAssistantWizard({
    messages: parsed.data.messages,
    draft: parsed.data.draft,
    organizationId: orgContext.organizationId,
    userId: session.user.id,
    userRole: orgContext.membership.role,
  })

  return result.toUIMessageStreamResponse()
}
