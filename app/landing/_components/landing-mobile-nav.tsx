"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const

export function LandingMobileNav() {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden text-zinc-400 hover:text-zinc-100" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px] border-zinc-800 bg-zinc-950">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">Menu</SheetTitle>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-2" aria-label="Mobile navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-3 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2 border-t border-zinc-800 pt-4">
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-3 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors text-center"
            >
              Open dashboard
            </Link>
            <Link
              href="/agent/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-4 py-3 bg-white text-zinc-950 font-medium hover:bg-zinc-200 transition-colors text-center"
            >
              Sign in
            </Link>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
