import Link from "next/link"
import { notFound } from "next/navigation"
import { PRICING_TIERS, getTier } from "@/lib/pricing"
import { landing } from "../../_components/landing-styles"
import { CheckoutForm } from "./checkout-form"

export function generateStaticParams() {
  return PRICING_TIERS.map((t) => ({ plan: t.slug }))
}

export default async function CheckoutPlanPage({
  params,
}: {
  params: Promise<{ plan: string }>
}) {
  const { plan } = await params
  const tier = getTier(plan)
  if (!tier) notFound()

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-zinc-200 hover:text-white text-sm">
            ← Back to home
          </Link>
          <span className="text-xs text-zinc-500">Secure checkout · Sandbox</span>
        </div>
      </header>

      <main className="flex-1 py-12 sm:py-16 px-4 sm:px-6">
        <div className={landing.containerTight}>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50 mb-2">Checkout</h1>
          <p className="text-zinc-400 mb-8 text-sm">
            Review your order and complete payment via Midtrans.
          </p>

          <div className="grid gap-6 md:grid-cols-5">
            <section
              className={`${landing.card} p-6 md:col-span-2`}
              aria-labelledby="order-summary-heading"
            >
              <h2 id="order-summary-heading" className="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-4">
                Order summary
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-200 font-medium">{tier.name} plan</span>
                  {tier.highlighted && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                      Most popular
                    </span>
                  )}
                </div>
                <p className="text-zinc-500 text-sm">{tier.description}</p>
                <ul className="space-y-1.5 text-sm text-zinc-300 pt-2 border-t border-zinc-800">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="text-indigo-400" aria-hidden>&#10003;</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="md:col-span-3">
              <CheckoutForm tier={tier} />
            </section>
          </div>

          <p className="mt-8 text-center text-xs text-zinc-500">
            This is a sandbox checkout. No payment will be charged. Production billing is processed by Midtrans.
          </p>
        </div>
      </main>
    </div>
  )
}
