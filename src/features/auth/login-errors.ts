/**
 * What a failed sign-in tells the person at the login screen.
 *
 * SSO failures arrive as `/login?error=<code>` from the Rust sign-in routes
 * (docs/operations/sso.md), password failures arrive as the answer's own `code`. Both end here so
 * the sentence is written once and a test can pin each one.
 */

const SSO_ERROR_MESSAGES: Record<string, string> = {
  sso_failed:
    "Single sign-on could not be completed. Try again; if it keeps happening, ask an administrator for the request id.",
  account_link_refused:
    "An account with this email already exists and cannot be linked to this identity provider. Sign in with your password, or ask an administrator.",
  account_not_provisioned:
    "This identity provider does not create accounts here. Ask an administrator to invite you.",
  permission_denied: "This account is suspended. Contact an administrator.",
  password_login_disabled:
    "Your organisation signs in through single sign-on. Use the single sign-on button.",
  rate_limited: "Too many sign-in attempts. Wait a moment, then try again.",
}

/** The sentence for a `?error=` value, or `null` when there is none to show. */
export function loginErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null
  return SSO_ERROR_MESSAGES[code] ?? "Sign-in failed. Try again."
}

/** The same, for a code on a failed password sign-in's answer body. */
export function passwordLoginErrorMessage(code: string | null, message: string): string {
  if (code === "rate_limited") return SSO_ERROR_MESSAGES.rate_limited
  if (code && SSO_ERROR_MESSAGES[code]) return SSO_ERROR_MESSAGES[code]
  return message
}

/** Whether a code means the organisation has turned password sign-in off. */
export function passwordLoginDisabled(code: string | null): boolean {
  return code === "password_login_disabled"
}
