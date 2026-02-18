"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type AccentColor = "primary" | "amber" | "cyan" | "violet" | "chart-1" | "chart-2" | "chart-3"

const accentStyles: Record<AccentColor, { border: string; iconBg: string; iconText: string }> = {
  primary: {
    border: "border-l-primary/30",
    iconBg: "bg-primary/10",
    iconText: "text-primary",
  },
  amber: {
    border: "border-l-amber-500/30",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-500",
  },
  cyan: {
    border: "border-l-cyan-500/30",
    iconBg: "bg-cyan-500/10",
    iconText: "text-cyan-500",
  },
  violet: {
    border: "border-l-violet-500/30",
    iconBg: "bg-violet-500/10",
    iconText: "text-violet-500",
  },
  "chart-1": {
    border: "border-l-chart-1/30",
    iconBg: "bg-chart-1/10",
    iconText: "text-chart-1",
  },
  "chart-2": {
    border: "border-l-chart-2/30",
    iconBg: "bg-chart-2/10",
    iconText: "text-chart-2",
  },
  "chart-3": {
    border: "border-l-chart-3/30",
    iconBg: "bg-chart-3/10",
    iconText: "text-chart-3",
  },
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: number
  accent?: AccentColor
  className?: string
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accent = "primary",
  className,
}: StatCardProps) {
  const styles = accentStyles[accent]

  return (
    <Card
      className={cn(
        "border-l-2 transition-all duration-200 hover:shadow-md animate-fade-in-up",
        styles.border,
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={cn("rounded-lg p-1.5", styles.iconBg)}>
          <Icon className={cn("h-4 w-4", styles.iconText)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-bold tracking-tight">{value}</div>
        <div className="flex items-center gap-1.5 mt-1">
          {trend !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
                trend > 0
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : trend < 0
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {trend > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : trend < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : null}
              {trend > 0 ? "+" : ""}
              {trend}%
            </span>
          )}
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
