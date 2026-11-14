"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { SELECTED_KEY } from "@/hooks/use-assistants"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandLogo } from "@/components/brand-logo"
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, ShieldCheck } from "@/lib/icons"
import { brand } from "@/lib/branding"
import { requestJson, retryAfterSeconds, readApiError } from "@/lib/api/error"
import {
  loginErrorMessage,
  passwordLoginDisabled,
  passwordLoginErrorMessage,
} from "@/features/auth/login-errors"

const DASHBOARD = "/dashboard"

interface DiscoverResponse {
  method: "sso" | "password"
  providerId: string | null
  providerName: string | null
  startUrl: string | null
}

interface LoginResponse {
  user: { id: string; email: string; name: string; role: string }
  redirectTo: string
}

type Step = "email" | "password" | "sso-only"

export interface LoginFlowProps {
  /** `?error=<code>` from a failed SSO sign-in, already read by the page. */
  initialError?: string | null
  /** Where to go on success; `window.location.assign` in the browser, a spy in a test. */
  navigate?: (url: string) => void
}

/**
 * Email first, then whichever sign-in the address belongs to (design §3.5): `discover` names the
 * identity provider that claims the domain, or the password form. The answer to a password
 * attempt never says whether the email exists, so the screen shows exactly what it carries.
 */
export function LoginFlow({ initialError = null, navigate }: LoginFlowProps) {
  const go = navigate ?? ((url: string) => window.location.assign(url))
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [providerName, setProviderName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(() => loginErrorMessage(initialError))
  const [busy, setBusy] = useState<"idle" | "discovering" | "signing-in">("idle")
  const [showPassword, setShowPassword] = useState(false)
  const passwordRef = useRef<HTMLInputElement | null>(null)

  // The login screen is the logout→login boundary. Reset the chat UI state here so each new
  // login starts at the default assistant instead of restoring the previous session's choice.
  useEffect(() => {
    try {
      localStorage.removeItem(SELECTED_KEY)
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i)
        if (key && (key.startsWith("chat-toolbar-state:") || key.startsWith("rantai-pending-chat-init"))) {
          sessionStorage.removeItem(key)
        }
      }
    } catch {
      // storage unavailable (private mode) — non-fatal
    }
  }, [])

  useEffect(() => {
    if (step === "password") passwordRef.current?.focus()
  }, [step])

  const discover = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy !== "idle") return
    setError(null)
    setBusy("discovering")
    try {
      const result = await requestJson<DiscoverResponse>(
        `/api/auth/sso/discover?email=${encodeURIComponent(email.trim())}`,
      )
      if (!result.ok) {
        // 404 means this deployment has no Rust sign-in behind the router yet (RUST_ROUTES has
        // no `auth`): the password form is the only route in, so offer it rather than a wall.
        if (result.error.status === 404) {
          setStep("password")
          return
        }
        setError(result.error.message)
        return
      }
      if (result.data.method === "sso" && result.data.startUrl) {
        setProviderName(result.data.providerName)
        const separator = result.data.startUrl.includes("?") ? "&" : "?"
        go(`${result.data.startUrl}${separator}callbackUrl=${encodeURIComponent(DASHBOARD)}`)
        return
      }
      setStep("password")
    } catch {
      setError("We could not reach the sign-in service. Check your connection and try again.")
    } finally {
      setBusy("idle")
    }
  }

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy !== "idle") return
    setError(null)
    setBusy("signing-in")

    /** The NextAuth credentials provider, for a deployment whose sign-in is still in Next. */
    const signInWithCredentials = async () => {
      const { signIn } = await import("next-auth/react")
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      })
      if (result?.error) {
        setError("The email or password is not correct.")
        return
      }
      go(DASHBOARD)
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, callbackUrl: DASHBOARD }),
      })
      if (!response.ok) {
        // Same 404: the TypeScript credentials provider is what signs in until the router sends
        // the `auth` group to Rust. It is the one NextAuth call this page keeps.
        if (response.status === 404) {
          await signInWithCredentials()
          return
        }
        const failure = await readApiError(response)
        if (passwordLoginDisabled(failure.code)) {
          setStep("sso-only")
          setPassword("")
          setError(passwordLoginErrorMessage(failure.code, failure.message))
          return
        }
        if (failure.code === "rate_limited") {
          const seconds = retryAfterSeconds(response)
          const wait = seconds ? ` Try again in ${seconds} second${seconds === 1 ? "" : "s"}.` : ""
          setError(`${passwordLoginErrorMessage(failure.code, failure.message)}${wait}`)
          return
        }
        setError(passwordLoginErrorMessage(failure.code, failure.message))
        return
      }
      const body = (await response.json()) as LoginResponse
      // A full-page navigation, not a client transition: the SessionProvider mounted by the
      // dashboard must come up with the fresh cookie, or session-gated navigation stays stale.
      go(body.redirectTo || DASHBOARD)
    } catch {
      setError("We could not reach the sign-in service. Check your connection and try again.")
    } finally {
      setBusy("idle")
    }
  }

  const backToEmail = () => {
    setStep("email")
    setPassword("")
    setError(null)
  }

  const isLoading = busy !== "idle"

  return (
    <main className="flex w-full items-center justify-center bg-background p-6 sm:p-10 lg:w-1/2">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <Link
            href="/"
            className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <BrandLogo className="h-10 w-auto" />
          </Link>
          <div>
            <h1 className="text-3xl font-normal tracking-[-0.02em] text-foreground">Sign in</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to access {brand.productName}
            </p>
          </div>
        </div>

        {error && (
          <div
            className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        {step === "email" && (
          <form onSubmit={discover} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder={brand.demoAgentEmail}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isLoading}
                className="h-11 rounded-lg border-input bg-background px-4 text-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-full bg-foreground text-sm font-medium text-background transition-transform hover:scale-[1.01] hover:bg-foreground/85 active:scale-[0.99]"
              disabled={isLoading}
            >
              {busy === "discovering" ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Checking your organisation...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-2 size-4" />
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              We use your email to find your organisation&apos;s sign-in method.
            </p>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={signIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-readonly" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email-readonly"
                  type="email"
                  value={email}
                  readOnly
                  className="h-11 rounded-lg border-input bg-muted/40 px-4 text-foreground shadow-none"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={backToEmail}
                  disabled={isLoading}
                  className="h-11 shrink-0"
                >
                  Change
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11 rounded-lg border-input bg-background px-4 pr-11 text-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-full bg-foreground text-sm font-medium text-background transition-transform hover:scale-[1.01] hover:bg-foreground/85 active:scale-[0.99]"
              disabled={isLoading}
            >
              {busy === "signing-in" ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        )}

        {step === "sso-only" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-foreground" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                {providerName
                  ? `${providerName} is the only way in for this organisation.`
                  : "This organisation signs in through single sign-on only."}{" "}
                Ask an administrator if the single sign-on button does not appear.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={backToEmail} className="h-11 w-full">
              Use a different email
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/50 p-4">
          <p className="text-center text-sm leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">Demo credentials</strong>
            <br />
            Email: <span className="text-foreground">{brand.demoAgentEmail}</span>
            <br />
            Password: <span className="text-foreground">password123</span>
          </p>
        </div>

        <div className="text-center lg:hidden">
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </main>
  )
}
