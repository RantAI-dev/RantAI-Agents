"use client"

import { useState, useCallback } from "react"
import { useOrgFetch } from "@/hooks/use-organization"

export interface MarketplaceItem {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  type: "tool" | "skill" | "workflow" | "assistant" | "mcp"
  icon: string
  tags: string[]
  installed: boolean
  installedId?: string
  skillId?: string
  isBuiltIn?: boolean
  communitySkillName?: string
  communityToolName?: string
  configSchema?: object
}

export interface ToolSchemaInfo {
  name: string
  displayName: string
  description: string
  parameters: object
  tags?: string[]
}

export interface MarketplaceItemDetail extends MarketplaceItem {
  version?: string
  author?: string
  skillPrompt?: string
  tools?: ToolSchemaInfo[]
  sharedToolNames?: string[]
  toolParameters?: object
  toolTags?: string[]
}

interface MarketplaceResponse {
  items: MarketplaceItem[]
  categories: string[]
  total: number
}

export function useMarketplace(options?: {
  initialItems?: MarketplaceItem[]
  initialCategories?: string[]
}) {
  const orgFetch = useOrgFetch()
  const [items, setItems] = useState<MarketplaceItem[]>(options?.initialItems ?? [])
  const [categories, setCategories] = useState<string[]>(options?.initialCategories ?? [])
  const [isLoading, setIsLoading] = useState(options?.initialItems == null)
  const [selectedItem, setSelectedItem] = useState<MarketplaceItemDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchItems = useCallback(async (filters?: {
    category?: string
    type?: string
    search?: string
  }) => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (filters?.category) params.set("category", filters.category)
      if (filters?.type) params.set("type", filters.type)
      if (filters?.search) params.set("q", filters.search)

      const res = await orgFetch(`/api/dashboard/marketplace?${params}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data: MarketplaceResponse = await res.json()
      setItems(data.items)
      setCategories(data.categories)
    } catch {
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [orgFetch])

  const fetchItemDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true)
      const res = await orgFetch(`/api/dashboard/marketplace/${id}`)
      if (!res.ok) throw new Error("Failed to fetch detail")
      const data: MarketplaceItemDetail = await res.json()
      setSelectedItem(data)
    } catch {
      setSelectedItem(null)
    } finally {
      setDetailLoading(false)
    }
  }, [orgFetch])

  const clearSelectedItem = useCallback(() => {
    setSelectedItem(null)
  }, [])

  const installItem = useCallback(
    async (catalogItemId: string, config?: Record<string, unknown>) => {
      const res = await orgFetch("/api/dashboard/marketplace/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogItemId, config }),
      })
      if (!res.ok) {
        const errorText = await res.text()
        let errorMessage = "Failed to install"
        try {
          const errData = JSON.parse(errorText) as { error?: string }
          if (typeof errData.error === "string" && errData.error.length > 0) {
            errorMessage = errData.error
          }
        } catch {
          if (errorText.trim().length > 0) {
            errorMessage = errorText
          }
        }
        throw new Error(errorMessage)
      }
      const result = await res.json() as {
        success: boolean
        installedId?: string
        skillId?: string
        toolIds?: string[]
      }
      // Update local state
      setItems((prev) =>
        prev.map((i) =>
          i.id === catalogItemId
            ? { ...i, installed: true, installedId: result.installedId, skillId: result.skillId }
            : i
        )
      )
      // Also update detail view if open
      setSelectedItem((prev) =>
        prev?.id === catalogItemId
          ? { ...prev, installed: true, installedId: result.installedId, skillId: result.skillId }
          : prev
      )
      return result
    },
    [orgFetch]
  )

  const uninstallItem = useCallback(async (catalogItemId: string) => {
    const res = await orgFetch(
      `/api/dashboard/marketplace/install?catalogItemId=${catalogItemId}`,
      { method: "DELETE" }
    )
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to uninstall")
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === catalogItemId ? { ...i, installed: false } : i
      )
    )
    setSelectedItem((prev) =>
      prev?.id === catalogItemId ? { ...prev, installed: false } : prev
    )
  }, [orgFetch])

  return {
    items,
    categories,
    isLoading,
    selectedItem,
    detailLoading,
    fetchItems,
    fetchItemDetail,
    clearSelectedItem,
    installItem,
    uninstallItem,
  }
}
