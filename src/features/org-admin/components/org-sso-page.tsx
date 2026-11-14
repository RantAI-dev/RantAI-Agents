"use client"

import { useState } from "react"
import {
  AlertCircle,
  CheckCircle,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useOrgFetch, useOrganization } from "@/hooks/use-organization"
import { useApiResource } from "@/hooks/use-api-resource"
import { readApiError } from "@/lib/api/error"
import { orgApi, orgPaths } from "@/features/org-admin/api"
import type {
  CursorPage,
  IdentityProvider,
  ProviderWriteBody,
} from "@/features/org-admin/types"
import { presetDefinition } from "@/features/org-admin/provider-presets"
import { ProviderFormDialog } from "./provider-form-dialog"

/**
 * SSO: the organisation's identity providers. The client secret goes in and never comes back
 * (`hasClientSecret` says whether one is stored); the callback URL is shown so an admin can
 * register it at the provider. A provider that comes from `AUTH_OIDC_*` is read-only here: the
 * operator chose it, not this organisation.
 */
export default function OrgSsoPage() {
  const orgFetch = useOrgFetch()
  const { activeOrganization, isAdmin } = useOrganization()
  const providers = useApiResource<CursorPage<IdentityProvider>>(
    activeOrganization && isAdmin ? orgPaths.providers : null,
  )

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<IdentityProvider | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<IdentityProvider | null>(null)

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Only owners and admins may manage identity providers.
        </CardContent>
      </Card>
    )
  }

  const openCreate = () => {
    setEditing(null)
    setError(null)
    setNotice(null)
    setFormOpen(true)
  }

  const openEdit = (provider: IdentityProvider) => {
    setEditing(provider)
    setError(null)
    setNotice(null)
    setFormOpen(true)
  }

  const submit = async (body: ProviderWriteBody) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const response = editing
        ? await orgApi.updateProvider(orgFetch, editing.id, body)
        : await orgApi.createProvider(orgFetch, body)
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(failure.message)
        return
      }
      setFormOpen(false)
      setNotice(editing ? "The provider was saved." : "The provider was added.")
      providers.reload()
    } catch {
      setError("We could not reach the server. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const test = async (provider: IdentityProvider) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const response = await orgApi.testProvider(orgFetch, provider.id)
      if (!response.ok) {
        const failure = await readApiError(response)
        setError(`${provider.name}: ${failure.message}`)
        return
      }
      setNotice(`${provider.name}: the provider answered, and its signing keys were fetched.`)
    } catch {
      setError("We could not reach the server. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
    } catch {
      setCopied(null)
    }
  }

  const rows = providers.data?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <KeyRound className="h-5 w-5" />
            Single sign-on
          </h2>
          <p className="text-sm text-muted-foreground">
            Identity providers, in the order people meet them. An email domain belongs to one
            organisation only.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add provider
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 px-4 py-3 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0 text-chart-2" />
          {notice}
        </div>
      )}
      {providers.error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {providers.error}
        </div>
      )}

      {providers.loading && !providers.data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading providers...
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No identity provider yet. People sign in with their password until one is enabled.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rows.map((provider) => (
            <Card key={provider.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{provider.name}</CardTitle>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {presetDefinition(provider.preset).label}
                  </Badge>
                  <Badge variant={provider.isEnabled ? "default" : "secondary"} className="text-[10px]">
                    {provider.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  {provider.isJitEnabled && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      Creates accounts
                    </Badge>
                  )}
                  {provider.isManagedByEnv && (
                    <Badge variant="secondary" className="text-[10px]">
                      From the environment
                    </Badge>
                  )}
                </div>
                {provider.emailDomains.length > 0 && (
                  <CardDescription>
                    Sign-in for {provider.emailDomains.join(", ")}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Register this redirect URL at the provider
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                      {provider.callbackUrl}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copy(provider.callbackUrl, provider.id)}
                    >
                      {copied === provider.id ? (
                        <CheckCircle className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1 h-3.5 w-3.5" />
                      )}
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {provider.issuer && <span className="truncate">Issuer: {provider.issuer}</span>}
                  {provider.tenantId && <span>Directory: {provider.tenantId}</span>}
                  {provider.hostedDomain && <span>Domain: {provider.hostedDomain}</span>}
                  <span>Client secret: {provider.hasClientSecret ? "stored" : "none"}</span>
                  {Object.keys(provider.roleMapping).length > 0 && (
                    <span>
                      Group roles:{" "}
                      {Object.entries(provider.roleMapping)
                        .map(([group, role]) => `${group} → ${role}`)
                        .join(", ")}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || provider.isManagedByEnv}
                    onClick={() => openEdit(provider)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void test(provider)}>
                    {busy ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={busy || provider.isManagedByEnv}
                    onClick={() => setDeleteTarget(provider)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {formOpen && (
        <ProviderFormDialog
          key={editing?.id ?? "new"}
          open={formOpen}
          provider={editing}
          busy={busy}
          error={error}
          onOpenChange={setFormOpen}
          onSubmit={(body) => void submit(body)}
        />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              People who sign in through it lose that route. Their accounts stay; they sign in with
              a password or another provider instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = deleteTarget
                setDeleteTarget(null)
                if (!target) return
                void (async () => {
                  const response = await orgApi.deleteProvider(orgFetch, target.id)
                  if (!response.ok) {
                    const failure = await readApiError(response)
                    setError(failure.message)
                    return
                  }
                  providers.reload()
                })()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
