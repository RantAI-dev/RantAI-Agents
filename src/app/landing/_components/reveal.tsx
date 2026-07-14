"use client"

import type { ComponentProps } from "react"
import { motion } from "framer-motion"

interface RevealProps extends ComponentProps<typeof motion.div> {
  /** Seconds to wait before the reveal starts (use for stagger). */
  delay?: number
}

/** Fade-up reveal that plays once when the element scrolls into view. */
export function Reveal({ children, delay = 0, ...rest }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
