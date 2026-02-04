import Image from "next/image"
import Link from "next/link"
import { Bot, BookOpen, Globe, Users, Zap, FileSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { LandingMobileNav } from "./_components/landing-mobile-nav"
import { TestimonialsCarousel } from "./_components/testimonials-carousel"
import { PricingSection } from "./_components/pricing-section"
import { landing } from "./_components/landing-styles"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const

const FEATURES = [
  { title: "AI Agent Framework", description: "Build configurable AI assistants with custom system prompts and behaviors.", icon: Bot },
  { title: "RAG Pipeline", description: "Advanced retrieval-augmented generation with hybrid search and semantic reranking.", icon: FileSearch },
  { title: "Knowledge Base", description: "Document ingestion, categorization, and intelligent chunking.", icon: BookOpen },
  { title: "Multi-Channel Deployment", description: "Deploy agents across web, WhatsApp, email, and embeddable widgets.", icon: Globe },
  { title: "Human-in-the-Loop", description: "Seamless handoff between AI agents and human operators.", icon: Users },
  { title: "Real-Time & Widget", description: "Socket.io powered live interactions and a drop-in chat widget for any website.", icon: Zap },
] as const

const HOW_IT_WORKS = [
  { step: 1, title: "Ingest knowledge", body: "Upload documents to your knowledge base; we chunk and embed them." },
  { step: 2, title: "Retrieve context", body: "Each query uses hybrid search and reranking to pull the right context." },
  { step: 3, title: "Respond", body: "The AI agent answers using your data and custom prompts." },
  { step: 4, title: "Escalate when needed", body: "Hand off to human operators for complex or sensitive cases." },
] as const

const USE_CASES = [
  { title: "Customer Support", description: "Automated support with knowledge base integration and agent handoff." },
  { title: "Internal Knowledge Assistant", description: "Help employees find information across company documents." },
  { title: "Domain-Specific Agents", description: "Build specialized agents for insurance, healthcare, legal, and more." },
  { title: "Lead Qualification", description: "Intelligent chatbots that qualify and route leads." },
  { title: "FAQ Automation", description: "Self-service answers powered by your documentation." },
] as const

const INTEGRATIONS = ["Next.js", "OpenRouter", "PostgreSQL", "SurrealDB", "Twilio", "Salesforce"] as const

const FAQ_ITEMS = [
  { q: "What is RantAI Agents?", a: "RantAI Agents is an enterprise-grade AI agent platform that lets you build and deploy intelligent agents with RAG, multi-channel deployment (web, WhatsApp, email, widget), and human-in-the-loop handoff." },
  { q: "Does it support RAG?", a: "Yes. The platform includes a full RAG pipeline: document ingestion, semantic chunking, vector storage in SurrealDB, hybrid search, reranking, and context-aware response generation." },
  { q: "Which channels are supported?", a: "You can deploy agents on the web portal, embeddable widget, WhatsApp (via Twilio), and email. Salesforce CRM integration is also available." },
  { q: "How does human handoff work?", a: "When the AI can't resolve an issue or you configure escalation, the conversation is queued for a human operator who can take over and continue the chat in real time." },
  { q: "What do I need to run it?", a: "You need Node.js v18+, pnpm, Docker (for PostgreSQL and SurrealDB), and an OpenRouter API key. See the README for a full quick start." },
] as const

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-zinc-950 focus:rounded-md focus:w-auto focus:h-auto focus:overflow-visible focus:m-0"
      >
        Skip to main content
      </a>
      <header
        className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/90 backdrop-blur"
        role="banner"
      >
        <nav
          className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
          aria-label="Main navigation"
        >
          <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="RantAI Agents home">
            <Image src="/logo/logo-rantai-bg.png" alt="RantAI" width={32} height={32} className="h-8 w-auto" />
            <span className="font-semibold text-zinc-100">RantAI Agents</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <LandingMobileNav />
            <Button variant="ghost" size="sm" className="hidden md:inline-flex text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800" asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
            <Button size="sm" className="hidden md:inline-flex bg-white text-zinc-950 hover:bg-zinc-200" asChild>
              <Link href="/agent/login">Sign in</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main id="main-content" className="flex-1" aria-label="Landing page content">
        {/* Hero - split layout */}
        <section className="relative py-16 sm:py-20 lg:py-28 px-4 sm:px-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-indigo-950/30" aria-hidden="true" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" aria-hidden="true" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            <div className="flex-1 text-center lg:text-left">
              <p className="text-sm font-medium text-indigo-400 uppercase tracking-wider mb-4">Enterprise AI agents</p>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl text-zinc-50 mb-6">
                Build. Deploy. Scale.
              </h1>
              <p className="text-lg sm:text-xl text-zinc-400 max-w-xl mx-auto lg:mx-0 mb-10">
                RantAI Agents is a flexible platform for building intelligent agents with RAG, multi-channel deployment, and human-in-the-loop workflows—so you can power support, knowledge assistants, and domain-specific AI from one place.
              </p>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
                <Button size="lg" className={landing.btnPrimary} asChild>
                  <Link href="/agent/login">Get started</Link>
                </Button>
                <Button size="lg" variant="outline" className={landing.btnSecondary} asChild>
                  <Link href="#features">See features</Link>
                </Button>
              </div>
            </div>
            <div className="flex-1 w-full max-w-md lg:max-w-lg">
              <Card className={cn(landing.card, "overflow-hidden shadow-2xl shadow-black/20")}>
                <CardContent className="p-0">
                  <AspectRatio ratio={5 / 4}>
                    <Image
                      src="/landing/hero-illustration-placeholder.svg"
                      alt=""
                      width={500}
                      height={400}
                      className="h-full w-full object-cover"
                    />
                  </AspectRatio>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Social proof / integrations */}
        <section className={cn(landing.section, "py-10 border-y border-zinc-800")} aria-labelledby="integrations-heading">
          <div className={landing.containerNarrow}>
            <p id="integrations-heading" className="sr-only">Integrations and technology</p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
              {INTEGRATIONS.map((name) => (
                <span key={name} className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
                  {name}
                </span>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-12 text-center">
              <div>
                <p className="text-2xl font-bold text-zinc-100">RAG-powered</p>
                <p className="text-xs text-zinc-500 mt-0.5">Hybrid search + rerank</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">Multi-channel</p>
                <p className="text-xs text-zinc-500 mt-0.5">Web, WhatsApp, Email</p>
              </div>
            </div>
          </div>
        </section>

        {/* Product preview */}
        <section className={landing.section} aria-labelledby="product-preview-heading">
          <div className="mx-auto max-w-5xl">
            <h2 id="product-preview-heading" className={landing.sectionTitle}>
              One dashboard. Full control.
            </h2>
            <p className={landing.sectionSubtitle}>
              Configure assistants, manage knowledge bases, and handle live conversations in one place.
            </p>
            <div className={cn(landing.card, "p-2 shadow-2xl shadow-black/30 overflow-hidden")}>
              <AspectRatio ratio={8 / 5}>
                <Image
                  src="/landing/product-screenshot-placeholder.svg"
                  alt="Dashboard and chat interface placeholder"
                  width={800}
                  height={500}
                  className="h-full w-full object-cover rounded-lg"
                />
              </AspectRatio>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section id="features" className={cn(landing.sectionAlt, "scroll-mt-14")} aria-labelledby="features-heading">
          <div className={landing.container}>
            <h2 id="features-heading" className={landing.sectionTitle}>Key features</h2>
            <p className={landing.sectionSubtitle}>
              Everything you need to build and run production-ready AI agents.
            </p>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => {
                const Icon = f.icon
                return (
                  <Card key={f.title} className={cn(landing.card, "flex flex-col")}>
                    <CardHeader>
                      <div className={cn(landing.iconWrapper, "mb-2")}>
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <CardTitle className="text-lg text-zinc-100">{f.title}</CardTitle>
                      <CardDescription className="text-zinc-400">{f.description}</CardDescription>
                    </CardHeader>
                  </Card>
                )
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className={landing.section} aria-labelledby="how-it-works-heading">
          <div className={landing.containerNarrow}>
            <h2 id="how-it-works-heading" className={landing.sectionTitle}>How it works</h2>
            <p className={landing.sectionSubtitle}>
              From knowledge to response, with human backup when it matters.
            </p>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.step} className="relative text-center">
                  <div className={landing.stepCircle}>{item.step}</div>
                  <h3 className="mt-3 font-semibold text-zinc-200">{item.title}</h3>
                  <p className="mt-1 text-sm text-zinc-500">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section id="use-cases" className={cn(landing.sectionAlt, "scroll-mt-14")} aria-labelledby="use-cases-heading">
          <div className={landing.container}>
            <h2 id="use-cases-heading" className={landing.sectionTitle}>Use cases</h2>
            <p className={landing.sectionSubtitle}>
              Built for support, knowledge, and domain-specific workflows.
            </p>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {USE_CASES.map((uc) => (
                <Card key={uc.title} className={landing.card}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-zinc-100">{uc.title}</CardTitle>
                    <CardDescription className="text-sm text-zinc-400">{uc.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className={landing.section} aria-labelledby="testimonials-heading">
          <div className={landing.containerNarrow}>
            <h2 id="testimonials-heading" className={landing.sectionTitle}>What teams say</h2>
            <p className={landing.sectionSubtitle}>
              Trusted by product and engineering teams to ship AI-powered experiences.
            </p>
            <TestimonialsCarousel />
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className={cn(landing.sectionAlt, "scroll-mt-14")} aria-labelledby="pricing-heading">
          <div className={landing.container}>
            <h2 id="pricing-heading" className={landing.sectionTitle}>Explore plans</h2>
            <p className={landing.sectionSubtitle}>
              Start free, scale as you grow. Pricing below is placeholder for demonstration.
            </p>
            <PricingSection />
          </div>
        </section>

        {/* CTA band */}
        <section className={cn(landing.section, "py-20 sm:py-28")} aria-labelledby="cta-heading">
          <div className={cn(landing.containerNarrow, "text-center rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-indigo-950/40 p-12 sm:p-16 shadow-xl")}>
            <h2 id="cta-heading" className={landing.sectionTitle}>
              Ready to build with AI agents?
            </h2>
            <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
              Get started in minutes. Deploy on your infrastructure or try the platform with a free account.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button size="lg" className={landing.btnPrimary} asChild>
                <Link href="/agent/login">Get started free</Link>
              </Button>
              <Button size="lg" variant="outline" className={landing.btnSecondary} asChild>
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={cn(landing.section, "scroll-mt-14")} aria-labelledby="faq-heading">
          <div className={landing.containerTight}>
            <h2 id="faq-heading" className={landing.sectionTitle}>Frequently asked questions</h2>
            <p className={landing.sectionSubtitle}>Quick answers to common questions.</p>
            <Accordion type="single" collapsible className={cn("w-full divide-y divide-zinc-800 overflow-hidden rounded-xl", landing.card)} aria-label="Frequently asked questions">
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

        {/* Footer */}
        <footer className={cn("border-t border-zinc-800 py-12 px-4 sm:px-6 bg-zinc-900/50")} role="contentinfo">
          <div className={cn(landing.container, "flex flex-col sm:flex-row items-center justify-between gap-6")}>
            <div className="flex items-center gap-2">
              <Image src="/logo/logo-rantai-bg.png" alt="" width={24} height={24} className="h-6 w-auto opacity-80" />
              <span className="text-sm font-medium text-zinc-300">RantAI Agents</span>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm" aria-label="Footer navigation">
              <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 transition-colors">Dashboard</Link>
              <Link href="/agent/login" className="text-zinc-500 hover:text-zinc-300 transition-colors">Agent login</Link>
              <Link href="#features" className="text-zinc-500 hover:text-zinc-300 transition-colors">Features</Link>
              <Link href="#pricing" className="text-zinc-500 hover:text-zinc-300 transition-colors">Pricing</Link>
              <Link href="#faq" className="text-zinc-500 hover:text-zinc-300 transition-colors">FAQ</Link>
            </nav>
          </div>
          <p className={cn(landing.container, "mt-6 text-center text-sm text-zinc-500")}>
            Built with Next.js, Prisma, SurrealDB, and OpenRouter API.
          </p>
        </footer>
      </main>
    </div>
  )
}
