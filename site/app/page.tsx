import type { Metadata } from "next"
import { Funnel_Display } from "next/font/google"
import { cn } from "@/lib/utils"
import { brand } from "@/lib/branding"
import { HomeNavbar } from "./_components/home-navbar"
import { HomeHero } from "./_components/home-hero"
import { HomeFeatures } from "./_components/home-features"
import { HomePricing } from "./_components/home-pricing"
import { HomeFaq } from "./_components/home-faq"
import { HomeCta } from "./_components/home-cta"
import { HomeFooter } from "./_components/home-footer"

const funnelDisplay = Funnel_Display({ subsets: ["latin"] })

export const metadata: Metadata = {
  description: `${brand.productName} lets you create intelligent chat agents with RAG, build visual AI pipelines, and deploy across multiple channels — all from one platform.`,
}

export default function LandingPage() {
  return (
    <div
      className={cn(
        funnelDisplay.className,
        "theme-home relative min-h-screen bg-background text-foreground antialiased"
      )}
    >
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
      >
        Skip to main content
      </a>

      <HomeNavbar />

      <main id="main-content" aria-label="Landing page content">
        <HomeHero />
        <HomeFeatures />
        <HomePricing />
        <HomeFaq />
        <HomeCta />
      </main>

      <HomeFooter />
    </div>
  )
}
