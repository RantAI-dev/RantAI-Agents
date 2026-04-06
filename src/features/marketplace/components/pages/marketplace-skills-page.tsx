import { MarketplaceBrowse } from "@/features/marketplace/components/marketplace-browse"
import { loadMarketplaceInitial } from "./load-marketplace-initial"

export default async function MarketplaceSkillsPage() {
  const initial = await loadMarketplaceInitial("skill")

  return (
    <MarketplaceBrowse
      type="skill"
      initialItems={initial.items}
      initialCategories={initial.categories}
    />
  )
}
