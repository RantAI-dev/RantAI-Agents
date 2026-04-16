import { env } from "@/lib/env"

export interface LoginInput {
  email: string
  password: string
  deviceId: string
  deviceName: string
  platform: "ios" | "android"
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string; name: string; role: string }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw Object.assign(new Error(`${path} ${res.status}`), { status: res.status, body: text })
  }
  return res.json() as Promise<T>
}

export const authApi = {
  login: (input: LoginInput) => post<AuthResponse>("/api/mobile/auth/login", input),
  refresh: (refreshToken: string, deviceId: string) =>
    post<{ accessToken: string; refreshToken: string }>("/api/mobile/auth/refresh", {
      refreshToken,
      deviceId,
    }),
  logout: (refreshToken: string) =>
    post<void>("/api/mobile/auth/logout", { refreshToken }),
}
