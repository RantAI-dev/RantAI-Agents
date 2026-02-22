"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Wrench,
  Sparkles,
  Download,
  Check,
  Loader2,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MarketplaceItem } from "@/hooks/use-marketplace"

const TYPE_STYLES: Record<
  string,
  {
    iconBg: string
    iconColor: string
    accentBorder: string
    glowClass: string
    badgeBg: string
    icon: React.ElementType
  }
> = {
  skill: {
    iconBg:
      "bg-violet-100 dark:bg-violet-500/15",
    iconColor: "text-violet-600 dark:text-violet-400",
    accentBorder: "border-l-violet-500/70",
    glowClass:
      "group-hover:shadow-[0_0_20px_-4px_oklch(0.62_0.2_295/0.12)] dark:group-hover:shadow-[0_0_20px_-4px_oklch(0.62_0.2_295/0.2)]",
    badgeBg: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    icon: Sparkles,
  },
  tool: {
    iconBg:
      "bg-sky-100 dark:bg-sky-500/15",
    iconColor: "text-sky-600 dark:text-sky-400",
    accentBorder: "border-l-sky-500/70",
    glowClass:
      "group-hover:shadow-[0_0_20px_-4px_oklch(0.55_0.2_230/0.12)] dark:group-hover:shadow-[0_0_20px_-4px_oklch(0.55_0.2_230/0.2)]",
    badgeBg: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    icon: Wrench,
  },
}

const CATEGORY_ACCENTS: Record<string, string> = {
  Productivity: "border-l-amber-500/70",
  Development: "border-l-sky-500/70",
  Communication: "border-l-violet-500/70",
  Data: "border-l-emerald-500/70",
  "AI & Writing": "border-l-rose-500/70",
  "Customer Support": "border-l-orange-500/70",
  Utilities: "border-l-slate-400/70 dark:border-l-slate-500/70",
}

interface MarketplaceCardProps {
  item: MarketplaceItem
  onInstall: (id: string) => Promise<void>
  onUninstall: (id: string) => Promise<void>
}

export function MarketplaceCard({
  item,
  onInstall,
  onUninstall,
}: MarketplaceCardProps) {
  const [loading, setLoading] = useState(false)
  const [justInstalled, setJustInstalled] = useState(false)

  const style = TYPE_STYLES[item.type] || TYPE_STYLES.tool
  const categoryAccent = CATEGORY_ACCENTS[item.category] || style.accentBorder
  const Icon = style.icon

  const handleAction = async () => {
    setLoading(true)
    try {
      if (item.installed) {
        await onUninstall(item.id)
        setJustInstalled(false)
      } else {
        await onInstall(item.id)
        setJustInstalled(true)
        setTimeout(() => setJustInstalled(false), 2000)
      }
    } catch (err) {
      console.error("Marketplace action failed:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card transition-all duration-300 ease-out overflow-hidden",
        "border-l-[3px]",
        categoryAccent,
        "hover:border-border/80 hover:bg-card",
        style.glowClass,
        item.installed &&
          "ring-1 ring-emerald-500/20 dark:ring-emerald-500/15"
      )}
    >
      {/* Installed indicator bar */}
      {item.installed && (
        <div className="absolute top-0 right-0">
          <div className="h-8 w-8 overflow-hidden">
            <div className="absolute -top-1 -right-1 h-4 w-10 bg-emerald-500 rotate-45 origin-bottom-left" />
          </div>
        </div>
      )}

      <div className="flex items-start gap-3.5 p-4">
        {/* Icon */}
        <div
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105",
            style.iconBg
          )}
        >
          <Icon className={cn("h-[18px] w-[18px]", style.iconColor)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate leading-tight">
              {item.displayName}
            </h3>
            <span
              className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0",
                style.badgeBg
              )}
            >
              {item.type}
            </span>
          </div>

          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
            {item.description}
          </p>

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              {item.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/60 text-[10px] text-muted-foreground font-medium"
                >
                  {tag}
                </span>
              ))}
              {item.tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground/50 font-medium">
                  +{item.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
          {item.category}
        </span>

        <Button
          variant={item.installed ? "ghost" : "default"}
          size="sm"
          className={cn(
            "h-7 text-xs gap-1.5 transition-all duration-200",
            item.installed
              ? "text-emerald-600 dark:text-emerald-400 hover:text-red-600 dark:hover:text-red-400"
              : "shadow-sm"
          )}
          onClick={handleAction}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : justInstalled ? (
            <motion.span
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1"
            >
              <Zap className="h-3 w-3" />
              Added!
            </motion.span>
          ) : item.installed ? (
            <>
              <Check className="h-3 w-3" />
              <span className="group-hover:hidden">Installed</span>
              <span className="hidden group-hover:inline">Remove</span>
            </>
          ) : (
            <>
              <Download className="h-3 w-3" />
              Install
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
