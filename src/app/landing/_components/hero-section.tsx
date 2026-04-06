"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BlurText } from "@/components/reactbits/blur-text"
import { ShinyText } from "@/components/reactbits/shiny-text"
import { CountUp } from "@/components/reactbits/count-up"
import { CardSwap, Card } from "@/components/reactbits/card-swap"
import { brand } from "@/lib/branding"
import { landing } from "./landing-styles"

const Beams = dynamic(() => import("@/components/reactbits/beams").then((m) => ({ default: m.Beams })), {
  ssr: false,
})

const HERO_CARDS = [
  { icon: "💬", label: "Chat Agents", desc: "RAG-powered AI agents with knowledge base", image: "/images/landing/chat-agents.png" },
  { icon: "⚡", label: "AI Pipelines", desc: "Visual workflow builder with drag & drop", image: "/images/landing/ai-pipeline.png" },
  { icon: "🌐", label: "Multi-Channel", desc: "Web, WhatsApp, email & embeddable widget", image: "/images/landing/multi-channel.png" },
]

const STATS = [
  { value: 20, suffix: "+", label: "Integrations" },
  { value: 5, suffix: "+", label: "Channels" },
  { label: "24/7", sublabel: "Operation" },
] as const

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-x-clip overflow-y-visible">
      {/* Beams background */}
      <Beams
        lightColor="#818CF8"
        beamWidth={2}
        beamHeight={15}
        beamNumber={12}
        speed={1.5}
        noiseIntensity={1.5}
        scale={0.2}
        rotation={25}
      />

      {/* Gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/40 to-zinc-950/80" />
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/80 via-transparent to-transparent" />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl w-full px-4 sm:px-6 pt-24 pb-16">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Left side — text */}
          <div className="flex-1 text-center lg:text-left">
            <div className={`${landing.badge} mb-6`}>
              <div className={landing.badgeDot} />
              <ShinyText className={landing.badgeText} shimmerWidth={80} speed={3}>
                Enterprise AI Agent Platform
              </ShinyText>
            </div>

            <BlurText
              text="Build, Deploy & Orchestrate AI Agents"
              className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl text-zinc-50 mb-6 justify-center lg:justify-start"
              delay={60}
              direction="top"
            />

            <p className="text-lg sm:text-xl text-zinc-400 max-w-xl mx-auto lg:mx-0 mb-8">
              {brand.productName} lets you create intelligent chat agents with RAG, build visual AI
              pipelines, and deploy across multiple channels — all from one platform.
            </p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-10">
              <Button size="lg" variant="ghost" className={landing.btnHighlightPill} asChild>
                <Link href="/login">Get Started Free</Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className={landing.btnSecondaryPill}
                asChild
              >
                <Link href="#features">Explore Platform</Link>
              </Button>
            </div>

            {/* Stats row */}
            <div className="flex items-center justify-center lg:justify-start gap-8">
              {STATS.map((stat) => (
                <div key={stat.label} className="text-center lg:text-left">
                  <p className="text-2xl font-bold text-zinc-50">
                    {"value" in stat ? (
                      <>
                        <CountUp to={stat.value} duration={2} />
                        {stat.suffix}
                      </>
                    ) : (
                      stat.label
                    )}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {"value" in stat ? stat.label : stat.sublabel}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right side — CardSwap */}
          <div className="flex-1 w-full hidden lg:flex items-center justify-center">
            <CardSwap
              width={700}
              height={439}
              cardDistance={30}
              verticalDistance={40}
              delay={5000}
              skewAmount={2}
              pauseOnHover
            >
              {HERO_CARDS.map((card) => (
                <Card key={card.label} customClass="overflow-hidden">
                  <div className="w-full h-full bg-zinc-900 flex flex-col">
                    {/* 16:9 image area */}
                    <div className="w-full aspect-video overflow-hidden">
                      {card.image ? (
                        <img
                          src={card.image}
                          alt={card.label}
                          className="w-full h-full object-cover object-left-top"
                        />
                      ) : (
                        <div className="w-full h-full bg-zinc-800/50" />
                      )}
                    </div>
                    {/* Label bar */}
                    <div className="flex items-center gap-3 px-5 py-3 border-t border-zinc-700/50">
                      <span className="text-lg">{card.icon}</span>
                      <p className="text-sm font-medium text-zinc-200">{card.label}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </CardSwap>
          </div>
        </div>
      </div>
    </section>
  )
}
