"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { landing } from "../../_components/landing-styles"
import { cn } from "@/lib/utils"
import type { PricingTier } from "@/lib/pricing"
import { formatIDR } from "@/lib/pricing"

type Billing = "monthly" | "annual"

function CheckoutFormInner({ tier }: { tier: PricingTier }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialBilling: Billing = searchParams.get("billing") === "annual" ? "annual" : "monthly"

  const [billing, setBilling] = useState<Billing>(initialBilling)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const fromUrl = searchParams.get("billing")
    if (fromUrl === "annual" || fromUrl === "monthly") setBilling(fromUrl)
  }, [searchParams])

  const unitAmount = billing === "annual" ? tier.priceAnnualAmount : tier.priceMonthlyAmount
  const totalLabel = billing === "annual" ? formatIDR(unitAmount * 12) : formatIDR(unitAmount)
  const totalSuffix = billing === "annual" ? "billed yearly" : "billed monthly"

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const order = {
        orderId: `DEMO-${Date.now().toString(36).toUpperCase()}`,
        plan: tier.slug,
        planName: tier.name,
        billing,
        unitAmount,
        totalAmount: billing === "annual" ? unitAmount * 12 : unitAmount,
        customer: { name, email, phone },
        createdAt: new Date().toISOString(),
      }
      sessionStorage.setItem("rantai_last_order", JSON.stringify(order))
    } catch {
      // sessionStorage may be unavailable; success page tolerates missing data
    }
    setTimeout(() => {
      router.push(`/checkout/success/?order=${tier.slug}-${billing}`)
    }, 900)
  }

  return (
    <form onSubmit={handleSubmit} className={`${landing.card} p-6 space-y-5`} aria-labelledby="checkout-heading">
      <h2 id="checkout-heading" className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Your details
      </h2>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-2">Billing period</label>
        <ToggleGroup
          type="single"
          value={billing}
          onValueChange={(v) => v && setBilling(v as Billing)}
          className="border border-zinc-700 rounded-full p-0.5 bg-zinc-900 w-fit"
          aria-label="Billing period"
        >
          <ToggleGroupItem
            value="monthly"
            className="!rounded-full data-[state=on]:bg-zinc-700 data-[state=on]:text-zinc-100 text-zinc-400 min-w-[110px]"
          >
            Monthly
          </ToggleGroupItem>
          <ToggleGroupItem
            value="annual"
            className="!rounded-full data-[state=on]:bg-zinc-700 data-[state=on]:text-zinc-100 text-zinc-400 min-w-[110px]"
          >
            Annual (−20%)
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Full name" required>
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Jane Doe"
          />
        </Field>
        <Field id="email" label="Email" required>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@company.com"
          />
        </Field>
        <Field id="phone" label="Phone (WhatsApp)" required>
          <input
            id="phone"
            type="tel"
            required
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="+62 812 3456 7890"
          />
        </Field>
      </div>

      <div className="border-t border-zinc-800 pt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between text-zinc-400">
          <span>{tier.name} — {billing === "annual" ? "annual" : "monthly"}</span>
          <span>{formatIDR(unitAmount)}/mo</span>
        </div>
        <div className="flex items-center justify-between text-zinc-100 font-semibold text-base">
          <span>Total today</span>
          <span>{totalLabel}</span>
        </div>
        <div className="text-xs text-zinc-500 text-right">{totalSuffix}</div>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className={cn("w-full rounded-full", landing.btnHighlight)}
        variant="ghost"
      >
        {submitting ? "Redirecting to Midtrans…" : `Pay ${totalLabel} via Midtrans`}
      </Button>
      <p className="text-[11px] text-zinc-500 text-center">
        By continuing you agree to our terms. Payments handled by Midtrans (PT Midtrans).
      </p>
    </form>
  )
}

function Field({ id, label, required, children }: { id: string; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-zinc-400 mb-1.5">
        {label}{required && <span className="text-indigo-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"

export function CheckoutForm({ tier }: { tier: PricingTier }) {
  return (
    <Suspense fallback={<div className={`${landing.card} p-6 text-zinc-500 text-sm`}>Loading checkout…</div>}>
      <CheckoutFormInner tier={tier} />
    </Suspense>
  )
}
