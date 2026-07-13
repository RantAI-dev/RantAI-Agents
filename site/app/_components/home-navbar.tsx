"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, useMotionValueEvent, useScroll } from "framer-motion"
import { Menu } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { brand } from "@/lib/branding"
import { appUrl } from "@/lib/app-url"

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "/docs/", label: "Docs" },
] as const

export function HomeNavbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12))

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-b border-border/60 bg-white/70 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <nav
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6"
        aria-label="Main navigation"
      >
        <Link href="/home/" className="flex shrink-0 items-center gap-2" aria-label={`${brand.productName} home`}>
          <Image
            src="/logo/rantai-agents-light.svg"
            alt={brand.productName}
            width={36}
            height={28}
            className="h-7 w-auto"
          />
        </Link>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-1.5 text-base text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            className="h-10 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-transform hover:scale-[1.03] hover:bg-foreground/85 active:scale-[0.98]"
            asChild
          >
            <Link href={appUrl("/login")}>Get Started</Link>
          </Button>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 rounded-full text-foreground hover:bg-foreground/5 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="theme-home w-[280px] border-border bg-background">
              <SheetHeader>
                <SheetTitle className="text-foreground">Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4" aria-label="Mobile navigation">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-4 py-3 text-base text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
                <Button
                  className="mt-4 h-10 rounded-full bg-foreground text-sm font-medium text-background hover:bg-foreground/85"
                  asChild
                >
                  <Link href={appUrl("/login")} onClick={() => setMenuOpen(false)}>
                    Get Started
                  </Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </motion.header>
  )
}
