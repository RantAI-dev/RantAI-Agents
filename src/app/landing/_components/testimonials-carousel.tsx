"use client"

import Image from "next/image"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { Card, CardContent } from "@/components/ui/card"
import { landing } from "./landing-styles"
import { brand } from "@/lib/branding"

const TESTIMONIALS = [
  {
    quote: `${brand.productName} let us ship a support bot in days. RAG + human handoff just works.`,
    name: "Alex Chen",
    role: "Head of Product",
    avatar: "/placeholder-user.jpg",
  },
  {
    quote: "We use it for internal knowledge. Our team finds answers without leaving Slack.",
    name: "Jordan Lee",
    role: "Engineering Lead",
    avatar: "/placeholder-user.jpg",
  },
  {
    quote: "The embeddable widget is clean and easy. Our conversion from chat to lead went up.",
    name: "Sam Rivera",
    role: "Growth",
    avatar: "/placeholder-user.jpg",
  },
]

export function TestimonialsCarousel() {
  return (
    <Carousel opts={{ align: "start", loop: true }} className="w-full max-w-4xl mx-auto" aria-label="Customer testimonials">
      <CarouselContent className="-ml-4">
        {TESTIMONIALS.map((t, i) => (
          <CarouselItem key={i} className="pl-4 md:basis-1/2 lg:basis-1/3">
            <Card className={landing.card}>
              <CardContent className="pt-6">
                <p className="text-zinc-300 text-sm leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <Image
                    src={t.avatar}
                    alt=""
                    width={40}
                    height={40}
                    className="rounded-full object-cover h-10 w-10"
                  />
                  <div>
                    <p className="font-medium text-zinc-100 text-sm">{t.name}</p>
                    <p className="text-zinc-500 text-xs">{t.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white -left-4 lg:-left-12" />
      <CarouselNext className="border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white -right-4 lg:-right-12" />
    </Carousel>
  )
}
