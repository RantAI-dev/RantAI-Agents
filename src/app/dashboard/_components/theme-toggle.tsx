"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Sun, Moon, Monitor } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"

const cycle = ["light", "dark", "system"] as const
const icons = { light: Sun, dark: Moon, system: Monitor }
const labels = { light: "Light", dark: "Dark", system: "System" }

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const current = (theme as typeof cycle[number]) || "system"
  const Icon = icons[current]
  const next = cycle[(cycle.indexOf(current) + 1) % cycle.length]

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setTheme(next)}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            aria-label={`Theme: ${labels[current]}`}
          >
            <Icon className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{labels[current]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
