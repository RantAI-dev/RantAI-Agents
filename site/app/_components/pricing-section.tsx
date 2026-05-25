"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SpotlightCard } from "@/components/reactbits/spotlight-card"
import { BlurText } from "@/components/reactbits/blur-text"
import { landing } from "./landing-styles"
import { cn } from "@/lib/utils"
import { PRICING_TIERS } from "@/lib/pricing"

export function PricingSection() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly")

  return (
    <section id="pricing" className={cn(landing.sectionAlt, "scroll-mt-20")} aria-labelledby="pricing-heading">
      <div className={landing.container}>
        <BlurText
          text="Simple Pricing"
          className="text-3xl font-bold tracking-tight text-center text-zinc-50 mb-4 justify-center"
          delay={50}
          direction="top"
        />
        <p className={landing.sectionSubtitle}>
          Start small, scale as you grow.
        </p>

        <div className="flex flex-row items-center justify-center gap-3 mb-10">
          <ToggleGroup
            type="single"
            value={billing}
            onValueChange={(v) => v && setBilling(v as "monthly" | "annual")}
            className="border border-zinc-700 rounded-full p-0.5 bg-zinc-900"
            aria-label="Billing period"
          >
            <ToggleGroupItem value="monthly" aria-label="Monthly billing" className="!rounded-full data-[state=on]:bg-zinc-700 data-[state=on]:text-zinc-100 text-zinc-400 min-w-[100px]">
              Monthly
            </ToggleGroupItem>
            <ToggleGroupItem value="annual" aria-label="Annual billing" className="!rounded-full data-[state=on]:bg-zinc-700 data-[state=on]:text-zinc-100 text-zinc-400 min-w-[100px]">
              Annual
            </ToggleGroupItem>
          </ToggleGroup>
          <span className="text-sm text-zinc-500">Save 20%</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-3" role="list">
          {PRICING_TIERS.map((tier) => {
            const price = billing === "annual" ? tier.priceAnnual : tier.priceMonthly
            const period = billing === "annual" ? tier.periodAnnual : tier.periodMonthly

            return (
              <SpotlightCard
                key={tier.name}
                className={cn(
                  "flex flex-col rounded-xl",
                  tier.highlighted ? landing.cardHighlight : landing.card
                )}
                spotlightColor={tier.highlighted ? "rgba(129,140,248,0.12)" : "rgba(129,140,248,0.06)"}
              >
                <Card
                  role="listitem"
                  aria-labelledby={`plan-${tier.name.toLowerCase()}`}
                  className="flex flex-col border-0 bg-transparent shadow-none"
                >
                  <CardHeader className="text-center pb-4">
                    {tier.highlighted && (
                      <Badge className={`w-fit mx-auto mb-2 ${landing.badgeHighlight}`}>
                        Most popular
                      </Badge>
                    )}
                    <CardTitle id={`plan-${tier.name.toLowerCase()}`} className="text-zinc-100">{tier.name}</CardTitle>
                    <div className="mt-2">
                      <span className="text-3xl font-bold text-zinc-100">{price}</span>
                      {period && <span className="text-zinc-500 text-sm ml-1">{period}</span>}
                    </div>
                    {billing === "annual" && (
                      <div className="mt-1 flex items-center justify-center gap-2 text-xs">
                        <span className="text-zinc-500 line-through">{tier.priceMonthly}/mo</span>
                        <span className="text-emerald-400">Save {tier.annualSavingsYearly}/yr</span>
                      </div>
                    )}
                    <CardDescription className="text-zinc-400">{tier.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-2 text-sm text-zinc-300">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <span className="text-indigo-400" aria-hidden>&#10003;</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className={cn(
                        "w-full rounded-full",
                        tier.highlighted ? landing.btnHighlight : landing.btnSecondary
                      )}
                      variant="ghost"
                      asChild
                    >
                      <a href={`/checkout/${tier.slug}/?billing=${billing}`}>{tier.cta}</a>
                    </Button>
                  </CardFooter>
                </Card>
              </SpotlightCard>
            )
          })}
        </div>
        <p className="text-center text-sm text-zinc-500 mt-6">
          All prices in IDR. Taxes may apply.
        </p>
      </div>
    </section>
  )
}
