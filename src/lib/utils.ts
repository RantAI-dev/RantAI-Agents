import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Deterministic tag color assignment from a palette
export const TAG_COLORS = [
  "#f59e0b", "#0ea5e9", "#8b5cf6", "#10b981", "#f43f5e",
  "#f97316", "#64748b", "#3b82f6", "#ec4899", "#06b6d4",
  "#84cc16", "#a855f7", "#ef4444", "#d946ef",
]

const TAG_COLOR_STORAGE_KEY = "rantai-tag-colors"

function getCustomTagColors(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem(TAG_COLOR_STORAGE_KEY) || "{}")
  } catch {
    return {}
  }
}

export function setTagColor(tag: string, color: string) {
  const colors = getCustomTagColors()
  colors[tag] = color
  localStorage.setItem(TAG_COLOR_STORAGE_KEY, JSON.stringify(colors))
}

export function getTagColor(tag: string): string {
  const custom = getCustomTagColors()[tag]
  if (custom) return custom
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}
