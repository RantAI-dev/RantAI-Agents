"use client"

interface DashboardPageHeaderProps {
  /** Required when not using children. Ignored when children is set. */
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  /** Optional custom title area (e.g. icon + title + count). When set, title/subtitle are ignored for the left side. */
  children?: React.ReactNode
}

const headerBaseClass =
  "min-h-14 flex shrink-0 items-center border-b bg-background pl-14 pr-4 py-3 w-full"

export function DashboardPageHeader({
  title,
  subtitle,
  actions,
  children,
}: DashboardPageHeaderProps) {
  const hasActions = actions != null
  const hasCustomLeft = children != null
  return (
    <header
      className={
        hasActions || hasCustomLeft
          ? `${headerBaseClass} justify-between gap-2`
          : headerBaseClass
      }
      role="banner"
    >
      {hasCustomLeft ? (
        <div className="flex items-center gap-4 min-w-0">{children}</div>
      ) : (
        <div>
          <h1 className="text-lg font-semibold">{title ?? ""}</h1>
          {subtitle != null && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      )}
      {hasActions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  )
}
