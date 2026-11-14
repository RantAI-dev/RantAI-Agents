"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { ArrowLeft } from "@/lib/icons"

const Grainient = dynamic(
  () => import("@/components/reactbits/grainient").then((module) => ({ default: module.Grainient })),
  { ssr: false },
)

/** The decorative half of the login screen. Kept apart from the form so its WebGL canvas never
 *  loads in a test or on a narrow screen (it is `hidden` below `lg`). */
export function LoginHero() {
  return (
    <section className="relative hidden w-1/2 flex-col overflow-hidden bg-[var(--brand-2)] lg:flex">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <Grainient
          className="absolute inset-0"
          color1="#A9D9FF"
          color2="#5CB6F9"
          color3="#0069A8"
          timeSpeed={0.2}
          warpStrength={0.9}
          warpFrequency={4.5}
          warpSpeed={1.5}
          warpAmplitude={46}
          blendSoftness={0.08}
          rotationAmount={420}
          noiseScale={2}
          grainAmount={0.07}
          grainScale={2}
          contrast={1.1}
          saturation={1}
          zoom={0.9}
        />
        <div className="absolute inset-0 bg-[var(--brand-2)]/35" />
      </div>

      <div className="relative z-10 p-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-white/15 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to Home
        </Link>
      </div>

      <div className="flex-1" />

      <div className="relative z-10 p-10 text-white">
        <h2 className="max-w-lg text-4xl font-normal leading-tight tracking-[-0.025em]">
          Build intelligent AI agents
        </h2>
        <p className="mt-4 max-w-md text-base leading-relaxed text-white/70">
          Connect your data sources, deploy across multiple channels, and orchestrate
          human-in-the-loop workflows.
        </p>
      </div>
    </section>
  )
}
