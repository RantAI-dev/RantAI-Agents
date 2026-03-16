import { ICON_MAP, Sparkles, type IconComponent } from "@/lib/icons"
import { getServiceLogo } from "@/lib/service-logos"
import { cn } from "@/lib/utils"

/** Detect if a string is an emoji (non-ASCII, not a URL, not a known icon name) */
function isEmoji(str: string): boolean {
  if (!str || str.startsWith("http") || str.startsWith("/")) return false
  if (ICON_MAP[str]) return false
  const code = str.codePointAt(0)
  return !!code && code > 255
}

interface DynamicIconProps {
  icon?: string
  /** Optional service name for logo lookup (e.g. "slack", "GitHub MCP Server") */
  serviceName?: string
  fallback?: IconComponent
  className?: string
  emojiClassName?: string
}

export function DynamicIcon({
  icon,
  serviceName,
  fallback: Fallback = Sparkles,
  className = "h-[18px] w-[18px]",
  emojiClassName,
}: DynamicIconProps) {
  if (!icon) {
    // Try service name logo lookup before falling back
    if (serviceName) {
      const logo = getServiceLogo(serviceName)
      if (logo) {
        return (
          <img
            src={logo}
            alt=""
            className={cn("object-contain", className)}
          />
        )
      }
    }
    return <Fallback className={className} />
  }

  // Image URL or local path
  if (icon.startsWith("http") || icon.startsWith("/")) {
    return (
      <img
        src={icon}
        alt=""
        className={cn("object-contain", className)}
      />
    )
  }

  // Emoji — but first check if service name has a real logo
  if (isEmoji(icon)) {
    if (serviceName) {
      const logo = getServiceLogo(serviceName)
      if (logo) {
        return (
          <img
            src={logo}
            alt=""
            className={cn("object-contain", className)}
          />
        )
      }
    }
    return (
      <span className={cn("leading-none", emojiClassName)} role="img">
        {icon}
      </span>
    )
  }

  // Icon name from map
  const IconComponent = ICON_MAP[icon]
  if (IconComponent) {
    return <IconComponent className={className} />
  }

  // Fallback
  return <Fallback className={className} />
}
