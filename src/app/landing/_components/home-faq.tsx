import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { FAQ_ITEMS } from "@/lib/faq"
import { Reveal } from "./reveal"

export function HomeFaq() {
  return (
    <section id="faq" className="scroll-mt-20 py-24 sm:py-32" aria-labelledby="faq-heading">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[1fr_1.7fr] lg:gap-16">
        <Reveal>
          <h2
            id="faq-heading"
            className="max-w-[12ch] text-3xl font-normal leading-tight tracking-tight text-foreground sm:text-[40px]"
          >
            Frequently asked questions
          </h2>
        </Reveal>

        <Reveal delay={0.15}>
          <Accordion
            type="single"
            collapsible
            defaultValue="faq-0"
            className="w-full"
            aria-label="Frequently asked questions"
          >
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem
                key={item.q}
                value={`faq-${i}`}
                className="border-b border-dashed border-border"
              >
                <AccordionTrigger className="py-5 text-left text-sm font-medium text-foreground hover:no-underline sm:text-base">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-base font-light leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}
