export interface HttpServiceError {
  status: number
  error: string
}

export function isHttpServiceError(value: unknown): value is HttpServiceError {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const candidate = value as { status?: unknown; error?: unknown }
  return (
    typeof candidate.status === "number" &&
    typeof candidate.error === "string"
  )
}
