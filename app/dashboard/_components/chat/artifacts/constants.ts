import {
  Globe,
  FileCode,
  Image,
  GitBranch,
  FileText,
  Code,
  Table2,
  Sigma,
  Presentation,
  Terminal,
} from "lucide-react"
import type { ArtifactType } from "./types"

export const TYPE_ICONS: Record<ArtifactType, typeof Globe> = {
  "text/html": Globe,
  "application/react": FileCode,
  "image/svg+xml": Image,
  "application/mermaid": GitBranch,
  "text/markdown": FileText,
  "application/code": Code,
  "application/sheet": Table2,
  "text/latex": Sigma,
  "application/slides": Presentation,
  "application/python": Terminal,
}

export const TYPE_LABELS: Record<ArtifactType, string> = {
  "text/html": "HTML Page",
  "application/react": "React Component",
  "image/svg+xml": "SVG Graphic",
  "application/mermaid": "Mermaid Diagram",
  "text/markdown": "Document",
  "application/code": "Code",
  "application/sheet": "Spreadsheet",
  "text/latex": "LaTeX / Math",
  "application/slides": "Slides",
  "application/python": "Python Script",
}

export const TYPE_COLORS: Record<ArtifactType, string> = {
  "text/html": "text-orange-500 bg-orange-500/10 border-orange-500/20",
  "application/react": "text-blue-500 bg-blue-500/10 border-blue-500/20",
  "image/svg+xml": "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  "application/mermaid": "text-purple-500 bg-purple-500/10 border-purple-500/20",
  "text/markdown": "text-gray-500 bg-gray-500/10 border-gray-500/20",
  "application/code": "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
  "application/sheet": "text-green-500 bg-green-500/10 border-green-500/20",
  "text/latex": "text-rose-500 bg-rose-500/10 border-rose-500/20",
  "application/slides": "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
  "application/python": "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
}
