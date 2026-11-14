/**
 * The four identity-provider presets, and the fields each one asks for.
 *
 * A preset only fills defaults (design §3.5): Keycloak takes the realm URL, Entra takes the
 * directory id, Google takes the Workspace domain, and a generic provider takes its issuer. The
 * service validates the same rules, so a form that follows this cannot offer a field the API
 * would refuse.
 */

import type { IdentityProvider, ProviderPreset } from "./types"

export interface PresetDefinition {
  id: ProviderPreset
  label: string
  description: string
  /** Whether the form shows each of the preset-specific fields. */
  shows: { issuer: boolean; tenantId: boolean; hostedDomain: boolean; discoveryUrl: boolean }
  issuerHint?: string
}

export const PROVIDER_PRESETS: PresetDefinition[] = [
  {
    id: "keycloak",
    label: "Keycloak",
    description: "Self-hosted Keycloak, or any provider that serves a realm.",
    shows: { issuer: true, tenantId: false, hostedDomain: false, discoveryUrl: true },
    issuerHint: "https://sso.example.com/realms/example",
  },
  {
    id: "entra",
    label: "Microsoft Entra ID",
    description: "Microsoft 365 / Azure AD, one directory.",
    shows: { issuer: false, tenantId: true, hostedDomain: false, discoveryUrl: false },
  },
  {
    id: "google",
    label: "Google Workspace",
    description: "Google accounts; a domain keeps it inside the company.",
    shows: { issuer: false, tenantId: false, hostedDomain: true, discoveryUrl: false },
  },
  {
    id: "generic",
    label: "Any OIDC provider",
    description: "Okta, Auth0, or any provider with discovery.",
    shows: { issuer: true, tenantId: false, hostedDomain: false, discoveryUrl: true },
    issuerHint: "https://idp.example.com",
  },
]

export function presetDefinition(preset: ProviderPreset | null): PresetDefinition {
  return PROVIDER_PRESETS.find((entry) => entry.id === preset) ?? PROVIDER_PRESETS[3]
}

/** `["a.com", " b.com "]` → `["a.com", "b.com"]`, dropping blanks. */
export function parseEmailDomains(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
}

export function formatEmailDomains(domains: string[]): string {
  return domains.join(", ")
}

/** `"it-admins=admin\nstaff=member"` → `{ "it-admins": "admin", "staff": "member" }`. */
export function parseRoleMapping(text: string): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const [group, role] = line.split("=")
    const key = group?.trim()
    const value = role?.trim()
    if (key && value) mapping[key] = value
  }
  return mapping
}

export function formatRoleMapping(mapping: Record<string, string>): string {
  return Object.entries(mapping)
    .map(([group, role]) => `${group}=${role}`)
    .join("\n")
}

/** The body a create sends for the form's state; an edit sends the same fields, so a cleared
 *  optional field becomes `null` and the stored value is cleared. */
export function providerBodyFromForm(form: {
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
  defaultRole: IdentityProvider["defaultRole"]
  isJitEnabled: boolean
  isEnabled: boolean
}) {
  return {
    name: form.name.trim(),
    preset: form.preset,
    issuer: form.issuer.trim() || null,
    tenantId: form.tenantId.trim() || null,
    hostedDomain: form.hostedDomain.trim() || null,
    discoveryUrl: form.discoveryUrl.trim() || null,
    clientId: form.clientId.trim(),
    ...(form.clientSecret.trim() ? { clientSecret: form.clientSecret.trim() } : {}),
    emailDomains: parseEmailDomains(form.emailDomains),
    groupsClaim: form.groupsClaim.trim() || null,
    roleMapping: parseRoleMapping(form.roleMapping),
    defaultRole: form.defaultRole,
    isJitEnabled: form.isJitEnabled,
    isEnabled: form.isEnabled,
  }
}
