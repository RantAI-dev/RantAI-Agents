"use client"

import Link from "next/link"
import Image from "next/image"
import { Squares } from "@/components/reactbits/squares"
import { brand } from "@/lib/branding"
import { landing } from "./landing-styles"

const FOOTER_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/login", label: "Sign in" },
  { href: "#features", label: "Platform" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const

export function FooterSection() {
  return (
    <footer className="relative border-t border-zinc-800 py-12 px-4 sm:px-6 overflow-hidden" role="contentinfo">
      <Squares
        speed={0.2}
        squareSize={50}
        borderColor="rgba(255,255,255,0.03)"
        hoverFillColor="rgba(255,255,255,0.015)"
        direction="diagonal"
      />
      <div className="absolute inset-0 bg-zinc-950/90" />

      <div className={`${landing.container} relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6`}>
        <div className="flex items-center gap-2">
          <Image src={brand.logoMain} alt="" width={24} height={24} className="h-6 w-auto opacity-80" />
          <span className="text-sm font-medium text-zinc-300">{brand.productName}</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-6 text-sm" aria-label="Footer navigation">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className={`${landing.container} relative z-10 mt-6 text-center text-sm text-zinc-600`}>
        Built with Next.js, RantaiClaw, Prisma, SurrealDB, and OpenRouter.
      </p>
    </footer>
  )
}
