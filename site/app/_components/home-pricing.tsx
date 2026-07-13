"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { PRICING_TIERS } from "@/lib/pricing"
import { Reveal } from "./reveal"

type Billing = "monthly" | "annual"

export function HomePricing() {
  const [billing, setBilling] = useState<Billing>("monthly")

  return (
    <section id="pricing" className="scroll-mt-20 py-24 sm:py-32" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <h2 id="pricing-heading" className="text-3xl font-normal tracking-tight text-foreground sm:text-[40px]">
            Explore Plans
          </h2>
        </Reveal>

        <Reveal delay={0.1} className="mt-6 flex flex-wrap items-center gap-4">
          <ToggleGroup
            type="single"
            value={billing}
            onValueChange={(v) => v && setBilling(v as Billing)}
            className="rounded-full border border-border bg-muted p-0.5"
            aria-label="Billing period"
          >
            <ToggleGroupItem
              value="monthly"
              aria-label="Monthly billing"
              className="!rounded-full min-w-[92px] text-muted-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              Monthly
            </ToggleGroupItem>
            <ToggleGroupItem
              value="annual"
              aria-label="Annual billing"
              className="!rounded-full min-w-[92px] text-muted-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              Annual
            </ToggleGroupItem>
          </ToggleGroup>
          <span className="text-sm text-muted-foreground">Save up to 20% with yearly</span>
          <span className="ml-auto text-sm text-muted-foreground">Prices in IDR</span>
        </Reveal>

        <div className="mt-8 grid gap-5 lg:grid-cols-3" role="list">
          {PRICING_TIERS.map((tier, i) => {
            const price = billing === "annual" ? tier.priceAnnual : tier.priceMonthly
            return (
              <Reveal
                key={tier.slug}
                delay={0.1 + i * 0.1}
                role="listitem"
                aria-labelledby={`plan-${tier.slug}`}
                className={cn(
                  "flex flex-col rounded-[32px] border bg-card p-8 text-center transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-lg",
                  tier.highlighted ? "border-foreground/20 shadow-md" : "border-border"
                )}
              >
                <h3 id={`plan-${tier.slug}`} className="text-xl font-medium text-foreground">
                  {tier.name}
                </h3>
                <div className="mt-3 flex items-baseline justify-center gap-1.5">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={price}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl"
                    >
                      {price}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </div>
                {billing === "annual" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    billed annually — save {tier.annualSavingsYearly}/yr
                  </p>
                )}
                <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>

                <Button
                  className={cn(
                    "mt-5 w-full rounded-full",
                    tier.highlighted
                      ? "bg-foreground text-background hover:bg-foreground/85"
                      : "border border-border bg-background text-foreground shadow-sm hover:bg-muted"
                  )}
                  variant="ghost"
                  asChild
                >
                  <a href={`/checkout/${tier.slug}/?billing=${billing}`}>
                    {tier.highlighted ? `${tier.cta} (Recommended)` : tier.cta}
                  </a>
                </Button>

                <hr className="mt-5 w-full border-t border-dashed border-border opacity-70" />

                <ul className="mt-5 space-y-2.5 text-left text-sm text-muted-foreground">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5">
                      <Check className="size-4 shrink-0 text-[var(--chart-3)]" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
