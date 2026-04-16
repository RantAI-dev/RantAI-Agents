import { create } from "zustand"
import * as Device from "expo-device"
import {
  addAccount,
  getAccount,
  getActiveAccountId,
  listAccounts,
  removeAccount,
  setActiveAccount,
  type StoredAccount,
} from "./account-store"
import { authApi } from "./api"

interface AuthState {
  ready: boolean
  accessToken: string | null
  activeAccount: StoredAccount | null
  setAccessToken: (access: string, newRefresh?: string) => Promise<void>
  bootstrap: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  switchAccount: (id: string) => Promise<void>
  signOutCurrent: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  accessToken: null,
  activeAccount: null,

  async setAccessToken(access, newRefresh) {
    const current = get().activeAccount
    if (current && newRefresh) {
      const updated = { ...current, refreshToken: newRefresh }
      await addAccount(updated)
      set({ activeAccount: updated })
    }
    set({ accessToken: access })
  },

  async bootstrap() {
    const id = await getActiveAccountId()
    if (!id) {
      set({ ready: true })
      return
    }
    const acct = await getAccount(id)
    set({ activeAccount: acct, ready: true })
  },

  async signIn(email, password) {
    const platform = (await import("react-native")).Platform.OS as "ios" | "android"
    const { getDeviceId } = await import("@/lib/device-id")
    const deviceId = getDeviceId()
    const deviceName = Device.deviceName ?? Device.modelName ?? "Mobile"
    const res = await authApi.login({ email, password, deviceId, deviceName, platform })
    const acct: StoredAccount = {
      id: res.user.id,
      email: res.user.email,
      name: res.user.name,
      refreshToken: res.refreshToken,
    }
    await addAccount(acct)
    await setActiveAccount(acct.id)
    set({ activeAccount: acct, accessToken: res.accessToken })
  },

  async switchAccount(id) {
    const acct = await getAccount(id)
    if (!acct) throw new Error("Account not found")
    await setActiveAccount(id)
    set({ activeAccount: acct, accessToken: null })
  },

  async signOutCurrent() {
    const current = get().activeAccount
    if (!current) return
    try { await authApi.logout(current.refreshToken) } catch { /* network failure is fine */ }
    await removeAccount(current.id)
    const remaining = await listAccounts()
    if (remaining[0]) {
      await setActiveAccount(remaining[0].id)
      set({ activeAccount: remaining[0], accessToken: null })
    } else {
      set({ activeAccount: null, accessToken: null })
    }
  },
}))
