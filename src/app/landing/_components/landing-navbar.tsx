"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { ShinyText } from "@/components/reactbits/shiny-text"
import { Button } from "@/components/ui/button"
import { brand } from "@/lib/branding"
import { LandingMobileNav } from "./landing-mobile-nav"
import { landing } from "./landing-styles"

const NAV_LINKS = [
  { href: "#features", label: "Platform" },
  { href: "#pricing", label: "Pricing" },
  { href: "#docs", label: "Docs" },
  { href: "#faq", label: "FAQ" },
] as const

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl">
      <nav
        className={`flex h-14 items-center justify-between gap-4 px-5 rounded-full border transition-all duration-300 ${
          scrolled
            ? "bg-zinc-900/80 backdrop-blur-xl border-zinc-700/50 shadow-lg shadow-black/20"
            : "bg-zinc-900/50 backdrop-blur-md border-zinc-700/30"
        }`}
        aria-label="Main navigation"
      >
        <Link href="/" className="flex items-center gap-2 shrink-0" aria-label={`${brand.productName} home`}>
          <Image src={brand.logoMain} alt={brand.productShortName} width={28} height={28} className="h-7 w-auto" />
          <ShinyText className="font-semibold text-zinc-100 text-sm" shimmerWidth={80} speed={4}>
            {brand.productName}
          </ShinyText>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 rounded-full hover:bg-zinc-800/50 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className={`hidden md:inline-flex ${landing.btnHighlightPill} text-xs px-4 h-8`}
            asChild
          >
            <Link href="/login">Get Started</Link>
          </Button>
          <LandingMobileNav />
        </div>
      </nav>
    </header>
  )
}
