"use client"

import { useState, useEffect, useCallback } from "react"

interface SidebarConfig {
  hiddenItems: string[]
  sidebarCollapsed: boolean
}

const DEFAULT_CONFIG: SidebarConfig = {
  hiddenItems: [],
  sidebarCollapsed: false,
}

// "Chat" is always visible and cannot be hidden
const NON_HIDEABLE_ITEMS = ["Chat"]

export function useSidebarPreferences() {
  const [config, setConfig] = useState<SidebarConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)

  // Fetch preferences on mount
  useEffect(() => {
    const fetchPrefs = async () => {
      try {
        const res = await fetch("/api/user/preferences")
        if (res.ok) {
          const data = await res.json()
          if (data.sidebarConfig) {
            setConfig(data.sidebarConfig as SidebarConfig)
          }
        }
      } catch {
        // Use defaults on error
      } finally {
        setLoading(false)
      }
    }
    fetchPrefs()
  }, [])

  // Persist to API
  const saveConfig = useCallback(async (newConfig: SidebarConfig) => {
    setConfig(newConfig)
    try {
      await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarConfig: newConfig }),
      })
    } catch {
      // Silent fail - local state already updated
    }
  }, [])

  const toggleItem = useCallback((itemTitle: string) => {
    if (NON_HIDEABLE_ITEMS.includes(itemTitle)) return

    setConfig((prev) => {
      const hidden = new Set(prev.hiddenItems)
      if (hidden.has(itemTitle)) {
        hidden.delete(itemTitle)
      } else {
        hidden.add(itemTitle)
      }
      const newConfig = { ...prev, hiddenItems: Array.from(hidden) }
      // Fire and forget save
      fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarConfig: newConfig }),
      }).catch(() => {})
      return newConfig
    })
  }, [])

  const isItemHidden = useCallback((itemTitle: string) => {
    return config.hiddenItems.includes(itemTitle)
  }, [config.hiddenItems])

  const isItemHideable = useCallback((itemTitle: string) => {
    return !NON_HIDEABLE_ITEMS.includes(itemTitle)
  }, [])

  return {
    config,
    loading,
    hiddenItems: new Set(config.hiddenItems),
    toggleItem,
    isItemHidden,
    isItemHideable,
    saveConfig,
  }
}
