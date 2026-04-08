"use client"

import { useEffect, useState } from "react"
import type { StoreAsset } from "@/features/media/store"

export interface LibraryAsset extends StoreAsset {
  job?: { prompt: string; modelId: string; costCents: number | null }
}

export interface LibraryFilters {
  modality: "" | "IMAGE" | "AUDIO" | "VIDEO"
  favoritesOnly: boolean
  q: string
}

export interface UseLibraryAssetsResult {
  items: LibraryAsset[]
  loading: boolean
  setItems: React.Dispatch<React.SetStateAction<LibraryAsset[]>>
}

export function useLibraryAssets(filters: LibraryFilters): UseLibraryAssetsResult {
  const [items, setItems] = useState<LibraryAsset[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.modality) params.set("modality", filters.modality)
    if (filters.favoritesOnly) params.set("favorite", "true")
    if (filters.q.trim()) params.set("q", filters.q.trim())
    params.set("limit", "60")

    setLoading(true)
    fetch(`/api/dashboard/media/assets?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setItems((data as { items?: LibraryAsset[] }).items ?? []))
      .finally(() => setLoading(false))
  }, [filters.modality, filters.favoritesOnly, filters.q])

  return { items, loading, setItems }
}
