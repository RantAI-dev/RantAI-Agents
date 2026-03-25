import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { listDashboardMarketplaceItems } from "@/src/features/marketplace/service"

type MarketplaceType = "tool" | "skill" | "workflow" | "assistant" | "mcp"

export async function loadMarketplaceInitial(type: MarketplaceType) {
  const session = await auth()
  if (!session?.user?.id) {
    return { items: [], categories: [] }
  }

  const requestHeaders = await headers()
  const request = new Request("http://localhost", {
    headers: new Headers(requestHeaders),
  })
  const orgContext = await getOrganizationContextWithFallback(request, session.user.id)

  const result = await listDashboardMarketplaceItems({
    organizationId: orgContext?.organizationId ?? null,
    type,
  })

  return {
    items: result.items,
    categories: result.categories,
  }
}
