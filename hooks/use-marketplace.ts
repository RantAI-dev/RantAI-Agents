"use client"

import { useState, useCallback, useEffect } from "react"

export interface MarketplaceItem {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  type: "tool" | "skill"
  icon: string
  tags: string[]
  installed: boolean
}

interface MarketplaceResponse {
  items: MarketplaceItem[]
  categories: string[]
  total: number
}

export function useMarketplace() {
  const [items, setItems] = useState<MarketplaceItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

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

      const res = await fetch(`/api/dashboard/marketplace?${params}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data: MarketplaceResponse = await res.json()
      setItems(data.items)
      setCategories(data.categories)
    } catch {
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const installItem = useCallback(
    async (catalogItemId: string, authConfig?: object) => {
      const res = await fetch("/api/dashboard/marketplace/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogItemId, authConfig }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to install")
      }
      // Update local state
      setItems((prev) =>
        prev.map((i) =>
          i.id === catalogItemId ? { ...i, installed: true } : i
        )
      )
      return await res.json()
    },
    []
  )

  const uninstallItem = useCallback(async (catalogItemId: string) => {
    const res = await fetch(
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
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  return {
    items,
    categories,
    isLoading,
    fetchItems,
    installItem,
    uninstallItem,
  }
}
