export interface SlideTheme {
  primaryColor: string
  secondaryColor: string
  fontFamily: string
}

export type SlideLayout =
  | "title"
  | "content"
  | "two-column"
  | "section"
  | "quote"
  | "image-text" // deprecated
  | "closing"
  // Visual layouts:
  | "diagram" // Full-slide Mermaid diagram
  | "image" // Full-slide image with caption
  | "chart" // Full-slide data chart
  | "diagram-content" // Diagram + text (split)
  | "image-content" // Image + text (split)
  | "chart-content" // Chart + text (split)
  | "hero" // Full-bleed background image + text overlay
  | "stats" // Big numbers/metrics display
  | "gallery" // Image grid (logos, team, screenshots)
  | "comparison" // Feature comparison table
  | "features" // Icon-based feature grid

// Chart types
export type ChartType = "bar" | "bar-horizontal" | "line" | "pie" | "donut"

export interface ChartDataPoint {
  label: string
  value: number
  color?: string
}

export interface ChartSeries {
  name: string
  values: number[]
  color?: string
}

export interface ChartData {
  type: ChartType
  title?: string
  data?: ChartDataPoint[] // bar, pie, donut
  labels?: string[] // line x-axis
  series?: ChartSeries[] // multi-series line
  showValues?: boolean
  showLegend?: boolean
}

// Stats/Metrics layout
export interface StatItem {
  value: string // "42%", "$1.2M", "99.9%"
  label: string // "Customer Retention"
  trend?: "up" | "down" | "neutral"
  change?: string // "+12% YoY"
}

// Gallery layout
export interface GalleryItem {
  imageUrl: string
  caption?: string
}

// Comparison layout
export interface ComparisonRow {
  feature: string
  values: (string | boolean)[] // true = ✓, false = ✗, string = custom value
}

// Features layout (icon grid)
export interface FeatureItem {
  icon: string // Lucide icon name (e.g., "rocket", "shield")
  title: string // Feature title
  description?: string // Short description (1-2 sentences)
}

export interface SlideData {
  layout: SlideLayout
  // Text fields
  title?: string
  subtitle?: string
  bullets?: string[]
  content?: string
  leftColumn?: string[]
  rightColumn?: string[]
  quote?: string
  attribution?: string
  quoteImage?: string // Avatar/photo URL for quote attribution
  quoteStyle?: "minimal" | "large" | "card" // Quote styling variant
  note?: string
  // Visual fields
  diagram?: string // Mermaid diagram code
  imageUrl?: string // Image URL or "unsplash:keyword"
  imageCaption?: string // Caption for image-only slides
  chart?: ChartData // Chart configuration
  backgroundImage?: string // For hero layout
  overlay?: "dark" | "light" | "none" // Text overlay style for hero
  // Stats layout
  stats?: StatItem[] // For stats layout (2-4 items)
  // Gallery layout
  gallery?: GalleryItem[] // For gallery layout (4-12 items)
  galleryColumns?: 2 | 3 | 4 | 5 | 6 // Column count (default: auto)
  // Comparison layout
  comparisonHeaders?: string[] // ["Feature", "Us", "Competitor A", "Competitor B"]
  comparisonRows?: ComparisonRow[]
  // Features layout (icon grid)
  features?: FeatureItem[] // For features layout (3-6 items)
  featuresColumns?: 2 | 3 | 4 // Column count (default: 3)
}

export interface PresentationData {
  theme: SlideTheme
  slides: SlideData[]
}

export const DEFAULT_THEME: SlideTheme = {
  primaryColor: "#0F172A",
  secondaryColor: "#3B82F6",
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
}
