"use client"

import { useEffect, useState } from "react"

export interface MediaLimitData {
  mediaLimitCentsPerDay: number | null
  usedTodayCents: number
}

export interface UseMediaLimitResult {
  data: MediaLimitData | null
  loading: boolean
  saving: boolean
  save: (mediaLimitCentsPerDay: number | null) => Promise<void>
}

export function useMediaLimit(): UseMediaLimitResult {
  const [data, setData] = useState<MediaLimitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/dashboard/user/media-limit")
      .then((r) => r.json())
      .then((d: MediaLimitData) => setData(d))
      .finally(() => setLoading(false))
  }, [])

  const save = async (mediaLimitCentsPerDay: number | null) => {
    setSaving(true)
    await fetch("/api/dashboard/user/media-limit", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaLimitCentsPerDay }),
    })
    setSaving(false)
  }

  return { data, loading, saving, save }
}
