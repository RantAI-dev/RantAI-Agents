"use client"

import { useState } from "react"
import {
  Wrench,
  Sparkles,
  Workflow,
  Download,
  Check,
  Loader2,
  Zap,
  Package,
  Bot,
  Plug,
  Plus,
  type IconComponent,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { cn } from "@/lib/utils"
import type { MarketplaceItem } from "@/hooks/use-marketplace"
import { ConfigFormDialog } from "./config-form-dialog"

const TYPE_STYLES: Record<
  string,
  {
    iconBg: string
    iconColor: string
    accentBorder: string
    glowClass: string
    badgeBg: string
    icon: IconComponent
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
  workflow: {
    iconBg:
      "bg-indigo-100 dark:bg-indigo-500/15",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    accentBorder: "border-l-indigo-500/70",
    glowClass:
      "group-hover:shadow-[0_0_20px_-4px_oklch(0.51_0.23_264/0.12)] dark:group-hover:shadow-[0_0_20px_-4px_oklch(0.51_0.23_264/0.2)]",
    badgeBg: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    icon: Workflow,
  },
  assistant: {
    iconBg:
      "bg-amber-100 dark:bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
    accentBorder: "border-l-amber-500/70",
    glowClass:
      "group-hover:shadow-[0_0_20px_-4px_oklch(0.75_0.15_75/0.12)] dark:group-hover:shadow-[0_0_20px_-4px_oklch(0.75_0.15_75/0.2)]",
    badgeBg: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    icon: Bot,
  },
  mcp: {
    iconBg:
      "bg-emerald-100 dark:bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    accentBorder: "border-l-emerald-500/70",
    glowClass:
      "group-hover:shadow-[0_0_20px_-4px_oklch(0.7_0.17_160/0.12)] dark:group-hover:shadow-[0_0_20px_-4px_oklch(0.7_0.17_160/0.2)]",
    badgeBg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    icon: Plug,
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
  Insurance: "border-l-blue-500/70",
  Finance: "border-l-emerald-500/70",
  Healthcare: "border-l-rose-500/70",
  Legal: "border-l-slate-500/70",
  "E-commerce": "border-l-purple-500/70",
  Marketing: "border-l-pink-500/70",
  Sales: "border-l-orange-500/70",
  HR: "border-l-cyan-500/70",
  Education: "border-l-lime-500/70",
  "IT Support": "border-l-gray-500/70",
  Compliance: "border-l-red-500/70",
  Travel: "border-l-sky-500/70",
  Knowledge: "border-l-violet-500/70",
  IT: "border-l-gray-500/70",
  Content: "border-l-fuchsia-500/70",
}

interface MarketplaceCardProps {
  item: MarketplaceItem
  onInstall: (id: string, config?: Record<string, unknown>) => Promise<unknown>
  onUninstall: (id: string) => Promise<void>
  onViewDetail: (id: string) => void
  onUseTemplate?: (id: string) => Promise<void>
}

export function MarketplaceCard({
  item,
  onInstall,
  onUninstall,
  onViewDetail,
  onUseTemplate,
}: MarketplaceCardProps) {
  const [loading, setLoading] = useState(false)
  const [justInstalled, setJustInstalled] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  const style = TYPE_STYLES[item.type] || TYPE_STYLES.tool
  const categoryAccent = CATEGORY_ACCENTS[item.category] || style.accentBorder
  const isTemplateType = item.type === "workflow" || item.type === "assistant"

  const doInstall = async (config?: Record<string, unknown>) => {
    setLoading(true)
    try {
      await onInstall(item.id, config)
      setJustInstalled(true)
      setTimeout(() => setJustInstalled(false), 2000)
    } catch (err) {
      console.error("Marketplace action failed:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleUseTemplate = async () => {
    if (!onUseTemplate) return
    setLoading(true)
    try {
      await onUseTemplate(item.id)
    } catch (err) {
      console.error("Use template failed:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async () => {
    if (isTemplateType) {
      await handleUseTemplate()
    } else if (item.installed) {
      setLoading(true)
      try {
        await onUninstall(item.id)
        setJustInstalled(false)
      } catch (err) {
        console.error("Marketplace action failed:", err)
      } finally {
        setLoading(false)
      }
    } else if (item.configSchema) {
      setConfigOpen(true)
    } else {
      await doInstall()
    }
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card transition-all duration-300 ease-out overflow-hidden cursor-pointer",
        "border-l-[3px]",
        categoryAccent,
        "hover:border-border/80 hover:bg-card",
        style.glowClass,
        item.installed &&
          "ring-1 ring-emerald-500/20 dark:ring-emerald-500/15"
      )}
      onClick={() => onViewDetail(item.id)}
    >
      <div className="flex items-start gap-3.5 p-4">
        {/* Icon */}
        <div
          className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105",
            style.iconBg
          )}
        >
          <DynamicIcon
            icon={item.icon}
            serviceName={item.displayName}
            fallback={style.icon}
            className={cn("h-[18px] w-[18px]", style.iconColor)}
            emojiClassName="text-lg"
          />
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
            {item.isBuiltIn && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                <Package className="h-2.5 w-2.5" />
                Built-in
              </span>
            )}
            {!item.isBuiltIn && (item.communitySkillName || item.communityToolName) && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                Community
              </span>
            )}
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

        {item.isBuiltIn ? (
          <span className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 font-medium">
            <Check className="h-3 w-3" />
            Always On
          </span>
        ) : isTemplateType ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 transition-all duration-200 shadow-sm cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              handleAction()
            }}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Plus className="h-3 w-3" />
                Use Template
              </>
            )}
          </Button>
        ) : (
          <Button
            variant={item.installed ? "ghost" : "default"}
            size="sm"
            className={cn(
              "h-7 text-xs gap-1.5 transition-all duration-200",
              item.installed
                ? "text-emerald-600 dark:text-emerald-400 hover:text-red-600 dark:hover:text-red-400"
                : "shadow-sm"
            )}
            onClick={(e) => {
              e.stopPropagation()
              handleAction()
            }}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : justInstalled ? (
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Added!
              </span>
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
        )}
      </div>

      {item.configSchema && (
        <ConfigFormDialog
          open={configOpen}
          onOpenChange={setConfigOpen}
          item={item}
          onSubmit={doInstall}
        />
      )}
    </div>
  )
}
