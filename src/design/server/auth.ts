/**
 * Design SPA request auth adapter.
 *
 * Resolves the `{ userId, organizationId }` scope for every `/api/design/*`
 * route handler from the RantAI session (`@/lib/auth`) + active-org resolver
 * (`@/lib/org-context`). This is the CLI→(later)gateway / single-user-daemon →
 * multi-tenant swap: upstream open-design's daemon was single-user and local,
 * so it had no auth; the cloud port scopes every project read/write by the
 * authenticated user and their active organization.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveActiveOrg } from "@/lib/org-context";

export interface DesignContext {
  userId: string;
  /** Active organization, or null for a personal (org-less) session. */
  organizationId: string | null;
}

export type DesignAuthResult =
  | { ok: true; ctx: DesignContext }
  | { ok: false; response: NextResponse };

/** Error body mirroring the daemon's `sendApiError` shape: `{ error: { code, message } }`. */
export function apiError(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** 401 in the daemon's error shape. */
export function unauthorizedResponse(): NextResponse {
  return apiError(401, "UNAUTHENTICATED", "Authentication required");
}

/**
 * Resolve the design context for a request, or return a ready-to-send 401.
 *
 * Usage in a route handler:
 *   const gate = await requireDesignContext(req);
 *   if (!gate.ok) return gate.response;
 *   const { userId, organizationId } = gate.ctx;
 */
export async function requireDesignContext(
  req: Request,
): Promise<DesignAuthResult> {
  const session = await auth();
  // The `session.user.id` augmentation lives in src/types/next-auth.d.ts, which
  // is outside this SPA's isolated tsconfig include; read it through a local
  // cast so the adapter typechecks standalone without depending on that global.
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return { ok: false, response: unauthorizedResponse() };
  }
  const org = await resolveActiveOrg(req, userId);
  return {
    ok: true,
    ctx: { userId, organizationId: org?.organizationId ?? null },
  };
}
