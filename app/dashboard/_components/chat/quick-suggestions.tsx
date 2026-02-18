"use client"

import { memo } from "react"
import { motion } from "framer-motion"
import { ArrowUpRight } from "lucide-react"
import type { Assistant } from "@/lib/types/assistant"

interface QuickSuggestionsProps {
  onSelect: (suggestion: string) => void
  assistant: Assistant
}

// Default suggestions for different assistant types
const SUGGESTIONS: Record<string, string[]> = {
  // Insurance assistant
  "horizon-insurance": [
    "What life insurance options do you have?",
    "Compare health insurance tiers",
    "Tell me about home insurance coverage",
  ],
  // General fallback
  default: [
    "What can you help me with?",
    "Tell me about your capabilities",
    "How do I get started?",
  ],
}

// Animation variants for staggered entrance
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.3,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 24,
    },
  },
}

export const QuickSuggestions = memo<QuickSuggestionsProps>(
  ({ onSelect, assistant }) => {
    // Get suggestions based on assistant ID or use default
    const suggestions =
      SUGGESTIONS[assistant.id] || SUGGESTIONS.default

    return (
      <motion.div
        className="flex flex-col items-center gap-3 mt-8"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <div className="flex flex-wrap justify-center gap-2 max-w-lg">
          {suggestions.map((suggestion, i) => (
            <motion.div key={i} variants={itemVariants}>
              <button
                type="button"
                className="group flex items-center gap-1.5 py-2.5 px-4 text-sm text-foreground/80 font-normal rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-border hover:text-foreground transition-colors cursor-pointer"
                onClick={() => onSelect(suggestion)}
              >
                <span>{suggestion}</span>
                <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-muted-foreground shrink-0 transition-opacity duration-200" />
              </button>
            </motion.div>
          ))}
        </div>
      </motion.div>
    )
  }
)

QuickSuggestions.displayName = "QuickSuggestions"
