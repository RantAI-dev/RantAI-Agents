export type PlanSlug = "lite" | "pro" | "max"

export interface PricingTier {
  slug: PlanSlug
  name: string
  priceMonthly: string
  priceAnnual: string
  priceMonthlyAmount: number
  priceAnnualAmount: number
  periodMonthly: string
  periodAnnual: string
  annualSavingsYearly: string
  description: string
  features: string[]
  cta: string
  highlighted: boolean
}

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    slug: "lite",
    name: "Lite",
    priceMonthly: "Rp 49.000",
    priceAnnual: "Rp 39.000",
    priceMonthlyAmount: 49000,
    priceAnnualAmount: 39000,
    periodMonthly: "per month",
    periodAnnual: "per month (billed annually)",
    annualSavingsYearly: "Rp 120.000",
    description: "For solo builders trying things out.",
    features: ["1 agent", "1,000 messages / month", "Knowledge base (basic)", "Community support"],
    cta: "Get Lite",
    highlighted: false,
  },
  {
    slug: "pro",
    name: "Pro",
    priceMonthly: "Rp 199.000",
    priceAnnual: "Rp 159.000",
    priceMonthlyAmount: 199000,
    priceAnnualAmount: 159000,
    periodMonthly: "per month",
    periodAnnual: "per month (billed annually)",
    annualSavingsYearly: "Rp 480.000",
    description: "For teams running real workloads.",
    features: ["5 agents", "25,000 messages / month", "Knowledge base (expanded)", "Priority support"],
    cta: "Get Pro",
    highlighted: true,
  },
  {
    slug: "max",
    name: "Max",
    priceMonthly: "Rp 999.000",
    priceAnnual: "Rp 799.000",
    priceMonthlyAmount: 999000,
    priceAnnualAmount: 799000,
    periodMonthly: "per month",
    periodAnnual: "per month (billed annually)",
    annualSavingsYearly: "Rp 2.400.000",
    description: "No limits — for serious deployments.",
    features: ["Unlimited agents", "Unlimited messages", "Unlimited knowledge base", "SSO, audit & dedicated support"],
    cta: "Get Max",
    highlighted: false,
  },
] as const

export function getTier(slug: string): PricingTier | undefined {
  return PRICING_TIERS.find((t) => t.slug === slug)
}

export function formatIDR(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`
}
