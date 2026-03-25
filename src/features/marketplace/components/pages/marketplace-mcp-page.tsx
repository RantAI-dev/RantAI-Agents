import { MarketplaceBrowse } from "@/src/features/marketplace/components/marketplace-browse"
import { loadMarketplaceInitial } from "./load-marketplace-initial"

export default async function MarketplaceMcpPage() {
  const initial = await loadMarketplaceInitial("mcp")

  return (
    <MarketplaceBrowse
      type="mcp"
      initialItems={initial.items}
      initialCategories={initial.categories}
    />
  )
}
