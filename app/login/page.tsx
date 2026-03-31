"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, ArrowLeft } from "@/lib/icons"
import { LineWaves } from "@/components/reactbits/line-waves"
import { brand } from "@/lib/branding"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left Panel — decorative, desktop only */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col bg-zinc-950 overflow-hidden">
        {/* LineWaves background */}
        <div className="absolute inset-0">
          <LineWaves
            color1="#818CF8"
            color2="#6366F1"
            color3="#4F46E5"
            speed={0.3}
            brightness={0.25}
            warpIntensity={1.0}
            innerLineCount={32}
            outerLineCount={36}
            rotation={-45}
            enableMouseInteraction={true}
            mouseInfluence={2.0}
          />
        </div>

        {/* Top: back link */}
        <div className="relative z-10 p-10">
          <Link
            href={brand.companyUrl}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {brand.companyName}
          </Link>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom: headline + tagline (DataBuddy style) */}
        <div className="relative z-10 p-10">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-50">
            Build Intelligent AI Agents
          </h2>
          <p className="mt-3 text-zinc-400 leading-relaxed max-w-md">
            Connect your data sources, deploy multi-channel agents, and
            orchestrate human-in-the-loop workflows.
          </p>
        </div>
      </div>

      {/* Right Panel — login form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-zinc-950 p-6 sm:p-10">
        <div className="w-full max-w-md space-y-8">
          {/* Logo + heading */}
          <div className="text-center space-y-2">
            <Image
              src={brand.logoMain}
              alt={brand.productName}
              width={120}
              height={120}
              className="h-14 w-auto mx-auto"
            />
            <h1 className="text-2xl font-semibold text-zinc-50">Sign in</h1>
            <p className="text-sm text-zinc-400">
              Sign in to access {brand.productName}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={brand.demoAgentEmail}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          {/* Demo credentials */}
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <p className="text-sm text-zinc-400 text-center">
              <strong className="text-zinc-300">Demo credentials</strong>
              <br />
              Email:{" "}
              <span className="text-zinc-200">{brand.demoAgentEmail}</span>
              <br />
              Password: <span className="text-zinc-200">password123</span>
            </p>
          </div>

          {/* Mobile back link */}
          <div className="text-center lg:hidden">
            <Link
              href={brand.companyUrl}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              &larr; Back to {brand.companyName}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
