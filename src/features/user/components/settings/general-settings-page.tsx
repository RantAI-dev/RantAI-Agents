"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { OrganizationSwitcher } from "@/app/dashboard/_components/organization-switcher"
import { useMediaLimit } from "@/features/media/use-media-limit"

export default function GeneralSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">General Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your application preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization</CardTitle>
          <CardDescription>
            Switch between your organizations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationSwitcher className="w-full max-w-sm" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Media Generation</CardTitle>
          <CardDescription>
            Daily spending limit for image, audio, and video generation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MediaLimitForm />
        </CardContent>
      </Card>
    </div>
  )
}

function MediaLimitForm() {
  const { data, loading, saving, save } = useMediaLimit()
  const [limitDollars, setLimitDollars] = useState<string | null>(null)

  // Initialise local input from fetched data (only on first load)
  const displayValue =
    limitDollars !== null
      ? limitDollars
      : data?.mediaLimitCentsPerDay == null
        ? ""
        : (data.mediaLimitCentsPerDay / 100).toFixed(2)

  const handleSave = async () => {
    const trimmed = displayValue.trim()
    const cents = trimmed === "" ? null : Math.round(parseFloat(trimmed) * 100)
    await save(cents)
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium uppercase text-muted-foreground">
          Daily limit (USD)
        </label>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-muted-foreground">$</span>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={displayValue}
            onChange={(e) => setLimitDollars(e.target.value)}
            placeholder="No limit"
            className="max-w-xs"
          />
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Today&apos;s usage: ${((data?.usedTodayCents ?? 0) / 100).toFixed(2)}
          {displayValue.trim() !== "" && ` of $${displayValue}`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Leave blank to remove the limit.
        </p>
      </div>
    </div>
  )
}
