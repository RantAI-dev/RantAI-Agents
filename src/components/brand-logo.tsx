import { brand } from "@/lib/branding"
import { cn } from "@/lib/utils"

interface BrandLogoProps {
  /**
   * Which mark to render:
   * - `"auto"` (default): theme-aware — navy mark on light, white mark in dark
   *   mode via CSS (no JS, no hydration flash). Use on theme-following surfaces.
   * - `"light"`: always the navy mark. Use on permanently light surfaces.
   * - `"dark"`: always the white mark. Use on permanently dark surfaces
   *   (e.g. the `bg-zinc-950` auth panels).
   */
  variant?: "auto" | "light" | "dark"
  /** Sizing/styling — e.g. `"h-8 w-8 rounded-lg"`, `"h-7 w-auto"`. */
  className?: string
  alt?: string
}

/**
 * The active brand's logo mark. Renders the correct light/dark variant for the
 * surface it sits on. Falls back to the single `logoMain` when a brand has no
 * dark variant (e.g. the Nexus brand).
 */
export function BrandLogo({
  variant = "auto",
  className,
  alt = brand.productName,
}: BrandLogoProps) {
  const light = brand.logoMain
  const dark = brand.logoMainDark ?? brand.logoMain

  if (variant === "light") {
    return <img src={light} alt={alt} className={className} />
  }
  if (variant === "dark") {
    return <img src={dark} alt={alt} className={className} />
  }

  // auto: render both marks and toggle by theme with CSS — no hydration flash.
  return (
    <>
      <img src={light} alt={alt} className={cn("block dark:hidden", className)} />
      <img src={dark} alt={alt} className={cn("hidden dark:block", className)} />
    </>
  )
}
