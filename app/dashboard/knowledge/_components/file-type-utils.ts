import { FileText, FileType, Image, Globe, FileCode, GitBranch, Code, Table2, Sigma, Presentation, Terminal, type LucideIcon } from "lucide-react"

interface FileTypeInfo {
  Icon: LucideIcon
  bgColor: string
  iconColor: string
  accentColor: string
}

const ARTIFACT_TYPE_MAP: Record<string, FileTypeInfo> = {
  "text/html": {
    Icon: Globe,
    bgColor: "bg-orange-500/10 dark:bg-orange-500/20",
    iconColor: "text-orange-500",
    accentColor: "#f97316",
  },
  "application/react": {
    Icon: FileCode,
    bgColor: "bg-blue-500/10 dark:bg-blue-500/20",
    iconColor: "text-blue-500",
    accentColor: "#3b82f6",
  },
  "image/svg+xml": {
    Icon: Image,
    bgColor: "bg-emerald-500/10 dark:bg-emerald-500/20",
    iconColor: "text-emerald-500",
    accentColor: "#10b981",
  },
  "application/mermaid": {
    Icon: GitBranch,
    bgColor: "bg-purple-500/10 dark:bg-purple-500/20",
    iconColor: "text-purple-500",
    accentColor: "#a855f7",
  },
  "text/markdown": {
    Icon: FileText,
    bgColor: "bg-gray-500/10 dark:bg-gray-500/20",
    iconColor: "text-gray-500",
    accentColor: "#6b7280",
  },
  "application/code": {
    Icon: Code,
    bgColor: "bg-cyan-500/10 dark:bg-cyan-500/20",
    iconColor: "text-cyan-500",
    accentColor: "#06b6d4",
  },
  "application/sheet": {
    Icon: Table2,
    bgColor: "bg-green-500/10 dark:bg-green-500/20",
    iconColor: "text-green-500",
    accentColor: "#22c55e",
  },
  "text/latex": {
    Icon: Sigma,
    bgColor: "bg-rose-500/10 dark:bg-rose-500/20",
    iconColor: "text-rose-500",
    accentColor: "#f43f5e",
  },
  "application/slides": {
    Icon: Presentation,
    bgColor: "bg-indigo-500/10 dark:bg-indigo-500/20",
    iconColor: "text-indigo-500",
    accentColor: "#6366f1",
  },
  "application/python": {
    Icon: Terminal,
    bgColor: "bg-yellow-500/10 dark:bg-yellow-500/20",
    iconColor: "text-yellow-500",
    accentColor: "#eab308",
  },
}

export function getFileTypeIcon(fileType?: string, artifactType?: string | null): FileTypeInfo {
  if (artifactType && ARTIFACT_TYPE_MAP[artifactType]) {
    return ARTIFACT_TYPE_MAP[artifactType]
  }

  switch (fileType) {
    case "image":
      return {
        Icon: Image,
        bgColor: "bg-chart-2/10 dark:bg-chart-2/20",
        iconColor: "text-chart-2",
        accentColor: "var(--chart-2)",
      }
    case "pdf":
      return {
        Icon: FileType,
        bgColor: "bg-destructive/10 dark:bg-destructive/20",
        iconColor: "text-destructive",
        accentColor: "var(--destructive)",
      }
    default:
      return {
        Icon: FileText,
        bgColor: "bg-chart-1/10 dark:bg-chart-1/20",
        iconColor: "text-chart-1",
        accentColor: "var(--chart-1)",
      }
  }
}

interface Category {
  id: string
  name: string
  label: string
  color: string
  isSystem: boolean
}

export function getCategoryDisplay(
  categoryName: string,
  categoryMap: Map<string, Category>,
) {
  const category = categoryMap.get(categoryName)
  if (category) {
    return { label: category.label, color: category.color }
  }
  return {
    label: categoryName
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    color: "#6b7280",
  }
}

const ARTIFACT_EXTENSION_MAP: Record<string, string> = {
  "text/html": ".HTML",
  "application/react": ".TSX",
  "image/svg+xml": ".SVG",
  "application/mermaid": ".MMD",
  "text/markdown": ".MD",
  "application/code": ".CODE",
  "application/sheet": ".CSV",
  "text/latex": ".TEX",
  "application/slides": ".PPTX",
  "application/python": ".PY",
}

export function getFileExtensionLabel(fileType?: string, artifactType?: string | null) {
  if (artifactType && ARTIFACT_EXTENSION_MAP[artifactType]) {
    return ARTIFACT_EXTENSION_MAP[artifactType]
  }

  switch (fileType) {
    case "image":
      return ".PNG"
    case "pdf":
      return ".PDF"
    default:
      return ".MD"
  }
}

export const CATEGORY_LABELS: Record<string, string> = {
  LIFE_INSURANCE: "Life Insurance",
  HEALTH_INSURANCE: "Health Insurance",
  HOME_INSURANCE: "Home Insurance",
  FAQ: "FAQ",
  POLICY: "Policy",
  GENERAL: "General",
}
