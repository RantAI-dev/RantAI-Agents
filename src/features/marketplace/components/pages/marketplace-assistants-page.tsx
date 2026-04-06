import { MarketplaceBrowse } from "@/features/marketplace/components/marketplace-browse"
import { loadMarketplaceInitial } from "./load-marketplace-initial"

export default async function MarketplaceAssistantsPage() {
  const initial = await loadMarketplaceInitial("assistant")

  return (
    <MarketplaceBrowse
      type="assistant"
      initialItems={initial.items}
      initialCategories={initial.categories}
    />
  )
}
