/**
 * Where the browser may be sent after sign-in: a path on this site and nothing else. Mirrors
 * `signin::safe_return_to` in Rust, so a `redirectTo` or `startUrl` that is not local can never
 * become an open redirect even if a server (or the NextAuth fallback) answered with one.
 */
export function isLocalPath(path: string | null | undefined): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\") &&
    // Control characters: a browser strips tab and newline, so "/\t/evil.test" is "//evil.test".
    ![...path].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)
  )
}

export function safeReturnTo(path: string | null | undefined, fallback = "/dashboard"): string {
  return isLocalPath(path) ? path : fallback
}
