"use client"

import { memo } from "react"
import { motion } from "framer-motion"

export const TypingIndicator = memo(() => {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 bg-foreground/30 rounded-full"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">Thinking...</span>
    </div>
  )
})

TypingIndicator.displayName = "TypingIndicator"

// Alternative skeleton-style loading indicator for longer content
export const ContentLoadingIndicator = memo(() => {
  return (
    <div className="space-y-2 py-1">
      <motion.div
        className="h-3 bg-muted-foreground/20 rounded w-3/4"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="h-3 bg-muted-foreground/20 rounded w-1/2"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
      />
      <motion.div
        className="h-3 bg-muted-foreground/20 rounded w-2/3"
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      />
    </div>
  )
})

ContentLoadingIndicator.displayName = "ContentLoadingIndicator"

// Compact loading indicator for button states
export const ButtonLoadingIndicator = memo<{ className?: string }>(({ className }) => {
  return (
    <div className={className}>
      <motion.div
        className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      />
    </div>
  )
})

ButtonLoadingIndicator.displayName = "ButtonLoadingIndicator"
