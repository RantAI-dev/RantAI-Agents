"use client"

import { useState } from "react"
import { Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  IdentityProvider,
  OrgRole,
  ProviderPreset,
  ProviderWriteBody,
} from "@/features/org-admin/types"
import {
  PROVIDER_PRESETS,
  formatEmailDomains,
  formatRoleMapping,
  presetDefinition,
  providerBodyFromForm,
} from "@/features/org-admin/provider-presets"

interface FormState {
  name: string
  preset: ProviderPreset
  issuer: string
  tenantId: string
  hostedDomain: string
  discoveryUrl: string
  clientId: string
  clientSecret: string
  emailDomains: string
  groupsClaim: string
  roleMapping: string
  defaultRole: OrgRole
  isJitEnabled: boolean
  isEnabled: boolean
}

const BLANK: FormState = {
  name: "",
  preset: "keycloak",
  issuer: "",
  tenantId: "",
  hostedDomain: "",
  discoveryUrl: "",
  clientId: "",
  clientSecret: "",
  emailDomains: "",
  groupsClaim: "groups",
  roleMapping: "",
  defaultRole: "member",
  isJitEnabled: false,
  isEnabled: true,
}

function formFrom(provider: IdentityProvider): FormState {
  return {
    name: provider.name,
    preset: provider.preset ?? "generic",
    issuer: provider.issuer ?? "",
    tenantId: provider.tenantId ?? "",
    hostedDomain: provider.hostedDomain ?? "",
    discoveryUrl: provider.discoveryUrl ?? "",
    clientId: provider.clientId ?? "",
    clientSecret: "",
    emailDomains: formatEmailDomains(provider.emailDomains),
    groupsClaim: provider.groupsClaim ?? "",
    roleMapping: formatRoleMapping(provider.roleMapping),
    defaultRole: provider.defaultRole,
    isJitEnabled: provider.isJitEnabled,
    isEnabled: provider.isEnabled,
  }
}

/**
 * Create or edit one identity provider. A preset only fills defaults, so the form shows the
 * fields that preset asks for; the secret is written but never read back.
 * The parent mounts this with a `key`, so opening another provider starts from that provider.
 */
export function ProviderFormDialog({
  open,
  provider,
  busy,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  provider: IdentityProvider | null
  busy: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (body: ProviderWriteBody) => void
}) {
  const [form, setForm] = useState<FormState>(() => (provider ? formFrom(provider) : BLANK))
  const preset = presetDefinition(form.preset)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(providerBodyFromForm(form))
          }}
        >
          <DialogHeader>
            <DialogTitle>{provider ? "Edit provider" : "Add an identity provider"}</DialogTitle>
            <DialogDescription>
              The preset only fills defaults. Save, then register the redirect URL at the provider.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider-name">Name</Label>
                <Input
                  id="provider-name"
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Acme Keycloak"
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-preset">Preset</Label>
                <Select
                  value={form.preset}
                  onValueChange={(value) => setForm({ ...form, preset: value as ProviderPreset })}
                  disabled={busy}
                >
                  <SelectTrigger id="provider-preset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_PRESETS.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{preset.description}</p>
              </div>
            </div>

            {preset.shows.issuer && (
              <div className="space-y-2">
                <Label htmlFor="provider-issuer">Issuer</Label>
                <Input
                  id="provider-issuer"
                  value={form.issuer}
                  onChange={(event) => setForm({ ...form, issuer: event.target.value })}
                  placeholder={preset.issuerHint}
                  disabled={busy}
                />
              </div>
            )}
            {preset.shows.tenantId && (
              <div className="space-y-2">
                <Label htmlFor="provider-tenant">Directory (tenant) id</Label>
                <Input
                  id="provider-tenant"
                  value={form.tenantId}
                  onChange={(event) => setForm({ ...form, tenantId: event.target.value })}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  One directory only; multi-tenant aliases such as common are refused.
                </p>
              </div>
            )}
            {preset.shows.hostedDomain && (
              <div className="space-y-2">
                <Label htmlFor="provider-domain">Workspace domain</Label>
                <Input
                  id="provider-domain"
                  value={form.hostedDomain}
                  onChange={(event) => setForm({ ...form, hostedDomain: event.target.value })}
                  placeholder="example.com"
                  disabled={busy}
                />
              </div>
            )}
            {preset.shows.discoveryUrl && (
              <div className="space-y-2">
                <Label htmlFor="provider-discovery">Discovery URL (optional)</Label>
                <Input
                  id="provider-discovery"
                  value={form.discoveryUrl}
                  onChange={(event) => setForm({ ...form, discoveryUrl: event.target.value })}
                  placeholder="https://idp.example.com/.well-known/openid-configuration"
                  disabled={busy}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider-client-id">Client id</Label>
                <Input
                  id="provider-client-id"
                  required
                  value={form.clientId}
                  onChange={(event) => setForm({ ...form, clientId: event.target.value })}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-client-secret">
                  Client secret {provider?.hasClientSecret ? "(leave empty to keep)" : ""}
                </Label>
                <Input
                  id="provider-client-secret"
                  type="password"
                  autoComplete="new-password"
                  value={form.clientSecret}
                  onChange={(event) => setForm({ ...form, clientSecret: event.target.value })}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-domains">Email domains</Label>
              <Input
                id="provider-domains"
                value={form.emailDomains}
                onChange={(event) => setForm({ ...form, emailDomains: event.target.value })}
                placeholder="example.com, example.co.uk"
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                These decide who is sent here from the sign-in screen.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider-groups">Groups claim</Label>
                <Input
                  id="provider-groups"
                  value={form.groupsClaim}
                  onChange={(event) => setForm({ ...form, groupsClaim: event.target.value })}
                  placeholder="groups"
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-default-role">Role for new accounts</Label>
                <Select
                  value={form.defaultRole}
                  onValueChange={(value) => setForm({ ...form, defaultRole: value as OrgRole })}
                  disabled={busy}
                >
                  <SelectTrigger id="provider-default-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-role-mapping">Group → role</Label>
              <Textarea
                id="provider-role-mapping"
                value={form.roleMapping}
                onChange={(event) => setForm({ ...form, roleMapping: event.target.value })}
                placeholder={"it-admins=admin\nstaff=member"}
                rows={3}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                One <code>group=role</code> per line. Group → unit is set on the unit itself, in
                Teams, as its identity-provider group.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="provider-jit" className="text-sm">
                  Create accounts on first sign-in
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off means an admin invites the person first.
                </p>
              </div>
              <Switch
                id="provider-jit"
                checked={form.isJitEnabled}
                onCheckedChange={(value) => setForm({ ...form, isJitEnabled: value })}
                disabled={busy}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="provider-enabled" className="text-sm">
                  Enabled
                </Label>
                <p className="text-xs text-muted-foreground">
                  A disabled provider stays configured but is never offered.
                </p>
              </div>
              <Switch
                id="provider-enabled"
                checked={form.isEnabled}
                onCheckedChange={(value) => setForm({ ...form, isEnabled: value })}
                disabled={busy}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !form.name.trim() || !form.clientId.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
