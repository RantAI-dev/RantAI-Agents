export type ArtifactFailureReason =
  | "validation"
  | "size"
  | "canvas-mode-mismatch"
  | "missing-language"
  | "persistence"
  | "concurrent-update"
  | "not-found"

export const RETRY_ABLE_FAILURES: ReadonlySet<ArtifactFailureReason> = new Set([
  "persistence",
  "concurrent-update",
])
