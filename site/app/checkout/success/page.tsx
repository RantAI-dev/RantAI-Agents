import { landing } from "../../_components/landing-styles"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SuccessSummary } from "./success-summary"

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-zinc-200 hover:text-white text-sm">
            ← Back to home
          </a>
          <span className="text-xs text-zinc-500">Order confirmed</span>
        </div>
      </header>

      <main className="flex-1 py-16 sm:py-24 px-4 sm:px-6">
        <div className={landing.containerTight}>
          <div className={`${landing.card} p-8 sm:p-10 text-center`}>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-2xl">
              &#10003;
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50 mb-2">
              Order received
            </h1>
            <p className="text-zinc-400 mb-6 text-sm sm:text-base">
              Thank you. Your sandbox order has been recorded.
            </p>

            <SuccessSummary />

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                asChild
                className={cn("rounded-full", landing.btnHighlight)}
                variant="ghost"
              >
                <a href="/">Back to home</a>
              </Button>
              <Button
                asChild
                className={cn("rounded-full", landing.btnSecondary)}
                variant="ghost"
              >
                <a href="/#pricing">View plans</a>
              </Button>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-zinc-500">
            This is a sandbox confirmation. No payment was processed. Production payments are handled by Midtrans and will appear in your dashboard once activation completes.
          </p>
        </div>
      </main>
    </div>
  )
}
