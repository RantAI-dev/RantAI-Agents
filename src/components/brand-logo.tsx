import { brand } from "@/lib/branding"
import { cn } from "@/lib/utils"

/**
 * The product mark, swapped for the surface it sits on.
 *
 * The default colourway is near-black navy, which disappears against a dark
 * background, so this renders both colourways and lets CSS pick — no theme hook,
 * so it stays a server component and never flashes the wrong one on hydration.
 *
 * The mark is wider than it is tall (130x100), so `object-contain` is baked in:
 * several callers size it into a fixed square and would otherwise stretch it.
 *
 * For surfaces whose darkness does not follow the theme — the login page is dark
 * in both — reach for `brand.logoMainDark` directly instead.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <>
      <img
        src={brand.logoMain}
        alt={brand.productName}
        className={cn("object-contain dark:hidden", className)}
      />
      <img
        src={brand.logoMainDark}
        alt=""
        aria-hidden="true"
        className={cn("hidden object-contain dark:block", className)}
      />
    </>
  )
}
