function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export const env = {
  apiBaseUrl: required("EXPO_PUBLIC_API_BASE_URL", process.env.EXPO_PUBLIC_API_BASE_URL),
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? null,
}
