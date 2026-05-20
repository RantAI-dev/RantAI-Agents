import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { LandingNavbar } from "./_components/landing-navbar"
import { HeroSection } from "./_components/hero-section"
import { FeaturesSection } from "./_components/features-section"
import { PricingSection } from "./_components/pricing-section"
import { FooterSection } from "./_components/footer-section"
import { CtaBand } from "./_components/cta-band"
import { landing } from "./_components/landing-styles"
import { cn } from "@/lib/utils"
import { brand } from "@/lib/branding"

const FAQ_ITEMS = [
  {
    q: `What is ${brand.productName}?`,
    a: `${brand.productName} is an enterprise AI agent platform that lets you build intelligent chat agents with RAG, create visual AI pipelines, and deploy across multiple channels — web, WhatsApp, email, and embeddable widgets.`,
  },
  {
    q: "What are Chat Agents?",
    a: "Chat Agents are AI-powered conversational agents backed by LLMs and your own knowledge base. They support RAG (Retrieval-Augmented Generation) for accurate, grounded responses, conversation memory, and can escalate to human operators when needed.",
  },
  {
    q: "How do AI Pipelines work?",
    a: "AI Pipelines is a visual drag-and-drop workflow builder. You can chain triggers, LLM calls, tool executions, conditional branches, and approval gates into automated workflows — no code required.",
  },
  {
    q: "Which channels are supported?",
    a: "You can deploy agents on the web portal, embeddable widget, WhatsApp (via Meta Cloud API), and email. One agent can serve multiple channels simultaneously.",
  },
  {
    q: "What about Digital Employees?",
    a: "Digital Employees — autonomous AI agents running in isolated Docker containers with their own workspace, VNC access, and graduated autonomy (L1–L4) — are coming soon. Stay tuned for updates.",
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-zinc-950 focus:rounded-md focus:w-auto focus:h-auto focus:overflow-visible focus:m-0"
      >
        Skip to main content
      </a>

      <LandingNavbar />

      <main id="main-content" className="flex-1" aria-label="Landing page content">
        <HeroSection />
        <FeaturesSection />
        <PricingSection />

        {/* CTA + FAQ */}
        <div>
          <CtaBand />

          {/* FAQ */}
          <section id="faq" className={cn(landing.section, "scroll-mt-20")} aria-labelledby="faq-heading">
            <div className={landing.containerTight}>
              <h2 id="faq-heading" className={landing.sectionTitle}>Frequently asked questions</h2>
              <p className={landing.sectionSubtitle}>Quick answers to common questions.</p>
              <Accordion
                type="single"
                collapsible
                className={cn("w-full divide-y divide-zinc-800 overflow-hidden rounded-xl", landing.card)}
                aria-label="Frequently asked questions"
              >
                {FAQ_ITEMS.map((item, i) => (
                  <AccordionItem key={item.q} value={`faq-${i}`} className="border-0 px-4">
                    <AccordionTrigger className="text-left text-zinc-200 hover:text-zinc-100 hover:no-underline py-4">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-zinc-400 pb-4">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>
        </div>

        <FooterSection />
      </main>
    </div>
  )
}
