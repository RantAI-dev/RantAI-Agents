import { auth } from "@/lib/auth"
import { resolveActiveOrgServer } from "@/lib/org-context"
import { listDashboardMarketplaceItems } from "@/features/marketplace/service"

type MarketplaceType = "tool" | "skill" | "workflow" | "assistant" | "mcp"

export async function loadMarketplaceInitial(type: MarketplaceType) {
  const session = await auth()
  if (!session?.user?.id) {
    return { items: [], categories: [] }
  }

  const orgContext = await resolveActiveOrgServer(session.user.id)

  const result = await listDashboardMarketplaceItems({
    organizationId: orgContext?.organizationId ?? null,
    type,
  })

  return {
    items: result.items,
    categories: result.categories,
  }
}
