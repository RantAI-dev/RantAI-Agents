"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Reveal } from "./reveal"

interface Feature {
  id: string
  label: string
  description: string
  image: string
}

const FEATURES: readonly Feature[] = [
  {
    id: "rag",
    label: "RAG",
    description:
      "Centralize your organization's knowledge and enable AI agents to retrieve the right information instantly from documents, manuals, policies, and internal data.",
    image: "/images/landing/chat-agents.png",
  },
  {
    id: "agent-builder",
    label: "Agent Builder",
    description:
      "Design agent behavior visually — personas, tools, knowledge, and guardrails — then ship the same agent to every channel without writing code.",
    image: "/images/landing/ai-pipeline.png",
  },
  {
    id: "artifacts",
    label: "Artifacts",
    description:
      "Turn conversations into shareable outputs — documents, tables, and rich interactive responses generated directly by your agents.",
    image: "/images/landing/chat-agents2.png",
  },
  {
    id: "skills",
    label: "Skills",
    description:
      "Extend agents with reusable skills from the marketplace, or build your own custom tools and integrations to handle domain-specific work.",
    image: "/images/landing/multi-channel.png",
  },
] as const

function featureNumber(index: number): string {
  return String(index + 1).padStart(2, "0")
}

export function HomeFeatures() {
  const [activeIndex, setActiveIndex] = useState(0)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const index = panelRefs.current.indexOf(entry.target as HTMLDivElement)
          if (index !== -1) setActiveIndex(index)
        }
      },
      // Thin band across the middle of the viewport decides which panel is active
      { rootMargin: "-45% 0px -45% 0px" }
    )
    for (const panel of panelRefs.current) {
      if (panel) observer.observe(panel)
    }
    return () => observer.disconnect()
  }, [])

  const scrollToPanel = (index: number) => {
    panelRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return (
    <section id="features" className="scroll-mt-20 py-24 sm:py-32" aria-labelledby="features-heading">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <h2
            id="features-heading"
            className="text-center text-3xl font-normal tracking-tight text-foreground sm:text-[40px]"
          >
            AI agents that handle real work
          </h2>
        </Reveal>

        <div className="mt-14 lg:grid lg:grid-cols-[1fr_1.6fr] lg:gap-14">
          {/* Sticky feature list — the active item follows the panels scrolling on the right */}
          <div className="hidden lg:block">
            <div className="sticky top-32 flex flex-col gap-8">
              {FEATURES.map((feature, i) => {
                const isActive = i === activeIndex
                return (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => scrollToPanel(i)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "border-l-2 pl-5 text-left transition-colors duration-300",
                      isActive ? "border-foreground" : "border-transparent"
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono text-xs transition-opacity duration-300",
                        isActive ? "text-muted-foreground" : "text-muted-foreground opacity-40"
                      )}
                    >
                      {featureNumber(i)}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block text-2xl font-light tracking-tight text-foreground transition-opacity duration-300 sm:text-[32px]",
                        isActive ? "opacity-100" : "opacity-30 hover:opacity-60"
                      )}
                    >
                      {feature.label}
                    </span>
                    <AnimatePresence initial={false}>
                      {isActive && (
                        <motion.span
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className="block overflow-hidden text-sm leading-relaxed text-muted-foreground"
                        >
                          <span className="block pt-2">{feature.description}</span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Screenshot panels — scrolling these switches the active feature */}
          <div className="flex flex-col gap-16 lg:gap-10">
            {FEATURES.map((feature, i) => (
              <div
                key={feature.id}
                ref={(el) => {
                  panelRefs.current[i] = el
                }}
                className={cn(
                  "flex flex-col lg:min-h-[72vh]",
                  // First panel aligns with the top of the sticky list; the rest are
                  // centered in their scroll window to keep the hand-off rhythm
                  i === 0 ? "lg:justify-start" : "lg:justify-center"
                )}
              >
                {/* Inline heading for mobile, where the sticky list is hidden */}
                <div className="mb-4 lg:hidden">
                  <span className="font-mono text-xs text-muted-foreground">{featureNumber(i)}</span>
                  <h3 className="mt-1 text-2xl font-light tracking-tight text-foreground">
                    {feature.label}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 40, scale: 0.98 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
                  className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border bg-[#0b0f11] shadow-lg"
                >
                  <Image
                    src={feature.image}
                    alt={`${feature.label} screenshot`}
                    fill
                    sizes="(min-width: 1024px) 640px, 100vw"
                    className="object-cover object-left-top"
                  />
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
