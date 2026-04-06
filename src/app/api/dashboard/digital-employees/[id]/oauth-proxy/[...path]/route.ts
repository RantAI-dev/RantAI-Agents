import { proxyDigitalEmployeeOAuthCallback } from "@/features/digital-employees/interactions/service"

interface RouteParams {
  params: Promise<{ id: string; path: string[] }>
}

/**
 * GET /api/dashboard/digital-employees/[id]/oauth-proxy/[...path]
 */
export async function GET(req: Request, { params }: RouteParams) {
  const { id, path } = await params
  return proxyDigitalEmployeeOAuthCallback({
    id,
    path,
    request: req,
  })
}
