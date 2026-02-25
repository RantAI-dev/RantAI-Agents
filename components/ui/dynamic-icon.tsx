import {
  BarChart,
  Calculator,
  Clock,
  Cloud,
  Code,
  FileText,
  GitBranch,
  Globe,
  Heart,
  Languages,
  Mail,
  PenTool,
  Search,
  Sparkles,
  TrendingUp,
  Wrench,
  Zap,
  Workflow,
  Box,
  Shield,
  Database,
  MessageSquare,
  BookOpen,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Static map of Lucide icon names to components.
 * Covers all icons used by community skills/tools + common marketplace icons.
 */
const LUCIDE_MAP: Record<string, LucideIcon> = {
  BarChart,
  Calculator,
  Clock,
  Cloud,
  Code,
  FileText,
  GitBranch,
  Globe,
  Heart,
  Languages,
  Mail,
  PenTool,
  Search,
  Sparkles,
  TrendingUp,
  Wrench,
  Zap,
  Workflow,
  Box,
  Shield,
  Database,
  MessageSquare,
  BookOpen,
}

/** Detect if a string is an emoji (non-ASCII, not a URL, not a known icon name) */
function isEmoji(str: string): boolean {
  if (!str || str.startsWith("http") || str.startsWith("/")) return false
  if (LUCIDE_MAP[str]) return false
  // Check if first char is outside basic ASCII range (emoji / unicode)
  const code = str.codePointAt(0)
  return !!code && code > 255
}

interface DynamicIconProps {
  icon?: string
  fallback?: LucideIcon
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

  // Lucide icon name
  const LucideComponent = LUCIDE_MAP[icon]
  if (LucideComponent) {
    return <LucideComponent className={className} />
  }

  // Fallback
  return <Fallback className={className} />
}
