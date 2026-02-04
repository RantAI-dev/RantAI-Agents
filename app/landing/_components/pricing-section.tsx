"use client"

import { useState } from "react"
import Link from "next/link"
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
import { landing } from "./landing-styles"
import { cn } from "@/lib/utils"

const PRICING_TIERS = [
  {
    name: "Free",
    priceMonthly: "$0",
    priceAnnual: "$0",
    periodMonthly: "Try the platform",
    periodAnnual: "Try the platform",
    description: "Get started with core features.",
    features: ["1 assistant", "Limited knowledge base", "Web chat only", "Community support"],
    cta: "Try RantAI",
    href: "/agent/login",
    highlighted: false,
  },
  {
    name: "Pro",
    priceMonthly: "$99",
    priceAnnual: "$79",
    periodMonthly: "per month",
    periodAnnual: "per month (billed annually)",
    description: "For teams getting started.",
    features: ["Multiple assistants", "Larger knowledge base", "WhatsApp & Email", "Priority support"],
    cta: "Get Pro",
    href: "/agent/login",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Contact us",
    period: " ",
    description: "Security, scale, and SSO.",
    features: ["Unlimited scale", "SSO & audit logs", "Dedicated support", "Custom integrations"],
    cta: "Contact sales",
    href: "/agent/login",
    highlighted: false,
  },
] as const

export function PricingSection() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly")

  return (
    <div className="w-full">
      <div className="flex flex-row items-center justify-center gap-3 mb-10">
        <ToggleGroup
          type="single"
          value={billing}
          onValueChange={(v) => v && setBilling(v as "monthly" | "annual")}
          className="border border-zinc-700 rounded-lg p-0.5 bg-zinc-900"
          aria-label="Billing period"
        >
          <ToggleGroupItem value="monthly" aria-label="Monthly billing" className="rounded-md data-[state=on]:bg-zinc-700 data-[state=on]:text-zinc-100 min-w-[100px]">
            Monthly
          </ToggleGroupItem>
          <ToggleGroupItem value="annual" aria-label="Annual billing" className="rounded-md data-[state=on]:bg-zinc-700 data-[state=on]:text-zinc-100 min-w-[100px]">
            Annual
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="text-sm text-zinc-500">Save 20%</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-3" role="list">
        {PRICING_TIERS.map((tier) => {
          const isEnterprise = tier.name === "Enterprise"
          const price = isEnterprise ? tier.price : billing === "annual" ? tier.priceAnnual : tier.priceMonthly
          const period = isEnterprise ? tier.period : billing === "annual" ? (tier as { periodAnnual?: string }).periodAnnual : (tier as { periodMonthly?: string }).periodMonthly

          return (
            <Card
              key={tier.name}
              role="listitem"
              aria-labelledby={`plan-${tier.name.toLowerCase()}`}
              className={cn(
                "flex flex-col",
                tier.highlighted ? landing.cardHighlight : landing.card
              )}
            >
              <CardHeader className="text-center pb-4">
                {tier.highlighted && (
                  <Badge className="w-fit mx-auto mb-2 bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                    Most popular
                  </Badge>
                )}
                <CardTitle id={`plan-${tier.name.toLowerCase()}`} className="text-zinc-100">{tier.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-zinc-100">{price}</span>
                  {period && <span className="text-zinc-500 text-sm ml-1">{period}</span>}
                </div>
                <CardDescription className="text-zinc-400">{tier.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm text-zinc-300">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="text-indigo-400" aria-hidden>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className={cn(
                    "w-full",
                    tier.highlighted && landing.btnHighlight,
                    isEnterprise && landing.btnSecondaryFilled,
                    !tier.highlighted && !isEnterprise && landing.btnSecondary
                  )}
                  variant={tier.highlighted ? "default" : "outline"}
                  asChild
                >
                  <Link href={tier.href}>{tier.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
      <p className="text-center text-sm text-zinc-500 mt-6">
        Pricing is placeholder for now. Actual plans and pricing will be announced later.
      </p>
    </div>
  )
}
