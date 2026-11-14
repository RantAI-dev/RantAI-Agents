import { LoginFlow } from "@/features/auth/components/login-flow"
import { LoginHero } from "@/features/auth/components/login-hero"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="theme-home flex min-h-dvh bg-background text-foreground">
      <LoginHero />
      <LoginFlow initialError={error ?? null} />
    </div>
  )
}
