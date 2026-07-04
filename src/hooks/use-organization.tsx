"use client"

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  ReactNode,
} from "react"

export interface Organization {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  role: "owner" | "admin" | "member" | "viewer"
  createdAt: string
  joinedAt?: string
}

export interface OrganizationMember {
  id: string
  userId: string
  email: string
  name: string | null
  role: "owner" | "admin" | "member" | "viewer"
  invitedBy: string | null
  invitedAt: string
  acceptedAt: string | null
  isPending: boolean
}

const STORAGE_KEY = "rantai-active-organization"

interface OrganizationContextType {
  organizations: Organization[]
  activeOrganization: Organization | null
  setActiveOrganization: (org: Organization | null) => void
  membership: Organization | null // Current user's membership/role info
  isOwner: boolean
  isAdmin: boolean
  canEdit: boolean // Owner, Admin, or Member
  canView: boolean // Any role
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  createOrganization: (name: string) => Promise<Organization | null>
}

const OrganizationContext = createContext<OrganizationContextType | null>(null)

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [activeOrganization, setActiveOrganizationState] = useState<Organization | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch organizations
  const fetchOrganizations = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch("/api/organizations")
      if (!response.ok) {
        throw new Error("Failed to fetch organizations")
      }

      const data = await response.json()
      setOrganizations(data)

      // Restore active organization from localStorage
      const storedOrgId = localStorage.getItem(STORAGE_KEY)
      if (storedOrgId) {
        const storedOrg = data.find((org: Organization) => org.id === storedOrgId)
        if (storedOrg) {
          setActiveOrganizationState(storedOrg)
        } else if (data.length > 0) {
          // Fallback to first org if stored one not found
          setActiveOrganizationState(data[0])
          localStorage.setItem(STORAGE_KEY, data[0].id)
        }
      } else if (data.length > 0) {
        // Default to first org
        setActiveOrganizationState(data[0])
        localStorage.setItem(STORAGE_KEY, data[0].id)
      }
    } catch (err) {
      console.error("[useOrganization] Fetch error:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch organizations")
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load on mount
  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  // Set active organization. Persists to:
  //   - localStorage (fast client read, no fetch needed for org selector UI)
  //   - HTTP-only cookie via API (server reads this in resolveActiveOrg)
  // The cookie is the source of truth server-side; localStorage is a mirror.
  // Also broadcasts ACTIVE_ORG_CHANGED_EVENT so other hooks can refetch.
  const setActiveOrganization = useCallback((org: Organization | null) => {
    setActiveOrganizationState(org)
    if (org) {
      localStorage.setItem(STORAGE_KEY, org.id)
      void fetch("/api/user/active-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org.id }),
        credentials: "include",
      })
        .catch(() => {
          // Cookie write failure is non-fatal — server may briefly resolve via
          // the auto-pick branch until the next attempt.
        })
        .finally(() => {
          window.dispatchEvent(new CustomEvent(ACTIVE_ORG_CHANGED_EVENT))
        })
    } else {
      localStorage.removeItem(STORAGE_KEY)
      void fetch("/api/user/active-organization", {
        method: "DELETE",
        credentials: "include",
      })
        .catch(() => {})
        .finally(() => {
          window.dispatchEvent(new CustomEvent(ACTIVE_ORG_CHANGED_EVENT))
        })
    }
  }, [])

  // Migration shim: on first mount, if localStorage has a value but the cookie
  // hasn't been set yet (existing users from before this fix), POST to set it.
  // Idempotent — backend just rewrites the cookie. Fires once per session.
  const migratedRef = useRef(false)
  useEffect(() => {
    if (migratedRef.current) return
    if (!activeOrganization?.id) return
    migratedRef.current = true
    void fetch("/api/user/active-organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: activeOrganization.id }),
      credentials: "include",
    }).catch(() => {})
  }, [activeOrganization?.id])

  // Create new organization
  const createOrganization = useCallback(async (name: string): Promise<Organization | null> => {
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create organization")
      }

      const newOrg = await response.json()
      setOrganizations((prev) => [...prev, newOrg])
      setActiveOrganization(newOrg)
      return newOrg
    } catch (err) {
      console.error("[useOrganization] Create error:", err)
      setError(err instanceof Error ? err.message : "Failed to create organization")
      return null
    }
  }, [setActiveOrganization])

  // Role-based permissions
  const role = activeOrganization?.role
  const isOwner = role === "owner"
  const isAdmin = role === "admin" || role === "owner"
  const canEdit = role === "owner" || role === "admin" || role === "member"
  const canView = !!role

  return (
    <OrganizationContext.Provider
      value={{
        organizations,
        activeOrganization,
        setActiveOrganization,
        membership: activeOrganization,
        isOwner,
        isAdmin,
        canEdit,
        canView,
        isLoading,
        error,
        refetch: fetchOrganizations,
        createOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error("useOrganization must be used within an OrganizationProvider")
  }
  return context
}

// Hook to fetch members of an organization
export function useOrganizationMembers(organizationId: string | null) {
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    if (!organizationId) {
      setMembers([])
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`/api/organizations/${organizationId}/members`)
      if (!response.ok) {
        throw new Error("Failed to fetch members")
      }

      const data = await response.json()
      setMembers(data)
    } catch (err) {
      console.error("[useOrganizationMembers] Fetch error:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch members")
    } finally {
      setIsLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const inviteMember = useCallback(async (email: string, role: string = "member") => {
    if (!organizationId) return null

    try {
      const response = await fetch(`/api/organizations/${organizationId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to invite member")
      }

      const newMember = await response.json()
      setMembers((prev) => [...prev, newMember])
      return newMember
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite member")
      return null
    }
  }, [organizationId])

  const updateMemberRole = useCallback(async (memberId: string, role: string) => {
    if (!organizationId) return false

    try {
      const response = await fetch(`/api/organizations/${organizationId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update member")
      }

      const updatedMember = await response.json()
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? updatedMember : m))
      )
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member")
      return false
    }
  }, [organizationId])

  const removeMember = useCallback(async (memberId: string) => {
    if (!organizationId) return false

    try {
      const response = await fetch(`/api/organizations/${organizationId}/members/${memberId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to remove member")
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId))
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member")
      return false
    }
  }, [organizationId])

  return {
    members,
    isLoading,
    error,
    refetch: fetchMembers,
    inviteMember,
    updateMemberRole,
    removeMember,
  }
}

/**
 * Hook that provides a fetch function with organization context header.
 *
 * The returned function has *stable identity* — it does not change when the
 * active organization changes. This means callers can safely use it in
 * useCallback / useEffect dependency arrays without re-creating their closures
 * on every org switch.
 *
 * To auto-refresh data when the user switches orgs, listen for the
 * `ACTIVE_ORG_CHANGED_EVENT` window event instead. See `useActiveOrgChange`.
 */
export const ACTIVE_ORG_CHANGED_EVENT = "rantai-active-org-changed"

export function useOrgFetch() {
  const { activeOrganization } = useOrganization()
  const activeOrgIdRef = useRef<string | null>(activeOrganization?.id ?? null)
  activeOrgIdRef.current = activeOrganization?.id ?? null

  return useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(options.headers)
      if (activeOrgIdRef.current) {
        headers.set("x-organization-id", activeOrgIdRef.current)
      }
      const res = await fetch(url, { ...options, headers, credentials: "include" })

      // Central upgrade-wall bridge: whenever any dashboard API blocks an action
      // for a plan/limit reason (it responds with `upgradeRequired`), surface the
      // cloud upgrade modal so the user understands why — instead of a silent
      // failure or a raw error. Covers make-agent, make-workflow, run-workflow,
      // API keys, members, storage, etc. Reads a clone so callers still get the body.
      if (
        (res.status === 402 || res.status === 403 || res.status === 429) &&
        typeof window !== "undefined"
      ) {
        try {
          const body = await res.clone().json()
          if (body?.upgradeRequired) {
            window.dispatchEvent(new CustomEvent("rantai:upgrade-required", { detail: body }))
          }
        } catch {
          // non-JSON body (or already consumed) — nothing to surface
        }
      }

      return res
    },
    []
  )
}

/**
 * Subscribe to active-organization changes. Hooks should call this and
 * re-run their fetches when the event fires.
 */
export function useActiveOrgChange(handler: () => void) {
  useEffect(() => {
    const cb = () => handler()
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, cb)
    return () => window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, cb)
  }, [handler])
}

/**
 * Get organization headers for use outside of React components
 */
export function getOrgHeaders(organizationId: string | null | undefined): HeadersInit {
  if (!organizationId) return {}
  return { "x-organization-id": organizationId }
}
