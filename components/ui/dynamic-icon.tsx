import { ICON_MAP, Sparkles, type IconComponent } from "@/lib/icons"
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
  fallback?: IconComponent
  className?: string
  emojiClassName?: string
}

export function DynamicIcon({
  icon,
  fallback: Fallback = Sparkles,
  className = "h-[18px] w-[18px]",
  emojiClassName,
}: DynamicIconProps) {
  if (!icon) {
    return <Fallback className={className} />
  }

  // Image URL
  if (icon.startsWith("http") || icon.startsWith("/")) {
    return (
      <img
        src={icon}
        alt=""
        className={cn("object-cover rounded", className)}
      />
    )
  }

  // Emoji
  if (isEmoji(icon)) {
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
