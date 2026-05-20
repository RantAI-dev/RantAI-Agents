const APP_BASE = process.env.NEXT_PUBLIC_APP_URL ?? ''

export function appUrl(path: string): string {
  return `${APP_BASE}${path}`
}
