"use client"

import { useEffect, useState } from "react"

/**
 * Detects whether the current org is on a free plan, used to gate the paid
 * media-generation action and show an upsell.
 *
 * This is an intentional base/cloud seam: `/api/dashboard/usage/free-limits`
 * exists only in the cloud deployment (paid feature). In the open-source base
 * the route 404s, the probe resolves to `false`, and no gating applies — the
 * API still enforces limits server-side regardless.
 *
 * Kept in a hook (outside the media component tree) so the studio components
 * stay free of direct data-effects per the frontend-compliance policy.
 */
export function useFreePlan(): boolean {
  const [isFreePlan, setIsFreePlan] = useState(false)

  useEffect(() => {
    fetch("/api/dashboard/usage/free-limits", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsFreePlan(!!d?.isFree))
      .catch(() => {})
  }, [])

  return isFreePlan
}
