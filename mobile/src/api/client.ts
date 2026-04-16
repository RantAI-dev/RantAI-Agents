import { env } from "@/lib/env"
import { useAuthStore } from "@/auth/use-auth-store"
import { authApi } from "@/auth/api"
import { getDeviceId } from "@/lib/device-id"

interface RequestOptions extends RequestInit {
  json?: unknown
}

let refreshPromise: Promise<void> | null = null

async function refreshIfNeeded(): Promise<void> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const { activeAccount, setAccessToken, signOutCurrent } = useAuthStore.getState()
    if (!activeAccount) throw new Error("No active account")
    try {
      const res = await authApi.refresh(activeAccount.refreshToken, getDeviceId())
      await setAccessToken(res.accessToken, res.refreshToken)
    } catch (e) {
      await signOutCurrent()
      throw e
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { accessToken } = useAuthStore.getState()
  const headers = new Headers(options.headers)
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`)
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json")
    options.body = JSON.stringify(options.json)
  }
  const res = await fetch(`${env.apiBaseUrl}${path}`, { ...options, headers })
  if (res.status === 401 && accessToken) {
    await refreshIfNeeded()
    return apiFetch<T>(path, options)
  }
  if (!res.ok) {
    throw Object.assign(new Error(`${path} ${res.status}`), { status: res.status })
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
