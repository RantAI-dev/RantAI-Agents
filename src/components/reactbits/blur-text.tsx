"use client"

import { useRef, useEffect, useState, useMemo } from "react"
import { motion, useInView } from "framer-motion"

interface BlurTextProps {
  text: string
  delay?: number
  className?: string
  animateBy?: "words" | "letters"
  direction?: "top" | "bottom"
  threshold?: number
  rootMargin?: string
  animationFrom?: Record<string, string | number>
  animationTo?: Record<string, string | number>
}

export function BlurText({
  text,
  delay = 50,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  animationFrom,
  animationTo,
}: BlurTextProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  const isInView = useInView(ref, { once: true, amount: threshold })
  const [hasAnimated, setHasAnimated] = useState(false)

  useEffect(() => {
    if (isInView) setHasAnimated(true)
  }, [isInView])

  const elements = useMemo(() => {
    if (animateBy === "words") {
      return text.split(" ").map((word, i, arr) => ({
        text: word + (i < arr.length - 1 ? "\u00A0" : ""),
        key: `word-${i}`,
      }))
    }
    return text.split("").map((char, i) => ({
      text: char === " " ? "\u00A0" : char,
      key: `char-${i}`,
    }))
  }, [text, animateBy])

  const defaultFrom =
    direction === "top"
      ? { filter: "blur(10px)", opacity: 0, y: -10 }
      : { filter: "blur(10px)", opacity: 0, y: 10 }

  const defaultTo = { filter: "blur(0px)", opacity: 1, y: 0 }

  const from = animationFrom ?? defaultFrom
  const to = animationTo ?? defaultTo

  return (
    <p ref={ref} className={`flex flex-wrap ${className}`}>
      {elements.map((el, i) => (
        <motion.span
          key={el.key}
          initial={from}
          animate={hasAnimated ? to : from}
          transition={{
            delay: i * (delay / 1000),
            duration: 0.4,
            ease: "easeOut",
          }}
          className="inline-block will-change-[filter,opacity,transform]"
        >
          {el.text}
        </motion.span>
      ))}
    </p>
  )
}
