/**
 * Shared class names for landing page consistency.
 * Zinc/indigo palette.
 */

export const landing = {
  /** Section wrapper */
  section: "py-16 sm:py-24 px-4 sm:px-6",
  sectionAlt: "py-16 sm:py-24 px-4 sm:px-6 bg-zinc-900/30",
  /** Section title (h2) */
  sectionTitle: "text-3xl font-bold tracking-tight text-center text-zinc-50 mb-4",
  /** Section subtitle */
  sectionSubtitle: "text-zinc-400 text-center max-w-2xl mx-auto mb-12",
  /** Content containers */
  container: "mx-auto max-w-6xl",
  containerNarrow: "mx-auto max-w-4xl",
  containerTight: "mx-auto max-w-3xl",

  /** Card on dark background */
  card: "border border-zinc-800 bg-zinc-900/50 rounded-xl",
  cardHighlight: "border border-zinc-800 bg-zinc-900/50 rounded-xl ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/10",

  /** Primary CTA (white) */
  btnPrimary:
    "bg-white text-zinc-950 hover:bg-zinc-200 shadow-lg shadow-black/20 transition-colors",
  /** Secondary CTA (outline) */
  btnSecondary:
    "border border-zinc-600 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50 hover:border-zinc-500 transition-colors backdrop-blur-sm",
  /** Secondary filled */
  btnSecondaryFilled:
    "border border-zinc-600 bg-zinc-800/80 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-50 hover:border-zinc-500 transition-colors",
  /** Highlight CTA (indigo) */
  btnHighlight: "bg-indigo-600 hover:bg-indigo-500 text-white transition-colors",

  /** Pill variants (rounded-full) of button styles */
  btnHighlightPill: "bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-500/20 transition-colors",
  btnSecondaryPill:
    "border border-zinc-600 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50 hover:border-zinc-500 rounded-full backdrop-blur-sm transition-colors",

  /** Badge / pill label */
  badge: "inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10",
  badgeText: "text-xs font-medium text-indigo-300",
  badgeDot: "h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse",
  badgeHighlight: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",

  /** Icon wrapper in feature cards */
  iconWrapper: "flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400",
  /** Step number circle */
  stepCircle: "inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-indigo-500/50 bg-zinc-900 text-sm font-semibold text-indigo-400",
} as const
