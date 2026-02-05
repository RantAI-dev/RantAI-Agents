"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Headphones,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react"

interface FeatureConfig {
  id: string | null
  feature: string
  enabled: boolean
  config: Record<string, string>
}

const featureMeta: Record<
  string,
  { name: string; icon: typeof Headphones; description: string }
> = {
  AGENT: {
    name: "Agent Portal",
    icon: Headphones,
    description:
      "Customer support queue and live chat with agents. When disabled, the Agent menu item will be hidden from the navigation.",
  },
}

export default function FeaturesSettingsPage() {
  const [features, setFeatures] = useState<FeatureConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchFeatures()
  }, [])

  async function fetchFeatures() {
    try {
      const response = await fetch("/api/admin/features")
      if (response.ok) {
        const data = await response.json()
        setFeatures(data)
      }
    } catch (err) {
      console.error("Failed to fetch features:", err)
      setError("Failed to load feature configurations")
    } finally {
      setLoading(false)
    }
  }

  async function saveFeature(feature: FeatureConfig) {
    setSaving(feature.feature)
    setError(null)
    setSaved(null)

    try {
      const response = await fetch("/api/admin/features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feature),
      })

      if (response.ok) {
        setSaved(feature.feature)
        setTimeout(() => setSaved(null), 3000)
        fetchFeatures()
      } else {
        const data = await response.json()
        setError(data.error || "Failed to save")
      }
    } catch (err) {
      console.error("Failed to save feature:", err)
      setError("Failed to save feature configuration")
    } finally {
      setSaving(null)
    }
  }

  function updateFeature(featureName: string, updates: Partial<FeatureConfig>) {
    setFeatures((prev) =>
      prev.map((f) =>
        f.feature === featureName ? { ...f, ...updates } : f
      )
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Feature Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Enable or disable application capabilities. Disabled features will be
          hidden from the navigation.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {features.map((feature) => {
          const meta = featureMeta[feature.feature]
          if (!meta) return null

          const Icon = meta.icon
          const isSaving = saving === feature.feature
          const isSaved = saved === feature.feature

          return (
            <Card key={feature.feature}>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-muted shrink-0">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base">{meta.name}</CardTitle>
                      <CardDescription>{meta.description}</CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`${feature.feature}-enabled`}
                        className="text-sm"
                      >
                        Enabled
                      </Label>
                      <Switch
                        id={`${feature.feature}-enabled`}
                        checked={feature.enabled}
                        onCheckedChange={(checked) =>
                          updateFeature(feature.feature, { enabled: checked })
                        }
                      />
                    </div>

                    <Button
                      onClick={() => saveFeature(feature)}
                      disabled={isSaving}
                      size="sm"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : isSaved ? (
                        <CheckCircle className="h-4 w-4 mr-2 text-chart-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      {isSaved ? "Saved!" : "Save"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      <Card className="bg-muted/50 border-dashed">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Changes to feature settings may require you
            to refresh your browser to see the updated navigation.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
