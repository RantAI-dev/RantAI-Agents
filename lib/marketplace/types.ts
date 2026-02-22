export interface MarketplaceCatalogItem {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  type: "tool" | "skill"
  icon: string // Lucide icon name or emoji
  tags: string[]
  featured?: boolean
  sourceUrl?: string
  toolTemplate?: {
    name: string
    displayName: string
    description: string
    parameters: object
    executionConfig: {
      url: string
      method: string
      headers?: Record<string, string>
    }
  }
  skillTemplate?: {
    name: string
    displayName: string
    description: string
    content: string
    category: string
    tags: string[]
  }
}

export interface MarketplaceInstallInfo {
  id: string
  catalogItemId: string
  itemType: string
  installedId: string
  organizationId: string
  createdAt: string
}
