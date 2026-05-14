// Permission helpers for organization roles. The resolver itself lives in
// `@/lib/org-context` (single source of truth). Import the helpers from here
// or migrate to `@/lib/org-context` which re-exports the same set.

export function canEdit(role: string): boolean {
  return ["owner", "admin", "member"].includes(role)
}

export function canManage(role: string): boolean {
  return ["owner", "admin"].includes(role)
}

export function isOwner(role: string): boolean {
  return role === "owner"
}
