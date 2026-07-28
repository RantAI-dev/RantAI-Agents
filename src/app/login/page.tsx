"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { SELECTED_KEY } from "@/hooks/use-assistants"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandLogo } from "@/components/brand-logo"
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
} from "@/lib/icons"
import { brand } from "@/lib/branding"

const Grainient = dynamic(
  () => import("@/components/reactbits/grainient").then((module) => ({
    default: module.Grainient,
  })),
  { ssr: false }
)

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // The login screen is the logout→login boundary. Reset the chat UI state here
  // so each new login starts at the default assistant (and clean composer),
  // instead of restoring the previous session's last selection. In-session
  // changes still persist across refreshes — they're only reset on (re)login.
  useEffect(() => {
    try {
      localStorage.removeItem(SELECTED_KEY)
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i)
        if (k && (k.startsWith("chat-toolbar-state:") || k.startsWith("rantai-pending-chat-init"))) {
          sessionStorage.removeItem(k)
        }
      }
    } catch {
      // storage unavailable (private mode) — non-fatal
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError("Invalid email or password")
      } else {
        // Full-page navigation, NOT router.push: client-side transitions keep
        // the pre-login SessionProvider state ("unauthenticated"), so anything
        // session-gated in the shell (e.g. the role=ADMIN nav) stays hidden
        // until a hard refresh. A real load remounts providers with the fresh
        // session cookie.
        window.location.href = "/dashboard"
      }
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="theme-home flex min-h-dvh bg-background text-foreground">
      <section className="relative hidden w-1/2 flex-col overflow-hidden bg-[var(--brand-2)] lg:flex">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <Grainient
            className="absolute inset-0"
            color1="#A9D9FF"
            color2="#5CB6F9"
            color3="#0069A8"
            timeSpeed={0.2}
            warpStrength={0.9}
            warpFrequency={4.5}
            warpSpeed={1.5}
            warpAmplitude={46}
            blendSoftness={0.08}
            rotationAmount={420}
            noiseScale={2}
            grainAmount={0.07}
            grainScale={2}
            contrast={1.1}
            saturation={1}
            zoom={0.9}
          />
          <div className="absolute inset-0 bg-[var(--brand-2)]/35" />
        </div>

        <div className="relative z-10 p-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-white/15 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Back to Home
          </Link>
        </div>

        <div className="flex-1" />

        <div className="relative z-10 p-10 text-white">
          <h2 className="max-w-lg text-4xl font-normal leading-tight tracking-[-0.025em]">
            Build intelligent AI agents
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/70">
            Connect your data sources, deploy across multiple channels, and
            orchestrate human-in-the-loop workflows.
          </p>
        </div>
      </section>

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

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={brand.demoAgentEmail}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="h-11 rounded-lg border-input bg-background px-4 text-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-full bg-foreground text-sm font-medium text-background transition-transform hover:scale-[1.01] hover:bg-foreground/85 active:scale-[0.99]"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

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
    </div>
  )
}
