"use client"

import { useEffect, useState } from "react"
import { Building2, Save, Loader2, CheckCircle, AlertCircle } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useOrgFetch, useOrganization } from "@/hooks/use-organization"
import { useApiResource } from "@/hooks/use-api-resource"
import { readApiError } from "@/lib/api/error"
import { orgApi, orgPaths } from "@/features/org-admin/api"
import type { OrgDetail } from "@/features/org-admin/types"

/**
 * General: the company's name, its slug, and whether passwords may sign in at all.
 * The name and slug need `org.manage` (owners); the password switch needs `org.sso.manage`
 * (owners and admins), so the save button sends only what this caller may change.
 */
export default function OrgGeneralPage() {
  const { isOwner, isAdmin } = useOrganization()
  const orgFetch = useOrgFetch()
  const { activeOrganization } = useOrganization()
  const orgId = activeOrganization?.id ?? null
  const detail = useApiResource<OrgDetail>(orgId && isAdmin ? orgPaths.org(orgId) : null)

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [passwordLoginEnabled, setPasswordLoginEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!detail.data) return
    setName(detail.data.name)
    setSlug(detail.data.slug)
    setPasswordLoginEnabled(detail.data.passwordLoginEnabled)
  }, [detail.data])

  if (!orgId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select an organisation to manage it.
        </CardContent>
      </Card>
    )
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Only owners and admins may change the organisation settings.
        </CardContent>
      </Card>
    )
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    const body: { name?: string; slug?: string; passwordLoginEnabled?: boolean } = {}
    if (isOwner) {
      body.name = name.trim()
      body.slug = slug.trim()
    }
    body.passwordLoginEnabled = passwordLoginEnabled
    try {
      const response = await orgApi.update(orgFetch, orgId, body)
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(failure.message)
        return
      }
      const updated = (await response.json()) as OrgDetail
      detail.setData(updated)
      setSaved(true)
    } catch {
      setError("We could not reach the server. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Building2 className="h-5 w-5" />
          General
        </h2>
        <p className="text-sm text-muted-foreground">
          The company this workspace belongs to, and how its people sign in.
        </p>
      </div>

      {detail.error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {detail.error}
        </div>
      )}

      {detail.loading && !detail.data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <form onSubmit={save} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 px-4 py-3 text-sm">
              <CheckCircle className="h-4 w-4 shrink-0 text-chart-2" />
              Saved.
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organisation</CardTitle>
              <CardDescription>
                {isOwner
                  ? "The name people see, and the slug used in links."
                  : "Only the owner may rename the organisation."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!isOwner || saving}
                  maxLength={100}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  disabled={!isOwner || saving}
                  maxLength={63}
                  pattern="[a-z0-9-]+"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Lower-case letters, digits and hyphens.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sign-in</CardTitle>
              <CardDescription>
                With passwords off, everyone signs in through the organisation&apos;s identity
                provider.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="password-login" className="text-sm font-medium">
                    Allow password sign-in
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Turning this off hides the password form for your organisation&apos;s people.
                    Keep at least one identity provider enabled first.
                  </p>
                </div>
                <Switch
                  id="password-login"
                  checked={passwordLoginEnabled}
                  onCheckedChange={setPasswordLoginEnabled}
                  disabled={saving}
                />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save changes
          </Button>
        </form>
      )}
    </div>
  )
}
