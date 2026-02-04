"use client"

import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  ReactNode,
} from "react"

export interface OrganizationLimits {
  maxMembers: number
  maxAssistants: number
  maxDocuments: number
  maxApiKeys: number
}

export interface OrganizationCounts {
  members: number
  assistants: number
  documents: number
  apiKeys: number
}

export interface Organization {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  plan: string
  role: "owner" | "admin" | "member" | "viewer"
  limits: OrganizationLimits
  counts: OrganizationCounts
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

  // Set active organization with persistence
  const setActiveOrganization = useCallback((org: Organization | null) => {
    setActiveOrganizationState(org)
    if (org) {
      localStorage.setItem(STORAGE_KEY, org.id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

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
 * Hook that provides a fetch function with organization context header
 */
export function useOrgFetch() {
  const { activeOrganization } = useOrganization()

  const orgFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(options.headers)

      // Add organization context header if active organization exists
      if (activeOrganization?.id) {
        headers.set("x-organization-id", activeOrganization.id)
      }

      return fetch(url, {
        ...options,
        headers,
      })
    },
    [activeOrganization?.id]
  )

  return orgFetch
}

/**
 * Get organization headers for use outside of React components
 */
export function getOrgHeaders(organizationId: string | null | undefined): HeadersInit {
  if (!organizationId) return {}
  return { "x-organization-id": organizationId }
}
