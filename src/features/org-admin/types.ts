/** The rows `/api/organizations/**` answers with (rust/crates/agents-server/src/routes/organizations). */

export type OrgRole = "owner" | "admin" | "member" | "viewer"

export interface OrgDetail {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  passwordLoginEnabled: boolean
  role: OrgRole
  createdAt: string
  updatedAt: string
}

export type UnitKind = "department" | "team"

export interface UnitNode {
  id: string
  parentId: string | null
  kind: UnitKind
  name: string
  slug: string
  externalId: string | null
  createdAt: string
  updatedAt: string
  children: UnitNode[]
}

export interface MemberUnit {
  unitId: string
  role: "lead" | "member"
  source: "manual" | "idp"
}

export interface OrgMember {
  id: string
  userId: string
  email: string
  name: string | null
  role: OrgRole
  invitedBy: string | null
  invitedAt: string
  acceptedAt: string | null
  isPending: boolean
  units: MemberUnit[]
}

export interface UnitMember {
  userId: string
  role: "lead" | "member"
  source: "manual" | "idp"
  createdAt: string
}

export interface AuditRow {
  id: string
  action: string
  resource: string
  detail: unknown
  userId: string | null
  ipAddress: string | null
  riskLevel: string
  createdAt: string
}

export interface CursorPage<T> {
  data: T[]
  nextCursor: string | null
}

/** `/api/dashboard/sso/providers` (routes/auth/providers.rs). The secret is never returned. */
export interface IdentityProvider {
  id: string
  kind: string
  name: string
  isEnabled: boolean
  preset: "keycloak" | "entra" | "google" | "generic" | null
  issuer: string | null
  discoveryUrl: string | null
  tenantId: string | null
  hostedDomain: string | null
  clientId: string | null
  hasClientSecret: boolean
  scopes: string[]
  groupsClaim: string | null
  roleMapping: Record<string, string>
  emailDomains: string[]
  isJitEnabled: boolean
  defaultRole: OrgRole
  callbackUrl: string
  /** Comes from `AUTH_OIDC_*`: shown, never edited here. */
  isManagedByEnv: boolean
  createdAt: string
  updatedAt: string
}

export type ProviderPreset = NonNullable<IdentityProvider["preset"]>

export interface ProviderWriteBody {
  name?: string
  preset?: ProviderPreset
  issuer?: string | null
  discoveryUrl?: string | null
  tenantId?: string | null
  hostedDomain?: string | null
  clientId?: string
  clientSecret?: string | null
  scopes?: string[]
  groupsClaim?: string | null
  roleMapping?: Record<string, string>
  emailDomains?: string[]
  isEnabled?: boolean
  isJitEnabled?: boolean
  defaultRole?: OrgRole
}

/** A grant, as `/api/assistants/{id}/access` answers (`routes/assistants/access.rs`). */
export interface AccessGrant {
  id: string
  subjectType: "org" | "unit" | "user"
  subjectId: string
  subjectName?: string
  level: "use" | "manage"
  grantedBy: string
  createdAt: string
}

export interface AccessGrantBody {
  subjectType: "org" | "unit" | "user"
  subjectId: string
  level: "use" | "manage"
}
