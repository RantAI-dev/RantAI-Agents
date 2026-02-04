"use client"

import { memo } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"
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
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
    },
  },
}

const headerVariants = {
  hidden: { opacity: 0, y: -10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
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
        className="flex flex-col items-center gap-3 mt-6"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          variants={headerVariants}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Try asking</span>
        </motion.div>
        <div className="flex flex-wrap justify-center gap-2 max-w-lg">
          {suggestions.map((suggestion, i) => (
            <motion.div key={i} variants={itemVariants}>
              <Button
                variant="outline"
                size="sm"
                className="h-auto py-2 px-3 text-sm font-normal whitespace-normal text-left hover:bg-primary/5 hover:border-primary/30 transition-colors"
                onClick={() => onSelect(suggestion)}
              >
                {suggestion}
              </Button>
            </motion.div>
          ))}
        </div>
      </motion.div>
    )
  }
)

QuickSuggestions.displayName = "QuickSuggestions"
