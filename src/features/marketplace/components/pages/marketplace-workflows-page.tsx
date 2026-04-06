import { MarketplaceBrowse } from "@/features/marketplace/components/marketplace-browse"
import { loadMarketplaceInitial } from "./load-marketplace-initial"

export default async function MarketplaceWorkflowsPage() {
  const initial = await loadMarketplaceInitial("workflow")

  return (
    <MarketplaceBrowse
      type="workflow"
      initialItems={initial.items}
      initialCategories={initial.categories}
    />
  )
}
