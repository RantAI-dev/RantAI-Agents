/**
 * The organisation, its members and its units, as the Rust admin API answers them.
 * Every call sends the active organisation in `x-organization-id` (see `useOrgFetch`), so a
 * caller passes the fetcher from the provider rather than `fetch` itself.
 */

import type {
  AuditRow,
  CursorPage,
  IdentityProvider,
  OrgDetail,
  OrgMember,
  OrgRole,
  ProviderWriteBody,
  UnitMember,
  UnitNode,
} from "./types"

export type OrgFetch = (url: string, options?: RequestInit) => Promise<Response>

export const orgPaths = {
  org: (orgId: string) => `/api/organizations/${orgId}`,
  members: (orgId: string) => `/api/organizations/${orgId}/members`,
  member: (orgId: string, memberId: string) => `/api/organizations/${orgId}/members/${memberId}`,
  units: (orgId: string) => `/api/organizations/${orgId}/units`,
  unit: (orgId: string, unitId: string) => `/api/organizations/${orgId}/units/${unitId}`,
  unitMembers: (orgId: string, unitId: string) =>
    `/api/organizations/${orgId}/units/${unitId}/members`,
  audit: (orgId: string, cursor?: string | null) =>
    `/api/organizations/${orgId}/audit?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  providers: "/api/dashboard/sso/providers",
  provider: (id: string) => `/api/dashboard/sso/providers/${id}`,
  providerTest: (id: string) => `/api/dashboard/sso/providers/${id}/test`,
} as const

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }
}

export const orgApi = {
  update: (orgFetch: OrgFetch, orgId: string, body: Partial<Pick<OrgDetail, "name" | "slug" | "passwordLoginEnabled">>) =>
    orgFetch(orgPaths.org(orgId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),

  invite: (orgFetch: OrgFetch, orgId: string, email: string, role: OrgRole) =>
    orgFetch(orgPaths.members(orgId), jsonBody({ email, role })),

  changeRole: (orgFetch: OrgFetch, orgId: string, memberId: string, role: OrgRole) =>
    orgFetch(orgPaths.member(orgId, memberId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    }),

  removeMember: (orgFetch: OrgFetch, orgId: string, memberId: string) =>
    orgFetch(orgPaths.member(orgId, memberId), { method: "DELETE" }),

  createUnit: (
    orgFetch: OrgFetch,
    orgId: string,
    body: { name: string; kind: UnitNode["kind"]; parentId?: string | null },
  ) => orgFetch(orgPaths.units(orgId), jsonBody(body)),

  /** A rename, a move (`parentId`, `null` for the top level), a new external id, or several. */
  updateUnit: (
    orgFetch: OrgFetch,
    orgId: string,
    unitId: string,
    body: { name?: string; externalId?: string | null; parentId?: string | null },
  ) =>
    orgFetch(orgPaths.unit(orgId, unitId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),

  deleteUnit: (orgFetch: OrgFetch, orgId: string, unitId: string) =>
    orgFetch(orgPaths.unit(orgId, unitId), { method: "DELETE" }),

  addUnitMember: (orgFetch: OrgFetch, orgId: string, unitId: string, userId: string, isLead: boolean) =>
    orgFetch(orgPaths.unitMembers(orgId, unitId), jsonBody({ userId, isLead })),

  removeUnitMember: (orgFetch: OrgFetch, orgId: string, unitId: string, userId: string) =>
    orgFetch(orgPaths.unitMembers(orgId, unitId), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    }),

  createProvider: (orgFetch: OrgFetch, body: ProviderWriteBody) =>
    orgFetch(orgPaths.providers, jsonBody(body)),

  updateProvider: (orgFetch: OrgFetch, id: string, body: ProviderWriteBody) =>
    orgFetch(orgPaths.provider(id), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),

  deleteProvider: (orgFetch: OrgFetch, id: string) =>
    orgFetch(orgPaths.provider(id), { method: "DELETE" }),

  testProvider: (orgFetch: OrgFetch, id: string) =>
    orgFetch(orgPaths.providerTest(id), { method: "POST" }),
}

export type { AuditRow, CursorPage, IdentityProvider, OrgDetail, OrgMember, UnitMember, UnitNode }
