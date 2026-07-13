"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { AnimatePresence, motion, type Variants } from "framer-motion"
import { Button } from "@/components/ui/button"
import { CountUp } from "@/components/reactbits/count-up"
import { brand } from "@/lib/branding"

const Grainient = dynamic(
  () => import("@/components/reactbits/grainient").then((m) => ({ default: m.Grainient })),
  { ssr: false }
)

const ROTATING_WORDS = ["Orchestrate", "Build", "Deploy"] as const
const ROTATE_INTERVAL_MS = 5000

const STATS = [
  { value: 20, suffix: "+", label: "Integrations" },
  { value: 5, suffix: "+", label: "Channels" },
  { text: "24/7", label: "Operation" },
] as const

const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}

const heroItem: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] },
  },
}

export function HomeHero() {
  const [wordIndex, setWordIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setWordIndex((i) => (i + 1) % ROTATING_WORDS.length)
    }, ROTATE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const word = ROTATING_WORDS[wordIndex]

  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-heading">
      {/* Dia-style dome: animated Grainient sky with a blurred white dome rising over it */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[860px]" aria-hidden>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="absolute inset-0"
        >
          <Grainient
            className="absolute inset-0"
            color1="#A9D9FF"
            color2="#5CB6F9"
            color3="#0069A8"
            timeSpeed={0.25}
            warpStrength={1.0}
            warpFrequency={5.0}
            warpSpeed={2.0}
            warpAmplitude={50.0}
            blendSoftness={0.05}
            rotationAmount={500.0}
            noiseScale={2.0}
            grainAmount={0.08}
            grainScale={2.0}
            contrast={1.2}
            saturation={1.1}
            zoom={0.9}
          />
        </motion.div>
        {/* soften Grainient into the white page near the bottom */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-white" />
        {/* white dome forming the arc */}
        <div className="absolute left-1/2 top-[400px] h-[2400px] w-[280%] -translate-x-1/2 rounded-[50%] bg-white blur-xl" />
      </div>

      <motion.div
        variants={heroContainer}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex min-h-dvh max-w-6xl flex-col items-center px-6 pb-12 pt-16 text-center"
      >
        {/* Centered block between the fixed navbar and the stats row */}
        <div className="flex flex-1 flex-col items-center justify-center">
          <motion.h1
            variants={heroItem}
            id="hero-heading"
            className="text-balance text-5xl font-normal leading-[1.1] tracking-[-0.02em] text-foreground sm:text-6xl"
          >
            <span className="inline-block">
              <span className="inline-block border-b-[5px] border-dotted border-[var(--brand-1)] pb-2.5">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={word}
                    initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="inline-block"
                  >
                    {word}
                  </motion.span>
                </AnimatePresence>
              </span>{" "}
              your
            </span>
            <br />
            AI Agents
          </motion.h1>

          <motion.p
            variants={heroItem}
            className="mt-8 max-w-3xl text-pretty text-base leading-normal text-muted-foreground sm:text-xl"
          >
            {brand.productName} lets you create intelligent chat agents with RAG, build visual AI
            pipelines, and deploy across multiple channels — all from one platform.
          </motion.p>

          <motion.div variants={heroItem} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              className="h-10 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-transform hover:scale-[1.03] hover:bg-foreground/85 active:scale-[0.98]"
              asChild
            >
              <Link href="#pricing">Build AI Agents</Link>
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-full border-border bg-background px-6 text-sm font-medium text-foreground shadow-sm transition-transform hover:scale-[1.03] hover:bg-muted active:scale-[0.98]"
              asChild
            >
              <Link href="/docs/">Read Documentations</Link>
            </Button>
          </motion.div>
        </div>

        {/* Stats row pinned to the bottom of the viewport */}
        <motion.dl
          variants={heroItem}
          className="grid w-full max-w-3xl grid-cols-1 gap-y-8 pt-16 sm:grid-cols-3 sm:divide-x sm:divide-border"
        >
          {STATS.map((stat) => (
            <div key={stat.label} className="flex items-baseline justify-center gap-2 px-4">
              <dd className="text-3xl font-normal tracking-tight text-foreground sm:text-[40px]">
                {"value" in stat ? (
                  <CountUp to={stat.value} suffix={stat.suffix} duration={1.2} />
                ) : (
                  stat.text
                )}
              </dd>
              <dt className="text-base text-muted-foreground sm:text-xl">{stat.label}</dt>
            </div>
          ))}
        </motion.dl>
      </motion.div>
    </section>
  )
}
