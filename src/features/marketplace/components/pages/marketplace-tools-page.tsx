import { MarketplaceBrowse } from "@/src/features/marketplace/components/marketplace-browse"
import { loadMarketplaceInitial } from "./load-marketplace-initial"

export default async function MarketplaceToolsPage() {
  const initial = await loadMarketplaceInitial("tool")

  return (
    <MarketplaceBrowse
      type="tool"
      initialItems={initial.items}
      initialCategories={initial.categories}
    />
  )
}
