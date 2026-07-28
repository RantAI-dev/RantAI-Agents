/**
 * Org-scoping guard for mobile workflow routes.
 *
 * The web dashboard workflow routes only check that the user is authenticated,
 * not that the workflow belongs to their org. For the mobile API we enforce the
 * same scoping rule as assistants: a workflow is accessible only if it is global
 * (organizationId null) or belongs to the caller's active org.
 */
import { getDashboardWorkflow } from "@/features/workflows/service"
import { isHttpServiceError, type HttpServiceError } from "@/features/shared/http-service-error"
import type { MobileContext } from "@/lib/mobile-org"

/**
 * Load a workflow by id and authorize it for the mobile caller. Returns the
 * workflow record, or an HttpServiceError (404 if missing or cross-org).
 */
export async function authorizeMobileWorkflow(
  ctx: MobileContext,
  id: string
): Promise<Record<string, unknown> | HttpServiceError> {
  const workflow = await getDashboardWorkflow(id)
  if (isHttpServiceError(workflow)) return workflow

  const orgId = (workflow as { organizationId: string | null }).organizationId
  if (orgId && orgId !== ctx.organizationId) {
    return { status: 404, error: "Workflow not found" }
  }
  return workflow as unknown as Record<string, unknown>
}
