"use client"

import { useEffect, useState } from "react"
import { Building2, Save, AlertCircle, Loader2, CheckCircle } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface OrganizationSettingsOrganization {
  id: string
  name: string
  slug: string
  role: "owner" | "admin" | "member" | "viewer"
}

const STORAGE_KEY = "rantai-active-organization"

export default function OrganizationSettingsPage({
  initialOrganizations = [],
}: {
  initialOrganizations?: OrganizationSettingsOrganization[]
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Organization</h2>
        <p className="text-sm text-muted-foreground">
          Manage your organization settings and information.
        </p>
      </div>
      <OrganizationSettingsContent initialOrganizations={initialOrganizations} />
    </div>
  )
}

function OrganizationSettingsContent({
  initialOrganizations,
}: {
  initialOrganizations: OrganizationSettingsOrganization[]
}) {
  const [activeOrganization, setActiveOrganization] = useState<OrganizationSettingsOrganization | null>(
    initialOrganizations[0] ?? null
  )

  const [name, setName] = useState(initialOrganizations[0]?.name || "")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (initialOrganizations.length === 0) {
      setActiveOrganization(null)
      setName("")
      return
    }

    const storedOrgId = localStorage.getItem(STORAGE_KEY)
    const storedOrg = storedOrgId
      ? initialOrganizations.find((organization) => organization.id === storedOrgId)
      : null
    const nextOrganization = storedOrg ?? initialOrganizations[0]

    setActiveOrganization(nextOrganization)
    setName(nextOrganization.name)

    if (storedOrg?.id !== nextOrganization.id) {
      localStorage.setItem(STORAGE_KEY, nextOrganization.id)
    }
  }, [initialOrganizations])

  if (!activeOrganization) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No active organization. Create or join one to manage settings.
        </CardContent>
      </Card>
    )
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Organization name is required")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/organizations/${activeOrganization.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update organization")
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setName(trimmedName)
      setActiveOrganization((current) =>
        current ? { ...current, name: trimmedName } : current
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update organization")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            General
          </CardTitle>
          <CardDescription>
            Basic organization information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Organization"
            />
          </div>

          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={activeOrganization.slug} disabled />
            <p className="text-xs text-muted-foreground">
              The URL-friendly identifier for your organization.
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : saved ? (
                <CheckCircle className="h-4 w-4 mr-2 text-chart-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saved ? "Saved!" : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
