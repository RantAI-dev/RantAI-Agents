import Link from "next/link"
import { Button } from "@/components/ui/button"
import { appUrl } from "@/lib/app-url"
import { Reveal } from "./reveal"

export function HomeCta() {
  return (
    <section className="py-12 sm:py-16" aria-labelledby="cta-heading">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="flex flex-col items-center gap-6 rounded-[32px] border border-dashed border-border bg-[var(--sidebar)] px-6 py-16 text-center sm:py-20">
          <h2 id="cta-heading" className="text-3xl font-normal tracking-tight text-foreground sm:text-[40px]">
            Ready to build your Agents?
          </h2>
          <Button
            className="h-10 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-transform hover:scale-[1.03] hover:bg-foreground/85 active:scale-[0.98]"
            asChild
          >
            <Link href={appUrl("/login")}>Get Started</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  )
}
