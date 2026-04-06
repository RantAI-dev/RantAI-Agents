"use client"

import { create } from "zustand"

interface ProfileState {
  avatarUrl: string | null
  name: string | null
  email: string | null
  loading: boolean
  error: string | null
  setAvatarUrl: (url: string | null) => void
  setProfile: (profile: { avatarUrl?: string | null; name?: string | null; email?: string | null }) => void
  fetchProfile: () => Promise<void>
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  avatarUrl: null,
  name: null,
  email: null,
  loading: false,
  error: null,

  setAvatarUrl: (url) => set({ avatarUrl: url }),

  setProfile: (profile) => set((state) => ({
    ...state,
    ...profile,
  })),

  fetchProfile: async () => {
    // Prevent duplicate fetches
    if (get().loading) return

    set({ loading: true, error: null })
    try {
      const response = await fetch("/api/admin/profile")
      if (response.ok) {
        const data = await response.json()
        set({
          avatarUrl: data.avatarUrl,
          name: data.name,
          email: data.email,
          loading: false,
        })
      } else {
        set({ loading: false, error: "Failed to fetch profile" })
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err)
      set({ loading: false, error: "Failed to fetch profile" })
    }
  },
}))

/**
 * Hook to use profile data with auto-fetch on mount
 */
export function useProfile() {
  const store = useProfileStore()

  return {
    avatarUrl: store.avatarUrl,
    name: store.name,
    email: store.email,
    loading: store.loading,
    error: store.error,
    setAvatarUrl: store.setAvatarUrl,
    setProfile: store.setProfile,
    fetchProfile: store.fetchProfile,
  }
}
