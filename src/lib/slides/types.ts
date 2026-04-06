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
  | "image-text"
  | "closing"

export interface SlideData {
  layout: SlideLayout
  title?: string
  subtitle?: string
  bullets?: string[]
  content?: string
  leftColumn?: string[]
  rightColumn?: string[]
  quote?: string
  attribution?: string
  note?: string
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
