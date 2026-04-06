"use client"

import { useEffect, useRef, useState } from "react"
import { useInView, motion, useSpring, useMotionValue } from "framer-motion"

interface CountUpProps {
  to: number
  from?: number
  duration?: number
  className?: string
  separator?: string
  suffix?: string
}

export function CountUp({
  to,
  from = 0,
  duration = 1.5,
  className = "",
  separator = "",
  suffix = "",
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })
  const motionValue = useMotionValue(from)
  const spring = useSpring(motionValue, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  })
  const [display, setDisplay] = useState(String(from))

  useEffect(() => {
    if (isInView) {
      motionValue.set(to)
    }
  }, [isInView, to, motionValue])

  useEffect(() => {
    const unsubscribe = spring.on("change", (latest) => {
      const value = Math.round(latest)
      if (separator) {
        setDisplay(value.toLocaleString())
      } else {
        setDisplay(String(value))
      }
    })
    return unsubscribe
  }, [spring, separator])

  return (
    <motion.span ref={ref} className={className}>
      {display}
      {suffix}
    </motion.span>
  )
}
