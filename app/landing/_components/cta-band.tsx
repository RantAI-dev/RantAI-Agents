"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Aurora } from "@/components/reactbits/aurora"
import { BlurText } from "@/components/reactbits/blur-text"
import { landing } from "./landing-styles"

export function CtaBand() {
  return (
    <section className="relative py-20 sm:py-28 px-4 sm:px-6 overflow-hidden" aria-labelledby="cta-heading">
      <Aurora
        colorOne="#818CF8"
        colorTwo="#6366F1"
        colorThree="#4F46E5"
        speed={8}
        blur={80}
        opacity={0.15}
      />

      <div className={`${landing.containerNarrow} relative z-10 text-center`}>
        <BlurText
          text="Ready to Build Your AI Agents?"
          className="text-3xl font-bold tracking-tight text-zinc-50 mb-4 justify-center"
          delay={50}
          direction="top"
        />
        <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
          Get started in minutes. Deploy on your infrastructure or try the platform with a free account.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" variant="ghost" className={landing.btnHighlightPill} asChild>
            <Link href="/login">Get started free</Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className={landing.btnSecondaryPill}
            asChild
          >
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
